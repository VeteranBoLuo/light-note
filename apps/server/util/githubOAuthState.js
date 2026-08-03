import crypto from 'node:crypto';
import redisClient from './redisClient.js';

export const GITHUB_OAUTH_CONSENT_VERSION = 'github-cross-border-2026-07-28';
export const GITHUB_OAUTH_NONCE_COOKIE = 'ln_github_oauth_nonce';

const CHALLENGE_TTL_SECONDS = 10 * 60;
const RESULT_TTL_SECONDS = 5 * 60;
const CHALLENGE_KEY_PREFIX = 'oauth:github:state:';
const DEFAULT_REDIRECT_URI = 'https://boluo66.top/auth/callback';
const VALID_FLOWS = new Set(['login', 'register']);
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

function validAuthorizationCode(value) {
  return typeof value === 'string' && value.length >= 8 && value.length <= 512;
}

function githubOAuthError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function sha256(value) {
  return crypto
    .createHash('sha256')
    .update(String(value || ''))
    .digest('hex');
}

function timingSafeDigestEqual(value, expectedDigest) {
  try {
    const actual = Buffer.from(sha256(value), 'hex');
    const expected = Buffer.from(String(expectedDigest || ''), 'hex');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function normalizeFlow(value) {
  return VALID_FLOWS.has(value) ? value : 'login';
}

function normalizeSignupSource(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  return /^[a-z0-9_-]{1,40}$/.test(normalized) ? normalized : 'unknown';
}

function challengeKey(state) {
  return `${CHALLENGE_KEY_PREFIX}${sha256(state)}`;
}

const CAS_SET_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if not current then return false end
if current ~= ARGV[1] then return current end
redis.call('SETEX', KEYS[1], tonumber(ARGV[3]), ARGV[2])
return ARGV[2]
`;

function parseChallenge(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    throw githubOAuthError('GITHUB_OAUTH_STATE_INVALID', 'GitHub 登录校验失败，请重新发起授权');
  }
}

function validateChallenge(challenge, normalizedNonce) {
  const consentAt = Number(challenge?.consentAt || 0);
  const ageMs = Date.now() - consentAt;
  const maxAgeSeconds = ['completed', 'failed'].includes(challenge?.status)
    ? CHALLENGE_TTL_SECONDS + RESULT_TTL_SECONDS
    : CHALLENGE_TTL_SECONDS;
  const validCommonFields =
    challenge?.consentVersion === GITHUB_OAUTH_CONSENT_VERSION &&
    Number.isFinite(consentAt) &&
    ageMs >= 0 &&
    ageMs <= maxAgeSeconds * 1000 &&
    typeof challenge?.redirectUri === 'string' &&
    timingSafeDigestEqual(normalizedNonce, challenge?.nonceDigest);
  if (!validCommonFields) {
    throw githubOAuthError('GITHUB_OAUTH_STATE_INVALID', 'GitHub 登录校验失败，请重新发起授权');
  }
  return consentAt;
}

function challengePublicContext(challenge, consentAt) {
  return {
    consentVersion: challenge.consentVersion,
    consentAt,
    flow: normalizeFlow(challenge.flow),
    signupSource: normalizeSignupSource(challenge.signupSource),
    codeVerifier: challenge.codeVerifier,
    redirectUri: challenge.redirectUri,
  };
}

async function compareAndSetChallenge(key, expectedRaw, nextChallenge, ttlSeconds) {
  return redisClient.eval(CAS_SET_SCRIPT, {
    keys: [key],
    arguments: [expectedRaw, JSON.stringify(nextChallenge), String(ttlSeconds)],
  });
}

function resolveOAuthConfig() {
  const clientId = String(process.env.GITHUB_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.GITHUB_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) {
    throw githubOAuthError('GITHUB_OAUTH_NOT_CONFIGURED', 'GitHub 登录暂不可用，请使用邮箱登录', 503);
  }
  const redirectUri = String(process.env.GITHUB_REDIRECT_URI || DEFAULT_REDIRECT_URI).trim();
  let parsedRedirect;
  try {
    parsedRedirect = new URL(redirectUri);
  } catch {
    throw githubOAuthError('GITHUB_OAUTH_REDIRECT_INVALID', 'GitHub 登录配置异常，请稍后再试', 503);
  }
  const isLocalHttpRedirect =
    parsedRedirect.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '::1'].includes(parsedRedirect.hostname.toLowerCase());
  if (parsedRedirect.protocol !== 'https:' && !isLocalHttpRedirect) {
    throw githubOAuthError('GITHUB_OAUTH_REDIRECT_INVALID', 'GitHub 登录配置异常，请稍后再试', 503);
  }

  return { clientId, redirectUri: parsedRedirect.toString() };
}

function buildAuthorizationUrl({ state, codeChallenge, clientId, redirectUri }) {
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', 'user:email');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export function githubOAuthCookieOptions(maxAge = CHALLENGE_TTL_SECONDS * 1000) {
  return {
    httpOnly: true,
    secure: process.env.SECURE_COOKIE != null ? process.env.SECURE_COOKIE === '1' : process.platform === 'linux',
    sameSite: 'lax',
    path: '/',
    maxAge,
  };
}

export function readGitHubOAuthNonce(req) {
  const cookieHeader = String(req?.headers?.cookie || '');
  for (const pair of cookieHeader.split(';')) {
    const separator = pair.indexOf('=');
    if (separator === -1) continue;
    const name = pair.slice(0, separator).trim();
    if (name !== GITHUB_OAUTH_NONCE_COOKIE) continue;
    try {
      return decodeURIComponent(pair.slice(separator + 1).trim());
    } catch {
      return '';
    }
  }
  return '';
}

export async function createGitHubOAuthChallenge({ consentVersion, flow = 'login', signupSource = 'unknown' } = {}) {
  if (consentVersion !== GITHUB_OAUTH_CONSENT_VERSION) {
    throw githubOAuthError('GITHUB_OAUTH_CONSENT_REQUIRED', '请先确认 GitHub 登录的数据处理说明');
  }

  const state = crypto.randomBytes(32).toString('base64url');
  const nonce = crypto.randomBytes(32).toString('base64url');
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  const { clientId, redirectUri } = resolveOAuthConfig();
  const challenge = {
    status: 'pending',
    nonceDigest: sha256(nonce),
    codeVerifier,
    redirectUri,
    consentVersion: GITHUB_OAUTH_CONSENT_VERSION,
    consentAt: Date.now(),
    flow: normalizeFlow(flow),
    signupSource: normalizeSignupSource(signupSource),
  };
  // 先校验 OAuth 配置，避免配置错误时在 Redis 留下无法使用的孤儿挑战。
  const authorizationUrl = buildAuthorizationUrl({
    state,
    codeChallenge,
    clientId,
    redirectUri,
  });
  await redisClient.setEx(challengeKey(state), CHALLENGE_TTL_SECONDS, JSON.stringify(challenge));

  return {
    authorizationUrl,
    nonce,
    expiresIn: CHALLENGE_TTL_SECONDS,
  };
}

export async function consumeGitHubOAuthChallenge({ state, nonce, code } = {}) {
  const normalizedState = String(state || '').trim();
  const normalizedNonce = String(nonce || '').trim();
  const normalizedCode = String(code || '').trim();
  if (
    !TOKEN_PATTERN.test(normalizedState) ||
    !TOKEN_PATTERN.test(normalizedNonce) ||
    !validAuthorizationCode(normalizedCode)
  ) {
    throw githubOAuthError('GITHUB_OAUTH_STATE_INVALID', 'GitHub 登录校验失败，请重新发起授权');
  }

  const key = challengeKey(normalizedState);
  const raw = await redisClient.get(key);
  if (!raw) {
    throw githubOAuthError('GITHUB_OAUTH_STATE_EXPIRED', 'GitHub 登录请求已过期，请重新发起授权');
  }

  const challenge = parseChallenge(raw);
  const consentAt = validateChallenge(challenge, normalizedNonce);
  const codeDigest = sha256(normalizedCode);
  if (challenge.codeDigest && challenge.codeDigest !== codeDigest) {
    throw githubOAuthError('GITHUB_OAUTH_STATE_INVALID', 'GitHub 登录校验失败，请重新发起授权');
  }
  if (challenge.status === 'completed') {
    if (!challenge.userId) {
      throw githubOAuthError('GITHUB_OAUTH_STATE_INVALID', 'GitHub 登录校验失败，请重新发起授权');
    }
    return { ...challengePublicContext(challenge, consentAt), recovered: true, userId: challenge.userId };
  }
  if (challenge.status === 'processing') {
    throw githubOAuthError('GITHUB_OAUTH_IN_PROGRESS', 'GitHub 登录仍在处理中，请稍后重试', 409);
  }
  if (challenge.status === 'failed') {
    throw githubOAuthError('GITHUB_OAUTH_RESTART_REQUIRED', '本次 GitHub 授权未完成，请重新发起授权', 400);
  }
  if (challenge.status !== 'pending' || !TOKEN_PATTERN.test(String(challenge?.codeVerifier || ''))) {
    throw githubOAuthError('GITHUB_OAUTH_STATE_INVALID', 'GitHub 登录校验失败，请重新发起授权');
  }

  const processingId = crypto.randomUUID();
  const processing = {
    ...challenge,
    status: 'processing',
    codeDigest,
    processingId,
    processingAt: Date.now(),
  };
  const claimedRaw = await compareAndSetChallenge(key, raw, processing, CHALLENGE_TTL_SECONDS);
  if (!claimedRaw) {
    throw githubOAuthError('GITHUB_OAUTH_STATE_EXPIRED', 'GitHub 登录请求已过期，请重新发起授权');
  }
  const claimed = parseChallenge(claimedRaw);
  if (claimed.processingId !== processingId) {
    if (claimed.status === 'completed' && claimed.codeDigest === codeDigest && claimed.userId) {
      return { ...challengePublicContext(claimed, consentAt), recovered: true, userId: claimed.userId };
    }
    throw githubOAuthError('GITHUB_OAUTH_IN_PROGRESS', 'GitHub 登录仍在处理中，请稍后重试', 409);
  }

  return {
    ...challengePublicContext(challenge, consentAt),
    recovered: false,
  };
}

export async function completeGitHubOAuthChallenge({ state, code, userId } = {}) {
  const normalizedState = String(state || '').trim();
  const normalizedCode = String(code || '').trim();
  const normalizedUserId = String(userId || '').trim();
  if (!TOKEN_PATTERN.test(normalizedState) || !validAuthorizationCode(normalizedCode) || !normalizedUserId)
    return false;

  const key = challengeKey(normalizedState);
  const raw = await redisClient.get(key);
  if (!raw) return false;
  const challenge = parseChallenge(raw);
  const codeDigest = sha256(normalizedCode);
  if (challenge.status === 'completed') {
    return challenge.codeDigest === codeDigest && challenge.userId === normalizedUserId;
  }
  if (challenge.status !== 'processing' || challenge.codeDigest !== codeDigest) return false;

  const completed = {
    ...challenge,
    status: 'completed',
    userId: normalizedUserId,
    completedAt: Date.now(),
  };
  delete completed.codeVerifier;
  delete completed.processingId;
  const result = await compareAndSetChallenge(key, raw, completed, RESULT_TTL_SECONDS);
  return Boolean(result && parseChallenge(result).status === 'completed');
}

export async function failGitHubOAuthChallenge({ state, code, errorCode } = {}) {
  const normalizedState = String(state || '').trim();
  const normalizedCode = String(code || '').trim();
  if (!TOKEN_PATTERN.test(normalizedState) || !validAuthorizationCode(normalizedCode)) return false;

  const key = challengeKey(normalizedState);
  const raw = await redisClient.get(key);
  if (!raw) return false;
  const challenge = parseChallenge(raw);
  if (challenge.status !== 'processing' || challenge.codeDigest !== sha256(normalizedCode)) return false;
  const failed = {
    ...challenge,
    status: 'failed',
    errorCode: String(errorCode || 'GITHUB_OAUTH_FAILED').slice(0, 80),
    failedAt: Date.now(),
  };
  delete failed.codeVerifier;
  delete failed.processingId;
  const result = await compareAndSetChallenge(key, raw, failed, RESULT_TTL_SECONDS);
  return Boolean(result && parseChallenge(result).status === 'failed');
}
