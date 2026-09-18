import { createHash } from 'node:crypto';
import pool from '../../db/index.js';
import { getCommunityChatFeatureState } from '../communityChatFeature.js';
import { ensureCommunityChatIdentity } from '../services/communityChatIdentityService.js';
import { communityFeedSchemaReady } from './schema.js';

export class CommunityFeedError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}
export const fail = (code, status) => {
  throw new CommunityFeedError(code, status);
};
export const first = async (db, sql, params = []) => (await db.query(sql, params))[0][0] || null;
export const parseJson = (value) => {
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return null;
  }
};
export const publicId = (value) => {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  )
    fail('COMMUNITY_INVALID_INPUT');
  return value.toLowerCase();
};
export function expectedRevision(value, current) {
  if (!Number.isSafeInteger(value) || value < 0) fail('COMMUNITY_INVALID_INPUT');
  if (value !== Number(current)) fail('COMMUNITY_REVISION_CONFLICT', 409);
}
export function strictFields(input, keys) {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !keys.includes(key))
  )
    fail('COMMUNITY_INVALID_INPUT');
}
export function text(value, max, required = true) {
  if (typeof value !== 'string' || Array.from(value.trim()).length > max || (required && !value.trim()))
    fail('COMMUNITY_INVALID_INPUT');
  return value.trim();
}
export function feature(env = process.env) {
  return {
    enabled: env.COMMUNITY_FEED_ENABLED === 'true',
    writesEnabled: env.COMMUNITY_FEED_WRITES_ENABLED === 'true',
    reviewAllWrites: env.COMMUNITY_FEED_REVIEW_ALL_WRITES === 'true',
  };
}
export async function capabilities({ env = process.env, db = pool } = {}) {
  const f = feature(env);
  const ready = f.enabled && (await communityFeedSchemaReady(db).catch(() => false));
  return {
    feedEnabled: Boolean(ready),
    writesEnabled: Boolean(ready && f.writesEnabled),
    reviewPolicy: f.reviewAllWrites ? 'all_writes' : 'all_posts',
    attachmentsEnabled: false,
  };
}
export async function access(db, user, { env = process.env, write = false, ownSafety = false, lock = false } = {}) {
  if (!ownSafety && !feature(env).enabled) fail('COMMUNITY_CLOSED', 503);
  if (write && !feature(env).writesEnabled) fail('COMMUNITY_READ_ONLY', 423);
  const registered = Boolean(user?.id && ['root', 'user', 'test'].includes(user.role));
  if (!registered) {
    if (write || ownSafety || getCommunityChatFeatureState(env).accessMode !== 'public')
      fail('COMMUNITY_LOGIN_REQUIRED', 403);
    return null;
  }
  const account = await first(
    db,
    `SELECT id, role, del_flag FROM user WHERE id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [user.id],
  );
  if (!account || String(account.del_flag) !== '0' || !['root', 'user', 'test'].includes(account.role))
    fail('COMMUNITY_ACCOUNT_UNAVAILABLE', 403);
  if (!ownSafety && account.role !== 'root') {
    const member = await first(
      db,
      `SELECT status,rules_version FROM community_chat_members WHERE user_id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
      [user.id],
    );
    const policy = getCommunityChatFeatureState(env);
    if (
      member?.status === 'banned' ||
      (policy.accessMode !== 'public' && (member?.status !== 'active' || member.rules_version !== policy.rulesVersion))
    )
      fail('COMMUNITY_ACCESS_DENIED', 403);
  }
  return account;
}
export async function pairAllowed(db, actor, target, { lock = false } = {}) {
  if (!actor || actor === target) return true;
  return !(await first(
    db,
    `SELECT id FROM community_chat_blocks WHERE (user_id=? AND blocked_user_id=?) OR (user_id=? AND blocked_user_id=?) LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [actor, target, target, actor],
  ));
}
export async function requirePair(db, actor, target, options) {
  if (!(await pairAllowed(db, actor, target, options))) fail('COMMUNITY_INTERACTION_UNAVAILABLE', 404);
}
export async function ensureProfile(db, userId) {
  await db.query(
    'INSERT IGNORE INTO community_profile_options (user_id,interests,featured_posts) VALUES (?,JSON_ARRAY(),JSON_ARRAY())',
    [userId],
  );
  return first(db, 'SELECT * FROM community_profile_options WHERE user_id=? FOR UPDATE', [userId]);
}
export async function identity(db, userId) {
  return ensureCommunityChatIdentity({ userId, db });
}
export async function transaction(
  { user, requestId, action, input, env = process.env, db = pool, ownSafety = false },
  perform,
) {
  publicId(requestId);
  const digest = createHash('sha256').update(JSON.stringify({ action, input })).digest('hex');
  const c = await db.getConnection();
  let committing = false;
  try {
    await c.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    await c.beginTransaction();
    const account = await access(c, user, { env, write: !ownSafety, ownSafety, lock: true });
    if (!account) fail('COMMUNITY_LOGIN_REQUIRED', 403);
    const receipt = await first(
      c,
      'SELECT request_hash,result FROM community_operation_receipts WHERE actor_id=? AND request_id=? FOR UPDATE',
      [user.id, requestId],
    );
    if (receipt) {
      if (receipt.request_hash !== digest) fail('COMMUNITY_REQUEST_REUSED', 409);
      await c.commit();
      return parseJson(receipt.result);
    }
    const recent = await first(
      c,
      'SELECT COUNT(*) AS count FROM community_operation_receipts WHERE actor_id=? AND created_at>DATE_SUB(NOW(6),INTERVAL 1 MINUTE)',
      [user.id],
    );
    if (Number(recent.count) >= 30) fail('COMMUNITY_RATE_LIMITED', 429);
    const result = await perform(c, account);
    await c.query(
      'INSERT INTO community_operation_receipts (actor_id,request_id,request_hash,result) VALUES (?,?,?,?)',
      [user.id, requestId, digest, JSON.stringify(result)],
    );
    committing = true;
    await c.commit();
    return result;
  } catch (error) {
    await c.rollback().catch(() => {});
    if (committing) fail('COMMUNITY_RESULT_UNKNOWN', 503);
    throw error;
  } finally {
    c.release();
  }
}
export async function operationReceipt({ user, requestId, env = process.env, db = pool }) {
  await access(db, user, { env, ownSafety: true });
  publicId(requestId);
  const row = await first(db, 'SELECT result FROM community_operation_receipts WHERE actor_id=? AND request_id=?', [
    user.id,
    requestId,
  ]);
  return { found: Boolean(row), result: row ? parseJson(row.result) : null };
}
// These predicates are shared by listings, counts and notification visibility; IDs never grant access.
export function authorVisibleSql(alias) {
  return `EXISTS (SELECT 1 FROM user active_author WHERE active_author.id=${alias}.author_id AND active_author.del_flag='0' AND active_author.role<>'visitor') AND NOT EXISTS (SELECT 1 FROM community_chat_members banned_author WHERE banned_author.user_id=${alias}.author_id AND banned_author.status='banned')`;
}
export function unblockedSql(alias) {
  return `NOT EXISTS (SELECT 1 FROM community_chat_blocks blocked WHERE (blocked.user_id=? AND blocked.blocked_user_id=${alias}.author_id) OR (blocked.blocked_user_id=? AND blocked.user_id=${alias}.author_id))`;
}
export async function loadPost(db, id, user, { owner = false, moderator = false, lock = false } = {}) {
  publicId(id);
  const post = await first(db, `SELECT p.* FROM community_posts p WHERE p.public_id=?${lock ? ' FOR UPDATE' : ''}`, [
    id,
  ]);
  if (!post || post.status === 'deleted') fail('COMMUNITY_CONTENT_UNAVAILABLE', 404);
  if (moderator || (owner && post.author_id === user?.id)) return post;
  if (post.status !== 'published') fail('COMMUNITY_CONTENT_UNAVAILABLE', 404);
  const author = await first(
    db,
    `SELECT p.id FROM community_posts p WHERE p.id=? AND ${authorVisibleSql('p')} AND ${unblockedSql('p')}`,
    [post.id, user?.id || '', user?.id || ''],
  );
  if (!author) fail('COMMUNITY_CONTENT_UNAVAILABLE', 404);
  return post;
}
export async function outbox(
  db,
  { key, kind, actorId, postId = null, commentId = null, actionId = null, revisionId = null },
) {
  await db.query(
    'INSERT IGNORE INTO community_outbox (event_key,kind,actor_id,post_id,comment_id,action_id,revision_id) VALUES (?,?,?,?,?,?,?)',
    [key, kind, actorId, postId, commentId, actionId, revisionId],
  );
}
export async function mentions(db, ids, actor) {
  for (const id of ids) {
    publicId(id);
    const row = await first(
      db,
      "SELECT i.user_id FROM community_chat_user_identities i JOIN user u ON u.id=i.user_id WHERE i.public_id=? AND u.del_flag='0' AND u.role<>'visitor' AND NOT EXISTS(SELECT 1 FROM community_chat_members m WHERE m.user_id=u.id AND m.status='banned')",
      [id],
    );
    if (!row) fail('COMMUNITY_INTERACTION_UNAVAILABLE', 404);
    await requirePair(db, actor, row.user_id, { lock: true });
  }
}
