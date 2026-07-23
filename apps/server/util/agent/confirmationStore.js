import crypto from 'crypto';
import redisClient from '../redisClient.js';
import { createAgentActionIdempotencyKey } from './actionIdempotency.js';
import { stableAgentErrorCode } from './logSafety.js';

const PREFIX = 'agent:confirm:';
const TTL_SECONDS = 5 * 60;
const EXECUTION_PREFIX = 'agent:confirm-execution:';
const EXECUTION_TTL_SECONDS = 5 * 60;
const ACTION_LOCK_PREFIX = 'agent:action-lock:';
const ACTION_LOCK_TTL_SECONDS = TTL_SECONDS + 60;
const ACTION_SUCCESS_COOLDOWN_SECONDS = TTL_SECONDS;
const IDEMPOTENT_ATTACHMENT_TOOLS = new Set(['create_image_note']);
const FINALIZE_ACTION_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then
  return 0
end
if ARGV[2] == 'expire' then
  return redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))
end
return redis.call('DEL', KEYS[1])
`;
const CLAIM_EXECUTION_SCRIPT = `
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
const SETTLE_EXECUTION_SCRIPT = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then
  return 0
end
redis.call('SETEX', KEYS[1], tonumber(ARGV[3]), ARGV[2])
return 1
`;
const STORED_TOKEN_KEY = Symbol('storedTokenKey');
const STORED_TOKEN_RAW = Symbol('storedTokenRaw');
const EXECUTION_KEY = Symbol('executionKey');
const EXECUTION_RAW = Symbol('executionRaw');
const EXPECTED_OWNER_KEY = Symbol('expectedOwnerKey');

const hash = (value) =>
  crypto
    .createHash('sha256')
    .update(String(value || ''))
    .digest('hex');
const tokenKey = (token) => `${PREFIX}${hash(token)}`;
const executionKey = (token) => `${EXECUTION_PREFIX}${hash(token)}`;
const ownerHash = (ownerKey) => hash(`owner:${ownerKey}`);
const argsHash = (args) => hash(JSON.stringify(args || {}));

function confirmationBinding(confirmation) {
  return {
    id: confirmation.id,
    ownerHash: confirmation.ownerHash,
    sessionId: confirmation.sessionId,
    toolName: confirmation.toolName,
    capabilityId: confirmation.capabilityId || null,
    argsHash: confirmation.argsHash,
    resourceUserId: confirmation.resourceUserId,
    resourceUserRole: confirmation.resourceUserRole,
    adminContextId: confirmation.adminContextId || null,
    adminMode: confirmation.adminMode || null,
    idempotencyKey: confirmation.idempotencyKey || null,
  };
}

function bindingHash(binding) {
  return hash(JSON.stringify(binding));
}

function attachExecutionMetadata(confirmation, metadata) {
  Object.defineProperties(confirmation, {
    [STORED_TOKEN_KEY]: { value: metadata.tokenKey },
    [STORED_TOKEN_RAW]: { value: metadata.tokenRaw },
    [EXECUTION_KEY]: { value: metadata.executionKey },
    [EXECUTION_RAW]: { value: metadata.executionRaw, writable: true },
    [EXPECTED_OWNER_KEY]: { value: metadata.ownerKey },
  });
  return confirmation;
}

function validateConfirmation(confirmation, ownerKey, expectedSessionId) {
  if (confirmation.ownerHash !== ownerHash(ownerKey)) {
    throw new ToolConfirmationError('TOOL_CONFIRMATION_FORBIDDEN', '该操作确认不属于当前用户。', 403);
  }
  if (confirmation.sessionId !== expectedSessionId) {
    throw new ToolConfirmationError('TOOL_CONFIRMATION_FORBIDDEN', '该操作确认不属于当前会话。', 403);
  }
  if (confirmation.args && confirmation.argsHash !== argsHash(confirmation.args)) {
    throw new ToolConfirmationError('TOOL_CONFIRMATION_INVALID', '操作确认参数校验失败。');
  }
}

function parseConfirmation(raw, ownerKey, expectedSessionId) {
  let confirmation;
  try {
    confirmation = JSON.parse(raw);
  } catch {
    throw new ToolConfirmationError('TOOL_CONFIRMATION_INVALID', '操作确认数据无效。');
  }
  validateConfirmation(confirmation, ownerKey, expectedSessionId);
  return confirmation;
}

function parseExecution(raw, ownerKey, expectedSessionId) {
  let execution;
  try {
    execution = JSON.parse(raw);
  } catch {
    throw new ToolConfirmationError('TOOL_CONFIRMATION_INVALID', '操作确认结果数据无效。');
  }
  if (!execution || !['running', 'settled'].includes(execution.state) || !execution.binding) {
    throw new ToolConfirmationError('TOOL_CONFIRMATION_INVALID', '操作确认结果数据无效。');
  }
  if (execution.bindingHash !== bindingHash(execution.binding)) {
    throw new ToolConfirmationError('TOOL_CONFIRMATION_INVALID', '操作确认结果校验失败。');
  }
  validateConfirmation(execution.binding, ownerKey, expectedSessionId);
  if (execution.state === 'settled') {
    if (!execution.outcome || execution.outcomeHash !== hash(JSON.stringify(execution.outcome))) {
      throw new ToolConfirmationError('TOOL_CONFIRMATION_INVALID', '操作确认结果校验失败。');
    }
  }
  return execution;
}

function executionAttempt(raw, key, ownerKey, expectedSessionId) {
  const execution = parseExecution(raw, ownerKey, expectedSessionId);
  const confirmation = attachExecutionMetadata(
    { ...execution.binding },
    { executionKey: key, executionRaw: raw, ownerKey },
  );
  return execution.state === 'settled'
    ? { state: 'settled', confirmation, outcome: execution.outcome }
    : { state: 'running', confirmation };
}

function attachmentActionLock(toolName, args, context) {
  if (!IDEMPOTENT_ATTACHMENT_TOOLS.has(toolName)) return null;
  const attachmentId = String(args?.attachmentId || '').trim();
  const resourceUserId = String(context?.resourceUserId || '').trim();
  if (!attachmentId || !resourceUserId) return null;
  return `${ACTION_LOCK_PREFIX}${hash(`${toolName}:${resourceUserId}:${attachmentId}`)}`;
}

export class ToolConfirmationError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function publicToolConfirmation(token, confirmation, expiresIn = TTL_SECONDS) {
  return {
    token,
    id: confirmation.id,
    sessionId: confirmation.sessionId,
    toolName: confirmation.toolName,
    capabilityId: confirmation.capabilityId || null,
    args: confirmation.args,
    riskLevel: confirmation.riskLevel,
    preview: confirmation.preview,
    expiresIn,
  };
}

export async function createToolConfirmation({
  ownerKey,
  sessionId,
  toolName,
  capabilityId,
  args,
  context,
  riskLevel,
  preview,
  token: suppliedToken,
}) {
  const token = suppliedToken || crypto.randomBytes(32).toString('base64url');
  if (!/^[A-Za-z0-9_-]{40,}$/.test(token)) {
    throw new ToolConfirmationError('TOOL_CONFIRMATION_INVALID', '操作确认令牌格式无效。');
  }
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000).toISOString();
  const confirmationId = crypto.randomUUID();
  const actionLockKey = attachmentActionLock(toolName, args, context);
  const idempotencyKey = createAgentActionIdempotencyKey({
    toolName,
    args,
    context: { ...context, sessionId },
  });
  const confirmation = {
    id: confirmationId,
    ownerHash: ownerHash(ownerKey),
    sessionId,
    toolName,
    capabilityId: String(capabilityId || '').trim() || null,
    args,
    argsHash: argsHash(args),
    riskLevel: riskLevel || 'low',
    preview: preview || null,
    resourceUserId: context.resourceUserId,
    resourceUserRole: context.resourceUserRole,
    adminContextId: context.adminContextId || null,
    adminMode: context.adminMode || null,
    createdAt: new Date().toISOString(),
    expiresAt,
    actionLockKey,
    idempotencyKey,
  };
  await redisClient.setEx(tokenKey(token), TTL_SECONDS, JSON.stringify(confirmation));
  return {
    token,
    expiresIn: TTL_SECONDS,
    confirmation: publicToolConfirmation(token, confirmation, TTL_SECONDS),
  };
}

/**
 * 查询确认令牌当前阶段。已执行结果使用 token 摘要作为 Redis key，且再次校验 owner/session 绑定。
 * ready 只表示可尝试原子认领，真正消费发生在 claimToolConfirmationExecution。
 */
export async function inspectToolConfirmationExecution(token, ownerKey, expectedSessionId) {
  if (!token) {
    throw new ToolConfirmationError('TOOL_CONFIRMATION_REQUIRED', '缺少操作确认令牌。');
  }
  if (!expectedSessionId) {
    throw new ToolConfirmationError('TOOL_CONFIRMATION_SESSION_REQUIRED', '缺少操作确认所属会话。');
  }
  const resultKey = executionKey(token);
  const cached = await redisClient.get(resultKey);
  if (cached) return executionAttempt(cached, resultKey, ownerKey, expectedSessionId);

  const key = tokenKey(token);
  const raw = await redisClient.get(key);
  if (!raw) {
    // 关闭「令牌刚被消费、执行记录刚写入」边界上的误报窗口。
    const raced = await redisClient.get(resultKey);
    if (raced) return executionAttempt(raced, resultKey, ownerKey, expectedSessionId);
    throw new ToolConfirmationError('TOOL_CONFIRMATION_EXPIRED', '操作确认已过期或已经使用，请重新发起。', 410);
  }
  const confirmation = parseConfirmation(raw, ownerKey, expectedSessionId);
  if (Date.parse(confirmation.expiresAt) <= Date.now()) {
    await redisClient.del(key);
    throw new ToolConfirmationError('TOOL_CONFIRMATION_EXPIRED', '操作确认已过期，请重新发起。', 410);
  }
  attachExecutionMetadata(confirmation, { tokenKey: key, tokenRaw: raw, executionKey: resultKey, ownerKey });
  return { state: 'ready', confirmation };
}

/** 原子消费令牌并建立短期 running 记录，避免并发确认重复执行。 */
export async function claimToolConfirmationExecution(confirmation) {
  const key = confirmation?.[STORED_TOKEN_KEY];
  const raw = confirmation?.[STORED_TOKEN_RAW];
  const resultKey = confirmation?.[EXECUTION_KEY];
  if (!key || !raw || !resultKey || typeof redisClient.eval !== 'function') {
    throw new ToolConfirmationError('TOOL_CONFIRMATION_UNAVAILABLE', '安全确认服务暂不可用，请稍后重试。', 503);
  }
  const binding = confirmationBinding(confirmation);
  const running = {
    version: 1,
    state: 'running',
    binding,
    bindingHash: bindingHash(binding),
    startedAt: new Date().toISOString(),
  };
  const runningRaw = JSON.stringify(running);
  let claimed;
  try {
    claimed = await redisClient.eval(CLAIM_EXECUTION_SCRIPT, {
      keys: [key, resultKey],
      arguments: [raw, runningRaw, String(EXECUTION_TTL_SECONDS)],
    });
  } catch (error) {
    console.warn('[Agent] confirmation claim failed code=%s', stableAgentErrorCode(error));
    throw new ToolConfirmationError('TOOL_CONFIRMATION_UNAVAILABLE', '安全确认服务暂不可用，请稍后重试。', 503);
  }
  if (Number(claimed) === 1) {
    confirmation[EXECUTION_RAW] = runningRaw;
    return { state: 'claimed', confirmation };
  }
  const existing = await redisClient.get(resultKey);
  if (existing) {
    return executionAttempt(existing, resultKey, confirmation[EXPECTED_OWNER_KEY], confirmation.sessionId);
  }
  throw new ToolConfirmationError('TOOL_CONFIRMATION_EXPIRED', '操作确认已过期或已经使用，请重新发起。', 410);
}

/**
 * 写操作完成后先落短期结果，再向客户端响应。只允许持有当前 running 记录的请求结算。
 */
export async function settleToolConfirmationExecution(confirmation, outcome) {
  const key = confirmation?.[EXECUTION_KEY];
  const runningRaw = confirmation?.[EXECUTION_RAW];
  if (!key || !runningRaw || typeof redisClient.eval !== 'function') {
    throw new ToolConfirmationError('TOOL_CONFIRMATION_UNAVAILABLE', '安全确认服务暂不可用，请稍后重试。', 503);
  }
  const normalizedOutcome = {
    httpStatus: Math.min(599, Math.max(200, Number(outcome?.httpStatus || 500))),
    data: outcome?.data && typeof outcome.data === 'object' ? outcome.data : {},
    message: String(outcome?.message || '').slice(0, 500),
  };
  const settled = {
    version: 1,
    state: 'settled',
    binding: confirmationBinding(confirmation),
    bindingHash: bindingHash(confirmationBinding(confirmation)),
    outcome: normalizedOutcome,
    outcomeHash: hash(JSON.stringify(normalizedOutcome)),
    settledAt: new Date().toISOString(),
  };
  let updated;
  try {
    updated = await redisClient.eval(SETTLE_EXECUTION_SCRIPT, {
      keys: [key],
      arguments: [runningRaw, JSON.stringify(settled), String(EXECUTION_TTL_SECONDS)],
    });
  } catch (error) {
    console.warn('[Agent] confirmation settlement failed code=%s', stableAgentErrorCode(error));
    throw new ToolConfirmationError('TOOL_CONFIRMATION_UNAVAILABLE', '操作结果暂未同步，请稍后安全重试。', 503);
  }
  if (Number(updated) !== 1) {
    throw new ToolConfirmationError('TOOL_CONFIRMATION_UNAVAILABLE', '操作结果暂未同步，请稍后安全重试。', 503);
  }
  confirmation[EXECUTION_RAW] = JSON.stringify(settled);
  return normalizedOutcome;
}

/**
 * 在一次性确认令牌完成身份、会话和工具校验后，真正执行动作前获取幂等锁。
 * 准备阶段不加锁，避免页面刷新导致确认令牌丢失后仍阻塞用户。
 */
export async function acquireToolConfirmationAction(confirmation) {
  if (!confirmation?.actionLockKey) return false;
  if (typeof redisClient.set !== 'function') {
    throw new ToolConfirmationError('TOOL_CONFIRMATION_UNAVAILABLE', '安全确认服务暂不可用，请稍后重试。', 503);
  }

  let acquired;
  try {
    acquired = await redisClient.set(confirmation.actionLockKey, confirmation.id, {
      NX: true,
      EX: ACTION_LOCK_TTL_SECONDS,
    });
  } catch (error) {
    console.warn('[Agent] action lock failed code=%s', stableAgentErrorCode(error));
    throw new ToolConfirmationError('TOOL_CONFIRMATION_UNAVAILABLE', '安全确认服务暂不可用，请稍后重试。', 503);
  }
  if (acquired !== 'OK') {
    throw new ToolConfirmationError(
      'TOOL_ACTION_PENDING',
      '这张图片已经有一项执行中或刚完成的图片笔记操作，请稍后再试。',
      409,
    );
  }
  return true;
}

export async function consumeToolConfirmation(token, ownerKey, expectedSessionId) {
  if (!token) {
    throw new ToolConfirmationError('TOOL_CONFIRMATION_REQUIRED', '缺少操作确认令牌。');
  }
  if (!expectedSessionId) {
    throw new ToolConfirmationError('TOOL_CONFIRMATION_SESSION_REQUIRED', '缺少操作确认所属会话。');
  }
  const key = tokenKey(token);
  if (typeof redisClient.getDel !== 'function') {
    throw new ToolConfirmationError('TOOL_CONFIRMATION_UNAVAILABLE', '安全确认服务暂不可用，请稍后重试。', 503);
  }
  const raw = await redisClient.get(key);
  if (!raw) {
    throw new ToolConfirmationError('TOOL_CONFIRMATION_EXPIRED', '操作确认已过期或已经使用，请重新发起。', 410);
  }
  let confirmation;
  try {
    confirmation = JSON.parse(raw);
  } catch {
    throw new ToolConfirmationError('TOOL_CONFIRMATION_INVALID', '操作确认数据无效。');
  }
  if (confirmation.ownerHash !== ownerHash(ownerKey)) {
    throw new ToolConfirmationError('TOOL_CONFIRMATION_FORBIDDEN', '该操作确认不属于当前用户。', 403);
  }
  if (confirmation.sessionId !== expectedSessionId) {
    throw new ToolConfirmationError('TOOL_CONFIRMATION_FORBIDDEN', '该操作确认不属于当前会话。', 403);
  }
  if (confirmation.argsHash !== argsHash(confirmation.args)) {
    throw new ToolConfirmationError('TOOL_CONFIRMATION_INVALID', '操作确认参数校验失败。');
  }
  if (Date.parse(confirmation.expiresAt) <= Date.now()) {
    await redisClient.del(key);
    throw new ToolConfirmationError('TOOL_CONFIRMATION_EXPIRED', '操作确认已过期，请重新发起。', 410);
  }

  const consumed = await redisClient.getDel(key);
  if (!consumed || consumed !== raw) {
    throw new ToolConfirmationError('TOOL_CONFIRMATION_EXPIRED', '操作确认已过期或已经使用，请重新发起。', 410);
  }
  return confirmation;
}

export async function finalizeToolConfirmationAction(confirmation, { succeeded = false } = {}) {
  if (!confirmation?.actionLockKey) return;
  try {
    if (typeof redisClient.eval !== 'function') {
      throw new Error('Redis EVAL is unavailable');
    }
    const remainingTokenTtl = Math.max(
      0,
      Math.ceil((Date.parse(confirmation.expiresAt || '') - Date.now()) / 1000) || 0,
    );
    const cooldownSeconds = Math.max(ACTION_SUCCESS_COOLDOWN_SECONDS, remainingTokenTtl);
    await redisClient.eval(FINALIZE_ACTION_LOCK_SCRIPT, {
      keys: [confirmation.actionLockKey],
      arguments: [confirmation.id, succeeded ? 'expire' : 'delete', String(cooldownSeconds)],
    });
  } catch (error) {
    console.warn('[Agent] action lock finalization failed code=%s', stableAgentErrorCode(error));
  }
}

export async function rejectToolConfirmation(token, ownerKey, expectedSessionId) {
  const confirmation = await consumeToolConfirmation(token, ownerKey, expectedSessionId);
  return { id: confirmation.id, toolName: confirmation.toolName };
}
