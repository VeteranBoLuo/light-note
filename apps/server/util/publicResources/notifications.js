import { randomUUID } from 'node:crypto';
import pool from '../../db/index.js';
import { createNotification } from '../notification.js';
import { queueNotificationChange } from '../notificationRealtimeEvents.js';
import { notificationSchedulerEnabled } from '../notificationSchedulerPolicy.js';
import { first, json, transaction } from './core.js';
import { publicResourceSchemaReady } from './schema.js';

export function publicResourceNotificationVisibleSql(ready) {
  if (!ready) return "type<>'public_resource'";
  return `(type<>'public_resource' OR (source_type='public_resource_result' AND EXISTS(SELECT 1 FROM public_resource_actions pa JOIN public_resource_publications pp ON pp.id=pa.publication_id WHERE CONVERT(pa.public_id USING utf8mb4) COLLATE utf8mb4_bin=notification.source_id AND CONVERT(pp.owner_id USING utf8mb4) COLLATE utf8mb4_bin=CONVERT(notification.user_id USING utf8mb4) COLLATE utf8mb4_bin)) OR (source_type='public_resource_review' AND EXISTS(SELECT 1 FROM user reviewer WHERE reviewer.id=notification.user_id AND reviewer.role='root' AND reviewer.del_flag='0') AND EXISTS(SELECT 1 FROM public_resource_publications pp JOIN user author ON author.id=pp.owner_id AND author.del_flag='0' AND author.role IN ('root','user','test') WHERE CONVERT(pp.public_id USING utf8mb4) COLLATE utf8mb4_bin=SUBSTRING_INDEX(notification.source_id,':',1) AND pp.pending_revision_id=CAST(JSON_UNQUOTE(JSON_EXTRACT(notification.meta,'$.revisionId')) AS UNSIGNED) AND pp.removed=0 AND pp.withdrawn=0 AND ((pp.kind='note' AND EXISTS(SELECT 1 FROM note sn WHERE sn.id=pp.source_id AND sn.create_by=pp.owner_id AND sn.del_flag=0)) OR (pp.kind='bookmark' AND EXISTS(SELECT 1 FROM bookmark sb WHERE sb.id=pp.source_id AND sb.user_id=pp.owner_id AND sb.del_flag=0))))))`;
}
async function deliver(db, event, userId) {
  await transaction(db, async (c) => {
    const u = await first(
      c,
      "SELECT id,role,preferences FROM user WHERE id=? AND del_flag='0' AND role<>'visitor' FOR UPDATE",
      [userId],
    );
    if (!u || json(u.preferences)?.notificationsInApp === false) return;
    const p = await first(c, 'SELECT * FROM public_resource_publications WHERE id=?', [event.publication_id]);
    if (!p) return;
    const action = event.action_id
      ? await first(c, 'SELECT * FROM public_resource_actions WHERE id=?', [event.action_id])
      : null;
    if (
      event.kind === 'review' &&
      (u.role !== 'root' ||
        Number(p.removed) ||
        Number(p.withdrawn) ||
        String(p.pending_revision_id) !== String(event.revision_id))
    )
      return;
    if (event.kind === 'result' && (!action || p.owner_id !== userId)) return;
    // Batch identity is carried by the durable outbox key; historical single-item keys keep their behavior.
    const batchId = event.kind === 'result' && /^result:([a-f0-9-]{36}):\d+$/i.exec(event.event_key)?.[1];
    let counts = null;
    if (batchId) {
      const [rows] = await c.query(
        `SELECT a.action,COUNT(*) AS count FROM public_resource_events e
         JOIN public_resource_actions a ON a.id=e.action_id
         JOIN public_resource_publications p ON p.id=a.publication_id
         WHERE e.event_key LIKE ? AND e.kind='result' AND p.owner_id=? AND a.actor_id=? GROUP BY a.action`,
        [`result:${batchId}:%`, userId, action.actor_id],
      );
      counts = Object.fromEntries(rows.map((row) => [row.action, Number(row.count)]));
      // The recipient row lock serializes consumers, including different events from this same batch.
      const existing = await first(
        c,
        `SELECT id,meta FROM notification WHERE user_id=? AND type='public_resource'
         AND source_type='public_resource_result' AND batch_id=?
         AND EXISTS(SELECT 1 FROM public_resource_actions a WHERE a.public_id=notification.source_id AND a.actor_id=?) FOR UPDATE`,
        [userId, batchId, action.actor_id],
      );
      if (existing) {
        const previous = json(existing.meta) || {},
          total = (value) => Object.values(value || {}).reduce((sum, count) => sum + Number(count || 0), 0);
        if (total(counts) > total(previous.counts)) {
          await c.query('UPDATE notification SET meta=?,is_read=0,read_time=NULL,create_time=NOW() WHERE id=?', [
            JSON.stringify({ ...previous, counts }),
            existing.id,
          ]);
          queueNotificationChange(c, [userId]);
        }
        // A retry never reopens a read notice, and a user's deletion is never undone.
        return;
      }
    }
    const revision = action
      ? await first(c, 'SELECT title FROM public_resource_revisions WHERE id=?', [action.revision_id])
      : null;
    await createNotification(
      userId,
      {
        type: 'public_resource',
        title: event.kind === 'review' ? '有公开资源待审核' : '公开资源审核结果',
        content: null,
        link: event.kind === 'review' ? '/community/moderation?tab=publicResources' : '/search/publications',
        sourceType: event.kind === 'review' ? 'public_resource_review' : 'public_resource_result',
        sourceId: action?.public_id || `${p.public_id}:${event.revision_id}`,
        batchId: batchId || null,
        meta: {
          kind: event.kind,
          publicationId: p.public_id,
          revisionId: event.revision_id,
          ...(action ? { action: action.action } : {}),
          ...(revision ? { resourceTitle: revision.title, reason: action.reason } : {}),
          ...(counts ? { counts } : {}),
        },
      },
      c,
    );
  });
}
export async function consumePublicResourceEvent({ db = pool } = {}) {
  if (!(await publicResourceSchemaReady(db))) return false;
  const event = await first(
    db,
    "SELECT * FROM public_resource_events WHERE (status='pending' AND next_attempt_at<=NOW(6)) OR (status='processing' AND lease_until<NOW(6)) ORDER BY id LIMIT 1",
  );
  if (!event) return false;
  const token = randomUUID();
  const [claim] = await db.query(
    "UPDATE public_resource_events SET status='processing',lease_token=?,lease_until=DATE_ADD(NOW(6),INTERVAL 60 SECOND) WHERE id=? AND ((status='pending' AND next_attempt_at<=NOW(6)) OR (status='processing' AND lease_until<NOW(6)))",
    [token, event.id],
  );
  if (!claim.affectedRows) return true;
  try {
    const [users] = await db.query(
      event.kind === 'review'
        ? "SELECT id FROM user WHERE role='root' AND del_flag='0' AND id>? ORDER BY id LIMIT 50"
        : "SELECT u.id FROM user u JOIN public_resource_publications p ON p.owner_id=u.id WHERE p.id=? AND u.del_flag='0' AND u.id>? ORDER BY u.id LIMIT 50",
      [...(event.kind === 'review' ? [] : [event.publication_id]), event.recipient_cursor],
    );
    for (const u of users) {
      await deliver(db, event, u.id);
      const [renew] = await db.query(
        'UPDATE public_resource_events SET recipient_cursor=?,lease_until=DATE_ADD(NOW(6),INTERVAL 60 SECOND) WHERE id=? AND lease_token=?',
        [u.id, event.id, token],
      );
      if (!renew.affectedRows) return true;
    }
    await db.query(
      'UPDATE public_resource_events SET status=?,lease_until=NULL,lease_token=NULL WHERE id=? AND lease_token=?',
      [users.length === 50 ? 'pending' : 'done', event.id, token],
    );
  } catch (error) {
    await db.query(
      'UPDATE public_resource_events SET attempts=attempts+1,status=?,next_attempt_at=DATE_ADD(NOW(6),INTERVAL 30 SECOND),lease_until=NULL,lease_token=NULL WHERE id=? AND lease_token=?',
      [event.attempts >= 7 ? 'failed' : 'pending', event.id, token],
    );
    throw error;
  }
  return true;
}
export function startPublicResourceEventScheduler({
  db = pool,
  env = process.env,
  onError = () => console.error('[public-resource-events] delivery failed'),
} = {}) {
  if (!notificationSchedulerEnabled(env)) return () => {};
  let running = false,
    stopped = false;
  const tick = async () => {
    if (running || stopped) return;
    running = true;
    try {
      // Polling waits only when idle; a backlog must not wait five seconds between every notice.
      for (let consumed = 0; consumed < 50 && !stopped; consumed++) {
        if (!(await consumePublicResourceEvent({ db }))) break;
      }
    } catch {
      onError();
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, 5000);
  timer.unref?.();
  void tick();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
