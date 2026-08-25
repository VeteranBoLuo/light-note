import crypto from 'node:crypto';
import { afdianError, getAfdianApiConfig, getAfdianOAuthConfig } from './afdianConfig.js';

const AFDIAN_OAUTH_AUTHORIZE_URL = 'https://afdian.com/oauth2/authorize';
const AFDIAN_OAUTH_TOKEN_URL = 'https://afdian.com/api/oauth2/access_token';
const AFDIAN_PUBLIC_PROFILE_URL = 'https://afdian.com/api/user/get-profile';
const AFDIAN_QUERY_ORDER_URL = 'https://afdian.com/api/open/query-order';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_OAUTH_CODE_LENGTH = 4096;
const MAX_PROVIDER_NAME_LENGTH = 100;
const MAX_PROVIDER_AVATAR_URL_LENGTH = 1024;

// 爱发电官方于 2025-07-01 公布的 Webhook RSA 公钥。
export const AFDIAN_WEBHOOK_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwwdaCg1Bt+UKZKs0R54y
lYnuANma49IpgoOwNmk3a0rhg/PQuhUJ0EOZSowIC44l0K3+fqGns3Ygi4AfmEfS
4EKbdk1ahSxu7Zkp2rHMt+R9GarQFQkwSS/5x1dYiHNVMiR8oIXDgjmvxuNes2Cr
8fw9dEF0xNBKdkKgG2qAawcN1nZrdyaKWtPVT9m2Hl0ddOO9thZmVLFOb9NVzgYf
jEgI+KWX6aY19Ka/ghv/L4t1IXmz9pctablN5S0CRWpJW3Cn0k6zSXgjVdKm4uN7
jRlgSRaf/Ind46vMCm3N2sgwxu/g3bnooW+db0iLo13zzuvyn727Q3UDQ0MmZcEW
MQIDAQAB
-----END PUBLIC KEY-----`;

function normalizeProviderId(value, field) {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length > 128 || !/^[A-Za-z0-9_-]+$/.test(normalized)) {
    throw afdianError('AFDIAN_RESPONSE_INVALID', `爱发电返回的 ${field} 不合法`, 502);
  }
  return normalized;
}

function normalizeOptionalProviderId(value, field) {
  const normalized = String(value || '').trim();
  return normalized ? normalizeProviderId(normalized, field) : null;
}

function normalizeOptionalProviderName(value) {
  const normalized = String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim();
  return normalized ? normalized.slice(0, MAX_PROVIDER_NAME_LENGTH) : null;
}

function normalizeOptionalProviderAvatarUrl(value) {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length > MAX_PROVIDER_AVATAR_URL_LENGTH) return null;
  try {
    const url = new URL(normalized);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeAmount(value, field) {
  const normalized = String(value ?? '').trim();
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(normalized)) {
    throw afdianError('AFDIAN_RESPONSE_INVALID', `爱发电返回的 ${field} 不合法`, 502);
  }
  return normalized;
}

function timeoutSignal() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  timer.unref?.();
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

async function requestJson(url, options) {
  const timeout = timeoutSignal();
  try {
    const response = await fetch(url, { ...options, signal: timeout.signal });
    if (!response.ok) throw afdianError('AFDIAN_UPSTREAM_HTTP_ERROR', '爱发电服务暂时不可用', 502);
    const payload = await response.json().catch(() => null);
    if (!payload || Number(payload.ec) !== 200) {
      throw afdianError('AFDIAN_UPSTREAM_REJECTED', '爱发电服务未接受本次请求', 502);
    }
    return payload;
  } catch (error) {
    if (String(error?.code || '').startsWith('AFDIAN_')) throw error;
    throw afdianError('AFDIAN_UPSTREAM_UNAVAILABLE', '爱发电服务暂时不可用', 502);
  } finally {
    timeout.clear();
  }
}

export function buildAfdianAuthorizationUrl(state) {
  const normalizedState = String(state || '').trim();
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(normalizedState)) {
    throw afdianError('AFDIAN_OAUTH_STATE_INVALID', '爱发电授权校验失败');
  }
  const { clientId, redirectUri } = getAfdianOAuthConfig();
  const url = new URL(AFDIAN_OAUTH_AUTHORIZE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'basic');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', normalizedState);
  return url.toString();
}

export async function exchangeAfdianAuthorizationCode(code) {
  const normalizedCode = String(code || '').trim();
  if (!normalizedCode || normalizedCode.length > MAX_OAUTH_CODE_LENGTH) {
    throw afdianError('AFDIAN_OAUTH_CODE_INVALID', '爱发电授权码无效');
  }
  const { clientId, clientSecret, redirectUri } = getAfdianOAuthConfig();
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code: normalizedCode,
    redirect_uri: redirectUri,
  });
  const payload = await requestJson(AFDIAN_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  return {
    providerUserId: normalizeProviderId(payload.data?.user_id, 'user_id'),
    providerPrivateId: normalizeOptionalProviderId(payload.data?.user_private_id, 'user_private_id'),
  };
}

/** OAuth basic 只返回用户 ID；昵称和头像需从爱发电公开用户资料中补全。 */
export async function queryAfdianPublicProfile(providerUserId) {
  const normalizedUserId = normalizeProviderId(providerUserId, 'user_id');
  const url = new URL(AFDIAN_PUBLIC_PROFILE_URL);
  url.searchParams.set('user_id', normalizedUserId);
  const payload = await requestJson(url, { method: 'GET' });
  const user = payload.data?.user;
  if (normalizeProviderId(user?.user_id, 'user_id') !== normalizedUserId) {
    throw afdianError('AFDIAN_RESPONSE_INVALID', '爱发电返回的用户资料不匹配', 502);
  }
  return {
    providerName: normalizeOptionalProviderName(user?.name),
    providerAvatarUrl: normalizeOptionalProviderAvatarUrl(user?.avatar),
  };
}

export function verifyAfdianWebhookSignature(payload, { publicKey = AFDIAN_WEBHOOK_PUBLIC_KEY } = {}) {
  const order = payload?.data?.order;
  const signature = String(payload?.sign || '').trim();
  if (payload?.data?.type !== 'order' || !order || !signature || signature.length > 1024) return false;
  const signText = buildAfdianWebhookSignText(order);
  try {
    return crypto.verify('RSA-SHA256', Buffer.from(signText), publicKey, Buffer.from(signature, 'base64'));
  } catch {
    return false;
  }
}

/** 开发者后台“发送测试”仍使用这条无签名公开样例；只允许无副作用确认，禁止落库。 */
export function isAfdianDashboardWebhookTestPayload(payload) {
  const order = payload?.data?.order;
  return (
    !payload?.sign &&
    payload?.data?.type === 'order' &&
    String(order?.out_trade_no || '') === '202106232138371083454010626' &&
    String(order?.user_id || '') === 'adf397fe8374811eaacee52540025c377' &&
    String(order?.plan_id || '') === 'a45353328af911eb973052540025c377' &&
    String(order?.total_amount || '') === '5.00' &&
    String(order?.show_amount || '') === '5.00' &&
    Number(order?.status) === 2
  );
}

/** 官方验签文本只覆盖这四项；custom_order_id 必须再经查询 API 复核。 */
export function buildAfdianWebhookSignText(order) {
  return [order?.out_trade_no, order?.user_id, order?.plan_id, order?.total_amount]
    .map((value) => String(value ?? ''))
    .join('');
}

function normalizeOptionalProviderCreatedAt(value) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  let epochSeconds = null;
  if (Number.isFinite(numeric)) {
    epochSeconds = numeric > 10_000_000_000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
  } else {
    const parsed = Date.parse(String(value));
    if (Number.isFinite(parsed)) epochSeconds = Math.floor(parsed / 1000);
  }
  const earliest = Date.UTC(2000, 0, 1) / 1000;
  const latest = Date.UTC(2100, 0, 1) / 1000;
  if (!Number.isSafeInteger(epochSeconds) || epochSeconds < earliest || epochSeconds >= latest) {
    throw afdianError('AFDIAN_ORDER_INVALID', '订单创建时间不合法');
  }
  return epochSeconds;
}

export function normalizeAfdianOrder(order) {
  const providerOrderNo = String(order?.out_trade_no || '').trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(providerOrderNo)) {
    throw afdianError('AFDIAN_ORDER_INVALID', '爱发电订单号不合法');
  }
  const month = Number(order?.month ?? 1);
  const productType = Number(order?.product_type ?? 0);
  const providerStatus = Number(order?.status ?? 0);
  if (!Number.isInteger(month) || month < 0 || month > 1200)
    throw afdianError('AFDIAN_ORDER_INVALID', '订单月数不合法');
  if (!Number.isInteger(productType) || productType < 0 || productType > 255) {
    throw afdianError('AFDIAN_ORDER_INVALID', '订单类型不合法');
  }
  if (!Number.isInteger(providerStatus) || providerStatus < -32768 || providerStatus > 32767) {
    throw afdianError('AFDIAN_ORDER_INVALID', '订单状态不合法');
  }
  const customOrderId = String(order?.custom_order_id || '').trim();
  return {
    providerOrderNo,
    providerUserId: normalizeProviderId(order?.user_id, 'user_id'),
    providerPrivateId: normalizeOptionalProviderId(order?.user_private_id, 'user_private_id'),
    customOrderId: /^[A-Za-z0-9_-]{32,128}$/.test(customOrderId) ? customOrderId : '',
    planId: normalizeOptionalProviderId(order?.plan_id, 'plan_id'),
    productType,
    month,
    totalAmount: normalizeAmount(order?.total_amount, 'total_amount'),
    showAmount: normalizeAmount(order?.show_amount ?? order?.total_amount, 'show_amount'),
    providerStatus,
    providerCreatedAt: normalizeOptionalProviderCreatedAt(order?.create_time),
  };
}

export async function queryAfdianOrders(params) {
  const { creatorUserId, apiToken } = getAfdianApiConfig();
  const paramsJson = JSON.stringify(params);
  const ts = Math.floor(Date.now() / 1000);
  const sign = crypto
    .createHash('md5')
    .update(`${apiToken}params${paramsJson}ts${ts}user_id${creatorUserId}`)
    .digest('hex');
  const payload = await requestJson(AFDIAN_QUERY_ORDER_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ user_id: creatorUserId, params: paramsJson, ts, sign }),
  });
  const list = Array.isArray(payload.data?.list) ? payload.data.list.map(normalizeAfdianOrder) : [];
  return {
    list,
    totalPage: Math.max(1, Number(payload.data?.total_page) || 1),
  };
}
