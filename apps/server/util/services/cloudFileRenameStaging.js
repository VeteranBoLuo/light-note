import { randomUUID } from 'node:crypto';
import pool from '../../db/index.js';
import { deleteObjectFromObs } from '../obsClient.js';
import { imagePreviewWorkerEnabled } from '../imagePreview/workerPolicy.js';

function assertStageKey(stage) {
  const prefix = `files/${stage.userId}/renamed/${stage.id}`;
  if (
    !stage.userId ||
    /[\\/]/u.test(String(stage.userId)) ||
    typeof stage.targetKey !== 'string' ||
    !stage.targetKey.startsWith(prefix) ||
    !/^(?:\.[^/\\]{0,16})?$/u.test(stage.targetKey.slice(prefix.length)) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(stage.id)
  )
    throw Object.assign(new Error('Invalid rename staging identity'), { code: 'FILE_RENAME_STAGE_INVALID' });
}

export async function reserveRenameStage(stage, database = pool) {
  assertStageKey(stage);
  // A crashed API leaves a recoverable identity before any remote side effect.
  await database.query(
    `INSERT INTO cloud_file_rename_staging
    (id,user_id,file_id,target_key,available_at) VALUES (?,?,?,?,DATE_ADD(NOW(),INTERVAL 1 HOUR))`,
    [stage.id, stage.userId, stage.fileId, stage.targetKey],
  );
}

export async function adoptRenameStage(connection, stage) {
  const [result] = await connection.query(
    `UPDATE cloud_file_rename_staging SET state='adopted',available_at=NOW()
    WHERE id=? AND user_id=? AND file_id=? AND target_key=? AND state='pending'`,
    [stage.id, stage.userId, stage.fileId, stage.targetKey],
  );
  if (result.affectedRows !== 1)
    throw Object.assign(new Error('文件重命名准备已失效，请重试'), {
      code: 'FILE_RENAME_STAGE_EXPIRED',
      status: 409,
    });
}

export async function releaseRenameStage(id, database = pool) {
  // A committed adoption is atomic with the file/asset updates. Never delete its
  // object, even when the API lost the commit acknowledgement.
  await database.query("DELETE FROM cloud_file_rename_staging WHERE id=? AND state='adopted'", [id]);
  await database.query("UPDATE cloud_file_rename_staging SET available_at=NOW() WHERE id=? AND state='pending'", [id]);
}

export async function cleanupRenameStage({
  database = pool,
  remove = deleteObjectFromObs,
  id,
  env = process.env,
} = {}) {
  if (!imagePreviewWorkerEnabled(env)) return false;
  const connection = await database.getConnection();
  let stage;
  const token = randomUUID();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT *, created_at <= DATE_SUB(NOW(),INTERVAL 1 DAY) AS expired
      FROM cloud_file_rename_staging WHERE available_at<=NOW() ${id ? 'AND id=?' : ''}
      ORDER BY available_at,id LIMIT 1 FOR UPDATE`,
      id ? [id] : [],
    );
    const row = rows[0];
    if (!row) {
      await connection.commit();
      return false;
    }
    if (row.state === 'adopted') {
      await connection.query('DELETE FROM cloud_file_rename_staging WHERE id=?', [row.id]);
      await connection.commit();
      return true;
    }
    stage = {
      id: row.id,
      userId: row.user_id,
      fileId: row.file_id,
      targetKey: row.target_key,
      expired: Boolean(row.expired),
    };
    assertStageKey(stage);
    // Publication must transition pending -> adopted in the same transaction as
    // references. Once deleting is committed, that transition can no longer win.
    await connection.query(
      `UPDATE cloud_file_rename_staging SET state='deleting',lease_token=?,attempts=attempts+1,
      available_at=DATE_ADD(NOW(),INTERVAL 5 MINUTE) WHERE id=?`,
      [token, row.id],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  // No SQL connection or reference lock is held during remote deletion. Repeated
  // deletion at the end of the grace day catches a late copy without deleting
  // every five minutes after a successful attempt.
  await remove(stage.targetKey);
  if (stage.expired) {
    await database.query("DELETE FROM cloud_file_rename_staging WHERE id=? AND state='deleting' AND lease_token=?", [
      stage.id,
      token,
    ]);
  } else {
    await database.query(
      "UPDATE cloud_file_rename_staging SET available_at=DATE_ADD(created_at,INTERVAL 1 DAY) WHERE id=? AND state='deleting' AND lease_token=?",
      [stage.id, token],
    );
  }
  return true;
}
