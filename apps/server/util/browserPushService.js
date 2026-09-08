import { browserPushQuietUntil } from './browserPushQuietHours.js';
import { browserNotificationPresentation } from '@lightnote/shared/notification-presentation';
import { randomUUID } from 'node:crypto';
import pool from '../db/index.js';
import { deliverBrowserPush } from './browserPushTransport.js';
import {
  browserPushEnabled,
  validatePushSubscription,
  endpointHash,
  pushFailure,
  notificationVisibleSql,
} from './browserPushPolicy.js';

export async function bindPushSubscription(userId, raw, locale, db = pool) {
  const subscription = validatePushSubscription(raw);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const hash = endpointHash(subscription.endpoint);
    const [existing] = await conn.query('SELECT * FROM browser_push_subscriptions WHERE endpoint_hash = ? FOR UPDATE', [
      hash,
    ]);
    const previous = existing[0];
    if (
      Number(previous?.active) === 1 &&
      previous.user_id === userId &&
      previous.p256dh === subscription.keys.p256dh &&
      previous.auth === subscription.keys.auth
    ) {
      await conn.query('UPDATE browser_push_subscriptions SET locale = ? WHERE id = ?', [locale, previous.id]);
      await conn.commit();
      return { id: previous.id, generation: previous.generation, userId };
    }
    const [[owner]] = await conn.query('SELECT id FROM user WHERE id = ? AND del_flag = 0 FOR UPDATE', [userId]);
    if (!owner) throw new Error('PUSH_ACCOUNT_UNAVAILABLE');
    const [[count]] = await conn.query(
      'SELECT COUNT(*) AS total FROM browser_push_subscriptions WHERE user_id = ? AND active IN (1, 2)',
      [userId],
    );
    if (Number(count.total) >= 20 && ![1, 2].includes(Number(previous?.active))) throw new Error('PUSH_DEVICE_LIMIT');
    let id = previous?.id || randomUUID();
    const generation = randomUUID();
    await conn.query(
      `INSERT INTO browser_push_subscriptions
      (id, user_id, endpoint_hash, endpoint, p256dh, auth, generation, locale, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 2)
      ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), endpoint = VALUES(endpoint),
      p256dh = VALUES(p256dh), auth = VALUES(auth), generation = VALUES(generation),
      locale = VALUES(locale), active = 2, enabled_at = CURRENT_TIMESTAMP(6)`,
      [id, userId, hash, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, generation, locale],
    );
    const [[stored]] = await conn.query(
      'SELECT id FROM browser_push_subscriptions WHERE endpoint_hash = ? FOR UPDATE',
      [hash],
    );
    id = stored.id;
    await conn.query(
      "UPDATE browser_push_jobs SET status = 'cancelled' WHERE subscription_id = ? AND status IN ('pending', 'sending')",
      [id],
    );
    await conn.commit();
    return { id, generation, userId };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

// Activate only after the client has durably stored its binding. This prevents a
// notification arriving between the subscription response and local IDB persistence.
export async function activatePushSubscription(userId, id, generation, db = pool) {
  const [result] = await db.query(
    `UPDATE browser_push_subscriptions SET active = 1, enabled_at = CURRENT_TIMESTAMP(6)
    WHERE user_id = ? AND id = ? AND generation = ? AND active = 2`,
    [userId, id, generation],
  );
  if (result.affectedRows) return true;
  const [[existing]] = await db.query(
    'SELECT id FROM browser_push_subscriptions WHERE user_id = ? AND id = ? AND generation = ? AND active = 1',
    [userId, id, generation],
  );
  return Boolean(existing);
}

export async function unbindPushSubscription(userId, id, generation, db = pool) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      'UPDATE browser_push_subscriptions SET active = 0 WHERE id = ? AND user_id = ? AND generation = ?',
      [id, userId, generation],
    );
    if (result.affectedRows)
      await conn.query(
        "UPDATE browser_push_jobs SET status = 'cancelled' WHERE subscription_id = ? AND generation = ? AND status IN ('pending', 'sending')",
        [id, generation],
      );
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

// Transactional outbox expansion: the notification row and this pending marker were
// inserted together. Subscription generation/time prevent re-enable and late binding replay.
export async function expandPushOutbox(db = pool) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(`SELECT id FROM notification WHERE browser_push_pending = 1
      ORDER BY browser_push_created_at, id LIMIT 50 FOR UPDATE`);
    for (const row of rows) {
      await conn.query(
        `INSERT IGNORE INTO browser_push_jobs
        (notification_id, subscription_id, generation, expires_at)
        SELECT n.id, s.id, s.generation, DATE_ADD(n.browser_push_created_at, INTERVAL 24 HOUR)
        FROM notification n JOIN browser_push_subscriptions s ON s.user_id = n.user_id
        WHERE n.id = ? AND s.active = 1 AND s.enabled_at <= n.browser_push_created_at
          AND n.browser_push_created_at > DATE_SUB(NOW(6), INTERVAL 24 HOUR)
          AND n.del_flag = 0 AND n.recalled = 0`,
        [row.id],
      );
      await conn.query('UPDATE notification SET browser_push_pending = 0 WHERE id = ?', [row.id]);
    }
    await conn.commit();
    return rows.length;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function sendWebPush(subscription, payload, ttl, env = process.env) {
  return deliverBrowserPush(subscription, payload, ttl, env);
}

export async function processNextPush({ db = pool, send = sendWebPush, env = process.env } = {}) {
  if (!browserPushEnabled(env)) return null;
  const lease = randomUUID();
  // Atomic MySQL 5.7 claim, one job at a time: a network timeout cannot outlive the lease.
  const [claim] = await db.query(
    `UPDATE browser_push_jobs SET status = 'sending', lease_token = ?,
    lease_until = DATE_ADD(NOW(6), INTERVAL 90 SECOND), attempts = attempts + 1
    WHERE (status = 'pending' AND available_at <= NOW(6)) OR (status = 'sending' AND lease_until < NOW(6))
    ORDER BY id LIMIT 1`,
    [lease],
  );
  if (!claim.affectedRows) return null;
  const [[job]] = await db.query(
    `SELECT *, TIMESTAMPDIFF(SECOND, NOW(), expires_at) AS ttl,
    TIMESTAMPDIFF(SECOND, created_at, NOW()) AS delay_seconds FROM browser_push_jobs WHERE lease_token = ?`,
    [lease],
  );
  if (!job) return null;
  let status = 'cancelled',
    code = null;
  try {
    const [[subscription]] = await db.query(
      `SELECT s.*, u.preferences AS push_preferences, JSON_UNQUOTE(JSON_EXTRACT(u.preferences, '$.lang')) AS preferred_locale FROM browser_push_subscriptions s
      JOIN user u ON u.id = s.user_id AND u.del_flag = 0 AND u.role <> 'visitor'
      WHERE s.id = ? AND s.generation = ? AND s.active = 1`,
      [job.subscription_id, job.generation],
    );
    const [[notification]] = await db.query(
      `SELECT * FROM notification WHERE id = ? AND user_id = ? AND ${notificationVisibleSql}`,
      [job.notification_id, subscription?.user_id || ''],
    );
    if (job.ttl <= 0) status = 'expired';
    else if (subscription && notification) {
      let preferences = subscription.push_preferences || {};
      if (typeof preferences === 'string') {
        try {
          preferences = JSON.parse(preferences);
        } catch {
          preferences = {};
        }
      }
      const quietUntil = browserPushQuietUntil(preferences);
      if (quietUntil) {
        // Quiet hours are not a transport attempt. Recheck preferences at least once a minute.
        const delay = Math.max(1, Math.min(60, job.ttl, Math.ceil((quietUntil.getTime() - Date.now()) / 1000)));
        await db.query(
          `UPDATE browser_push_jobs SET status = 'pending', last_code = 'QUIET_HOURS',
          attempts = GREATEST(0, attempts - 1), lease_until = NULL,
          available_at = DATE_ADD(NOW(6), INTERVAL ? SECOND)
          WHERE id = ? AND lease_token = ? AND status = 'sending'`,
          [delay, job.id, lease],
        );
        return { status: 'deferred', delaySeconds: Number(job.delay_seconds || 0) };
      }
      const [[owned]] = await db.query(
        "SELECT id FROM browser_push_jobs WHERE id = ? AND lease_token = ? AND status = 'sending' AND lease_until > NOW(6)",
        [job.id, lease],
      );
      if (!owned) return { status: 'cancelled', delaySeconds: Number(job.delay_seconds || 0) };
      await send(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        {
          version: 1,
          notificationId: notification.id,
          subscriptionId: subscription.id,
          generation: subscription.generation,
          userId: subscription.user_id,
          ...browserNotificationPresentation(notification, subscription.preferred_locale || subscription.locale),
        },
        Math.min(86400, job.ttl),
        env,
      );
      status = 'accepted';
    }
  } catch (error) {
    const httpCode = Number(error?.statusCode || 0);
    status = error?.code === 'PUSH_EXPIRED' ? 'expired' : pushFailure(httpCode, job.attempts);
    code = httpCode ? `HTTP_${httpCode}` : 'PUSH_TRANSPORT_ERROR';
    if (status === 'invalid')
      await db.query('UPDATE browser_push_subscriptions SET active = 0 WHERE id = ? AND generation = ?', [
        job.subscription_id,
        job.generation,
      ]);
  }
  await db.query(
    `UPDATE browser_push_jobs SET status = ?, last_code = ?, lease_until = NULL,
    available_at = DATE_ADD(NOW(6), INTERVAL ? SECOND) WHERE id = ? AND lease_token = ? AND status = 'sending'`,
    [status, code, Math.min(3600, 10 * 2 ** Math.min(job.attempts, 8)), job.id, lease],
  );
  return { status, delaySeconds: Number(job.delay_seconds || 0) };
}
