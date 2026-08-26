import crypto from 'node:crypto';
import redisClient from './redisClient.js';

const AUTHORIZATION_CODE_TTL_SECONDS = 5 * 60;
const AUTHORIZATION_CODE_PREFIX = 'extension:authorization-code:';
const EXTENSION_ID_PATTERN = /^[a-p]{32}$/u;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/u;
const PKCE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43,128}$/u;
const PKCE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/u;
const DEVICE_DIGEST_PATTERN = /^[0-9a-f]{64}$/u;

function extensionAuthError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function sha256Base64Url(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('base64url');
}

function timingSafeEqualText(actualValue, expectedValue) {
  try {
    const actual = Buffer.from(String(actualValue || ''));
    const expected = Buffer.from(String(expectedValue || ''));
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function configuredExtensionIds(env = process.env) {
  return new Set(
    String(env.LIGHTNOTE_EXTENSION_IDS || '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter((item) => EXTENSION_ID_PATTERN.test(item)),
  );
}

function normalizeExtensionClient({ clientId, redirectUri } = {}, env = process.env) {
  const normalizedClientId = String(clientId || '')
    .trim()
    .toLowerCase();
  if (!EXTENSION_ID_PATTERN.test(normalizedClientId)) {
    throw extensionAuthError('EXTENSION_CLIENT_INVALID', '浏览器插件身份无效');
  }

  const allowedIds = configuredExtensionIds(env);
  if (allowedIds.size === 0) {
    throw extensionAuthError('EXTENSION_AUTH_NOT_CONFIGURED', '浏览器插件授权暂不可用', 503);
  }
  if (!allowedIds.has(normalizedClientId)) {
    throw extensionAuthError('EXTENSION_CLIENT_FORBIDDEN', '该浏览器插件未获授权', 403);
  }

  const normalizedRedirectUri = String(redirectUri || '').trim();
  const expectedRedirectUri = `https://${normalizedClientId}.chromiumapp.org/light-note-auth`;
  if (normalizedRedirectUri !== expectedRedirectUri) {
    throw extensionAuthError('EXTENSION_REDIRECT_INVALID', '浏览器插件回调地址无效');
  }
  return { clientId: normalizedClientId, redirectUri: expectedRedirectUri };
}

function normalizeAuthorizationRequest(input = {}, env = process.env) {
  const client = normalizeExtensionClient(input, env);
  const state = String(input.state || '').trim();
  const codeChallenge = String(input.codeChallenge || '').trim();
  const codeChallengeMethod = String(input.codeChallengeMethod || '').trim();
  const deviceDigest = String(input.deviceDigest || '')
    .trim()
    .toLowerCase();
  if (!TOKEN_PATTERN.test(state)) {
    throw extensionAuthError('EXTENSION_STATE_INVALID', '浏览器插件授权状态无效');
  }
  if (codeChallengeMethod !== 'S256' || !PKCE_CHALLENGE_PATTERN.test(codeChallenge)) {
    throw extensionAuthError('EXTENSION_PKCE_INVALID', '浏览器插件安全校验无效');
  }
  if (!DEVICE_DIGEST_PATTERN.test(deviceDigest)) {
    throw extensionAuthError('EXTENSION_DEVICE_INVALID', '浏览器插件设备标识无效');
  }
  return { ...client, state, codeChallenge, codeChallengeMethod: 'S256', deviceDigest };
}

function authorizationCodeKey(code) {
  return `${AUTHORIZATION_CODE_PREFIX}${sha256Hex(code)}`;
}

function parseAuthorizationCode(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    throw extensionAuthError('EXTENSION_CODE_INVALID', '浏览器插件授权码无效或已使用');
  }
}

export async function createExtensionAuthorizationCode({ userId, request, env = process.env } = {}) {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) throw extensionAuthError('EXTENSION_USER_REQUIRED', '请先登录轻笺', 401);
  const normalized = normalizeAuthorizationRequest(request, env);
  const code = crypto.randomBytes(32).toString('base64url');
  const challenge = {
    userId: normalizedUserId,
    clientId: normalized.clientId,
    redirectUri: normalized.redirectUri,
    state: normalized.state,
    codeChallenge: normalized.codeChallenge,
    codeChallengeMethod: normalized.codeChallengeMethod,
    deviceDigest: normalized.deviceDigest,
    createdAt: Date.now(),
  };
  await redisClient.setEx(
    authorizationCodeKey(code),
    AUTHORIZATION_CODE_TTL_SECONDS,
    JSON.stringify(challenge),
  );
  return {
    code,
    state: normalized.state,
    redirectUri: normalized.redirectUri,
    expiresIn: AUTHORIZATION_CODE_TTL_SECONDS,
  };
}

export async function consumeExtensionAuthorizationCode({
  code,
  codeVerifier,
  deviceId,
  clientId,
  redirectUri,
  env = process.env,
} = {}) {
  const client = normalizeExtensionClient({ clientId, redirectUri }, env);
  const normalizedCode = String(code || '').trim();
  const normalizedVerifier = String(codeVerifier || '').trim();
  const normalizedDeviceId = String(deviceId || '').trim();
  if (!TOKEN_PATTERN.test(normalizedCode) || !PKCE_VERIFIER_PATTERN.test(normalizedVerifier)) {
    throw extensionAuthError('EXTENSION_CODE_INVALID', '浏览器插件授权码无效或已使用');
  }
  if (!normalizedDeviceId || normalizedDeviceId.length > 128) {
    throw extensionAuthError('EXTENSION_DEVICE_INVALID', '浏览器插件设备标识无效');
  }

  // 先原子消费，再校验全部绑定字段。即使攻击者猜中授权码但 PKCE 不匹配，授权码也会立即作废。
  const raw = await redisClient.getDel(authorizationCodeKey(normalizedCode));
  if (!raw) throw extensionAuthError('EXTENSION_CODE_INVALID', '浏览器插件授权码无效或已使用');
  const challenge = parseAuthorizationCode(raw);
  const ageMs = Date.now() - Number(challenge.createdAt || 0);
  const valid =
    ageMs >= 0 &&
    ageMs <= AUTHORIZATION_CODE_TTL_SECONDS * 1000 &&
    challenge.clientId === client.clientId &&
    challenge.redirectUri === client.redirectUri &&
    challenge.codeChallengeMethod === 'S256' &&
    timingSafeEqualText(sha256Base64Url(normalizedVerifier), challenge.codeChallenge) &&
    timingSafeEqualText(sha256Hex(normalizedDeviceId), challenge.deviceDigest);
  if (!valid || !String(challenge.userId || '').trim()) {
    throw extensionAuthError('EXTENSION_CODE_INVALID', '浏览器插件授权码无效或已使用');
  }
  return {
    userId: String(challenge.userId),
    clientId: client.clientId,
  };
}

export const extensionAuthInternals = Object.freeze({
  AUTHORIZATION_CODE_TTL_SECONDS,
  authorizationCodeKey,
  normalizeAuthorizationRequest,
  sha256Base64Url,
  sha256Hex,
});
