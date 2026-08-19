import crypto from 'node:crypto';

export const TURN_SPEC_VERSION = '2.0';
export const TURN_SPEC_TOOL_NAME = 'submit_turn_spec';

export const TURN_REQUEST_KINDS = Object.freeze([
  'conversation',
  'product_help',
  'answer',
  'action',
  'mixed',
  'create_artifact',
  'revise_artifact',
]);
export const TURN_GOAL_KINDS = Object.freeze(['read', 'write', 'transform']);
export const CAPABILITY_DOMAINS = Object.freeze([
  'content',
  'note',
  'bookmark',
  'file',
  'todo',
  'tag',
  'account',
  'growth',
  'admin',
  'web',
  'none',
]);
export const GROUNDING_POLICIES = Object.freeze([
  'current_explicit_only',
  'inherit_confirmed_source_set',
  'workspace_query',
  'general_knowledge',
  'none',
]);

const CONFIDENCE_LEVELS = Object.freeze(['high', 'medium', 'low']);
const MAX_GOALS = 4;
const MAX_CAPABILITY_DOMAINS = 3;
const MAX_DEPENDENCY_DEPTH = 3;
const MAX_TEXT = 240;
const MAX_SLOT_NAME = 80;
const MAX_CLARIFICATION = 300;

function normalizeText(value, maxLength = MAX_TEXT) {
  return String(value || '')
    .trim()
    .slice(0, maxLength);
}

function uniqueStrings(values, maxLength = 40) {
  return [
    ...new Set((Array.isArray(values) ? values : []).map((value) => normalizeText(value, maxLength)).filter(Boolean)),
  ];
}

function normalizeMissingSlot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const name = normalizeText(value.name, MAX_SLOT_NAME);
  const reason = normalizeText(value.reason);
  const question = normalizeText(value.question, MAX_CLARIFICATION);
  return name && reason && question ? Object.freeze({ name, reason, question }) : null;
}

function canonicalTurnSpec(value) {
  return JSON.stringify({
    version: value.version,
    requestKind: value.requestKind,
    confidence: value.confidence,
    goals: value.goals.map((goal) => ({
      id: goal.id,
      kind: goal.kind,
      capabilityDomain: goal.capabilityDomain,
      description: goal.description,
      targetDescription: goal.targetDescription,
      dependsOn: goal.dependsOn,
    })),
    groundingPolicy: value.groundingPolicy,
    outputContract: value.outputContract || null,
    missingSlots: value.missingSlots,
    clarificationQuestion: value.clarificationQuestion,
  });
}

export function digestTurnSpec(value) {
  return crypto.createHash('sha256').update(canonicalTurnSpec(value)).digest('hex');
}

export function normalizeTurnSpec(
  raw,
  { authoritativeGroundingPolicy, outputContract = null, allowedDomains = CAPABILITY_DOMAINS } = {},
) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (String(raw.version || '') !== TURN_SPEC_VERSION) return null;
  if (!TURN_REQUEST_KINDS.includes(raw.requestKind) || !CONFIDENCE_LEVELS.includes(raw.confidence)) return null;
  if (!Array.isArray(raw.goals) || raw.goals.length > MAX_GOALS) return null;

  const allowedDomainSet = new Set(allowedDomains);
  const goals = [];
  const goalIds = new Set();
  for (const [index, value] of raw.goals.entries()) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const id = normalizeText(value.id, 40);
    const kind = TURN_GOAL_KINDS.includes(value.kind) ? value.kind : '';
    const capabilityDomain = allowedDomainSet.has(value.capabilityDomain) ? value.capabilityDomain : '';
    if (!id || goalIds.has(id) || !kind || !capabilityDomain) return null;
    if (!Array.isArray(value.dependsOn) || value.dependsOn.length > MAX_GOALS) return null;
    const dependsOn = uniqueStrings(value.dependsOn);
    if (dependsOn.some((dependencyId) => !goalIds.has(dependencyId))) return null;
    goalIds.add(id);
    goals.push(
      Object.freeze({
        id,
        kind,
        capabilityDomain,
        description: normalizeText(value.description),
        targetDescription: normalizeText(value.targetDescription),
        dependsOn: Object.freeze(dependsOn),
        order: index,
      }),
    );
  }

  const depths = new Map();
  for (const goal of goals) {
    const depth = 1 + Math.max(0, ...goal.dependsOn.map((id) => depths.get(id) || 0));
    if (depth > MAX_DEPENDENCY_DEPTH) return null;
    depths.set(goal.id, depth);
  }
  if (goals.some((goal) => goal.dependsOn.some((id) => goals.find((item) => item.id === id)?.kind !== 'read'))) {
    return null;
  }
  if (
    new Set(goals.map((goal) => goal.capabilityDomain).filter((domain) => domain !== 'none')).size >
    MAX_CAPABILITY_DOMAINS
  ) {
    return null;
  }

  if (!Array.isArray(raw.missingSlots) || raw.missingSlots.length > 8) return null;
  const missingSlots = raw.missingSlots.map(normalizeMissingSlot);
  if (missingSlots.some((slot) => !slot)) return null;
  if (new Set(missingSlots.map((slot) => slot.name)).size !== missingSlots.length) return null;

  const clarificationQuestion = normalizeText(raw.clarificationQuestion, MAX_CLARIFICATION);
  if ((raw.confidence === 'low' || missingSlots.length > 0) && !clarificationQuestion) return null;
  const requestedGroundingPolicy = GROUNDING_POLICIES.includes(raw.groundingPolicy) ? raw.groundingPolicy : '';
  if (!requestedGroundingPolicy) return null;
  if (authoritativeGroundingPolicy && requestedGroundingPolicy !== authoritativeGroundingPolicy) return null;

  const hasRead = goals.some((goal) => goal.kind === 'read');
  const hasMutation = goals.some((goal) => goal.kind === 'write' || goal.kind === 'transform');
  if (raw.requestKind === 'conversation' && goals.length > 0) return null;
  if (['product_help', 'answer'].includes(raw.requestKind) && hasMutation) return null;
  if (raw.requestKind === 'action' && !hasMutation) return null;
  if (raw.requestKind === 'mixed' && !(hasRead && hasMutation)) return null;
  if (
    ['create_artifact', 'revise_artifact'].includes(raw.requestKind) &&
    !goals.some((goal) => goal.kind === 'transform')
  ) {
    return null;
  }
  if (
    requestedGroundingPolicy === 'workspace_query' &&
    ['create_artifact', 'revise_artifact'].includes(raw.requestKind) &&
    (!hasRead || goals.filter((goal) => goal.kind === 'transform').some((goal) => !goal.dependsOn.length))
  ) {
    return null;
  }

  const normalized = {
    version: TURN_SPEC_VERSION,
    requestKind: raw.requestKind,
    confidence: raw.confidence,
    goals: Object.freeze(goals),
    groundingPolicy: authoritativeGroundingPolicy || requestedGroundingPolicy,
    outputContract: outputContract ? Object.freeze(structuredClone(outputContract)) : null,
    missingSlots: Object.freeze(missingSlots),
    clarificationQuestion,
  };
  return Object.freeze({ ...normalized, digest: digestTurnSpec(normalized) });
}

export function buildTurnSpecToolDefinition({ allowedDomains = CAPABILITY_DOMAINS, groundingPolicy } = {}) {
  return {
    type: 'function',
    function: {
      name: TURN_SPEC_TOOL_NAME,
      description: '只提交用户本轮的语义任务规格，不选择具体工具、不填写工具参数，也不扩展材料范围。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          version: { type: 'string', enum: [TURN_SPEC_VERSION] },
          requestKind: { type: 'string', enum: TURN_REQUEST_KINDS },
          confidence: { type: 'string', enum: CONFIDENCE_LEVELS },
          goals: {
            type: 'array',
            maxItems: MAX_GOALS,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', minLength: 1, maxLength: 40 },
                kind: { type: 'string', enum: TURN_GOAL_KINDS },
                capabilityDomain: { type: 'string', enum: allowedDomains },
                description: { type: 'string', maxLength: MAX_TEXT },
                targetDescription: { type: 'string', maxLength: MAX_TEXT },
                dependsOn: { type: 'array', maxItems: MAX_GOALS, items: { type: 'string', maxLength: 40 } },
              },
              required: ['id', 'kind', 'capabilityDomain', 'description', 'targetDescription', 'dependsOn'],
            },
          },
          groundingPolicy: {
            type: 'string',
            enum: groundingPolicy ? [groundingPolicy] : GROUNDING_POLICIES,
          },
          missingSlots: {
            type: 'array',
            maxItems: 8,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                name: { type: 'string', maxLength: MAX_SLOT_NAME },
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
          'goals',
          'groundingPolicy',
          'missingSlots',
          'clarificationQuestion',
        ],
      },
    },
  };
}

export function parseTurnSpecResponse(response, options = {}) {
  const calls = (Array.isArray(response?.toolCalls) ? response.toolCalls : []).filter(
    (call) => call?.function?.name === TURN_SPEC_TOOL_NAME,
  );
  if (calls.length !== 1) return null;
  try {
    return normalizeTurnSpec(JSON.parse(String(calls[0]?.function?.arguments || '{}')), options);
  } catch {
    return null;
  }
}

export function groundingPolicyFromScopeMode(mode) {
  const normalized = String(mode || '');
  if (normalized === 'current_explicit_only') return 'current_explicit_only';
  if (normalized === 'source_set_inherited' || normalized === 'inherited_source_set') {
    return 'inherit_confirmed_source_set';
  }
  if (normalized === 'workspace_query') return 'workspace_query';
  if (normalized === 'general_knowledge') return 'general_knowledge';
  return 'none';
}

export const __testing = Object.freeze({ canonicalTurnSpec });
