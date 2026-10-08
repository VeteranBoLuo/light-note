import { huaweiPushEnabled } from './huaweiPushPolicy.js';
import { communityFeedSchemaReady } from './communityFeed/schema.js';
import { feedNotificationVisibleSql } from './communityFeed/notifications.js';
import { COMMUNITY_CHAT_TARGETED_NOTIFICATION_SQL } from './notificationVisibility.js';

const timestamp = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{6}$/;
const isTime = (value) => typeof value === 'string' && timestamp.test(value);
const idPattern = /^[a-f\d-]{36}$/i;
export function validateNativeCursor({ since, cursor } = {}) {
  if (
    (since != null && !isTime(since)) ||
    (cursor != null &&
      (!isTime(cursor.time) || !isTime(cursor.until) || typeof cursor.id !== 'string' || !idPattern.test(cursor.id)))
  ) {
    const error = new Error('Invalid cursor');
    error.code = 'INVALID_NATIVE_CURSOR';
    throw error;
  }
}
export async function readNativeNotifications(db, userId, input = {}) {
  validateNativeCursor(input);
  const [[clock]] = await db.query("SELECT DATE_FORMAT(NOW(6),'%Y-%m-%d %H:%i:%s.%f') AS now");
  // First bind establishes a server-clock baseline, never replays historical notifications.
  if (!input.since) return { owner: userId, since: clock.now, items: [], cursor: null };
  const ready = await communityFeedSchemaReady(db).catch(() => false);
  const until = input.cursor?.until || clock.now;
  const after = input.cursor;
  const [rows] = await db.query(
    `SELECT id,
      DATE_FORMAT(browser_push_created_at,'%Y-%m-%d %H:%i:%s.%f') AS time
    FROM notification WHERE user_id=? AND del_flag=0 AND COALESCE(recalled,0)=0
      AND create_time >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      AND browser_push_created_at>=? AND browser_push_created_at<=?
      AND ${COMMUNITY_CHAT_TARGETED_NOTIFICATION_SQL} AND ${feedNotificationVisibleSql(ready)}
      ${after ? 'AND (browser_push_created_at>? OR (browser_push_created_at=? AND id>?))' : ''}
    ORDER BY browser_push_created_at,id LIMIT 100`,
    [userId, input.since, until, ...(after ? [after.time, after.time, after.id] : [])],
  );
  // Only suppress local alerts for this exact, active device generation. The inbox still returns every ID.
  if (input.huaweiBinding && huaweiPushEnabled()) {
    const [[binding]] = await db.query(
      "SELECT id FROM browser_push_subscriptions WHERE id = ? AND generation = ? AND user_id = ? AND active = 1 AND endpoint LIKE 'huawei:%'",
      [String(input.huaweiBinding.id || ''), String(input.huaweiBinding.generation || ''), userId],
    );
    if (binding && rows.length) {
      const [remote] = await db.query(
        `SELECT n.id FROM notification n JOIN browser_push_subscriptions s ON s.id = ?
         WHERE n.user_id = ? AND n.id IN (?) AND n.type = 'todo_reminder' AND n.source_type = 'todo_reminder_job' AND n.source_id IS NOT NULL
           AND s.enabled_at <= n.browser_push_created_at
           AND (n.browser_push_pending = 1 OR EXISTS (SELECT 1 FROM browser_push_jobs j
             WHERE j.notification_id = n.id AND j.subscription_id = s.id AND j.generation = s.generation
               AND j.status IN ('pending', 'sending', 'accepted')))`,
        [binding.id, userId, rows.map((row) => row.id)],
      );
      const ids = new Set(remote.map((row) => row.id));
      for (const row of rows) if (ids.has(row.id)) row.remote = true;
    }
  }
  const last = rows.at(-1);
  // Every sweep restarts at the activation baseline (bounded to 24h). This also catches late commits
  // and avoids timestamp watermark loss; native IDs deduplicate previously delivered notifications.
  return { owner: userId, since: input.since, items: rows, cursor: rows.length === 100 ? { ...last, until } : null };
}
