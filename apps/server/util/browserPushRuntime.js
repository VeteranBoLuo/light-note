import webpush from 'web-push';
import { browserPushEnabled } from './browserPushPolicy.js';
export async function assertBrowserPushRuntime(db, env = process.env) {
  await db.query('SELECT browser_push_pending, browser_push_created_at FROM notification LIMIT 0');
  await db.query('SELECT id, generation, enabled_at FROM browser_push_subscriptions LIMIT 0');
  await db.query('SELECT id, generation, lease_token, lease_until, expires_at FROM browser_push_jobs LIMIT 0');
  if (env.BROWSER_PUSH_ENABLED !== 'true') return;
  if (!browserPushEnabled(env) || !env.BROWSER_PUSH_ORIGIN) throw new Error('BROWSER_PUSH_CONFIG_INVALID');
  const origin = new URL(env.BROWSER_PUSH_ORIGIN);
  if (
    origin.origin !== env.BROWSER_PUSH_ORIGIN ||
    (origin.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(origin.hostname))
  )
    throw new Error('BROWSER_PUSH_ORIGIN_INVALID');
  webpush.setVapidDetails(
    env.BROWSER_PUSH_VAPID_SUBJECT,
    env.BROWSER_PUSH_VAPID_PUBLIC_KEY,
    env.BROWSER_PUSH_VAPID_PRIVATE_KEY,
  );
}
