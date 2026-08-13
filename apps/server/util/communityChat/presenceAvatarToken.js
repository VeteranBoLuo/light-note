import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const TOKEN_VERSION = 'v1';
const TOKEN_TTL_MS = 5 * 60 * 1000;
const TOKEN_PATTERN = /^v1\.([A-Za-z0-9_-]{40,512})$/;

function tokenError(code) {
  const error = new Error(code);
  error.code = code;
  error.status = code.endsWith('_EXPIRED') ? 410 : 404;
  return error;
}

function tokenKey(env = process.env) {
  // 社区可配置独立密钥；旧环境尚未配置时复用已有高熵 HMAC 密钥并做用途隔离派生，
  // 避免一次普通头像增强要求立刻修改生产环境变量。
  const secret = String(
    env.COMMUNITY_CHAT_PRESENCE_TOKEN_SECRET ||
      env.AI_TELEMETRY_HMAC_SECRET ||
      env.AI_QUOTA_HASH_SECRET ||
      env.SESSION_SECRET ||
      '',
  ).trim();
  if (secret.length < 32) throw tokenError('COMMUNITY_CHAT_PRESENCE_TOKEN_UNAVAILABLE');
  return createHash('sha256').update(`light-note:community-chat:presence-avatar:${secret}`).digest();
}

export function issueCommunityChatPresenceAvatarToken(userId, { env = process.env, now = Date.now() } = {}) {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId || normalizedUserId.length > 80) {
    throw tokenError('COMMUNITY_CHAT_PRESENCE_AVATAR_INVALID');
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', tokenKey(env), iv);
  cipher.setAAD(Buffer.from(TOKEN_VERSION));
  const plaintext = Buffer.from(JSON.stringify({ userId: normalizedUserId, expiresAt: now + TOKEN_TTL_MS }), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${TOKEN_VERSION}.${Buffer.concat([iv, tag, ciphertext]).toString('base64url')}`;
}

export function verifyCommunityChatPresenceAvatarToken(token, { env = process.env, now = Date.now() } = {}) {
  const match = TOKEN_PATTERN.exec(String(token || '').trim());
  if (!match) throw tokenError('COMMUNITY_CHAT_PRESENCE_AVATAR_INVALID');
  try {
    const packed = Buffer.from(match[1], 'base64url');
    if (packed.length < 29) throw tokenError('COMMUNITY_CHAT_PRESENCE_AVATAR_INVALID');
    const decipher = createDecipheriv('aes-256-gcm', tokenKey(env), packed.subarray(0, 12));
    decipher.setAAD(Buffer.from(TOKEN_VERSION));
    decipher.setAuthTag(packed.subarray(12, 28));
    const payload = JSON.parse(
      Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString('utf8'),
    );
    const userId = String(payload?.userId || '').trim();
    const expiresAt = Number(payload?.expiresAt || 0);
    if (!userId || userId.length > 80 || !Number.isFinite(expiresAt)) {
      throw tokenError('COMMUNITY_CHAT_PRESENCE_AVATAR_INVALID');
    }
    if (expiresAt < now) throw tokenError('COMMUNITY_CHAT_PRESENCE_AVATAR_EXPIRED');
    return { userId, expiresAt };
  } catch (error) {
    if (error?.code === 'COMMUNITY_CHAT_PRESENCE_AVATAR_EXPIRED') throw error;
    throw tokenError('COMMUNITY_CHAT_PRESENCE_AVATAR_INVALID');
  }
}

export const COMMUNITY_CHAT_PRESENCE_AVATAR_TOKEN_TTL_MS = TOKEN_TTL_MS;
