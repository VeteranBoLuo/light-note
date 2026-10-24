import pool from '../../db/index.js';
import { actionIdempotencyUuid } from '../agent/actionIdempotency.js';
import { createNote } from '../services/noteService.js';
import { createBookmark } from '../services/bookmarkService.js';
import { access, fail, fields, first, ready, uuid, version, write } from './core.js';
import { lockLiveSource } from './material.js';
import { loadVisible } from './read.js';

const escapeHtml = (value) =>
  value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
function sourceUrl(id, env) {
  const fallback = 'https://boluo66.top';
  let origin = fallback;
  try {
    const candidate = new URL(env.SITE_URL || fallback);
    if (
      ['https:', 'http:'].includes(candidate.protocol) &&
      !candidate.username &&
      !candidate.password &&
      candidate.origin.length < 180
    )
      origin = candidate.origin;
  } catch {
    /* Use the existing canonical site default. */
  }
  return `${origin}/public-resources/${id}`;
}
export async function savedSource({ user, input = {}, db = pool, env = process.env }) {
  await access(db, user);
  await ready(db, env, 'safety');
  fields(input, ['kind', 'resourceId']);
  if (
    !['note', 'bookmark'].includes(input.kind) ||
    typeof input.resourceId !== 'string' ||
    !input.resourceId ||
    input.resourceId.length > 64
  )
    fail('INVALID_INPUT');
  const table = input.kind === 'note' ? 'note' : 'bookmark',
    owner = input.kind === 'note' ? 'create_by' : 'user_id';
  const owned = await first(db, `SELECT id FROM ${table} WHERE id=? AND ${owner}=? AND del_flag=0`, [
    input.resourceId,
    user.id,
  ]);
  if (!owned) return { source: null };
  const row = await first(
    db,
    'SELECT author_name,author_public_id,source_url,revision FROM public_resource_saved_sources WHERE recipient_id=? AND kind=? AND resource_id=?',
    [user.id, input.kind, input.resourceId],
  );
  return {
    source: row
      ? {
          authorName: row.author_name,
          authorPublicId: row.author_public_id,
          url: row.source_url,
          revision: Number(row.revision),
        }
      : null,
  };
}
export async function save({
  user,
  id,
  input,
  db = pool,
  env = process.env,
  lang = 'zh-CN',
  createNoteService = createNote,
  createBookmarkService = createBookmark,
}) {
  fields(input, ['requestId', 'expectedVersion']);
  uuid(id);
  const effects = [];
  const result = await write({ user, input: { ...input, id }, db, env, action: 'save', mode: 'read' }, async (c) => {
    const current = await first(c, 'SELECT * FROM public_resource_publications WHERE public_id=?', [id]);
    if (!current) fail('UNAVAILABLE', 404);
    await access(c, { id: current.owner_id, role: 'user' }, { lock: true });
    await lockLiveSource(c, current);
    const p = await loadVisible(c, id, user, { lock: true });
    version(input.expectedVersion, p.version);
    const key = `public-resource-save:${user.id}:${id}:${p.revision}`,
      resourceId = actionIdempotencyUuid(key, p.kind);
    const note = p.kind === 'note',
      table = note ? 'note' : 'bookmark',
      owner = note ? 'create_by' : 'user_id';
    const existing = await first(c, `SELECT id,del_flag FROM ${table} WHERE id=? AND ${owner}=? FOR UPDATE`, [
      resourceId,
      user.id,
    ]);
    if (existing)
      return { kind: p.kind, id: String(existing.id), existing: true, inTrash: Number(existing.del_flag) !== 0 };
    if (!note) {
      // An existing URL, including a trash entry, remains the recipient's own copy without any overwrite.
      const duplicate = await first(
        c,
        'SELECT id,del_flag FROM bookmark WHERE user_id=? AND url=? AND BINARY url=BINARY ? ORDER BY del_flag,id LIMIT 1 FOR UPDATE',
        [user.id, p.url, p.url],
      );
      if (duplicate)
        return { kind: p.kind, id: String(duplicate.id), existing: true, inTrash: Number(duplicate.del_flag) !== 0 };
    }
    const options = {
      userId: user.id,
      userRole: user.role,
      idempotencyKey: key,
      transactionConnection: c,
      afterCommit: (effect) => effects.push(effect),
      beforeCreate: async (connection) => {
        const fresh = await loadVisible(connection, id, user, { lock: true });
        version(input.expectedVersion, fresh.version);
      },
    };
    // Public identity and approved revision are read inside the same visibility-checked transaction.
    const origin = sourceUrl(id, env),
      english = lang === 'en-US';
    const attribution = `<hr><p>${english ? 'Original author' : '原作者'}：${escapeHtml(p.author_name)}<br>${english ? 'Public source' : '公开来源'}：<a href="${escapeHtml(origin)}" rel="noopener noreferrer">${escapeHtml(origin)}</a></p>`;
    const created = note
      ? await createNoteService({
          ...options,
          note: {
            title: p.title,
            type: 'html',
            content:
              p.body
                .split(/\n\s*\n/u)
                .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
                .join('') + attribution,
          },
          maxContentLength: 300000,
        })
      : await createBookmarkService({
          ...options,
          bookmark: { name: p.title, url: p.url, description: p.description },
          saveSnapshot: false,
          fillMetadata: false,
          captureMetadata: false,
          suffixDuplicateName: true,
        });
    // Only a newly created copy can acquire attribution. Recreating a permanently deleted
    // deterministic ID replaces its orphan source record; live/trash copies returned above stay untouched.
    if (!created.duplicate && !created.idempotentReplay)
      await c.query(
        'INSERT INTO public_resource_saved_sources(recipient_id,kind,resource_id,author_public_id,author_name,source_url,revision) VALUES(?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE author_public_id=VALUES(author_public_id),author_name=VALUES(author_name),source_url=VALUES(source_url),revision=VALUES(revision)',
        [user.id, p.kind, String(created.id), p.author_public_id, p.author_name, origin, Number(p.revision)],
      );
    return { kind: p.kind, id: String(created.id), existing: false, inTrash: false };
  });
  // Domain side effects run only after the copy and operation receipt have committed together.
  for (const effect of effects) await effect().catch(() => {});
  return result;
}
