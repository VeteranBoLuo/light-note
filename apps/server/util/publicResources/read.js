import pool from '../../db/index.js';
import { access, date, fail, fields, first, ready, uuid } from './core.js';

// Legacy account/bookmark keys are utf8_general_ci. Convert the publication key,
// not the indexed legacy column, so MySQL 5.7 can use its point-lookup index.
export const legacyKey = (column) => `CONVERT(${column} USING utf8) COLLATE utf8_general_ci`;

// The single public visibility predicate: snapshots never grant access by possession of an ID.
export function visibleSql(alias = 'p') {
  return `${alias}.withdrawn=0 AND ${alias}.removed=0 AND ${alias}.published_revision_id IS NOT NULL
    AND EXISTS(SELECT 1 FROM public_resource_revisions vr WHERE vr.id=${alias}.published_revision_id AND vr.publication_id=${alias}.id AND vr.status='approved')
    AND EXISTS(SELECT 1 FROM user au WHERE au.id=${legacyKey(`${alias}.owner_id`)} AND au.del_flag='0' AND au.role IN ('root','user','test'))
    AND ((${alias}.kind='note' AND EXISTS(SELECT 1 FROM note ns WHERE ns.id=${alias}.source_id AND ns.create_by=${alias}.owner_id AND ns.del_flag=0)) OR (${alias}.kind='bookmark' AND EXISTS(SELECT 1 FROM bookmark bs WHERE bs.id=${legacyKey(`${alias}.source_id`)} AND bs.user_id=${legacyKey(`${alias}.owner_id`)} AND bs.del_flag=0)))
    AND NOT EXISTS(SELECT 1 FROM community_chat_blocks b WHERE (b.user_id=? AND b.blocked_user_id=${legacyKey(`${alias}.owner_id`)}) OR (b.blocked_user_id=? AND b.user_id=${legacyKey(`${alias}.owner_id`)}))`;
}
export const readJoins = `FROM public_resource_publications p JOIN public_resource_revisions r ON r.id=p.published_revision_id JOIN user a ON a.id=${legacyKey('p.owner_id')} JOIN community_chat_user_identities i ON i.user_id=${legacyKey('p.owner_id')}`;
export const readColumns =
  "p.public_id,p.kind,p.version,p.published_at,r.revision,r.title,r.body,r.url,r.description,i.public_id AS author_public_id,i.community_id,COALESCE(NULLIF(a.alias,''),'成员') AS author_name";
// Keep the same public identity fields, without transferring complete text for result lists.
export const readSummaryColumns =
  "p.public_id,p.kind,p.version,p.published_at,r.revision,r.title,LEFT(r.body,240) AS body,LEFT(r.description,240) AS description,i.public_id AS author_public_id,i.community_id,COALESCE(NULLIF(a.alias,''),'成员') AS author_name";
export function dto(row, { detail = false } = {}) {
  return {
    origin: 'public',
    publicId: row.public_id,
    kind: row.kind,
    title: row.title,
    summary: (row.kind === 'note' ? row.body : row.description).slice(0, 240),
    author: { publicId: row.author_public_id, name: row.author_name, communityId: row.community_id },
    publishedAt: date(row.published_at),
    revision: Number(row.revision),
    version: Number(row.version),
    ...(detail ? { body: row.body, url: row.url, description: row.description } : {}),
  };
}
export async function loadVisible(db, id, user, { lock = false } = {}) {
  uuid(id);
  const row = await first(
    db,
    `SELECT p.*,r.title,r.body,r.url,r.description,r.revision,i.public_id AS author_public_id,COALESCE(NULLIF(a.alias,''),'成员') AS author_name ${readJoins} WHERE p.public_id=? AND ${visibleSql()}${lock ? ' FOR UPDATE' : ''}`,
    [id, user.id, user.id],
  );
  if (!row) fail('UNAVAILABLE', 404);
  return row;
}
export async function detail({ user, id, db = pool, env = process.env }) {
  await access(db, user);
  await ready(db, env);
  uuid(id);
  const row = await first(db, `SELECT ${readColumns} ${readJoins} WHERE p.public_id=? AND ${visibleSql()}`, [
    id,
    user.id,
    user.id,
  ]);
  if (!row) fail('UNAVAILABLE', 404);
  return dto(row, { detail: true });
}
export async function search({ user, input = {}, db = pool, env = process.env, suggest = false }) {
  await access(db, user);
  await ready(db, env);
  fields(input, ['q', 'type', 'from', 'to', 'page', 'pageSize', 'sort']);
  const q = String(input.q || '')
    .normalize('NFKC')
    .trim();
  if (q.length > 200) fail('INVALID_INPUT');
  const kind = input.type || 'all';
  if (!['all', 'bookmark', 'note', 'file', 'todo'].includes(kind)) fail('INVALID_INPUT');
  const page = suggest ? 1 : Math.max(1, Math.min(10000, Math.trunc(Number(input.page) || 1)));
  const limit = suggest ? 3 : Math.max(1, Math.min(50, Math.trunc(Number(input.pageSize) || 20)));
  if (['file', 'todo'].includes(kind)) return { items: [], total: 0, page, pageSize: limit, hasMore: false };
  const where = [visibleSql(), 'p.owner_id<>?'],
    params = [user.id, user.id, user.id];
  if (kind !== 'all') {
    where.push('p.kind=?');
    params.push(kind);
  }
  for (const [key, operator] of [
    ['from', '>='],
    ['to', '<='],
  ])
    if (input[key]) {
      const value = String(input[key]);
      if (!/^\d{4}-\d\d-\d\d(?:T[\d:.Z+-]+)?$/.test(value) || !Number.isFinite(Date.parse(value)))
        fail('INVALID_INPUT');
      where.push(`p.published_at${operator}?`);
      params.push(new Date(value));
    }
  if (q) {
    where.push('(LOCATE(?,r.title)>0 OR LOCATE(?,r.body)>0 OR LOCATE(?,r.url)>0 OR LOCATE(?,r.description)>0)');
    params.push(q, q, q, q);
  }
  // Rank the entire visible set before LIMIT, including all note/bookmark bodies.
  const rank = q
    ? 'CASE WHEN r.title=? THEN 100 WHEN LEFT(r.title,CHAR_LENGTH(?))=? THEN 80 WHEN LOCATE(?,r.title)>0 THEN 60 WHEN LOCATE(?,r.url)>0 THEN 40 WHEN LOCATE(?,r.description)>0 THEN 30 ELSE 10 END'
    : '0';
  const rankParams = q ? [q, q, q, q, q, q] : [];
  const sort = input.sort || 'relevance';
  if (!['relevance', 'updated', 'created', 'updated_desc', 'created_desc'].includes(sort)) fail('INVALID_INPUT');
  const total = Number(
    (await first(db, `SELECT COUNT(*) AS count ${readJoins} WHERE ${where.join(' AND ')}`, params)).count,
  );
  const [rows] = await db.query(
    `SELECT ${readColumns},${rank} AS relevance ${readJoins} WHERE ${where.join(' AND ')} ORDER BY ${sort === 'relevance' ? 'relevance DESC,' : ''}p.published_at DESC,p.id DESC LIMIT ? OFFSET ?`,
    [...rankParams, ...params, limit, (page - 1) * limit],
  );
  return { items: rows.map((row) => dto(row)), total, page, pageSize: limit, hasMore: page * limit < total };
}
export const suggestions = (options) => search({ ...options, suggest: true });
