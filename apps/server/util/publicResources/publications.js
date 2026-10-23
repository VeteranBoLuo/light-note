import { randomUUID } from 'node:crypto';
import pool from '../../db/index.js';
import { ensureCommunityChatIdentity } from '../services/communityChatIdentityService.js';
import { access, audit, date, event, fail, fields, first, flags, ready, uuid, version, write } from './core.js';
import { PUBLIC_RESOURCE_LIMITS } from '@lightnote/shared/public-resources';
import { loadSource, sourceInput, supportedSourceKeys } from './material.js';

const pageNumber = (value) => Math.max(1, Math.min(10000, Math.trunc(Number(value) || 1)));
export async function candidates({ user, input = {}, db = pool, env = process.env }) {
  await access(db, user);
  await ready(db, env, 'submit');
  fields(input, ['kind', 'q', 'page']);
  const kind = input.kind || 'note';
  if (!['all', 'note', 'bookmark'].includes(kind)) fail('INVALID_INPUT');
  const page = pageNumber(input.page),
    q = String(input.q || '').trim();
  if (q.length > 200) fail('INVALID_INPUT');
  const kinds = kind === 'all' ? ['note', 'bookmark'] : [kind],
    params = [];
  const branches = kinds.map((type) => {
    const note = type === 'note',
      title = note ? 'title' : 'name';
    params.push(user.id, ...(q ? [q] : []));
    const cast = (value) => `CONVERT(${value} USING utf8mb4) COLLATE utf8mb4_unicode_ci`;
    return `SELECT ${cast('id')} AS id,${cast(`'${type}'`)} AS kind,${cast(title)} AS title,${note ? 'COALESCE(update_time,create_time)' : 'create_time'} AS update_time
      FROM ${note ? 'note' : 'bookmark'} WHERE ${note ? 'create_by' : 'user_id'}=? AND del_flag=0
      ${note ? "AND type IN ('html','md','markdown')" : ''}${q ? ` AND LOCATE(?,${title})>0` : ''}`;
  });
  const from = `FROM (${branches.join(' UNION ALL ')}) candidate`;
  let total = 0;
  const items = [];
  for (let offset = 0; ; offset += 100) {
    const [rows] = await db.query(
      `SELECT id,kind,title ${from} ORDER BY update_time DESC,id DESC,kind ASC LIMIT 100 OFFSET ?`,
      [...params, offset],
    );
    const supported = await supportedSourceKeys(
      db,
      user.id,
      rows.map((row) => ({ kind: row.kind, sourceId: row.id })),
    );
    for (const row of rows) {
      if (!supported.has(`${row.kind}:${row.id}`)) continue;
      if (total >= (page - 1) * 20 && items.length < 20)
        items.push({ sourceId: String(row.id), kind: row.kind, title: row.title });
      total++;
    }
    if (rows.length < 100) break;
  }
  return { items, total, page, pageSize: 20, hasMore: page * 20 < total };
}
export async function preview({ user, input, db = pool, env = process.env }) {
  await access(db, user);
  await ready(db, env, 'submit');
  fields(input, ['kind', 'sourceId']);
  sourceInput(input);
  const material = await loadSource(db, user.id, input.kind, input.sourceId);
  const p = await first(
    db,
    'SELECT public_id,version,removed FROM public_resource_publications WHERE owner_id=? AND kind=? AND source_id=?',
    [user.id, input.kind, input.sourceId],
  );
  if (Number(p?.removed)) fail('REMOVED', 423);
  return { ...material, publicationId: p?.public_id || null, expectedVersion: Number(p?.version || 0) };
}
export async function cancelPending(db, p) {
  if (!p.pending_revision_id) return;
  await db.query("UPDATE public_resource_revisions SET status='obsolete' WHERE id=? AND status='pending_review'", [
    p.pending_revision_id,
  ]);
  await db.query(
    "UPDATE public_resource_review_jobs SET status='obsolete',lease_token=NULL,lease_until=NULL,finished_at=NOW(6) WHERE revision_id=? AND status IN ('pending','processing')",
    [p.pending_revision_id],
  );
}
export function ownStatus(p, r, job, aiActive = true) {
  if (Number(p.removed)) return 'removed';
  if (Number(p.withdrawn)) return 'withdrawn';
  if (p.pending_revision_id)
    return aiActive && job && ['pending', 'processing'].includes(job.status) ? 'ai_checking' : 'pending_review';
  if (r?.status === 'rejected') return 'rejected';
  return p.published_revision_id ? 'published' : 'withdrawn';
}
export async function submit({ user, input, db = pool, env = process.env, batchId = null }) {
  fields(input, ['requestId', 'kind', 'sourceId', 'fingerprint', 'expectedVersion', 'confirmed']);
  sourceInput(input);
  if (input.confirmed !== true || typeof input.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(input.fingerprint))
    fail('CONFIRMATION_REQUIRED');
  return write({ user, input, db, env, action: 'submit', batchId }, async (c) => {
    const material = await loadSource(c, user.id, input.kind, input.sourceId, { lock: true });
    if (material.fingerprint !== input.fingerprint) fail('MATERIAL_CHANGED', 409);
    let p = await first(
      c,
      'SELECT * FROM public_resource_publications WHERE owner_id=? AND kind=? AND source_id=? FOR UPDATE',
      [user.id, input.kind, input.sourceId],
    );
    if (Number(p?.removed)) fail('REMOVED', 423);
    // Same material has one authoritative outcome even with a new request ID.
    const latest = p?.latest_revision_id
      ? await first(c, 'SELECT * FROM public_resource_revisions WHERE id=?', [p.latest_revision_id])
      : null;
    if (p && !Number(p.withdrawn) && latest?.fingerprint === material.fingerprint)
      return { publicId: p.public_id, version: Number(p.version), revision: Number(latest.revision), reused: true };
    version(input.expectedVersion, p?.version || 0);
    await ensureCommunityChatIdentity({ userId: user.id, db: c });
    if (!p) {
      const id = randomUUID();
      const [insert] = await c.query(
        'INSERT INTO public_resource_publications(public_id,owner_id,kind,source_id) VALUES(?,?,?,?)',
        [id, user.id, input.kind, input.sourceId],
      );
      p = { id: insert.insertId, public_id: id, owner_id: user.id, kind: input.kind, version: 0 };
    }
    await cancelPending(c, p);
    const revision = Number(latest?.revision || 0) + 1;
    const [insert] = await c.query(
      'INSERT INTO public_resource_revisions(publication_id,revision,title,body,url,description,fingerprint) VALUES(?,?,?,?,?,?,?)',
      [p.id, revision, material.title, material.body, material.url, material.description, material.fingerprint],
    );
    const revisionId = insert.insertId,
      ai = flags(env).aiEnabled;
    await c.query(
      'INSERT INTO public_resource_review_jobs(publication_id,revision_id,status,reason_code) VALUES(?,?,?,?)',
      [p.id, revisionId, ai ? 'pending' : 'hold', ai ? null : 'review_disabled'],
    );
    await c.query(
      "UPDATE public_resource_publications SET pending_revision_id=?,latest_revision_id=?,version=version+1,withdrawn=0,reason='',updated_at=NOW(6) WHERE id=?",
      [revisionId, revisionId, p.id],
    );
    await audit(c, { publication: p, revision: revisionId, actor: user.id, action: 'submit' });
    await event(c, { key: `review:${revisionId}`, publication: p.id, revision: revisionId, kind: 'review' });
    return { publicId: p.public_id, version: Number(p.version) + 1, revision, reused: false };
  });
}
export async function own({ user, input = {}, db = pool, env = process.env }) {
  await access(db, user);
  await ready(db, env, 'safety');
  fields(input, ['page', 'status', 'q', 'kind']);
  const page = pageNumber(input.page),
    status = input.status || 'all';
  const states = ['ai_checking', 'pending_review', 'published', 'rejected', 'withdrawn', 'removed'];
  if (status !== 'all' && status !== 'reviewing' && !states.includes(status)) fail('INVALID_INPUT');
  const feature = flags(env),
    aiActive = feature.enabled && feature.submissionsEnabled && feature.aiEnabled;
  const stateSql = `CASE WHEN p.removed=1 THEN 'removed' WHEN p.withdrawn=1 THEN 'withdrawn' WHEN p.pending_revision_id IS NOT NULL AND ${aiActive ? 'TRUE' : 'FALSE'} AND j.status IN ('pending','processing') THEN 'ai_checking' WHEN p.pending_revision_id IS NOT NULL THEN 'pending_review' WHEN r.status='rejected' THEN 'rejected' WHEN p.published_revision_id IS NOT NULL THEN 'published' ELSE 'withdrawn' END`;
  const joins =
    'FROM public_resource_publications p LEFT JOIN public_resource_revisions r ON r.id=p.latest_revision_id LEFT JOIN public_resource_review_jobs j ON j.revision_id=p.pending_revision_id';
  const filters = ['p.owner_id=?'],
    params = [user.id];
  if (input.kind && input.kind !== 'all') {
    if (!['note', 'bookmark'].includes(input.kind)) fail('INVALID_INPUT');
    filters.push('p.kind=?');
    params.push(input.kind);
  }
  if (input.q) {
    if (typeof input.q !== 'string' || input.q.length > 200) fail('INVALID_INPUT');
    filters.push('LOCATE(?,r.title)>0');
    params.push(input.q.trim());
  }
  const where = filters.join(' AND ');
  const [counts] = await db.query(
    `SELECT ${stateSql} AS status,COUNT(*) AS count ${joins} WHERE ${where} GROUP BY status`,
    params,
  );
  const totals = Object.fromEntries(states.map((s) => [s, 0]));
  for (const row of counts) totals[row.status] = Number(row.count);
  totals.reviewing = totals.ai_checking + totals.pending_review;
  totals.all = counts.reduce((sum, r) => sum + Number(r.count), 0);
  const [rows] = await db.query(
    `SELECT p.*,r.title,r.fingerprint,r.revision,r.status AS revision_status,j.status AS ai_status,j.result_json ${joins} WHERE ${where}${status === 'all' ? '' : status === 'reviewing' ? ` AND (${stateSql}) IN ('ai_checking','pending_review')` : ` AND (${stateSql})=?`} ORDER BY p.updated_at DESC,p.id DESC LIMIT 20 OFFSET ?`,
    [...params, ...(['all', 'reviewing'].includes(status) ? [] : [status]), (page - 1) * 20],
  );
  const items = [];
  for (const p of rows) {
    let material = null,
      sourceUnavailable = false;
    try {
      material = await loadSource(db, user.id, p.kind, p.source_id);
    } catch (error) {
      if (!error?.code?.startsWith('PUBLIC_RESOURCE_')) throw error;
      sourceUnavailable = true;
    }
    const published = p.published_revision_id
      ? await first(db, 'SELECT fingerprint,revision FROM public_resource_revisions WHERE id=?', [
          p.published_revision_id,
        ])
      : null;
    items.push({
      publicId: p.public_id,
      kind: p.kind,
      sourceId: p.source_id,
      title: p.title || '',
      version: Number(p.version),
      status: ownStatus(p, { status: p.revision_status }, { status: p.ai_status }, aiActive),
      oldVersionPublic: Boolean(
        p.published_revision_id &&
        !Number(p.withdrawn) &&
        !Number(p.removed) &&
        String(p.latest_revision_id) !== String(p.published_revision_id),
      ),
      hasUnpublishedChanges: material ? material.fingerprint !== (published?.fingerprint || p.fingerprint) : null,
      sourceUnavailable,
      reason: p.reason || '',
      createdAt: date(p.created_at),
      updatedAt: date(p.updated_at),
      publishedAt: date(p.published_at),
      pendingRevision: p.pending_revision_id ? Number(p.revision) : null,
      publishedRevision: published ? Number(published.revision) : null,
      latestRevision: Number(p.revision) || null,
      aiStatus: p.ai_status || null,
      aiCompleted: Boolean(p.result_json),
    });
  }
  return { items, totals, total: totals[status], page, pageSize: 20, hasMore: page * 20 < totals[status] };
}
export async function ownDetail({ user, id, db = pool, env = process.env }) {
  await access(db, user);
  await ready(db, env, 'safety');
  const p = await first(db, 'SELECT * FROM public_resource_publications WHERE public_id=? AND owner_id=?', [
    id,
    user.id,
  ]);
  if (!p) fail('UNAVAILABLE', 404);
  const [rows] = await db.query(
    'SELECT revision,title,body,url,description,status,reason,created_at,fingerprint FROM public_resource_revisions WHERE id IN (?,?)',
    [p.latest_revision_id, p.published_revision_id],
  );
  return {
    publicId: p.public_id,
    kind: p.kind,
    version: Number(p.version),
    reason: p.reason,
    revisions: rows.map((r) => ({ ...r, createdAt: date(r.created_at), created_at: undefined })),
  };
}
// Bounded, owner-only preflight for explicit selections. No private bodies are read or returned.
export async function resolveOwn({ user, input, db = pool, env = process.env }) {
  await access(db, user);
  await ready(db, env, 'safety');
  fields(input, ['ids']);
  if (!Array.isArray(input.ids) || !input.ids.length || input.ids.length > PUBLIC_RESOURCE_LIMITS.batch)
    fail('INVALID_INPUT');
  const ids = [...new Set(input.ids.map(uuid))];
  const f = flags(env),
    aiActive = f.enabled && f.submissionsEnabled && f.aiEnabled;
  const [rows] = await db.query(
    `SELECT p.*,l.title,l.status AS revision_status,l.revision AS latest_revision,
    a.revision AS published_revision,n.revision AS pending_revision,j.status AS ai_status
    FROM public_resource_publications p
    LEFT JOIN public_resource_revisions l ON l.id=p.latest_revision_id
    LEFT JOIN public_resource_revisions a ON a.id=p.published_revision_id
    LEFT JOIN public_resource_revisions n ON n.id=p.pending_revision_id
    LEFT JOIN public_resource_review_jobs j ON j.revision_id=p.pending_revision_id
    WHERE p.owner_id=? AND p.public_id IN (${ids.map(() => '?').join(',')})`,
    [user.id, ...ids],
  );
  const items = rows.map((p) => ({
    publicId: p.public_id,
    kind: p.kind,
    sourceId: p.source_id,
    title: p.title || '',
    version: Number(p.version),
    status: ownStatus(p, { status: p.revision_status }, { status: p.ai_status }, aiActive),
    oldVersionPublic: Boolean(
      p.published_revision_id &&
      !Number(p.withdrawn) &&
      !Number(p.removed) &&
      String(p.latest_revision_id) !== String(p.published_revision_id),
    ),
    pendingRevision: Number(p.pending_revision) || null,
    publishedRevision: Number(p.published_revision) || null,
    latestRevision: Number(p.latest_revision) || null,
  }));
  return { items, unavailableIds: ids.filter((id) => !items.some((item) => item.publicId === id)) };
}
export async function withdraw({ user, id, input, db = pool, env = process.env, batchId = null }) {
  fields(input, ['requestId', 'expectedVersion']);
  return write({ user, input: { ...input, id }, db, env, action: 'withdraw', mode: 'safety', batchId }, async (c) => {
    const p = await first(c, 'SELECT * FROM public_resource_publications WHERE public_id=? AND owner_id=? FOR UPDATE', [
      id,
      user.id,
    ]);
    if (!p) fail('UNAVAILABLE', 404);
    version(input.expectedVersion, p.version);
    if (Number(p.removed)) fail('REMOVED', 423);
    if (Number(p.withdrawn) || (!p.published_revision_id && !p.pending_revision_id))
      return { publicId: p.public_id, version: Number(p.version), reused: true };
    await cancelPending(c, p);
    await c.query(
      'UPDATE public_resource_publications SET withdrawn=1,pending_revision_id=NULL,published_revision_id=NULL,version=version+1,updated_at=NOW(6) WHERE id=?',
      [p.id],
    );
    await audit(c, { publication: p, actor: user.id, action: 'withdraw' });
    return { publicId: p.public_id, version: Number(p.version) + 1, reused: false };
  });
}
