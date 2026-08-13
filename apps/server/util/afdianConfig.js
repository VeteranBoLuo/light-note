const DEFAULT_OAUTH_REDIRECT_URI = 'https://boluo66.top/api/support/afdian/oauth/callback';

export function afdianError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function normalizeHttpsUrl(value, fallback, code) {
  let parsed;
  try {
    parsed = new URL(String(value || fallback).trim());
  } catch {
    throw afdianError(code, '爱发电接入配置异常，请稍后再试', 503);
  }
  const localHttp =
    parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname.toLowerCase());
  if ((parsed.protocol !== 'https:' && !localHttp) || parsed.username || parsed.password || parsed.hash) {
    throw afdianError(code, '爱发电接入配置异常，请稍后再试', 503);
  }
  return parsed.toString();
}

export function getAfdianOAuthConfig({ required = true } = {}) {
  const clientId = String(process.env.AFDIAN_OAUTH_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.AFDIAN_OAUTH_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) {
    if (!required) return null;
    throw afdianError('AFDIAN_OAUTH_NOT_CONFIGURED', '爱发电账号关联暂不可用', 503);
  }
  const redirectUri = normalizeHttpsUrl(
    process.env.AFDIAN_OAUTH_REDIRECT_URI,
    DEFAULT_OAUTH_REDIRECT_URI,
    'AFDIAN_OAUTH_REDIRECT_INVALID',
  );
  return { clientId, clientSecret, redirectUri };
}

export function getAfdianApiConfig({ required = true } = {}) {
  const creatorUserId = String(process.env.AFDIAN_CREATOR_USER_ID || '').trim();
  const apiToken = String(process.env.AFDIAN_API_TOKEN || '').trim();
  if (!creatorUserId || !apiToken) {
    if (!required) return null;
    throw afdianError('AFDIAN_API_NOT_CONFIGURED', '爱发电订单同步暂不可用', 503);
  }
  return { creatorUserId, apiToken };
}

export function getAfdianFeatureState() {
  return {
    oauthAvailable: Boolean(getAfdianOAuthConfig({ required: false })),
    orderSyncAvailable: Boolean(getAfdianApiConfig({ required: false })),
  };
}
