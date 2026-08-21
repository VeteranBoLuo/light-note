import { requestAi } from '../../aiGateway.js';

export const SLOT_FILLER_VERSION = '1.0';
export const SLOT_FILLER_TOOL_NAME = 'submit_goal_slot_values_v3';
const MAX_LATEST_MESSAGE_CHARS = 4_000;

function hasOnlyKeys(value, keys) {
  return (
    value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every((key) => keys.includes(key))
  );
}

export function modelSlotsForCapability(capability) {
  return Object.freeze(
    (Array.isArray(capability?.slots) ? capability.slots : []).filter((slot) =>
      ['model_text', 'model_enum'].includes(slot?.source),
    ),
  );
}

function valueSchema(slot) {
  const value =
    slot.source === 'model_enum'
      ? { type: 'string', enum: slot.enum }
      : { type: 'string', minLength: 1, maxLength: slot.maxLength };
  return { anyOf: [value, { type: 'null' }] };
}

export function buildSlotFillerToolDefinition({ goal, capability } = {}) {
  const slots = modelSlotsForCapability(capability);
  const requiredNames = slots.filter((slot) => slot.required).map((slot) => slot.name);
  return {
    type: 'function',
    function: {
      name: SLOT_FILLER_TOOL_NAME,
      description: '只提取当前目标已声明的文字或枚举槽；不得选择工具、能力、依赖、资源、时间或账号。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          version: { type: 'string', enum: [SLOT_FILLER_VERSION] },
          goalId: { type: 'string', enum: [goal?.id || 'missing'] },
          slots: {
            type: 'object',
            additionalProperties: false,
            properties: Object.fromEntries(slots.map((slot) => [slot.name, valueSchema(slot)])),
            required: slots.map((slot) => slot.name),
          },
          missing: {
            type: 'array',
            maxItems: requiredNames.length,
            items: { type: 'string', enum: requiredNames.length ? requiredNames : ['__none__'] },
          },
        },
        required: ['version', 'goalId', 'slots', 'missing'],
      },
    },
  };
}

function parseArguments(value) {
  try {
    const parsed = JSON.parse(String(value || '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function parseSlotFillerResponse(response, { goal, capability } = {}) {
  const calls = Array.isArray(response?.toolCalls) ? response.toolCalls : [];
  const targetCalls = calls.filter((call) => call?.function?.name === SLOT_FILLER_TOOL_NAME);
  if (targetCalls.length !== 1 || calls.length !== 1) return null;
  const raw = parseArguments(targetCalls[0]?.function?.arguments);
  const slots = modelSlotsForCapability(capability);
  const names = slots.map((slot) => slot.name);
  if (
    !hasOnlyKeys(raw, ['version', 'goalId', 'slots', 'missing']) ||
    raw.version !== SLOT_FILLER_VERSION ||
    raw.goalId !== goal?.id ||
    !hasOnlyKeys(raw.slots, names) ||
    Object.keys(raw.slots).length !== names.length ||
    !Array.isArray(raw.missing)
  ) {
    return null;
  }
  const missing = [...new Set(raw.missing.map(String))];
  const required = new Set(slots.filter((slot) => slot.required).map((slot) => slot.name));
  if (missing.some((name) => !required.has(name))) return null;
  for (const slot of slots) {
    const value = raw.slots[slot.name];
    if (value == null) {
      if (slot.required && !missing.includes(slot.name)) return null;
      continue;
    }
    if (typeof value !== 'string' || !value.trim()) return null;
    if (slot.source === 'model_text' && value.length > slot.maxLength) return null;
    if (slot.source === 'model_enum' && !slot.enum.includes(value)) return null;
    if (missing.includes(slot.name)) return null;
  }
  return Object.freeze({
    goalId: goal.id,
    slots: Object.freeze(Object.fromEntries(slots.map((slot) => [slot.name, raw.slots[slot.name] ?? null]))),
    missing: Object.freeze(missing),
  });
}

function slotFillerPrompt() {
  return [
    '你是轻笺 Agent 的受限 Slot Filler，只处理一个已经确定的目标。',
    '仅从 payload.latestMessage 提取 payload.slots 中声明的文字或枚举值；未出现就返回 null。',
    '不得选择 capability、toolName、依赖，不得输出或猜测资源 ID、URL、时间、用户范围、确认令牌和默认值。',
    `必须且只能调用 ${SLOT_FILLER_TOOL_NAME}，不要输出普通文本或额外工具调用。`,
  ].join('\n');
}

export async function fillAgentGoalSlots({
  message,
  goal,
  capability,
  signal,
  traceId = '',
  request = requestAi,
  onResponse,
} = {}) {
  const slots = modelSlotsForCapability(capability);
  if (!goal || !slots.length) return Object.freeze({ applicable: false, reason: 'no_model_slots', attempts: 0 });
  const existing = goal.slotClaims && typeof goal.slotClaims === 'object' ? goal.slotClaims : {};
  if (
    slots.every(
      (slot) =>
        Object.prototype.hasOwnProperty.call(existing, slot.name) &&
        (!slot.required || (existing[slot.name] !== null && existing[slot.name] !== undefined)),
    )
  ) {
    return Object.freeze({
      applicable: true,
      slotValues: Object.freeze(Object.fromEntries(slots.map((slot) => [slot.name, existing[slot.name] ?? null]))),
      missing: Object.freeze([]),
      attempts: 0,
      planningMode: 'slot_filler',
    });
  }
  const response = await request(
    [
      { role: 'system', content: slotFillerPrompt() },
      {
        role: 'user',
        content: JSON.stringify({
          latestMessage: String(message || '')
            .trim()
            .slice(0, MAX_LATEST_MESSAGE_CHARS),
          goal: {
            id: goal.id,
            operation: goal.operation,
            description: goal.description,
            targetDescription: goal.targetDescription,
          },
          slots: slots.map((slot) => ({
            name: slot.name,
            source: slot.source,
            required: slot.required,
            maxLength: slot.maxLength,
            enum: slot.enum,
          })),
        }),
      },
    ],
    {
      tools: [buildSlotFillerToolDefinition({ goal, capability })],
      toolChoice: { type: 'function', function: { name: SLOT_FILLER_TOOL_NAME } },
      signal,
      maxTokens: 800,
      temperature: 0,
      trace: { traceId, stage: 'slot_filler_v3' },
    },
  );
  onResponse?.(response, 1);
  const parsed = parseSlotFillerResponse(response, { goal, capability });
  if (!parsed) return Object.freeze({ applicable: false, reason: 'slot_filler_invalid', attempts: 1 });
  if (parsed.missing.length) {
    return Object.freeze({
      applicable: false,
      reason: 'required_model_slots_missing',
      missing: parsed.missing,
      attempts: 1,
    });
  }
  return Object.freeze({
    applicable: true,
    slotValues: parsed.slots,
    missing: parsed.missing,
    attempts: 1,
    planningMode: 'slot_filler',
  });
}

export const __testing = Object.freeze({ hasOnlyKeys, slotFillerPrompt, valueSchema });
