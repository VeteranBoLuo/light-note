import crypto from 'node:crypto';
import {
  AGENT_CAPABILITY_MANIFEST_VERSION,
  getAgentV3CapabilityById,
  normalizeCapabilityScope,
} from './capabilityManifest.js';
import { collectMissingTemporalSlotsV3, compileTemporalConstraintsV3 } from './temporalConstraints.js';

export const TURN_SPEC_V3_VERSION = '3.0';
export const TURN_SPEC_V3_TOOL_NAME = 'submit_turn_spec_v3';

export const TURN_REQUEST_KINDS_V3 = Object.freeze([
  'conversation',
  'product_help',
  'answer',
  'action',
  'mixed',
  'create_artifact',
  'revise_artifact',
]);
export const TURN_CONTINUATION_MODES_V3 = Object.freeze([
  'independent',
  'refer_last_result',
  'refine_last_artifact',
  'answer_clarification',
  'action_continuation',
  'scope_replacement',
]);
export const TURN_TOPIC_EPOCH_ACTIONS_V3 = Object.freeze(['keep', 'advance']);
export const GROUNDING_POLICIES_V3 = Object.freeze([
  'current_explicit_only',
  'inherit_confirmed_source_set',
  'workspace_query',
  'general_knowledge',
  'none',
]);

const CONFIDENCE_LEVELS = Object.freeze(['high', 'medium', 'low']);
const MAX_RAW_GOALS = 5;
const MAX_NORMALIZED_GOALS = 8;
const MAX_TEXT = 300;
const MAX_CLARIFICATION = 320;

function text(value, max = MAX_TEXT) {
  return String(value || '')
    .trim()
    .slice(0, max);
}

function uniqueStrings(values, max = 80) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => text(value, max)).filter(Boolean))];
}

function normalizeMissingSlot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const name = text(value.name, 80);
  const reason = text(value.reason);
  const question = text(value.question, MAX_CLARIFICATION);
  return name && reason && question ? Object.freeze({ name, reason, question }) : null;
}

function normalizeReferentSelector(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = ['current_explicit', 'last_result', 'pending_artifact'].includes(value.source) ? value.source : '';
  if (!source) return null;
  const ordinalValue = Number(value.ordinal);
  const ordinal = Number.isSafeInteger(ordinalValue) && ordinalValue > 0 && ordinalValue <= 50 ? ordinalValue : null;
  return Object.freeze({ source, types: Object.freeze(uniqueStrings(value.types, 32)), ordinal });
}

function goalKind(capability, requestKind) {
  if (capability.effect === 'read') return 'read';
  if (
    ['create_artifact', 'revise_artifact'].includes(requestKind) &&
    capability.domains.includes('note') &&
    ['create', 'update'].some((operation) => capability.operations.includes(operation))
  ) {
    return 'transform';
  }
  return 'write';
}

function dependencyGoalId(parentId, capabilityId, index) {
  return `${parentId}__dep_${index + 1}_${capabilityId.replace(/[^a-z0-9]+/giu, '_')}`.slice(0, 64);
}

function expandGoalDependencies(goals, catalogById) {
  const expanded = [];
  const byCapabilityId = new Map();
  const append = (goal) => {
    const capability = catalogById.get(goal.capabilityId);
    if (!capability) return false;
    const dependencies = [];
    for (const [index, dependencyId] of capability.dependencies.entries()) {
      let dependencyGoal = byCapabilityId.get(dependencyId);
      if (!dependencyGoal) {
        const dependencyCapability = catalogById.get(dependencyId);
        if (!dependencyCapability || dependencyCapability.status !== 'enabled') return false;
        dependencyGoal = {
          id: dependencyGoalId(goal.id, dependencyId, index),
          capabilityId: dependencyId,
          capabilityDomain: dependencyCapability.domains[0],
          kind: 'read',
          operation: dependencyCapability.operations[0],
          description: `为“${goal.description || goal.targetDescription}”读取并核验前置目标`,
          targetDescription: goal.targetDescription,
          dependsOn: [],
          referentSelectors: goal.referentSelectors,
          implicit: true,
        };
        if (!append(dependencyGoal)) return false;
        dependencyGoal = byCapabilityId.get(dependencyId);
      }
      dependencies.push(dependencyGoal.id);
    }
    const normalized = Object.freeze({
      ...goal,
      dependsOn: Object.freeze([...new Set([...goal.dependsOn, ...dependencies])]),
      referentSelectors: Object.freeze(goal.referentSelectors),
      order: expanded.length,
    });
    expanded.push(normalized);
    if (!byCapabilityId.has(goal.capabilityId)) byCapabilityId.set(goal.capabilityId, normalized);
    return expanded.length <= MAX_NORMALIZED_GOALS;
  };

  for (const goal of goals) if (!append(goal)) return null;
  return Object.freeze(expanded);
}

function canonicalTurnSpec(value) {
  return JSON.stringify({
    version: value.version,
    requestKind: value.requestKind,
    confidence: value.confidence,
    continuationMode: value.continuationMode,
    topicEpochAction: value.topicEpochAction,
    capabilityScope: value.capabilityScope,
    goals: value.goals.map((goal) => ({
      id: goal.id,
      capabilityId: goal.capabilityId,
      operation: goal.operation,
      dependsOn: goal.dependsOn,
      referentSelectors: goal.referentSelectors,
      implicit: goal.implicit,
    })),
    groundingPolicy: value.groundingPolicy,
    temporalConstraints: value.temporalConstraints.map((constraint) => ({
      goalId: constraint.goalId,
      slot: constraint.slot,
      kind: constraint.kind,
      expression: constraint.expression,
      argumentValue: constraint.argumentValue,
      implicit: constraint.implicit,
    })),
    outputContract: value.outputContract || null,
    missingSlots: value.missingSlots,
    clarificationQuestion: value.clarificationQuestion,
  });
}

export function digestTurnSpecV3(value) {
  return crypto.createHash('sha256').update(canonicalTurnSpec(value)).digest('hex');
}

function stableCanonicalValue(value) {
  if (Array.isArray(value)) return value.map(stableCanonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableCanonicalValue(value[key])]),
  );
}

function compareCanonicalText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalExecutionContractV3({ turnSpec, route, executionContext } = {}) {
  const refs = (Array.isArray(executionContext?.contextRefs) ? executionContext.contextRefs : [])
    .map((ref) => ({ type: String(ref?.type || ''), id: String(ref?.id || '') }))
    .filter((ref) => ref.type && ref.id)
    .sort((left, right) => compareCanonicalText(`${left.type}:${left.id}`, `${right.type}:${right.id}`));
  const resources = (Array.isArray(executionContext?.resources) ? executionContext.resources : [])
    .map((resource) => ({
      type: String(resource?.type || ''),
      id: String(resource?.id || ''),
      values: stableCanonicalValue(resource?.values || {}),
    }))
    .filter((resource) => resource.type && resource.id)
    .sort((left, right) => compareCanonicalText(`${left.type}:${left.id}`, `${right.type}:${right.id}`));
  const routes = (Array.isArray(route?.goalRoutes) ? route.goalRoutes : [])
    .map((goalRoute) => ({
      goalId: String(goalRoute?.goalId || ''),
      capabilityIds: [...new Set((goalRoute?.capabilityIds || []).map(String))].sort(),
      toolNames: [...new Set((goalRoute?.toolNames || []).map(String))].sort(),
      status: String(goalRoute?.status || ''),
    }))
    .sort((left, right) => compareCanonicalText(left.goalId, right.goalId));
  return JSON.stringify(
    stableCanonicalValue({
      version: TURN_SPEC_V3_VERSION,
      manifestVersion: AGENT_CAPABILITY_MANIFEST_VERSION,
      semanticDigest: String(turnSpec?.semanticDigest || turnSpec?.digest || ''),
      groundingPolicy: String(turnSpec?.groundingPolicy || ''),
      capabilityScope: turnSpec?.capabilityScope || null,
      routes,
      effectiveEvidenceScope: {
        refs,
        attachmentIds: [...new Set((executionContext?.attachmentIds || []).map(String))].sort(),
        resources,
      },
    }),
  );
}

export function digestExecutionContractV3(input = {}) {
  return crypto.createHash('sha256').update(canonicalExecutionContractV3(input)).digest('hex');
}

/**
 * 输出约束来自服务端对最新消息的确定性编译，不需要为“至少 2000 字”再调用一次模型。
 * 该函数只允许给已经确认的单篇笔记产物附加契约，并重新计算摘要；任何不匹配都失败关闭。
 */
export function attachTurnSpecV3OutputContract(turnSpec, outputContract) {
  if (!turnSpec || String(outputContract?.format || '') !== 'note_markdown') return null;
  const candidate = {
    ...turnSpec,
    outputContract: Object.freeze(structuredClone(outputContract)),
  };
  delete candidate.digest;
  delete candidate.semanticDigest;
  if (!validateOutputContract(candidate)) return null;
  const semanticDigest = digestTurnSpecV3(candidate);
  return Object.freeze({ ...candidate, digest: semanticDigest, semanticDigest });
}

/**
 * 把产物续写协议归一成服务端生命周期动作。
 *
 * 这里不关心具体文案或产物类型，只解释 TurnSpec 的稳定枚举。调用方仍需校验当前
 * 会话确实存在可用的 pending artifact，才能执行 refine / replace。
 */
export function resolveArtifactContinuationV3(turnSpec) {
  if (!turnSpec || !['create_artifact', 'revise_artifact'].includes(turnSpec.requestKind)) return 'none';
  if (turnSpec.continuationMode === 'scope_replacement') return 'replace_scope';
  if (turnSpec.requestKind === 'revise_artifact' || turnSpec.continuationMode === 'refine_last_artifact') {
    return 'refine';
  }
  return 'create';
}

function validateRequestKind(spec) {
  const hasRead = spec.goals.some((goal) => goal.kind === 'read');
  const hasMutation = spec.goals.some((goal) => goal.kind === 'write' || goal.kind === 'transform');
  const createsMarkdownNote = spec.goals.some((goal) => goal.capabilityId === 'note.create');
  if (createsMarkdownNote && !['create_artifact', 'revise_artifact'].includes(spec.requestKind)) return false;
  if (spec.requestKind === 'conversation') return spec.goals.length === 0;
  if (['product_help', 'answer'].includes(spec.requestKind)) return !hasMutation;
  if (spec.requestKind === 'action') return hasMutation;
  if (spec.requestKind === 'mixed') return hasRead && hasMutation;
  if (['create_artifact', 'revise_artifact'].includes(spec.requestKind)) {
    return spec.goals.some((goal) => goal.kind === 'transform');
  }
  return false;
}

function validateOutputContract(spec) {
  if (String(spec.outputContract?.format || '') !== 'note_markdown') return true;
  const artifacts = spec.goals.filter((goal) => goal.kind === 'transform' && goal.capabilityId === 'note.create');
  if (artifacts.length !== 1) return false;
  if (!['create_artifact', 'revise_artifact'].includes(spec.requestKind)) return false;
  if (spec.groundingPolicy === 'workspace_query') {
    const dependencies = new Set(artifacts[0].dependsOn);
    if (!spec.goals.some((goal) => goal.kind === 'read' && dependencies.has(goal.id))) return false;
  }
  return true;
}

export function normalizeTurnSpecV3(
  raw,
  {
    catalog = [],
    authoritativeGroundingPolicy,
    outputContract = null,
    capabilityScope = null,
    actorRole = 'user',
    latestMessage = '',
    temporalContext = {},
  } = {},
) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (String(raw.version || '') !== TURN_SPEC_V3_VERSION) return null;
  if (!TURN_REQUEST_KINDS_V3.includes(raw.requestKind) || !CONFIDENCE_LEVELS.includes(raw.confidence)) return null;
  if (!TURN_CONTINUATION_MODES_V3.includes(raw.continuationMode)) return null;
  if (!TURN_TOPIC_EPOCH_ACTIONS_V3.includes(raw.topicEpochAction)) return null;
  if (!Array.isArray(raw.goals) || raw.goals.length > MAX_RAW_GOALS) return null;

  const catalogById = new Map((Array.isArray(catalog) ? catalog : []).map((entry) => [entry.id, entry]));
  const ids = new Set();
  const rawGoals = [];
  for (const value of raw.goals) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const id = text(value.id, 64);
    const capabilityId = text(value.capabilityId, 120);
    const capability = catalogById.get(capabilityId);
    const operation = text(value.operation, 40);
    if (!id || ids.has(id) || !capability || !capability.operations.includes(operation)) return null;
    if (!Array.isArray(value.dependsOn)) return null;
    const dependsOn = uniqueStrings(value.dependsOn, 64);
    if (dependsOn.some((dependencyId) => !ids.has(dependencyId))) return null;
    if (!Array.isArray(value.referentSelectors)) return null;
    const referentSelectors = value.referentSelectors.map(normalizeReferentSelector);
    if (referentSelectors.some((selector) => !selector)) return null;
    ids.add(id);
    rawGoals.push({
      id,
      capabilityId,
      capabilityDomain: capability.domains[0],
      kind: goalKind(capability, raw.requestKind),
      operation,
      description: text(value.description),
      targetDescription: text(value.targetDescription),
      dependsOn,
      referentSelectors,
      implicit: false,
    });
  }

  const goals = expandGoalDependencies(rawGoals, catalogById);
  if (!goals) return null;
  const goalIds = new Set(goals.map((goal) => goal.id));
  if (goals.some((goal) => goal.dependsOn.some((dependencyId) => !goalIds.has(dependencyId)))) return null;
  if (goals.some((goal) => goal.dependsOn.some((dependencyId) => goals.find((item) => item.id === dependencyId)?.kind !== 'read'))) {
    return null;
  }

  if (!Array.isArray(raw.missingSlots) || raw.missingSlots.length > 8) return null;
  const declaredMissingSlots = raw.missingSlots.map(normalizeMissingSlot);
  if (declaredMissingSlots.some((slot) => !slot)) return null;
  const declaredClarificationQuestion = text(raw.clarificationQuestion, MAX_CLARIFICATION);
  if ((raw.confidence === 'low' || declaredMissingSlots.length) && !declaredClarificationQuestion) return null;
  if (!GROUNDING_POLICIES_V3.includes(raw.groundingPolicy)) return null;
  if (authoritativeGroundingPolicy && raw.groundingPolicy !== authoritativeGroundingPolicy) return null;
  const temporalConstraints = compileTemporalConstraintsV3(raw.temporalConstraints, {
    goals,
    catalog,
    latestMessage,
    temporalContext,
  });
  if (!temporalConstraints) return null;
  const temporalMissingSlots = collectMissingTemporalSlotsV3({ goals, catalog, constraints: temporalConstraints });
  const normalizedTemporalMissingSlots = temporalMissingSlots.map(({ name, reason, question }) =>
    Object.freeze({ name, reason, question }),
  );
  const missingSlots = Object.freeze(
    [...declaredMissingSlots, ...normalizedTemporalMissingSlots]
      .filter((slot, index, values) => values.findIndex((item) => item.name === slot.name) === index)
      .slice(0, 8),
  );
  const clarificationQuestion =
    declaredClarificationQuestion ||
    (temporalMissingSlots.length
      ? `请补充${[...new Set(temporalMissingSlots.map((slot) => slot.label))].join('和')}。`.slice(
          0,
          MAX_CLARIFICATION,
        )
      : '');

  const normalized = {
    version: TURN_SPEC_V3_VERSION,
    requestKind: raw.requestKind,
    confidence: raw.confidence,
    continuationMode: raw.continuationMode,
    topicEpochAction: raw.topicEpochAction,
    capabilityScope: normalizeCapabilityScope(capabilityScope, { actorRole }),
    goals,
    groundingPolicy: authoritativeGroundingPolicy || raw.groundingPolicy,
    temporalConstraints,
    outputContract: outputContract ? Object.freeze(structuredClone(outputContract)) : null,
    missingSlots,
    clarificationQuestion,
  };
  if (!validateRequestKind(normalized) || !validateOutputContract(normalized)) return null;
  const semanticDigest = digestTurnSpecV3(normalized);
  return Object.freeze({ ...normalized, digest: semanticDigest, semanticDigest });
}

export function buildTurnSpecV3ToolDefinition({ catalog = [], groundingPolicy } = {}) {
  const capabilities = (Array.isArray(catalog) ? catalog : []).map((entry) => entry.id);
  const operations = [...new Set((Array.isArray(catalog) ? catalog : []).flatMap((entry) => entry.operations || []))];
  return {
    type: 'function',
    function: {
      name: TURN_SPEC_V3_TOOL_NAME,
      description: '提交本轮唯一语义任务规格；只选择产品能力 ID，不选择工具名，不填写工具参数。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          version: { type: 'string', enum: [TURN_SPEC_V3_VERSION] },
          requestKind: { type: 'string', enum: TURN_REQUEST_KINDS_V3 },
          confidence: { type: 'string', enum: CONFIDENCE_LEVELS },
          continuationMode: { type: 'string', enum: TURN_CONTINUATION_MODES_V3 },
          topicEpochAction: { type: 'string', enum: TURN_TOPIC_EPOCH_ACTIONS_V3 },
          goals: {
            type: 'array',
            maxItems: MAX_RAW_GOALS,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', minLength: 1, maxLength: 64 },
                capabilityId: { type: 'string', enum: capabilities.length ? capabilities : ['none'] },
                operation: { type: 'string', enum: operations.length ? operations : ['read'] },
                description: { type: 'string', maxLength: MAX_TEXT },
                targetDescription: { type: 'string', maxLength: MAX_TEXT },
                dependsOn: { type: 'array', maxItems: MAX_RAW_GOALS, items: { type: 'string', maxLength: 64 } },
                referentSelectors: {
                  type: 'array',
                  maxItems: 4,
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      source: {
                        type: 'string',
                        enum: ['current_explicit', 'last_result', 'pending_artifact'],
                      },
                      types: { type: 'array', maxItems: 6, items: { type: 'string', maxLength: 32 } },
                      ordinal: { anyOf: [{ type: 'integer', minimum: 1, maximum: 50 }, { type: 'null' }] },
                    },
                    required: ['source', 'types', 'ordinal'],
                  },
                },
              },
              required: [
                'id',
                'capabilityId',
                'operation',
                'description',
                'targetDescription',
                'dependsOn',
                'referentSelectors',
              ],
            },
          },
          groundingPolicy: {
            type: 'string',
            enum: groundingPolicy ? [groundingPolicy] : GROUNDING_POLICIES_V3,
          },
          temporalConstraints: {
            type: 'array',
            maxItems: 12,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                goalId: { type: 'string', minLength: 1, maxLength: 64 },
                slot: { type: 'string', minLength: 1, maxLength: 64 },
                expression: { type: 'string', minLength: 1, maxLength: 80 },
              },
              required: ['goalId', 'slot', 'expression'],
            },
          },
          missingSlots: {
            type: 'array',
            maxItems: 8,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                name: { type: 'string', maxLength: 80 },
                reason: { type: 'string', maxLength: MAX_TEXT },
                question: { type: 'string', maxLength: MAX_CLARIFICATION },
              },
              required: ['name', 'reason', 'question'],
            },
          },
          clarificationQuestion: { type: 'string', maxLength: MAX_CLARIFICATION },
        },
        required: [
          'version',
          'requestKind',
          'confidence',
          'continuationMode',
          'topicEpochAction',
          'goals',
          'groundingPolicy',
          'temporalConstraints',
          'missingSlots',
          'clarificationQuestion',
        ],
      },
    },
  };
}

export function parseTurnSpecV3Response(response, options = {}) {
  const calls = (Array.isArray(response?.toolCalls) ? response.toolCalls : []).filter(
    (call) => call?.function?.name === TURN_SPEC_V3_TOOL_NAME,
  );
  if (calls.length !== 1) return null;
  try {
    return normalizeTurnSpecV3(JSON.parse(String(calls[0]?.function?.arguments || '{}')), options);
  } catch {
    return null;
  }
}

export const __testing = Object.freeze({
  canonicalTurnSpec,
  canonicalExecutionContractV3,
  expandGoalDependencies,
  goalKind,
  normalizeReferentSelector,
  validateOutputContract,
  validateRequestKind,
});
