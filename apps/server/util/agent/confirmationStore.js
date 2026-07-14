import crypto from 'crypto';
import redisClient from '../redisClient.js';

const PREFIX = 'agent:confirm:';
const TTL_SECONDS = 5 * 60;

const hash = (value) => crypto.createHash('sha256').update(String(value || '')).digest('hex');
const tokenKey = (token) => `${PREFIX}${hash(token)}`;
const ownerHash = (ownerKey) => hash(`owner:${ownerKey}`);
const argsHash = (args) => hash(JSON.stringify(args || {}));

export class ToolConfirmationError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function createToolConfirmation({ ownerKey, sessionId, toolName, args, context, riskLevel, preview }) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000).toISOString();
  const confirmation = {
    id: crypto.randomUUID(),
    ownerHash: ownerHash(ownerKey),
    sessionId,
    toolName,
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
  };
  await redisClient.setEx(tokenKey(token), TTL_SECONDS, JSON.stringify(confirmation));
  return {
    token,
    expiresIn: TTL_SECONDS,
    confirmation: {
      id: confirmation.id,
      sessionId: confirmation.sessionId,
      toolName,
      args,
      riskLevel: confirmation.riskLevel,
      preview: confirmation.preview,
      expiresIn: TTL_SECONDS,
    },
  };
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

export async function rejectToolConfirmation(token, ownerKey, expectedSessionId) {
  const confirmation = await consumeToolConfirmation(token, ownerKey, expectedSessionId);
  return { id: confirmation.id, toolName: confirmation.toolName };
}
