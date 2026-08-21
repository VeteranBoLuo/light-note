import { compileAgentTurnSpec } from './intentCompiler.js';
import { getAgentV3CapabilityById, getAgentV3CapabilityByToolName } from './v3/capabilityManifest.js';

const LEGACY_REQUEST_KIND = Object.freeze({
  conversation: 'conversation',
  query: 'answer',
  action: 'action',
  mixed: 'mixed',
});

function usageTotal(responses) {
  return responses.reduce(
    (total, response) => ({
      promptTokens: total.promptTokens + Number(response?.usage?.promptTokens || 0),
      completionTokens: total.completionTokens + Number(response?.usage?.completionTokens || 0),
      totalTokens: total.totalTokens + Number(response?.usage?.totalTokens || 0),
    }),
    { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  );
}

export async function compileTurnSpecShadow(options = {}) {
  const responses = [];
  const startedAt = Date.now();
  try {
    const result = await compileAgentTurnSpec({
      ...options,
      onResponse(response) {
        responses.push(response);
        options.onResponse?.(response);
      },
    });
    return {
      state: 'ready',
      turnSpec: result.turnSpec,
      attempts: result.attempts,
      finishReason: result.finishReason,
      durationMs: Date.now() - startedAt,
      usage: usageTotal(responses),
      usageReported: responses.every((response) => response?.usageStatus === 'reported'),
    };
  } catch (error) {
    if (options.signal?.aborted || error?.name === 'AbortError' || error?.code === 'AGENT_HARD_DEADLINE_EXCEEDED') {
      throw error;
    }
    return {
      state: 'invalid',
      errorCode: String(error?.code || 'TURN_SPEC_SHADOW_FAILED').slice(0, 64),
      attempts: responses.length,
      durationMs: Date.now() - startedAt,
      usage: usageTotal(responses),
      usageReported: responses.every((response) => response?.usageStatus === 'reported'),
    };
  }
}

export function compareTurnSpecWithLegacyPlan(turnSpec, legacyPlan, catalog = []) {
  if (!turnSpec) return ['turn_spec_missing'];
  if (!legacyPlan) return ['legacy_plan_missing'];
  const divergences = [];
  const expectedKind = LEGACY_REQUEST_KIND[legacyPlan.requestClass];
  const compatibleKinds =
    expectedKind === 'answer'
      ? new Set(['answer', 'product_help'])
      : expectedKind === 'action'
        ? new Set(['action', 'create_artifact', 'revise_artifact'])
        : new Set([expectedKind]);
  if (!compatibleKinds.has(turnSpec.requestKind)) divergences.push('request_kind');
  if (String(legacyPlan.confidence || '') !== turnSpec.confidence) divergences.push('confidence');

  const catalogById = new Map((Array.isArray(catalog) ? catalog : []).map((entry) => [entry.id, entry]));
  const legacyCapabilityIds = new Set();
  for (const intent of legacyPlan.intents || []) {
    const entry = catalogById.get(intent.capabilityId);
    const direct = getAgentV3CapabilityById(intent.capabilityId);
    if (direct) legacyCapabilityIds.add(direct.id);
    for (const toolName of entry?.toolNames || []) {
      const projected = getAgentV3CapabilityByToolName(toolName);
      if (projected) legacyCapabilityIds.add(projected.id);
    }
  }
  const v3CapabilityIds = new Set((turnSpec.goals || []).map((goal) => goal.capabilityId).filter(Boolean));
  if (
    legacyCapabilityIds.size !== v3CapabilityIds.size ||
    [...legacyCapabilityIds].some((capabilityId) => !v3CapabilityIds.has(capabilityId))
  ) {
    divergences.push('capability_ids');
  }
  const legacyDomains = new Set(
    [...legacyCapabilityIds]
      .map((capabilityId) => getAgentV3CapabilityById(capabilityId)?.domains?.[0])
      .filter(Boolean),
  );
  const v2Domains = new Set(
    (turnSpec.goals || []).map((goal) => goal.capabilityDomain).filter((domain) => domain !== 'none'),
  );
  if (legacyDomains.size !== v2Domains.size || [...legacyDomains].some((domain) => !v2Domains.has(domain))) {
    divergences.push('capability_domains');
  }
  const legacyClarifies = legacyPlan.needsClarification === true || legacyPlan.confidence === 'low';
  const v2Clarifies = turnSpec.confidence === 'low' || turnSpec.missingSlots.length > 0;
  if (legacyClarifies !== v2Clarifies) divergences.push('clarification');
  return divergences;
}

export function turnSpecTraceSummary(shadow, divergences = [], mode = 'shadow') {
  const turnSpec = shadow?.turnSpec;
  return {
    mode,
    state: shadow?.state === 'ready' ? 'ready' : 'invalid',
    requestKind: turnSpec?.requestKind || 'unknown',
    version: turnSpec?.version || 'unknown',
    confidence: turnSpec?.confidence || 'unknown',
    continuationMode: turnSpec?.continuationMode || 'unknown',
    topicEpochAction: turnSpec?.topicEpochAction || 'unknown',
    goalCount: turnSpec?.goals?.length || 0,
    domainCount: new Set((turnSpec?.goals || []).map((goal) => goal.capabilityDomain)).size,
    missingSlotCount: turnSpec?.missingSlots?.length || 0,
    attempts: shadow?.attempts || 0,
    durationMs: shadow?.durationMs || 0,
    divergenceCodes: divergences,
    errorCode: shadow?.errorCode || null,
  };
}
