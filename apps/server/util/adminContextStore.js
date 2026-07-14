import crypto from 'crypto';
import pool from '../db/index.js';
import redisClient from './redisClient.js';

const CACHE_PREFIX = 'admin-context:';
const METADATA_PREFIX = 'admin-context-meta:';
const READONLY_TTL_SECONDS = 20 * 60;
const MAINTAIN_TTL_SECONDS = 10 * 60;
const METADATA_RETENTION_SECONDS = 24 * 60 * 60;
const VALID_MODES = new Set(['readonly', 'maintain']);

const hashToken = (token) => crypto.createHash('sha256').update(String(token || '')).digest('hex');
const cacheKey = (token) => `${CACHE_PREFIX}${hashToken(token)}`;
const metadataKey = (token) => `${METADATA_PREFIX}${hashToken(token)}`;

export class AdminContextError extends Error {
  constructor(code, message, status = 403) {
    super(message);
    this.name = 'AdminContextError';
    this.code = code;
    this.status = status;
  }
}

export async function createAdminContext({ actor, actorSessionId, subjectUserId, mode }) {
  if (process.env.ADMIN_CONTEXT_ENABLED === 'false' || process.env.ADMIN_PREVIEW_ENABLED === 'false') {
    throw new AdminContextError('ADMIN_CONTEXT_DISABLED', '管理员预览功能当前未开启。', 503);
  }
  if (!actor?.id || actor.role !== 'root' || !actorSessionId) {
    throw new AdminContextError('ADMIN_CONTEXT_FORBIDDEN', '仅真实 root 登录会话可开启管理员预览。');
  }
  if (!VALID_MODES.has(mode)) {
    throw new AdminContextError('ADMIN_CONTEXT_MODE_INVALID', '管理员上下文模式无效。', 400);
  }
  // 内容代管是高风险能力，必须由部署环境显式开启；未配置时保持关闭。
  if (mode === 'maintain' && process.env.ADMIN_MAINTENANCE_ENABLED !== 'true') {
    throw new AdminContextError('ADMIN_MAINTENANCE_DISABLED', '管理员内容代管功能当前未开启。');
  }
  if (!subjectUserId || subjectUserId === actor.id) {
    throw new AdminContextError('ADMIN_CONTEXT_TARGET_INVALID', '不能预览当前 root 账号。', 400);
  }

  const [rows] = await pool.query(
    'SELECT id, alias, email, role, del_flag FROM user WHERE id = ? LIMIT 1',
    [subjectUserId],
  );
  const subject = rows[0];
  if (!subject) {
    throw new AdminContextError('ADMIN_CONTEXT_TARGET_MISSING', '目标用户不存在。', 404);
  }
  if (subject.role === 'root') {
    throw new AdminContextError('ADMIN_CONTEXT_TARGET_INVALID', '不能以管理员上下文进入其他 root 账号。');
  }
  if (mode === 'maintain' && Number(subject.del_flag || 0) === 1) {
    throw new AdminContextError(
      'ADMIN_MAINTENANCE_FORBIDDEN',
      '封禁账号仅允许只读预览，请先通过独立安全流程处理封禁状态。',
    );
  }

  const token = crypto.randomBytes(32).toString('base64url');
  const contextId = crypto.randomUUID();
  const ttlSeconds = mode === 'maintain' ? MAINTAIN_TTL_SECONDS : READONLY_TTL_SECONDS;
  const now = Date.now();
  const context = {
    id: contextId,
    actorUserId: actor.id,
    actorSessionId,
    subjectUserId: subject.id,
    subjectRole: subject.role,
    subjectAlias: subject.alias || '',
    mode,
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlSeconds * 1000).toISOString(),
  };

  const serialized = JSON.stringify(context);
  await Promise.all([
    redisClient.setEx(cacheKey(token), ttlSeconds, serialized),
    // 活跃令牌到期后短时保留不含原始 token 的元数据，只用于记录过期访问审计。
    redisClient.setEx(metadataKey(token), ttlSeconds + METADATA_RETENTION_SECONDS, serialized),
  ]);
  return { token, ttlSeconds, context };
}

export async function getAdminContext(token) {
  if (!token) return null;
  const raw = await redisClient.get(cacheKey(token));
  if (!raw) return null;
  try {
    const context = JSON.parse(raw);
    if (!context?.id || !VALID_MODES.has(context.mode)) return null;
    return context;
  } catch {
    return null;
  }
}

export async function getAdminContextMetadata(token) {
  if (!token) return null;
  const raw = await redisClient.get(metadataKey(token));
  if (!raw) return null;
  try {
    const context = JSON.parse(raw);
    if (!context?.id || !VALID_MODES.has(context.mode) || !context.expiresAt) return null;
    return {
      context,
      expired: Date.parse(context.expiresAt) <= Date.now(),
    };
  } catch {
    return null;
  }
}

export async function revokeAdminContext(token) {
  if (!token) return false;
  const [activeDeleted, metadataDeleted] = await Promise.all([
    redisClient.del(cacheKey(token)),
    redisClient.del(metadataKey(token)),
  ]);
  return activeDeleted > 0 || metadataDeleted > 0;
}

export function adminContextPublicView(context) {
  if (!context) return null;
  return {
    id: context.id,
    subjectUserId: context.subjectUserId,
    subjectRole: context.subjectRole,
    subjectAlias: context.subjectAlias,
    mode: context.mode,
    issuedAt: context.issuedAt,
    expiresAt: context.expiresAt,
  };
}
