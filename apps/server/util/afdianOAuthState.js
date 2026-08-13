import crypto from 'node:crypto';
import redisClient from './redisClient.js';
import { afdianError } from './afdianConfig.js';

const STATE_TTL_SECONDS = 10 * 60;
const STATE_KEY_PREFIX = 'oauth:afdian:state:';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

function stateKey(state) {
  const digest = crypto.createHash('sha256').update(state).digest('hex');
  return `${STATE_KEY_PREFIX}${digest}`;
}

export async function createAfdianOAuthState({ userId, sessionId }) {
  if (!userId || !sessionId) throw afdianError('AFDIAN_OAUTH_SESSION_REQUIRED', '请先登录轻笺', 401);
  const state = crypto.randomBytes(32).toString('base64url');
  await redisClient.setEx(
    stateKey(state),
    STATE_TTL_SECONDS,
    JSON.stringify({ userId: String(userId), sessionDigest: sha256(sessionId), createdAt: Date.now() }),
  );
  return { state, expiresIn: STATE_TTL_SECONDS };
}

export async function consumeAfdianOAuthState({ state, userId, sessionId }) {
  const normalizedState = String(state || '').trim();
  if (!TOKEN_PATTERN.test(normalizedState) || !userId || !sessionId) {
    throw afdianError('AFDIAN_OAUTH_STATE_INVALID', '爱发电授权校验失败，请重新发起');
  }
  const raw = await redisClient.getDel(stateKey(normalizedState));
  if (!raw) throw afdianError('AFDIAN_OAUTH_STATE_EXPIRED', '爱发电授权已过期，请重新发起');
  let challenge;
  try {
    challenge = JSON.parse(raw);
  } catch {
    throw afdianError('AFDIAN_OAUTH_STATE_INVALID', '爱发电授权校验失败，请重新发起');
  }
  const age = Date.now() - Number(challenge.createdAt || 0);
  if (
    challenge.userId !== String(userId) ||
    challenge.sessionDigest !== sha256(sessionId) ||
    !Number.isFinite(age) ||
    age < 0 ||
    age > STATE_TTL_SECONDS * 1000
  ) {
    throw afdianError('AFDIAN_OAUTH_STATE_INVALID', '爱发电授权校验失败，请重新发起');
  }
}

function sha256(value) {
  return crypto
    .createHash('sha256')
    .update(String(value || ''))
    .digest('hex');
}
