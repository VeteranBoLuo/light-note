import crypto from 'node:crypto';
import redisClient from './redisClient.js';

export const GITHUB_OAUTH_CONSENT_VERSION = 'github-cross-border-2026-07-28';
export const GITHUB_OAUTH_NONCE_COOKIE = 'ln_github_oauth_nonce';

const CHALLENGE_TTL_SECONDS = 10 * 60;
const CHALLENGE_KEY_PREFIX = 'oauth:github:state:';
const DEFAULT_REDIRECT_URI = 'https://boluo66.top/auth/callback';
const VALID_FLOWS = new Set(['login', 'register']);
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

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

export async function consumeGitHubOAuthChallenge({ state, nonce } = {}) {
  const normalizedState = String(state || '').trim();
  const normalizedNonce = String(nonce || '').trim();
  if (!TOKEN_PATTERN.test(normalizedState) || !TOKEN_PATTERN.test(normalizedNonce)) {
    throw githubOAuthError('GITHUB_OAUTH_STATE_INVALID', 'GitHub 登录校验失败，请重新发起授权');
  }

  const raw = await redisClient.getDel(challengeKey(normalizedState));
  if (!raw) {
    throw githubOAuthError('GITHUB_OAUTH_STATE_EXPIRED', 'GitHub 登录请求已过期，请重新发起授权');
  }

  let challenge;
  try {
    challenge = JSON.parse(raw);
  } catch {
    throw githubOAuthError('GITHUB_OAUTH_STATE_INVALID', 'GitHub 登录校验失败，请重新发起授权');
  }
  const consentAt = Number(challenge?.consentAt || 0);
  const ageMs = Date.now() - consentAt;
  if (
    challenge?.consentVersion !== GITHUB_OAUTH_CONSENT_VERSION ||
    !Number.isFinite(consentAt) ||
    ageMs < 0 ||
    ageMs > CHALLENGE_TTL_SECONDS * 1000 ||
    !TOKEN_PATTERN.test(String(challenge?.codeVerifier || '')) ||
    typeof challenge?.redirectUri !== 'string' ||
    !timingSafeDigestEqual(normalizedNonce, challenge?.nonceDigest)
  ) {
    throw githubOAuthError('GITHUB_OAUTH_STATE_INVALID', 'GitHub 登录校验失败，请重新发起授权');
  }

  return {
    consentVersion: challenge.consentVersion,
    consentAt,
    flow: normalizeFlow(challenge.flow),
    signupSource: normalizeSignupSource(challenge.signupSource),
    codeVerifier: challenge.codeVerifier,
    redirectUri: challenge.redirectUri,
  };
}
