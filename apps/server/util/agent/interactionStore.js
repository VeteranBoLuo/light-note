import crypto from 'node:crypto';
import redisClient from '../redisClient.js';

const PREFIX = 'agent:interaction:';
const RESULT_PREFIX = 'agent:interaction-result:';
const TTL_SECONDS = 5 * 60;
const RESULT_TTL_SECONDS = 5 * 60;
const CLAIM_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if current == ARGV[1] then
  if redis.call('EXISTS', KEYS[2]) == 1 then
    return 2
  end
  redis.call('DEL', KEYS[1])
  redis.call('SETEX', KEYS[2], tonumber(ARGV[3]), ARGV[2])
  return 1
end
if redis.call('EXISTS', KEYS[2]) == 1 then
  return 2
end
return 0
`;
const SETTLE_SCRIPT = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then
  return 0
end
redis.call('SETEX', KEYS[1], tonumber(ARGV[3]), ARGV[2])
return 1
`;

const STORED_TOKEN_KEY = Symbol('interactionTokenKey');
const STORED_TOKEN_RAW = Symbol('interactionTokenRaw');
const RESULT_KEY = Symbol('interactionResultKey');
const RESULT_RAW = Symbol('interactionResultRaw');
const EXPECTED_OWNER_KEY = Symbol('interactionOwnerKey');

const hash = (value) =>
  crypto
    .createHash('sha256')
    .update(String(value || ''))
    .digest('hex');
const tokenKey = (token) => `${PREFIX}${hash(token)}`;
const resultKey = (token) => `${RESULT_PREFIX}${hash(token)}`;
const ownerHash = (ownerKey) => hash(`owner:${ownerKey}`);
const stableHash = (value) => hash(JSON.stringify(value ?? null));

export class AgentInteractionError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function cleanText(value, maxLength, fieldName, required = false) {
  const text = String(value || '').trim();
  if (required && !text) throw new AgentInteractionError('AGENT_INTERACTION_INVALID', `${fieldName}不能为空。`);
  if (text.length > maxLength) {
    throw new AgentInteractionError('AGENT_INTERACTION_INVALID', `${fieldName}不能超过 ${maxLength} 个字符。`);
  }
  return text;
}

function normalizeI18nParams(value) {
  if (value == null) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AgentInteractionError('AGENT_INTERACTION_INVALID', '交互文案参数格式无效。');
  }
  const entries = Object.entries(value);
  if (entries.length > 20) throw new AgentInteractionError('AGENT_INTERACTION_INVALID', '交互文案参数过多。');
  return Object.fromEntries(
    entries.map(([key, item]) => {
      if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key)) {
        throw new AgentInteractionError('AGENT_INTERACTION_INVALID', '交互文案参数名称无效。');
      }
      const normalized = ['string', 'number', 'boolean'].includes(typeof item) ? item : String(item ?? '');
      if (String(normalized).length > 300) {
        throw new AgentInteractionError('AGENT_INTERACTION_INVALID', '交互文案参数过长。');
      }
      return [key, normalized];
    }),
  );
}

function normalizeOptions(rawOptions) {
  if (!Array.isArray(rawOptions) || rawOptions.length < 1 || rawOptions.length > 20) {
    throw new AgentInteractionError('AGENT_INTERACTION_INVALID', '交互选项数量必须在 1～20 个之间。');
  }
  const ids = new Set();
  return rawOptions.map((option) => {
    const id = cleanText(option?.id, 80, '选项 ID', true);
    if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(id) || ids.has(id)) {
      throw new AgentInteractionError('AGENT_INTERACTION_INVALID', '交互选项 ID 无效或重复。');
    }
    ids.add(id);
    return {
      id,
      label: cleanText(option?.label, 120, '选项标题', true),
      description: cleanText(option?.description, 300, '选项说明'),
      i18nKey: cleanText(option?.i18nKey, 160, '选项国际化键'),
      i18nParams: normalizeI18nParams(option?.i18nParams),
      recommended: Boolean(option?.recommended),
      disabled: Boolean(option?.disabled),
    };
  });
}

function normalizeSpec(rawSpec = {}) {
  const type = String(rawSpec.type || 'single_choice');
  if (!['single_choice', 'multi_choice', 'confirmation'].includes(type)) {
    throw new AgentInteractionError('AGENT_INTERACTION_INVALID', '不支持的交互类型。');
  }
  const purpose = String(rawSpec.purpose || 'choice');
  if (!['choice', 'choice_confirmation'].includes(purpose)) {
    throw new AgentInteractionError('AGENT_INTERACTION_INVALID', '不支持的交互用途。');
  }
  const options = normalizeOptions(rawSpec.options);
  const selectableCount = options.filter((option) => !option.disabled).length;
  const defaultMin = type === 'multi_choice' ? 1 : 1;
  const defaultMax = type === 'multi_choice' ? selectableCount : 1;
  const minSelections = Number.isInteger(Number(rawSpec.minSelections))
    ? Number(rawSpec.minSelections)
    : defaultMin;
  const maxSelections = Number.isInteger(Number(rawSpec.maxSelections))
    ? Number(rawSpec.maxSelections)
    : defaultMax;
  if (minSelections < 0 || maxSelections < 1 || minSelections > maxSelections || maxSelections > selectableCount) {
    throw new AgentInteractionError('AGENT_INTERACTION_INVALID', '交互选择数量限制无效。');
  }
  if (type !== 'multi_choice' && (minSelections !== 1 || maxSelections !== 1)) {
    throw new AgentInteractionError('AGENT_INTERACTION_INVALID', '单选和确认交互必须且只能选择一项。');
  }
  if (purpose === 'choice_confirmation' && rawSpec.allowCustom) {
    throw new AgentInteractionError('AGENT_INTERACTION_INVALID', '写操作选项不支持自定义回答。');
  }
  return {
    code: cleanText(rawSpec.code, 80, '交互代码'),
    type,
    purpose,
    title: cleanText(rawSpec.title, 120, '交互标题', true),
    description: cleanText(rawSpec.description, 500, '交互说明'),
    i18nKey: cleanText(rawSpec.i18nKey, 160, '交互国际化键'),
    i18nParams: normalizeI18nParams(rawSpec.i18nParams),
    options,
    minSelections,
    maxSelections,
    allowCustom: Boolean(rawSpec.allowCustom),
    customLabel: cleanText(rawSpec.customLabel, 80, '自定义选项标题'),
    customPlaceholder: cleanText(rawSpec.customPlaceholder, 160, '自定义输入提示'),
    submitLabel: cleanText(rawSpec.submitLabel, 40, '提交按钮文案'),
    cancelLabel: cleanText(rawSpec.cancelLabel, 40, '取消按钮文案'),
  };
}

function interactionBinding(interaction) {
  return {
    id: interaction.id,
    ownerHash: interaction.ownerHash,
    sessionId: interaction.sessionId,
    spec: interaction.spec,
    specHash: interaction.specHash,
    action: interaction.action,
    actionHash: interaction.actionHash,
    resourceUserId: interaction.resourceUserId,
    resourceUserRole: interaction.resourceUserRole,
    adminContextId: interaction.adminContextId || null,
    adminMode: interaction.adminMode || null,
    createdAt: interaction.createdAt,
    expiresAt: interaction.expiresAt,
  };
}

function bindingHash(binding) {
  return stableHash(binding);
}

function attachMetadata(interaction, metadata) {
  Object.defineProperties(interaction, {
    [STORED_TOKEN_KEY]: { value: metadata.tokenKey },
    [STORED_TOKEN_RAW]: { value: metadata.tokenRaw },
    [RESULT_KEY]: { value: metadata.resultKey },
    [RESULT_RAW]: { value: metadata.resultRaw, writable: true },
    [EXPECTED_OWNER_KEY]: { value: metadata.ownerKey },
  });
  return interaction;
}

function validateInteraction(interaction, ownerKey, expectedSessionId) {
  if (interaction.ownerHash !== ownerHash(ownerKey)) {
    throw new AgentInteractionError('AGENT_INTERACTION_FORBIDDEN', '该交互不属于当前用户。', 403);
  }
  if (!expectedSessionId || interaction.sessionId !== expectedSessionId) {
    throw new AgentInteractionError('AGENT_INTERACTION_FORBIDDEN', '该交互不属于当前会话。', 403);
  }
  if (interaction.specHash !== stableHash(interaction.spec) || interaction.actionHash !== stableHash(interaction.action)) {
    throw new AgentInteractionError('AGENT_INTERACTION_INVALID', '交互数据校验失败。');
  }
}

function parseStored(raw, ownerKey, expectedSessionId) {
  let interaction;
  try {
    interaction = JSON.parse(raw);
  } catch {
    throw new AgentInteractionError('AGENT_INTERACTION_INVALID', '交互数据无效。');
  }
  validateInteraction(interaction, ownerKey, expectedSessionId);
  return interaction;
}

function parseResult(raw, ownerKey, expectedSessionId) {
  let result;
  try {
    result = JSON.parse(raw);
  } catch {
    throw new AgentInteractionError('AGENT_INTERACTION_INVALID', '交互结果数据无效。');
  }
  if (!result || !['running', 'settled'].includes(result.state) || !result.binding) {
    throw new AgentInteractionError('AGENT_INTERACTION_INVALID', '交互结果数据无效。');
  }
  if (result.bindingHash !== bindingHash(result.binding)) {
    throw new AgentInteractionError('AGENT_INTERACTION_INVALID', '交互结果校验失败。');
  }
  validateInteraction(result.binding, ownerKey, expectedSessionId);
  if (result.responseHash !== stableHash(result.response)) {
    throw new AgentInteractionError('AGENT_INTERACTION_INVALID', '交互回答校验失败。');
  }
  if (result.state === 'settled' && result.outcomeHash !== stableHash(result.outcome)) {
    throw new AgentInteractionError('AGENT_INTERACTION_INVALID', '交互结果校验失败。');
  }
  return result;
}

function normalizeResponse(interaction, rawResponse = {}) {
  const cancelled = rawResponse.cancelled === true;
  if (cancelled) return { cancelled: true, selectedIds: [], customValue: '' };
  const selectedIds = [...new Set((Array.isArray(rawResponse.selectedIds) ? rawResponse.selectedIds : []).map(String))];
  const optionMap = new Map(interaction.spec.options.map((option) => [option.id, option]));
  if (selectedIds.some((id) => !optionMap.has(id) || optionMap.get(id).disabled)) {
    throw new AgentInteractionError('AGENT_INTERACTION_RESPONSE_INVALID', '选择中包含无效选项。');
  }
  const customValue = cleanText(rawResponse.customValue, 1000, '自定义回答');
  if (customValue && !interaction.spec.allowCustom) {
    throw new AgentInteractionError('AGENT_INTERACTION_RESPONSE_INVALID', '当前问题不支持自定义回答。');
  }
  const count = selectedIds.length + (customValue ? 1 : 0);
  if (count < interaction.spec.minSelections || count > interaction.spec.maxSelections) {
    throw new AgentInteractionError(
      'AGENT_INTERACTION_RESPONSE_INVALID',
      `请选择 ${interaction.spec.minSelections}～${interaction.spec.maxSelections} 项。`,
    );
  }
  return { cancelled: false, selectedIds, customValue };
}

function publicInteraction(token, interaction) {
  return {
    token,
    id: interaction.id,
    sessionId: interaction.sessionId,
    ...interaction.spec,
    expiresIn: TTL_SECONDS,
  };
}

export async function createAgentInteraction({ ownerKey, sessionId, spec, action, context }) {
  if (!ownerKey || !sessionId || !action || typeof action !== 'object' || Array.isArray(action)) {
    throw new AgentInteractionError('AGENT_INTERACTION_INVALID', '交互上下文不完整。');
  }
  const normalizedSpec = normalizeSpec(spec);
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000).toISOString();
  const interaction = {
    id: crypto.randomUUID(),
    ownerHash: ownerHash(ownerKey),
    sessionId,
    spec: normalizedSpec,
    specHash: stableHash(normalizedSpec),
    action,
    actionHash: stableHash(action),
    resourceUserId: context?.resourceUserId,
    resourceUserRole: context?.resourceUserRole,
    adminContextId: context?.adminContextId || null,
    adminMode: context?.adminMode || null,
    createdAt: new Date().toISOString(),
    expiresAt,
  };
  await redisClient.setEx(tokenKey(token), TTL_SECONDS, JSON.stringify(interaction));
  return { token, expiresIn: TTL_SECONDS, interaction: publicInteraction(token, interaction) };
}

function resultAttempt(raw, key, ownerKey, expectedSessionId) {
  const result = parseResult(raw, ownerKey, expectedSessionId);
  const interaction = attachMetadata(
    { ...result.binding },
    { resultKey: key, resultRaw: raw, ownerKey },
  );
  return result.state === 'settled'
    ? { state: 'settled', interaction, response: result.response, outcome: result.outcome }
    : { state: 'running', interaction, response: result.response };
}

export async function inspectAgentInteractionResponse(token, ownerKey, expectedSessionId, rawResponse) {
  if (!token) throw new AgentInteractionError('AGENT_INTERACTION_REQUIRED', '缺少交互令牌。');
  const responseKey = resultKey(token);
  const cached = await redisClient.get(responseKey);
  if (cached) return resultAttempt(cached, responseKey, ownerKey, expectedSessionId);

  const key = tokenKey(token);
  const raw = await redisClient.get(key);
  if (!raw) {
    const raced = await redisClient.get(responseKey);
    if (raced) return resultAttempt(raced, responseKey, ownerKey, expectedSessionId);
    throw new AgentInteractionError('AGENT_INTERACTION_EXPIRED', '该问题已过期或已经回答，请重新发起。', 410);
  }
  const interaction = parseStored(raw, ownerKey, expectedSessionId);
  if (Date.parse(interaction.expiresAt) <= Date.now()) {
    await redisClient.del(key);
    throw new AgentInteractionError('AGENT_INTERACTION_EXPIRED', '该问题已过期，请重新发起。', 410);
  }
  const response = normalizeResponse(interaction, rawResponse);
  attachMetadata(interaction, { tokenKey: key, tokenRaw: raw, resultKey: responseKey, ownerKey });
  return { state: 'ready', interaction, response };
}

export async function claimAgentInteractionResponse(interaction, response) {
  const key = interaction?.[STORED_TOKEN_KEY];
  const raw = interaction?.[STORED_TOKEN_RAW];
  const responseKey = interaction?.[RESULT_KEY];
  const ownerKey = interaction?.[EXPECTED_OWNER_KEY];
  if (!key || !raw || !responseKey || !ownerKey) {
    throw new AgentInteractionError('AGENT_INTERACTION_INVALID', '交互响应缺少原子认领上下文。');
  }
  const binding = interactionBinding(interaction);
  const running = {
    state: 'running',
    binding,
    bindingHash: bindingHash(binding),
    response,
    responseHash: stableHash(response),
  };
  let claimed;
  try {
    claimed = await redisClient.eval(CLAIM_SCRIPT, {
      keys: [key, responseKey],
      arguments: [raw, JSON.stringify(running), String(RESULT_TTL_SECONDS)],
    });
  } catch {
    throw new AgentInteractionError('AGENT_INTERACTION_UNAVAILABLE', '交互服务暂时不可用，请稍后重试。', 503);
  }
  if (Number(claimed) === 1) {
    const runningRaw = JSON.stringify(running);
    return {
      state: 'claimed',
      interaction: attachMetadata(
        { ...binding },
        { resultKey: responseKey, resultRaw: runningRaw, ownerKey },
      ),
      response,
    };
  }
  const cached = await redisClient.get(responseKey);
  if (cached) return resultAttempt(cached, responseKey, ownerKey, interaction.sessionId);
  throw new AgentInteractionError('AGENT_INTERACTION_EXPIRED', '该问题已过期或已经回答，请重新发起。', 410);
}

export async function settleAgentInteractionResponse(interaction, response, outcome) {
  const key = interaction?.[RESULT_KEY];
  const raw = interaction?.[RESULT_RAW];
  if (!key || !raw) throw new AgentInteractionError('AGENT_INTERACTION_INVALID', '交互结果缺少结算上下文。');
  const running = parseResult(raw, interaction[EXPECTED_OWNER_KEY], interaction.sessionId);
  const settled = {
    ...running,
    state: 'settled',
    response,
    responseHash: stableHash(response),
    outcome,
    outcomeHash: stableHash(outcome),
  };
  let result;
  try {
    result = await redisClient.eval(SETTLE_SCRIPT, {
      keys: [key],
      arguments: [raw, JSON.stringify(settled), String(RESULT_TTL_SECONDS)],
    });
  } catch {
    throw new AgentInteractionError('AGENT_INTERACTION_UNAVAILABLE', '交互结果暂时无法同步，请安全重试。', 503);
  }
  if (Number(result) !== 1) {
    throw new AgentInteractionError('AGENT_INTERACTION_UNAVAILABLE', '交互结果暂时无法同步，请安全重试。', 503);
  }
  interaction[RESULT_RAW] = JSON.stringify(settled);
  return outcome;
}
