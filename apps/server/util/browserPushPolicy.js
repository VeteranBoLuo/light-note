import { createHash } from 'node:crypto';
export function browserPushEnabled(env = process.env) {
  return (
    env.LIGHTNOTE_RUNTIME_ENV !== 'local' &&
    env.BROWSER_PUSH_ENABLED === 'true' &&
    Boolean(
      env.BROWSER_PUSH_ORIGIN &&
      env.BROWSER_PUSH_VAPID_PUBLIC_KEY &&
      env.BROWSER_PUSH_VAPID_PRIVATE_KEY &&
      env.BROWSER_PUSH_VAPID_SUBJECT,
    )
  );
}
// Provider-owned exact hosts only. No arbitrary callback URLs, ports or redirects.
const ENDPOINT_HOSTS = new Set([
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'web.push.apple.com',
  'wns2-par02p.notify.windows.com',
]);
export function validatePushSubscription(value) {
  const fail = () => {
    throw Object.assign(new Error('Invalid push subscription'), { code: 'INVALID_PUSH_SUBSCRIPTION' });
  };
  if (!value || typeof value.endpoint !== 'string' || value.endpoint.length > 2048) return fail();
  let url;
  try {
    url = new URL(value.endpoint);
  } catch {
    return fail();
  }
  if (url.href.length > 2048) return fail();
  const hostAllowed = ENDPOINT_HOSTS.has(url.hostname) || /^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname);
  if (url.protocol !== 'https:' || !hostAllowed || url.port || url.username || url.password || url.hash) return fail();
  const { p256dh, auth } = value.keys || {};
  if (![p256dh, auth].every((key) => typeof key === 'string' && /^[A-Za-z0-9_-]+$/.test(key))) return fail();
  if (
    Buffer.from(p256dh, 'base64url').length !== 65 ||
    Buffer.from(p256dh, 'base64url')[0] !== 4 ||
    Buffer.from(auth, 'base64url').length !== 16
  )
    return fail();
  return { endpoint: url.href, keys: { p256dh, auth } };
}
export const endpointHash = (endpoint) => createHash('sha256').update(endpoint).digest('hex');
export function pushFailure(code, attempts) {
  if (code === 404 || code === 410) return 'invalid';
  if (attempts >= 8 || (code >= 400 && code < 500 && code !== 408 && code !== 429)) return 'failed';
  return 'pending';
}
export const notificationVisibleSql = `(del_flag = 0 AND recalled = 0 AND (
 (type <> 'community_chat' AND COALESCE(source_type, '') <> 'community_chat_message')
 OR COALESCE(JSON_UNQUOTE(JSON_EXTRACT(meta, '$.kind')), '') IN ('reply', 'mention'))) `;

export const isBrowserPushSubscriptionRequest = (context) =>
  String(context.method).toUpperCase() === 'POST' &&
  /^(?:\/api)?\/notification\/browser\/subscribe\/?$/.test(String(context.path || context.url || ''));
