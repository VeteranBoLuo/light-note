import { persistPublicResourceAchievements } from './growthMetrics.js';
import { audit } from './core.js';
import { publicResourceSchemaReady, PUBLIC_RESOURCE_SCHEMA } from './schema.js';
import { communityFeedSchemaReady } from '../communityFeed/schema.js';
import { cancelPending } from './publications.js';
import { queueNotificationSourceChange } from '../notificationRealtimeEvents.js';

// Called only with the caller's deletion transaction. A missing additive schema must not break old deletes.
export async function withdrawDeletedSources(db, { userId, kind, ids }) {
  if (!['note', 'bookmark'].includes(kind) || !ids.length) return;
  const complete = await publicResourceSchemaReady(db);
  const hasTable = (table) =>
    communityFeedSchemaReady(db, { [table]: { columns: PUBLIC_RESOURCE_SCHEMA[table].columns, indexes: [] } });
  if (!complete && !(await hasTable('public_resource_publications'))) return;
  // Partial installation of an ancillary table must not leave a publication that can reappear on restore.
  const [revisions, jobs, actions] = complete
    ? [true, true, true]
    : await Promise.all(
        ['public_resource_revisions', 'public_resource_review_jobs', 'public_resource_actions'].map(hasTable),
      );
  const [rows] = await db.query(
    `SELECT * FROM public_resource_publications WHERE owner_id=? AND kind=? AND source_id IN (${ids.map(() => '?').join(',')}) ORDER BY id FOR UPDATE`,
    [userId, kind, ...ids],
  );
  if (complete && rows.some((p) => p.published_revision_id))
    await persistPublicResourceAchievements(userId, { db, env: { PUBLIC_RESOURCES_ENABLED: 'true' } });
  for (const p of rows) {
    queueNotificationSourceChange(db, { kind: 'publication', ids: [p.public_id] });
    if (complete) await cancelPending(db, p);
    else if (p.pending_revision_id) {
      if (revisions)
        await db.query(
          "UPDATE public_resource_revisions SET status='obsolete' WHERE id=? AND status='pending_review'",
          [p.pending_revision_id],
        );
      if (jobs)
        await db.query(
          "UPDATE public_resource_review_jobs SET status='obsolete',lease_token=NULL,lease_until=NULL,finished_at=NOW(6) WHERE revision_id=? AND status IN ('pending','processing')",
          [p.pending_revision_id],
        );
    }
    await db.query(
      'UPDATE public_resource_publications SET withdrawn=1,published_revision_id=NULL,pending_revision_id=NULL,version=version+1,updated_at=NOW(6) WHERE id=?',
      [p.id],
    );
    if (actions) await audit(db, { publication: p, actor: userId, action: 'source_delete' });
  }
}
export async function purgePublicResourceData(db, tables, userId) {
  if (tables.has('public_resource_saved_sources'))
    await db.query('DELETE FROM public_resource_saved_sources WHERE recipient_id=?', [userId]);
  if (tables.has('public_resource_publications')) {
    for (const table of [
      'public_resource_events',
      'public_resource_review_jobs',
      'public_resource_reports',
      'public_resource_actions',
      'public_resource_revisions',
    ])
      if (tables.has(table))
        await db.query(
          `DELETE child FROM ${table} child JOIN public_resource_publications p ON p.id=child.publication_id WHERE p.owner_id=?`,
          [userId],
        );
    await db.query('DELETE FROM public_resource_publications WHERE owner_id=?', [userId]);
  }
  if (tables.has('public_resource_receipts'))
    await db.query('DELETE FROM public_resource_receipts WHERE actor_id=?', [userId]);
  if (tables.has('public_resource_reports'))
    await db.query('DELETE FROM public_resource_reports WHERE reporter_id=?', [userId]);
  if (tables.has('public_resource_reports'))
    await db.query('UPDATE public_resource_reports SET handled_by=NULL WHERE handled_by=?', [userId]);
  if (tables.has('public_resource_actions'))
    await db.query('UPDATE public_resource_actions SET actor_id=? WHERE actor_id=?', ['deleted', userId]);
  if (tables.has('notification'))
    await db.query("DELETE FROM notification WHERE user_id=? AND type='public_resource'", [userId]);
}
