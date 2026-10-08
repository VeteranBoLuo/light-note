import { createHash, randomUUID } from 'node:crypto';

export function cloudObjectOwner(objectKey) {
  const match = /^files\/([^/]+)\/(.+)$/u.exec(String(objectKey || ''));
  if (
    !match ||
    /[\\\x00-\x1f]/u.test(match[2]) ||
    match[2].split('/').some((part) => !part || part === '.' || part === '..')
  )
    return null;
  return match[1];
}

async function lockIdentity(connection, userId, objectKey) {
  if (cloudObjectOwner(objectKey) !== String(userId)) {
    throw Object.assign(new Error('上传对象无效'), { code: 'UPLOAD_KEY_INVALID', status: 400 });
  }
  const hash = createHash('sha256').update(objectKey).digest('hex');
  await connection.query(
    `INSERT INTO cloud_legacy_object_lifecycle (object_hash,generation,user_id,object_key,available_at)
     VALUES (?,?,?,?,NULL) ON DUPLICATE KEY UPDATE object_hash=VALUES(object_hash)`,
    [hash, randomUUID(), userId, objectKey],
  );
  const [[row]] = await connection.query(
    'SELECT state FROM cloud_legacy_object_lifecycle WHERE object_hash=? FOR UPDATE',
    [hash],
  );
  return { hash, state: row.state };
}

// Call under the owner's row lock. A HEAD performed before a concurrent deletion
// never authorizes publication after that deletion has claimed the identity.
export async function lockCloudObjectForPublication(connection, userId, objectKey) {
  const row = await lockIdentity(connection, userId, objectKey);
  if (['deleting', 'retired'].includes(row.state)) {
    throw Object.assign(new Error('上传对象已失效，请重新上传'), { code: 'UPLOAD_OBJECT_RETIRED', status: 409 });
  }
}

// Caller owns the transaction and owner row lock. Commit before remote deletion.
// The existing cleanup worker retries deleting rows after a crash or OBS failure.
export async function beginCloudObjectDeletion(connection, userId, objectKey) {
  const row = await lockIdentity(connection, userId, objectKey);
  if (['deleting', 'retired'].includes(row.state)) return false;
  const [files] = await connection.query(
    `SELECT id FROM files WHERE create_by=? AND
     (obs_key=? OR ((obs_key IS NULL OR obs_key='') AND file_name=?)) FOR UPDATE`,
    [userId, objectKey, objectKey.slice(`files/${userId}/`.length)],
  );
  const [assets] = await connection.query(
    "SELECT id FROM image_assets WHERE storage_kind='obs' AND source_locator=? FOR UPDATE",
    [objectKey],
  );
  if (files.length || assets.length) return false;
  const token = randomUUID();
  await connection.query(
    `UPDATE cloud_legacy_object_lifecycle SET state='deleting',lease_token=?,attempts=attempts+1,
     available_at=DATE_ADD(NOW(),INTERVAL 5 MINUTE) WHERE object_hash=?`,
    [token, row.hash],
  );
  return { hash: row.hash, token };
}

export async function finishCloudObjectDeletion(database, claim) {
  await database.query(
    "UPDATE cloud_legacy_object_lifecycle SET state='retired',available_at=NULL WHERE object_hash=? AND state='deleting' AND lease_token=?",
    [claim.hash, claim.token],
  );
}
