import { cloudObjectOwner } from './cloudObjectPublication.js';
import { createHash, randomUUID } from 'node:crypto';
import pool from '../../db/index.js';
import { buildObjectKey, createUploadSignedUrl, deleteObjectFromObs } from '../obsClient.js';
import { assertCloudFileDisplayName } from './cloudFileNameService.js';
import { imagePreviewWorkerEnabled } from '../imagePreview/workerPolicy.js';

const UPLOAD_TTL_SECONDS = 900;
const GRACE_SECONDS = 86400;
const identity = (key) => createHash('sha256').update(key).digest('hex');
function busy() {
  return Object.assign(new Error('文件正在清理，请稍后重新上传'), { code: 'FILE_UPLOAD_OBJECT_BUSY', status: 409 });
}
function legacyName(userId, key) {
  const prefix = `files/${userId}/`;
  if (!key.startsWith(prefix)) return null;
  const name = key.slice(prefix.length);
  try {
    assertCloudFileDisplayName(name);
    return name;
  } catch {
    return null;
  }
}
export async function lockActiveUploadOwner(connection, userId) {
  const [[owner]] = await connection.query('SELECT id,role,del_flag FROM user WHERE id=? FOR UPDATE', [userId]);
  if (!owner || Number(owner.del_flag) === 1 || owner.role === 'deleted') {
    throw Object.assign(new Error('账号不可用，请重新登录'), { code: 'UPLOAD_OWNER_INACTIVE', status: 403 });
  }
}

async function lockObject(connection, userId, key) {
  const hash = identity(key);
  await connection.query(
    `INSERT INTO cloud_legacy_object_lifecycle (object_hash,generation,user_id,object_key,available_at) VALUES (?,?,?,?,DATE_ADD(NOW(),INTERVAL 1 DAY))
    ON DUPLICATE KEY UPDATE object_hash=VALUES(object_hash)`,
    [hash, randomUUID(), userId, key],
  );
  const [[row]] = await connection.query('SELECT * FROM cloud_legacy_object_lifecycle WHERE object_hash=? FOR UPDATE', [
    hash,
  ]);
  return { ...row, hash };
}

// The compatibility name alias is server-owned. Every newly issued URL writes
// a fresh managed key; a retired legacy address is never issued again.
export async function prepareLegacyCloudUpload({ userId, fileName, fileType, database = pool }) {
  assertCloudFileDisplayName(fileName);
  const objectKey = buildObjectKey(userId, `uploads/${randomUUID()}`);
  const generation = randomUUID();
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    await lockActiveUploadOwner(connection, userId);
    const { hash } = await lockObject(connection, userId, buildObjectKey(userId, fileName));
    await connection.query(
      `UPDATE cloud_legacy_object_lifecycle SET upload_key=?,generation=?,
      available_at=IF(state='active',NULL,available_at) WHERE object_hash=?`,
      [objectKey, generation, hash],
    );
    const signed = createUploadSignedUrl({ objectKey, contentType: fileType, expires: UPLOAD_TTL_SECONDS });
    await connection.commit();
    return { ...signed, objectKey, generation };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function reserveLegacyUploadConfirmation({ userId, fileName, objectKey, database = pool }) {
  assertCloudFileDisplayName(fileName);
  const legacyKey = buildObjectKey(userId, fileName);
  if (objectKey && objectKey !== legacyKey) {
    const prefix = buildObjectKey(userId, 'uploads/');
    if (
      typeof objectKey !== 'string' ||
      !objectKey.startsWith(prefix) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(objectKey.slice(prefix.length))
    )
      throw busy();
    // Random, owner-scoped keys are never targets of legacy retirement. Explicit
    // keys let concurrent uploads with the same display name confirm their own bytes.
    return { objectKey, generation: null };
  }
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    await lockActiveUploadOwner(connection, userId);
    const row = await lockObject(connection, userId, legacyKey);
    if (!row.upload_key && ['deleting', 'retired'].includes(row.state)) throw busy();
    if (!row.upload_key) {
      await connection.query(
        `UPDATE cloud_legacy_object_lifecycle SET upload_until=GREATEST(upload_until,DATE_ADD(NOW(),INTERVAL ? SECOND)),
        available_at=GREATEST(COALESCE(available_at,NOW()),DATE_ADD(NOW(),INTERVAL ? SECOND)) WHERE object_hash=?`,
        [UPLOAD_TTL_SECONDS, UPLOAD_TTL_SECONDS + GRACE_SECONDS, row.hash],
      );
    }
    await connection.commit();
    return { objectKey: row.upload_key || legacyKey, generation: row.generation };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// Call after locking the owner and before any file insert. The row remains locked
// through commit, including confirmations using a URL issued by an older API.
export async function lockLegacyUploadForConfirmation(connection, userId, fileName, generation) {
  assertCloudFileDisplayName(fileName);
  const hash = identity(buildObjectKey(userId, fileName));
  const [[row]] = await connection.query(
    'SELECT state,generation,upload_key FROM cloud_legacy_object_lifecycle WHERE object_hash=? FOR UPDATE',
    [hash],
  );
  if (
    !generation ||
    !row ||
    (!row.upload_key && ['deleting', 'retired'].includes(row.state)) ||
    row.generation !== generation
  )
    throw busy();
  return hash;
}

export async function queueLegacyObjectRetirement(connection, userId, key) {
  if (!legacyName(userId, key)) return false;
  const { hash, state } = await lockObject(connection, userId, key);
  if (['deleting', 'retired'].includes(state)) return true;
  await connection.query(
    `UPDATE cloud_legacy_object_lifecycle SET state='pending',
    available_at=GREATEST(DATE_ADD(NOW(),INTERVAL 1 DAY),DATE_ADD(upload_until,INTERVAL 1 DAY)) WHERE object_hash=?`,
    [hash],
  );
  return true;
}

export async function cleanupLegacyCloudObject({
  database = pool,
  remove = deleteObjectFromObs,
  env = process.env,
} = {}) {
  if (!imagePreviewWorkerEnabled(env)) return false;
  const [[candidate]] = await database.query(`SELECT object_hash,user_id FROM cloud_legacy_object_lifecycle
    WHERE available_at<=NOW() ORDER BY available_at,object_hash LIMIT 1`);
  if (!candidate) return false;
  const connection = await database.getConnection();
  const token = randomUUID();
  let row;
  try {
    await connection.beginTransaction();
    // Same lock order as file mutation and confirmation: owner, lifecycle, refs.
    await connection.query('SELECT id FROM user WHERE id=? FOR UPDATE', [candidate.user_id]);
    const [[current]] = await connection.query(
      `SELECT * FROM cloud_legacy_object_lifecycle
      WHERE object_hash=? AND available_at<=NOW() FOR UPDATE`,
      [candidate.object_hash],
    );
    row = current;
    if (!row) {
      await connection.commit();
      return false;
    }
    const name = row.object_key.slice(`files/${row.user_id}/`.length);
    if (cloudObjectOwner(row.object_key) !== String(row.user_id) || identity(row.object_key) !== row.object_hash) throw Error('Invalid legacy object retirement identity');
    if (row.state === 'active') {
      // Expired signature bookkeeping is disposable; this is not authorization
      // to remove abandoned uploads that were never explicitly retired.
      await connection.query(
        row.upload_key
          ? 'UPDATE cloud_legacy_object_lifecycle SET available_at=NULL WHERE object_hash=?'
          : 'DELETE FROM cloud_legacy_object_lifecycle WHERE object_hash=?',
        [row.object_hash],
      );
      await connection.commit();
      return true;
    }
    if (row.state !== 'deleting') {
      const [files] = await connection.query(
        `SELECT id FROM files WHERE create_by=? AND
        (obs_key=? OR ((obs_key IS NULL OR obs_key='') AND file_name=?)) FOR UPDATE`,
        [row.user_id, row.object_key, name],
      );
      const [assets] = await connection.query(
        "SELECT id FROM image_assets WHERE storage_kind='obs' AND source_locator=? FOR UPDATE",
        [row.object_key],
      );
      if (files.length || assets.length) {
        await connection.query(
          row.upload_key
            ? "UPDATE cloud_legacy_object_lifecycle SET state='active',available_at=NULL WHERE object_hash=?"
            : 'DELETE FROM cloud_legacy_object_lifecycle WHERE object_hash=?',
          [row.object_hash],
        );
        await connection.commit();
        return true;
      }
    }
    await connection.query(
      `UPDATE cloud_legacy_object_lifecycle SET state='deleting',lease_token=?,attempts=attempts+1,
      available_at=DATE_ADD(NOW(),INTERVAL 5 MINUTE) WHERE object_hash=?`,
      [token, row.object_hash],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  await remove(row.object_key);
  await database.query(
    "UPDATE cloud_legacy_object_lifecycle SET state='retired',available_at=NULL WHERE object_hash=? AND state='deleting' AND lease_token=?",
    [row.object_hash, token],
  );
  return true;
}
