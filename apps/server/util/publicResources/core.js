import { createHash, randomUUID } from 'node:crypto';
import pool from '../../db/index.js';
import { queueNotificationSourceChange } from '../notificationRealtimeEvents.js';
import { publicResourceSchemaReady } from './schema.js';

export class PublicResourceError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}
export const fail = (code, status) => {
  throw new PublicResourceError(`PUBLIC_RESOURCE_${code}`, status);
};
export const first = async (db, sql, params = []) => (await db.query(sql, params))[0][0] || null;
export const json = (value) => {
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return null;
  }
};
export const date = (value) => (value instanceof Date ? value.toISOString() : value || null);
export const receiptValue = (value) => {
  const result = json(value);
  return result && typeof result.__publicResourceBatch === 'string' ? result.value : result;
};
// JSON strings use utf8mb4_bin; request IDs are ascii_bin in the MySQL 5.7 schema.
const receiptBucket =
  "COALESCE(CONVERT(JSON_UNQUOTE(JSON_EXTRACT(result,'$.__publicResourceBatch')) USING ascii) COLLATE ascii_bin,request_id)";
export const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function uuid(value) {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  )
    fail('INVALID_INPUT');
  return value.toLowerCase();
}
export function fields(input, allowed) {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !allowed.includes(key))
  )
    fail('INVALID_INPUT');
}
export function text(value, max, required = true) {
  if (typeof value !== 'string' || Array.from(value.trim()).length > max || (required && !value.trim()))
    fail('INVALID_INPUT');
  return value.trim();
}
export function version(input, current) {
  if (!Number.isSafeInteger(input) || input < 0) fail('INVALID_INPUT');
  if (input !== Number(current)) fail('VERSION_CONFLICT', 409);
}
export function flags(env = process.env) {
  return {
    enabled: env.PUBLIC_RESOURCES_ENABLED === 'true',
    submissionsEnabled: env.PUBLIC_RESOURCES_SUBMISSIONS_ENABLED === 'true',
    aiEnabled:
      env.PUBLIC_RESOURCES_AI_ENABLED === 'true' &&
      !['0', 'false', 'off', 'no'].includes(
        String(env.AI_SKILL_KERNEL_ENABLED || '')
          .trim()
          .toLowerCase(),
      ),
  };
}
export async function capabilities({ db = pool, env = process.env, user } = {}) {
  const account = await access(db, user);
  const f = flags(env),
    ready = await publicResourceSchemaReady(db).catch(() => false);
  return {
    enabled: ready && f.enabled,
    submissionsEnabled: ready && f.enabled && f.submissionsEnabled,
    aiEnabled: ready && f.enabled && f.submissionsEnabled && f.aiEnabled,
    moderationEnabled: ready && account.role === 'root',
  };
}
export async function access(db, user, { lock = false, root = false } = {}) {
  if (!user?.id || !['root', 'user', 'test'].includes(user.role)) fail('LOGIN_REQUIRED', 403);
  const account = await first(db, `SELECT id,role,del_flag FROM user WHERE id=?${lock ? ' FOR UPDATE' : ''}`, [
    user.id,
  ]);
  if (!account || String(account.del_flag) !== '0' || !['root', 'user', 'test'].includes(account.role))
    fail('ACCOUNT_UNAVAILABLE', 403);
  if (root && account.role !== 'root') fail('FORBIDDEN', 403);
  return account;
}
export async function ready(db, env, mode = 'read') {
  if (!(await publicResourceSchemaReady(db))) fail('UNAVAILABLE', 503);
  const f = flags(env);
  if (mode !== 'safety' && !f.enabled) fail('CLOSED', 503);
  if (mode === 'submit' && !f.submissionsEnabled) fail('READ_ONLY', 423);
}
export async function transaction(db, perform) {
  const c = await db.getConnection();
  try {
    await c.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    await c.beginTransaction();
    const result = await perform(c);
    await c.commit();
    return result;
  } catch (error) {
    await c.rollback().catch(() => {});
    throw error;
  } finally {
    c.release();
  }
}
export async function write(
  { user, input, action, db = pool, env = process.env, mode = 'submit', root = false, batchId = null },
  perform,
) {
  uuid(input.requestId);
  if (batchId !== null) uuid(batchId);
  await ready(db, env, mode);
  const hash = digest({ action, input });
  return transaction(db, async (c) => {
    const account = await access(c, user, { lock: true, root });
    const old = await first(
      c,
      'SELECT request_hash,result FROM public_resource_receipts WHERE actor_id=? AND request_id=? FOR UPDATE',
      [user.id, input.requestId],
    );
    if (old) {
      if (old.request_hash !== hash) fail('REQUEST_REUSED', 409);
      return receiptValue(old.result);
    }
    const recent = await first(
      c,
      `SELECT COUNT(DISTINCT ${receiptBucket}) AS count
       FROM public_resource_receipts WHERE actor_id=? AND created_at>DATE_SUB(NOW(6),INTERVAL 1 MINUTE)
       AND (? IS NULL OR ${receiptBucket}<>?)`,
      [user.id, batchId, batchId],
    );
    if (Number(recent.count) >= 30) fail('RATE_LIMITED', 429);
    const result = await perform(c, account);
    await c.query('INSERT INTO public_resource_receipts(actor_id,request_id,request_hash,result) VALUES(?,?,?,?)', [
      user.id,
      input.requestId,
      hash,
      JSON.stringify(batchId ? { __publicResourceBatch: batchId, value: result } : result),
    ]);
    return result;
  });
}
export async function receipt({ user, id, db = pool, env = process.env }) {
  await access(db, user);
  await ready(db, env, 'safety');
  uuid(id);
  const row = await first(db, 'SELECT result FROM public_resource_receipts WHERE actor_id=? AND request_id=?', [
    user.id,
    id,
  ]);
  const result = row ? receiptValue(row.result) : null;
  const found = Boolean(row) && result?.__publicResourcePendingBatch !== true;
  return { found, result: found ? result : null };
}
export async function event(db, { key, publication, revision = null, action = null, kind }) {
  await db.query(
    'INSERT IGNORE INTO public_resource_events(event_key,publication_id,revision_id,action_id,kind) VALUES(?,?,?,?,?)',
    [key, publication, revision, action, kind],
  );
}
export async function audit(
  db,
  {
    publication,
    revision = null,
    actor,
    action,
    reason = '',
    notify = false,
    notificationBatchId = null,
    resultVersion = Number(publication.version) + 1,
  },
) {
  const publicId = randomUUID();
  queueNotificationSourceChange(db, { kind: 'publication', ids: [publication.public_id] });
  const [result] = await db.query(
    'INSERT INTO public_resource_actions(public_id,publication_id,revision_id,actor_id,action,reason,version) VALUES(?,?,?,?,?,?,?)',
    [publicId, publication.id, revision, actor, action, reason, resultVersion],
  );
  if (notify)
    await event(db, {
      key: notificationBatchId ? `result:${notificationBatchId}:${result.insertId}` : `result:${result.insertId}`,
      publication: publication.id,
      revision,
      action: result.insertId,
      kind: 'result',
    });
  return publicId;
}
