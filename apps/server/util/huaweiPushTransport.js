import { huaweiPushEnabled, HUAWEI_ENDPOINT } from './huaweiPushPolicy.js';

const fail = (code, statusCode = 503) => Object.assign(new Error(code), { code, statusCode });
export function createHuaweiTransport(fetcher = globalThis.fetch) {
  let cached = null;
  let pending = null;
  async function json(url, options) {
    try {
      const response = await fetcher(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(10000) });
      if (response.status === 401) cached = null;
      if (!response.ok)
        throw fail('HUAWEI_HTTP_ERROR', [401, 404, 410].includes(response.status) ? 503 : response.status);
      return await response.json();
    } catch (error) {
      // No provider bodies, tokens, URLs or raw network errors escape this adapter.
      throw fail(error?.code === 'HUAWEI_HTTP_ERROR' ? error.code : 'HUAWEI_NETWORK_ERROR', error?.statusCode || 503);
    }
  }
  async function credential(env) {
    const key = env.HUAWEI_PUSH_APP_ID + ':' + env.HUAWEI_PUSH_APP_SECRET;
    if (cached?.key === key && cached.until > Date.now()) return cached.token;
    if (pending?.key === key) return pending.promise;
    const promise = (async () => {
      const result = await json('https://oauth-login.cloud.huawei.com/oauth2/v3/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: env.HUAWEI_PUSH_APP_ID,
          client_secret: env.HUAWEI_PUSH_APP_SECRET,
        }).toString(),
      });
      if (
        typeof result.access_token !== 'string' ||
        !result.access_token ||
        !Number.isFinite(Number(result.expires_in))
      )
        throw fail('HUAWEI_AUTH_FAILED', 401);
      cached = {
        key,
        token: result.access_token,
        until: Date.now() + Math.max(0, Math.min(3600, Number(result.expires_in)) - 60) * 1000,
      };
      return cached.token;
    })();
    pending = { key, promise };
    try {
      return await promise;
    } finally {
      if (pending?.promise === promise) pending = null;
    }
  }
  return async (subscription, payload, ttl, env = process.env) => {
    if (!huaweiPushEnabled(env)) throw fail('HUAWEI_PUSH_DISABLED');
    const bearer = await credential(env);
    const result = await json(`https://push-api.cloud.huawei.com/v2/${env.HUAWEI_PUSH_PROJECT_ID}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        validate_only: false,
        message: {
          token: [subscription.endpoint.slice(HUAWEI_ENDPOINT.length)],
          notification: {
            title: payload.huawei?.title || '轻笺通知',
            body: payload.huawei?.body || '你有一条新通知，点击打开通知中心查看。',
          },
          android: {
            ...(payload.huawei?.category ? { category: payload.huawei.category } : {}),
            ttl: `${Math.max(1, Math.min(300, Math.floor(ttl)))}s`,
            notification: {
              tag: payload.notificationId,
              click_action: { type: 1, action: 'top.boluo66.lightnote.HUAWEI_PUSH_TEST' },
            },
          },
        },
      }),
    });
    if (String(result.code) === '80000000') return;
    if (['80200001', '80200003'].includes(String(result.code))) {
      cached = null;
      throw fail('HUAWEI_AUTH_EXPIRED', 503);
    }
    if (['80300007', '80100000'].includes(String(result.code))) throw fail('HUAWEI_TOKEN_INVALID', 410);
    throw fail('HUAWEI_SEND_REJECTED', /^(801|803)/.test(String(result.code)) ? 400 : 503);
  };
}
export const deliverHuaweiPush = createHuaweiTransport();
