import pool from '../../db/index.js';
import { access, date, fail, fields, flags, ready } from './core.js';
import { PUBLIC_RESOURCE_LIMITS } from '@lightnote/shared/public-resources';

const cast = (column) => `CONVERT(${column} USING utf8mb4) COLLATE utf8mb4_unicode_ci`;
const liveNote = "n.del_flag=0 AND n.type IN ('html','md','markdown')";

/** Candidate metadata only. Full material eligibility is checked on preview and submission. */
export async function workspace({ user, input = {}, db = pool, env = process.env }) {
  await access(db, user);
  await ready(db, env, 'safety');
  fields(input, ['page', 'pageSize', 'kind', 'q', 'status']);
  const kind = input.kind || 'all',
    status = input.status || 'all',
    q = input.q || '';
  const states = ['unpublished', 'published', 'ai_checking', 'pending_review', 'rejected', 'withdrawn', 'removed'];
  if (
    !['all', 'note', 'bookmark'].includes(kind) ||
    !['all', 'reviewing', ...states].includes(status) ||
    typeof q !== 'string' ||
    q.length > 200
  )
    fail('INVALID_INPUT');
  const page = Math.max(1, Math.min(10000, Math.trunc(Number(input.page) || 1)));
  const pageSize = Math.max(
    1,
    Math.min(PUBLIC_RESOURCE_LIMITS.workspace, Math.trunc(Number(input.pageSize) || PUBLIC_RESOURCE_LIMITS.workspace)),
  );
  const f = flags(env),
    aiActive = f.enabled && f.submissionsEnabled && f.aiEnabled;
  const sources = `SELECT ${cast("'note'")} AS kind,${cast('n.id')} AS source_id,${cast('n.title')} AS title,COALESCE(n.update_time,n.create_time) AS update_time,0 AS source_unavailable
    FROM note n WHERE n.create_by=? AND ${liveNote}
    UNION ALL SELECT ${cast("'bookmark'")},${cast('b.id')},${cast('b.name')},b.create_time,0
    FROM bookmark b WHERE b.user_id=? AND b.del_flag=0`;
  const state = `CASE WHEN p.id IS NULL THEN 'unpublished' WHEN p.removed=1 THEN 'removed' WHEN p.withdrawn=1 THEN 'withdrawn'
    WHEN p.pending_revision_id IS NOT NULL AND ${aiActive ? 'TRUE' : 'FALSE'} AND j.status IN ('pending','processing') THEN 'ai_checking'
    WHEN p.pending_revision_id IS NOT NULL THEN 'pending_review' WHEN r.status='rejected' THEN 'rejected'
    WHEN p.published_revision_id IS NOT NULL THEN 'published' ELSE 'withdrawn' END`;
  const projection = `SELECT s.kind,s.source_id,COALESCE(s.title,r.title,'') AS title,s.source_unavailable,
    CAST(GREATEST(COALESCE(s.update_time,'1970-01-01 00:00:00'),COALESCE(p.updated_at,'1970-01-01 00:00:00')) AS DATETIME(6)) AS updated_at,
    p.public_id,p.version,p.reason,p.created_at,p.updated_at AS publication_updated_at,p.published_at,
    r.title AS revision_title,r.revision AS latest_revision,a.revision AS published_revision,nr.revision AS pending_revision,
    (p.published_revision_id IS NOT NULL AND p.removed=0 AND p.withdrawn=0 AND p.latest_revision_id<>p.published_revision_id) AS old_public,
    j.status AS ai_status,(j.result_json IS NOT NULL) AS ai_completed,${state} AS status
    FROM (${sources}) s LEFT JOIN public_resource_publications p ON p.owner_id=? AND p.kind=s.kind AND p.source_id=s.source_id
    LEFT JOIN public_resource_revisions r ON r.id=p.latest_revision_id
    LEFT JOIN public_resource_revisions a ON a.id=p.published_revision_id
    LEFT JOIN public_resource_revisions nr ON nr.id=p.pending_revision_id
    LEFT JOIN public_resource_review_jobs j ON j.revision_id=p.pending_revision_id`;
  const params = [user.id, user.id, user.id],
    filters = [];
  if (kind !== 'all') {
    filters.push('kind=?');
    params.push(kind);
  }
  if (q.trim()) {
    filters.push('(LOCATE(?,title)>0 OR LOCATE(?,revision_title)>0)');
    params.push(q.trim(), q.trim());
  }
  const from = `FROM (${projection}) catalogue WHERE ${filters.length ? filters.join(' AND ') : 'TRUE'}`;
  const totals = Object.fromEntries(states.map((key) => [key, 0]));
  totals.all = 0;
  totals.reviewing = 0;
  const [counts] = await db.query(`SELECT status,COUNT(*) AS count ${from} GROUP BY status`, params);
  for (const row of counts) {
    totals[row.status] = Number(row.count);
    totals.all += Number(row.count);
  }
  totals.reviewing = totals.ai_checking + totals.pending_review;
  const condition =
    status === 'all'
      ? ''
      : status === 'reviewing'
        ? " AND status IN ('ai_checking','pending_review')"
        : ' AND status=?';
  const [rows] = await db.query(
    `SELECT * ${from}${condition} ORDER BY updated_at DESC,source_id DESC,kind ASC LIMIT ? OFFSET ?`,
    [...params, ...(['all', 'reviewing'].includes(status) ? [] : [status]), pageSize, (page - 1) * pageSize],
  );
  return {
    items: rows.map((row) => ({
      kind: row.kind,
      sourceId: String(row.source_id),
      title: row.title,
      updatedAt: date(row.updated_at),
      sourceUnavailable: Boolean(row.source_unavailable),
      publication: row.public_id
        ? {
            publicId: row.public_id,
            kind: row.kind,
            sourceId: String(row.source_id),
            title: row.revision_title || row.title,
            version: Number(row.version),
            status: row.status,
            oldVersionPublic: Boolean(row.old_public),
            hasUnpublishedChanges: null,
            sourceUnavailable: Boolean(row.source_unavailable),
            reason: row.reason || '',
            createdAt: date(row.created_at),
            updatedAt: date(row.publication_updated_at),
            publishedAt: date(row.published_at),
            pendingRevision: Number(row.pending_revision) || null,
            publishedRevision: Number(row.published_revision) || null,
            latestRevision: Number(row.latest_revision) || null,
            aiStatus: row.ai_status || null,
            aiCompleted: Boolean(row.ai_completed),
          }
        : null,
    })),
    totals,
    total: totals[status],
    page,
    pageSize,
    hasMore: page * pageSize < totals[status],
  };
}
