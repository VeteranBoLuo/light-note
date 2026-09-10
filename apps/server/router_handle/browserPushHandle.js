import pool from '../db/index.js';
import { resultData } from '../util/common.js';
import { browserPushEnabled } from '../util/browserPushPolicy.js';
import { activatePushSubscription, bindPushSubscription, unbindPushSubscription } from '../util/browserPushService.js';

function actor(req, res) {
  if (!req.user?.id || req.user.role === 'visitor' || req.adminContext) {
    res.send(resultData(null, 403, 'BROWSER_PUSH_ACCOUNT_REQUIRED'));
    return null;
  }
  // Browser-only mutation surface: explicit same-origin check, in addition to session auth.
  const origin = req.get?.('origin');
  const expected = process.env.BROWSER_PUSH_ORIGIN;
  if (expected && origin !== expected) {
    res.send(resultData(null, 403, 'BROWSER_PUSH_ORIGIN_DENIED'));
    return null;
  }
  if (req.get?.('sec-fetch-site') === 'cross-site') {
    res.send(resultData(null, 403, 'BROWSER_PUSH_ORIGIN_DENIED'));
    return null;
  }
  return req.user.id;
}
export async function config(req, res) {
  const userId = actor(req, res);
  if (!userId) return;
  try {
    const { id, generation } = req.body || {};
    const [[subscription]] = await pool.query(
      `SELECT id, active, EXISTS(SELECT 1 FROM browser_push_jobs j WHERE j.subscription_id = browser_push_subscriptions.id AND j.status = 'invalid') AS invalid FROM browser_push_subscriptions
      WHERE id = ? AND generation = ? AND user_id = ?`,
      [String(id || ''), String(generation || ''), userId],
    );
    res.send(
      resultData({
        available: browserPushEnabled() && Boolean(process.env.BROWSER_PUSH_ORIGIN),
        publicKey: process.env.BROWSER_PUSH_VAPID_PUBLIC_KEY || '',
        enabled: Number(subscription?.active) === 1 && !Number(subscription?.invalid),
        invalid: Number(subscription?.active) === 3 || Number(subscription?.invalid) === 1,
        userId,
      }),
    );
  } catch {
    res.send(resultData(null, 500, 'BROWSER_PUSH_STATE_FAILED'));
  }
}
export async function subscribe(req, res) {
  const userId = actor(req, res);
  if (!userId) return;
  if (!browserPushEnabled() || !process.env.BROWSER_PUSH_ORIGIN)
    return res.send(resultData(null, 503, 'BROWSER_PUSH_DISABLED'));
  try {
    const locale = req.body?.locale === 'en-US' ? 'en-US' : 'zh-CN';
    const binding = await bindPushSubscription(userId, req.body?.subscription, locale);
    res.send(resultData(binding));
  } catch (error) {
    res.send(
      resultData(
        null,
        error?.code === 'PUSH_SUBSCRIPTION_INVALID' ? 409 : error?.code === 'INVALID_PUSH_SUBSCRIPTION' ? 400 : 500,
        error?.code === 'PUSH_SUBSCRIPTION_INVALID' ? 'PUSH_SUBSCRIPTION_INVALID' : 'BROWSER_PUSH_SUBSCRIBE_FAILED',
      ),
    );
  }
}
export async function unsubscribe(req, res) {
  const userId = actor(req, res);
  if (!userId) return;
  try {
    await unbindPushSubscription(userId, String(req.body?.id || ''), String(req.body?.generation || ''));
    res.send(resultData(null));
  } catch {
    res.send(resultData(null, 500, 'BROWSER_PUSH_UNSUBSCRIBE_FAILED'));
  }
}

export async function activate(req, res) {
  const userId = actor(req, res);
  if (!userId) return;
  if (!browserPushEnabled()) return res.send(resultData(null, 503, 'BROWSER_PUSH_DISABLED'));
  try {
    const activated = await activatePushSubscription(
      userId,
      String(req.body?.id || ''),
      String(req.body?.generation || ''),
    );
    res.send(resultData(null, activated ? 200 : 409, activated ? '' : 'BROWSER_PUSH_BINDING_EXPIRED'));
  } catch {
    res.send(resultData(null, 500, 'BROWSER_PUSH_ACTIVATE_FAILED'));
  }
}
