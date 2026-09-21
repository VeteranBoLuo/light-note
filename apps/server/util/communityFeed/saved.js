import pool from '../../db/index.js';
import { actionIdempotencyUuid } from '../agent/actionIdempotency.js';
import { access, publicId, fail } from './core.js';

// The same owner/post key is used by the canonical note and bookmark create services.
export async function savedPostResources({ user, id, db = pool, env = process.env }) {
  await access(db, user, { env });
  if (!user?.id || user.role === 'visitor') fail('COMMUNITY_LOGIN_REQUIRED', 401);
  const key = `community-save:${user.id}:${publicId(id)}`;
  const result = { key, note: null, bookmark: null };
  for (const kind of ['note', 'bookmark']) {
    const resourceId = actionIdempotencyUuid(key, kind);
    const [rows] = await db.query(
      kind === 'note'
        ? 'SELECT id, del_flag FROM note WHERE id=? AND create_by=? LIMIT 1'
        : 'SELECT id, del_flag FROM bookmark WHERE id=? AND user_id=? LIMIT 1',
      [resourceId, user.id],
    );
    if (rows[0]) result[kind] = { id: String(rows[0].id), deleted: Number(rows[0].del_flag) !== 0 };
  }
  return result;
}
