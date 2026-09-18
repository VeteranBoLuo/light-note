import { randomUUID } from 'node:crypto';
import { parseDocument } from 'htmlparser2';
import { marked } from 'marked';
import pool from '../../db/index.js';
import { normalizeCanonicalNoteRecord } from '../noteReadModel.js';
import { access, CommunityFeedError, fail, first, publicId, strictFields, transaction, loadPost } from './core.js';
import { communityFeedSchemaReady } from './schema.js';
import { COMMUNITY_RESOURCE_SCHEMA } from './schemaContract.js';

export const resourcesReady = (db = pool) => communityFeedSchemaReady(db, COMMUNITY_RESOURCE_SCHEMA);
// Rendered as text on the client. No HTML, remote assets, child pages or private link targets escape.
export function noteSnapshot(source) {
  if (!['html', 'md', 'markdown'].includes(source.type)) fail('COMMUNITY_RESOURCE_TEXT_ONLY');
  if (typeof source.content !== 'string' || Buffer.byteLength(source.content) > 200000)
    fail('COMMUNITY_RESOURCE_TOO_LARGE');
  const raw = source.type === 'markdown' ? marked.parse(source.content, { async: false }) : source.content;
  const media = new Set(['img', 'picture', 'audio', 'video', 'svg', 'canvas', 'iframe', 'object', 'embed', 'source']);
  function rejectMedia(node) {
    if (media.has(node.name)) fail('COMMUNITY_RESOURCE_TEXT_ONLY');
    for (const child of node.children || []) rejectMedia(child);
  }
  rejectMedia(parseDocument(raw));
  const normalized = normalizeCanonicalNoteRecord(source);
  const html = source.type === 'markdown' ? marked.parse(normalized.content, { async: false }) : normalized.content;
  const blocks = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'pre', 'blockquote', 'tr', 'section']);
  function plain(node) {
    if (['script', 'style', 'head'].includes(node.name)) return '';
    if (node.type === 'text') return node.data;
    if (node.name === 'br') return '\n';
    const value = (node.children || []).map(plain).join('');
    return blocks.has(node.name) ? '\n' + value + '\n' : ['td', 'th'].includes(node.name) ? value + '\t' : value;
  }
  const body = plain(parseDocument(html))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!body) fail('COMMUNITY_RESOURCE_EMPTY');
  if (Array.from(body).length > 30000) fail('COMMUNITY_RESOURCE_TOO_LARGE');
  return body;
}
export function bookmarkSnapshot(value) {
  if (typeof value !== 'string' || value.length > 2048) fail('COMMUNITY_RESOURCE_INVALID_URL');
  let url;
  try {
    url = new URL(value);
  } catch {
    fail('COMMUNITY_RESOURCE_INVALID_URL');
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
    fail('COMMUNITY_RESOURCE_INVALID_URL');
  // Sharing tickets are not fixed content and must never be republished by this path.
  const keys = [...url.searchParams.keys(), ...new URLSearchParams(url.hash.slice(1)).keys()];
  if (
    url.href.length > 2048 ||
    keys.some((key) => /^(token|access_token|share_token|ticket|password|signature|x-amz-signature)$/i.test(key))
  )
    fail('COMMUNITY_RESOURCE_INVALID_URL');
  return url.href;
}
export function resourceDto(row, postId, revision) {
  return {
    publicId: row.public_id,
    kind: row.kind,
    title: row.title,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    ...(postId ? { postId, revision: Number(revision) } : {}),
  };
}
// Check owned candidates without creating snapshots or exposing private note content.
export async function eligibleResources({ user, input, db = pool, env = process.env }) {
  await access(db, user, { env, write: true });
  strictFields(input, ['items']);
  let items;
  try {
    items = JSON.parse(input.items);
  } catch {
    fail('COMMUNITY_INVALID_INPUT');
  }
  if (!Array.isArray(items) || items.length > 40) fail('COMMUNITY_INVALID_INPUT');
  for (const item of items) {
    if (
      !item ||
      !['note', 'bookmark'].includes(item.type) ||
      typeof item.id !== 'string' ||
      !item.id ||
      item.id.length > 255
    )
      fail('COMMUNITY_INVALID_INPUT');
    strictFields(item, ['type', 'id']);
  }
  const eligible = new Set();
  for (const type of ['note', 'bookmark']) {
    const ids = [...new Set(items.filter((item) => item.type === type).map((item) => item.id))];
    if (!ids.length) continue;
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await db.query(
      type === 'note'
        ? `SELECT id,title,content,type FROM note WHERE create_by=? AND del_flag=0 AND OCTET_LENGTH(content)<=200000 AND id IN (${placeholders})`
        : `SELECT id,name AS title,url FROM bookmark WHERE user_id=? AND del_flag=0 AND id IN (${placeholders})`,
      [user.id, ...ids],
    );
    for (const row of rows) {
      const title = String(row.title || '').trim();
      if (!title || Array.from(title).length > 255) continue;
      try {
        if (type === 'note') noteSnapshot(row);
        else bookmarkSnapshot(row.url);
        eligible.add(`${type}:${row.id}`);
      } catch (error) {
        if (!(error instanceof CommunityFeedError)) throw error;
      }
    }
  }
  return { keys: [...eligible] };
}
export async function prepareResource({ user, input, db = pool, env = process.env }) {
  strictFields(input, ['requestId', 'type', 'id']);
  if (!['note', 'bookmark'].includes(input.type) || typeof input.id !== 'string' || !input.id || input.id.length > 255)
    fail('COMMUNITY_INVALID_INPUT');
  if (!(await resourcesReady(db))) fail('COMMUNITY_RESOURCES_UNAVAILABLE', 503);
  return transaction({ user, requestId: input.requestId, action: 'resource-prepare', input, db, env }, async (c) => {
    const count = await first(
      c,
      'SELECT COUNT(*) AS count FROM community_resource_snapshots WHERE owner_id=? AND post_id IS NULL',
      [user.id],
    );
    if (Number(count.count) >= 12) fail('COMMUNITY_RESOURCE_LIMIT', 429);
    const note = input.type === 'note';
    const source = await first(
      c,
      note
        ? 'SELECT title,content,type FROM note WHERE id=? AND create_by=? AND del_flag=0'
        : 'SELECT name AS title,url FROM bookmark WHERE id=? AND user_id=? AND del_flag=0',
      [input.id, user.id],
    );
    if (!source) fail('COMMUNITY_RESOURCE_UNAVAILABLE', 404);
    const title = String(source.title || '').trim();
    if (!title || Array.from(title).length > 255) fail('COMMUNITY_INVALID_INPUT');
    const body = note ? noteSnapshot(source) : '',
      url = note ? '' : bookmarkSnapshot(source.url),
      id = randomUUID();
    await c.query(
      'INSERT INTO community_resource_snapshots(public_id,owner_id,kind,title,body,url) VALUES(?,?,?,?,?,?)',
      [id, user.id, input.type, title, body, url],
    );
    // Receipt stores only the ID/metadata. Full private text never enters the receipt log.
    return resourceDto(await first(c, 'SELECT * FROM community_resource_snapshots WHERE public_id=?', [id]));
  });
}
export async function bindResources(db, post, revisionId, ids) {
  if (!ids.length) return;
  if (!(await resourcesReady(db))) fail('COMMUNITY_RESOURCES_UNAVAILABLE', 503);
  for (const [order, id] of ids.entries()) {
    const row = await first(db, 'SELECT * FROM community_resource_snapshots WHERE public_id=? FOR UPDATE', [id]);
    if (!row || row.owner_id !== post.author_id || (row.post_id && Number(row.post_id) !== Number(post.id)))
      fail('COMMUNITY_RESOURCE_UNAVAILABLE', 409);
    await db.query('UPDATE community_resource_snapshots SET post_id=? WHERE public_id=?', [post.id, id]);
    await db.query('INSERT INTO community_revision_resources(revision_id,resource_id,sort_order) VALUES(?,?,?)', [
      revisionId,
      id,
      order,
    ]);
  }
}
export async function revisionResources(db, ids) {
  if (!ids.length || !(await resourcesReady(db))) return [];
  return (
    await db.query(
      `SELECT s.public_id,s.kind,s.title,s.created_at,r.revision_id FROM community_revision_resources r JOIN community_resource_snapshots s ON s.public_id=r.resource_id WHERE r.revision_id IN (${ids.map(() => '?').join(',')}) ORDER BY r.sort_order`,
      ids,
    )
  )[0];
}
export async function readResource({ user, id, input = {}, db = pool, env = process.env }) {
  const account = await access(db, user, { env });
  if (!(await resourcesReady(db))) fail('COMMUNITY_RESOURCES_UNAVAILABLE', 503);
  const row = await first(db, 'SELECT * FROM community_resource_snapshots WHERE public_id=?', [publicId(id)]);
  if (!row) fail('COMMUNITY_RESOURCE_UNAVAILABLE', 404);
  if (input.postId) {
    const owner = row.owner_id === user?.id,
      moderator = account?.role === 'root';
    const post = await loadPost(db, input.postId, user, { owner, moderator });
    const revision = await first(
      db,
      'SELECT r.id FROM community_post_revisions r JOIN community_revision_resources rr ON rr.revision_id=r.id WHERE r.post_id=? AND r.revision_no=? AND rr.resource_id=?',
      [post.id, Number(input.revision), row.public_id],
    );
    if (!revision || (!owner && !moderator && Number(post.published_revision_id) !== Number(revision.id)))
      fail('COMMUNITY_RESOURCE_UNAVAILABLE', 404);
  } else if (row.owner_id !== user?.id) fail('COMMUNITY_RESOURCE_UNAVAILABLE', 404);
  return { ...resourceDto(row), body: row.body, url: row.url };
}
export async function discardResource({ user, id, db = pool, env = process.env }) {
  await access(db, user, { env, ownSafety: true });
  await db.query('DELETE FROM community_resource_snapshots WHERE public_id=? AND owner_id=? AND post_id IS NULL', [
    publicId(id),
    user.id,
  ]);
  return { discarded: true };
}
export async function cleanupResources({ db = pool } = {}) {
  if (!(await resourcesReady(db))) return;
  await db.query(
    'DELETE FROM community_resource_snapshots WHERE post_id IS NULL AND created_at<DATE_SUB(NOW(),INTERVAL 24 HOUR) LIMIT 100',
  );
}
