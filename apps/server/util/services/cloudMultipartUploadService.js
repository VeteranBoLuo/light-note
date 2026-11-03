import { randomUUID } from 'node:crypto';
import pool from '../../db/index.js';
import { CLOUD_UPLOAD_PART_BYTES, CLOUD_UPLOAD_SIGN_BATCH, cloudUploadMode } from '@lightnote/shared/cloud-upload';
import * as storage from '../cloudMultipartObs.js';
import { deleteObjectFromObs } from '../obsClient.js';
import { getUserSpaceMb } from '../growth.js';
import {
  BYTES_PER_MB,
  getAccountedStorageBytes,
  getActiveReplacementBytes,
  getProjectedStorageBytes,
} from '../storageUsage.js';
import { assertCloudFileDisplayName } from './cloudFileNameService.js';
import { assertOwnedCloudFolder } from './cloudFolderAccess.js';
import { lockActiveUploadOwner } from './cloudLegacyObjectLifecycle.js';
import {
  beginCloudObjectDeletion,
  finishCloudObjectDeletion,
  lockCloudObjectForPublication,
} from './cloudObjectPublication.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const schemas = new WeakMap();
const fail = (code, status = 409) => Object.assign(new Error(code), { code, status });
const signature = (row) => ({
  sessionId: row.id,
  objectKey: row.object_key,
  filename: row.file_name,
  fileType: row.file_type,
  fileSize: Number(row.file_size),
  partSize: CLOUD_UPLOAD_PART_BYTES,
  partCount: Math.ceil(Number(row.file_size) / CLOUD_UPLOAD_PART_BYTES),
  state: row.state,
});

async function schemaReady(database) {
  const cached = schemas.get(database);
  if (cached?.until > Date.now()) return cached.ready;
  let ready = false;
  try {
    await database.query(
      'SELECT id,request_id,user_id,upload_id,file_size,state,cancel_requested,final_etag,file_id,expires_at,lease_token,lease_until,available_at,attempts FROM cloud_multipart_uploads LIMIT 0',
    );
    ready = true;
  } catch (error) {
    if (!['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error.code)) throw error;
  }
  schemas.set(database, { ready, until: Date.now() + 30000 });
  return ready;
}

/** 只有 >5GiB 使用本协议。网络阶段不持有数据库事务或账号锁。 */
export function createCloudMultipartService({
  database = pool,
  obs = storage,
  quota = getUserSpaceMb,
  remove = deleteObjectFromObs,
} = {}) {
  async function transaction(userId, operation, cleanup = false) {
    const connection = await database.getConnection();
    try {
      await connection.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
      await connection.beginTransaction();
      if (cleanup) await connection.query('SELECT id FROM user WHERE id=? FOR UPDATE', [userId]);
      else await lockActiveUploadOwner(connection, userId);
      const result = await operation(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback().catch(() => {});
      throw error;
    } finally {
      connection.release();
    }
  }
  async function owned(db, userId, id, lock = false) {
    if (!uuid.test(String(id || ''))) throw fail('MULTIPART_SESSION_INVALID', 400);
    const [[row]] = await db.query(
      `SELECT *,expires_at>NOW() AS is_live,lease_until>NOW() AS lease_live,available_at>NOW() AS cleanup_waiting
       FROM cloud_multipart_uploads WHERE id=? AND user_id=?${lock ? ' FOR UPDATE' : ''}`,
      [id, userId],
    );
    if (!row) throw fail('MULTIPART_SESSION_NOT_FOUND', 404);
    return row;
  }
  function active(row, states) {
    if (row.cancel_requested || !states.includes(row.state)) throw fail('MULTIPART_SESSION_INACTIVE');
    if (!row.is_live) throw fail('MULTIPART_SESSION_EXPIRED', 410);
  }
  async function initialize({ userId, userRole, requestId, fileName, fileType, fileSize, folderId }) {
    if (!(await schemaReady(database))) throw fail('MULTIPART_SCHEMA_NOT_READY', 503);
    if (!uuid.test(String(requestId || '')) || cloudUploadMode(fileSize) !== 'multipart')
      throw fail('MULTIPART_FILE_INVALID', 400);
    const name = assertCloudFileDisplayName(
      String(fileName || '')
        .normalize('NFC')
        .trim(),
    );
    const type = String(fileType || 'application/octet-stream')
      .replace(/[\r\n]/gu, '')
      .slice(0, 255);
    const token = randomUUID();
    const row = await transaction(userId, async (connection) => {
      const [[previous]] = await connection.query(
        'SELECT *,expires_at>NOW() AS is_live,lease_until>NOW() AS lease_live FROM cloud_multipart_uploads WHERE user_id=? AND request_id=? FOR UPDATE',
        [userId, requestId],
      );
      if (previous) {
        if (
          previous.file_name !== name ||
          previous.file_type !== type ||
          Number(previous.file_size) !== fileSize ||
          String(previous.folder_id ?? '') !== String(folderId ?? '')
        )
          throw fail('MULTIPART_REQUEST_MISMATCH', 400);
        if (previous.state === 'confirmed') return previous;
        if (previous.state !== 'creating') {
          active(previous, ['uploading', 'ready', 'completing']);
          return previous;
        }
        if (previous.lease_live) throw fail('MULTIPART_BUSY', 429);
        active(previous, ['creating']);
        await connection.query(
          'UPDATE cloud_multipart_uploads SET lease_token=?,lease_until=DATE_ADD(NOW(),INTERVAL 2 MINUTE) WHERE id=?',
          [token, previous.id],
        );
        return { ...previous, lease_token: token };
      }
      const target = await assertOwnedCloudFolder(connection, userId, folderId);
      const [used, replaced, quotaMB] = await Promise.all([
        getAccountedStorageBytes(connection, userId),
        getActiveReplacementBytes(connection, userId, [name]),
        quota(userId, userRole),
      ]);
      if (
        getProjectedStorageBytes({ usedBytes: used, replacementBytes: replaced, incomingBytes: fileSize }) >
        Number(quotaMB) * BYTES_PER_MB
      )
        throw Object.assign(fail('STORAGE_QUOTA_EXCEEDED', 413), {
          shortfallMB: Math.max(0, (used - replaced + fileSize) / BYTES_PER_MB - quotaMB),
        });
      const [[count]] = await connection.query(
        "SELECT COUNT(*) AS n FROM cloud_multipart_uploads WHERE user_id=? AND state IN ('creating','uploading','completing','ready') AND expires_at>NOW()",
        [userId],
      );
      if (Number(count.n) >= 10) throw fail('MULTIPART_SESSION_LIMIT', 429);
      const id = randomUUID(),
        key = `files/${userId}/published/multipart/${id}`;
      await connection.query(
        `INSERT INTO cloud_multipart_uploads
        (id,request_id,user_id,object_key,file_name,file_type,file_size,folder_id,state,expires_at,lease_token,lease_until)
        VALUES (?,?,?,?,?,?,?,?,'creating',DATE_ADD(NOW(),INTERVAL 1 HOUR),?,DATE_ADD(NOW(),INTERVAL 2 MINUTE))`,
        [id, requestId, userId, key, name, type, fileSize, target, token],
      );
      await lockCloudObjectForPublication(connection, userId, key);
      return {
        id,
        object_key: key,
        file_name: name,
        file_type: type,
        file_size: fileSize,
        folder_id: target,
        state: 'creating',
        lease_token: token,
      };
    });
    if (row.state !== 'creating') return signature(row);
    try {
      // 初始化响应丢失时按本会话独占的 key 找回，绝不直接再初始化另一任务。
      const existing = await obs.findCloudMultipartUploads(row.object_key);
      if (existing.length > 1) throw fail('MULTIPART_INIT_AMBIGUOUS', 503);
      const uploaded = existing[0] || (await obs.initiateCloudMultipart(row.object_key, row.id, row.file_type));
      const [saved] = await database.query(
        `UPDATE cloud_multipart_uploads SET upload_id=?,state='uploading',lease_token=NULL,lease_until=NULL,
        expires_at=DATE_ADD(NOW(),INTERVAL 1 HOUR) WHERE id=? AND lease_token=? AND state='creating' AND cancel_requested=0`,
        [uploaded.UploadId, row.id, token],
      );
      if (!saved.affectedRows) {
        await obs.abortCloudMultipart(row.object_key, uploaded.UploadId);
        throw fail('MULTIPART_SESSION_INACTIVE');
      }
      return signature({ ...row, upload_id: uploaded.UploadId, state: 'uploading' });
    } catch (error) {
      await database
        .query('UPDATE cloud_multipart_uploads SET lease_until=NOW() WHERE id=? AND lease_token=?', [row.id, token])
        .catch(() => {});
      throw error;
    }
  }
  async function signParts({ userId, sessionId, partNumbers }) {
    if (
      !Array.isArray(partNumbers) ||
      !partNumbers.length ||
      partNumbers.length > CLOUD_UPLOAD_SIGN_BATCH ||
      new Set(partNumbers).size !== partNumbers.length
    )
      throw fail('MULTIPART_PART_INVALID', 400);
    const row = await transaction(userId, async (connection) => {
      const row = await owned(connection, userId, sessionId, true);
      active(row, ['uploading']);
      if (partNumbers.some((n) => !Number.isInteger(n) || n < 1 || n > signature(row).partCount))
        throw fail('MULTIPART_PART_INVALID', 400);
      await connection.query(
        'UPDATE cloud_multipart_uploads SET expires_at=DATE_ADD(NOW(),INTERVAL 1 HOUR) WHERE id=?',
        [row.id],
      );
      return row;
    });
    return partNumbers.map((n) => obs.signCloudMultipartPart(row.object_key, row.upload_id, n, row.file_type));
  }
  function validHead(row, head) {
    if (!head || head.sessionId !== row.id || head.size !== Number(row.file_size) || !head.etag)
      throw fail('MULTIPART_OBJECT_INVALID', 409);
    return head;
  }
  async function status({ userId, sessionId }) {
    const row = await owned(database, userId, sessionId);
    if (['confirmed', 'aborting', 'aborted'].includes(row.state))
      return { ...signature(row), fileId: row.file_id, parts: [] };
    if (!row.is_live) return { ...signature(row), state: 'expired', parts: [] };
    if (row.state === 'ready') return { ...signature(row), parts: [] };
    const head = row.state === 'completing' ? await obs.headCloudMultipart(row.object_key) : null;
    if (head) {
      validHead(row, head);
      return { ...signature(row), state: 'completed', parts: [] };
    }
    if (!row.upload_id) return { ...signature(row), parts: [] };
    const parts = await obs.listCloudMultipartParts(row.object_key, row.upload_id);
    return {
      ...signature(row),
      parts: parts.map((p) => ({ partNumber: Number(p.PartNumber), etag: p.ETag, size: Number(p.Size) })),
    };
  }
  async function complete({ userId, sessionId }) {
    const token = randomUUID();
    const row = await transaction(userId, async (connection) => {
      const row = await owned(connection, userId, sessionId, true);
      if (row.state === 'confirmed') return row;
      active(row, ['uploading', 'completing', 'ready']);
      if (row.state === 'ready') return row;
      if (row.state === 'completing' && row.lease_live) throw fail('MULTIPART_BUSY', 429);
      await connection.query(
        "UPDATE cloud_multipart_uploads SET state='completing',lease_token=?,lease_until=DATE_ADD(NOW(),INTERVAL 2 MINUTE),expires_at=DATE_ADD(NOW(),INTERVAL 1 HOUR) WHERE id=?",
        [token, row.id],
      );
      return row;
    });
    if (['ready', 'confirmed'].includes(row.state)) return signature(row);
    try {
      let head = await obs.headCloudMultipart(row.object_key);
      if (!head) {
        const parts = (await obs.listCloudMultipartParts(row.object_key, row.upload_id)).sort(
          (a, b) => Number(a.PartNumber) - Number(b.PartNumber),
        );
        if (
          parts.length !== signature(row).partCount ||
          parts.some(
            (p, i) =>
              Number(p.PartNumber) !== i + 1 ||
              !p.ETag ||
              Number(p.Size) !== Math.min(CLOUD_UPLOAD_PART_BYTES, Number(row.file_size) - i * CLOUD_UPLOAD_PART_BYTES),
          )
        )
          throw fail('MULTIPART_PARTS_INCOMPLETE', 409);
        // 200 + Error XML 或响应丢失都不能直接算成功，最终以绑定本会话的 HEAD 为准。
        try {
          await obs.completeCloudMultipart(row.object_key, row.upload_id, parts);
        } catch (error) {
          head = await obs.headCloudMultipart(row.object_key);
          if (!head) throw error;
        }
        head ||= await obs.headCloudMultipart(row.object_key);
      }
      validHead(row, head);
      await transaction(userId, async (connection) => {
        const current = await owned(connection, userId, sessionId, true);
        if (current.cancel_requested || current.lease_token !== token) throw fail('MULTIPART_SESSION_INACTIVE');
        await connection.query(
          "UPDATE cloud_multipart_uploads SET state='ready',final_etag=?,lease_token=NULL,lease_until=NULL,expires_at=DATE_ADD(NOW(),INTERVAL 1 HOUR) WHERE id=?",
          [head.etag, row.id],
        );
      });
      return signature({ ...row, state: 'ready' });
    } catch (error) {
      if (error.code === 'MULTIPART_PARTS_INCOMPLETE')
        await database.query(
          "UPDATE cloud_multipart_uploads SET state='uploading' WHERE id=? AND lease_token=? AND cancel_requested=0",
          [row.id, token],
        );
      await database
        .query('UPDATE cloud_multipart_uploads SET lease_until=NOW() WHERE id=? AND lease_token=?', [row.id, token])
        .catch(() => {});
      throw error;
    }
  }
  async function reserveConfirmation({ userId, sessionId, folderId }) {
    const row = await owned(database, userId, sessionId);
    let confirmedFile;
    if (row.state === 'confirmed') {
      const [[saved]] = await database.query('SELECT id,file_name,del_flag FROM files WHERE id=? AND create_by=?', [
        row.file_id,
        userId,
      ]);
      if (!saved) throw fail('UPLOAD_OBJECT_RETIRED');
      confirmedFile = saved;
    }
    if (row.state !== 'confirmed') {
      active(row, ['ready']);
      if (String(row.folder_id ?? '') !== String(folderId ?? '')) throw fail('MULTIPART_TARGET_MISMATCH', 400);
    }
    return {
      fileName: row.file_name,
      fileType: row.file_type,
      objectKey: row.object_key,
      publicationKey: row.object_key,
      multipartSessionId: row.id,
      fileSize: Number(row.file_size),
      finalEtag: row.final_etag,
      confirmedFile,
    };
  }
  async function verifyPublication(userId, file) {
    const head = await obs.headCloudMultipart(file.objectKey);
    validHead({ id: file.multipartSessionId, file_size: file.fileSize }, head);
    if (head.etag !== file.finalEtag) throw fail('MULTIPART_OBJECT_INVALID');
    return file;
  }
  async function lockForPublication(connection, userId, id) {
    const row = await owned(connection, userId, id, true);
    if (row.state !== 'confirmed') active(row, ['ready']);
  }
  async function markConfirmed(connection, userId, id, fileId) {
    await connection.query(
      "UPDATE cloud_multipart_uploads SET state='confirmed',file_id=?,expires_at=NULL,available_at=NULL,lease_token=NULL,lease_until=NULL WHERE id=? AND user_id=?",
      [fileId, id, userId],
    );
  }
  async function abort({ userId, sessionId }) {
    const row = await transaction(userId, async (connection) => {
      const row = await owned(connection, userId, sessionId, true);
      if (row.state === 'confirmed' || row.state === 'aborted') return row;
      // 与发布使用同一账号→会话锁序。先提交取消事实，晚到的合并结果不能入库。
      await connection.query(
        "UPDATE cloud_multipart_uploads SET state='aborting',cancel_requested=1,available_at=NOW(),expires_at=NULL WHERE id=?",
        [row.id],
      );
      return { ...row, state: 'aborting' };
    });
    if (row.state === 'confirmed') return { alreadyConfirmed: true, fileId: row.file_id };
    await cleanup(sessionId);
    return { cancelled: true };
  }
  async function cleanup(id) {
    if (!(await schemaReady(database))) return false;
    // 两个到期索引分别取候选，避免 OR + COALESCE 扫描全部已确认会话。
    let [[candidate]] = await database.query(
      `SELECT * FROM cloud_multipart_uploads WHERE ${id ? 'id=? AND ' : ''}
       expires_at<=NOW() AND state NOT IN ('confirmed','aborted') AND (lease_until IS NULL OR lease_until<=NOW())
       ORDER BY expires_at,id LIMIT 1`,
      id ? [id] : [],
    );
    if (!candidate)
      [[candidate]] = await database.query(
        `SELECT * FROM cloud_multipart_uploads WHERE ${id ? 'id=? AND ' : ''}
       available_at<=NOW() AND state IN ('aborting','aborted') AND (lease_until IS NULL OR lease_until<=NOW())
       ORDER BY available_at,id LIMIT 1`,
        id ? [id] : [],
      );
    if (!candidate) return false;
    const token = randomUUID();
    const row = await transaction(
      candidate.user_id,
      async (connection) => {
        const row = await owned(connection, candidate.user_id, candidate.id, true);
        if (row.state === 'confirmed' || (row.state === 'aborted' && (!row.available_at || row.cleanup_waiting)))
          return null;
        // 等在途初始化/合并结束后再清理，避免删除后出现迟到对象。
        if (row.lease_live) return null;
        if (!['aborting', 'aborted'].includes(row.state) && row.is_live) return null;
        await connection.query(
          "UPDATE cloud_multipart_uploads SET state='aborting',cancel_requested=1,lease_token=?,lease_until=DATE_ADD(NOW(),INTERVAL 2 MINUTE),available_at=DATE_ADD(NOW(),INTERVAL 5 MINUTE),expires_at=NULL,attempts=attempts+1 WHERE id=?",
          [token, row.id],
        );
        return row;
      },
      true,
    );
    if (!row) return false;
    try {
      // 初始化响应或 SDK 重试可能留下未记录的上传 ID；按会话独占 key 回收全部任务。
      const uploads = await obs.findCloudMultipartUploads(row.object_key);
      if (row.upload_id && !uploads.some((upload) => upload.UploadId === row.upload_id))
        uploads.push({ UploadId: row.upload_id });
      for (const upload of uploads) await obs.abortCloudMultipart(row.object_key, upload.UploadId);
      const claim = await transaction(
        row.user_id,
        async (connection) => {
          const claim = await beginCloudObjectDeletion(connection, row.user_id, row.object_key);
          if (claim) return claim;
          const [[ledger]] = await connection.query(
            'SELECT state FROM cloud_legacy_object_lifecycle WHERE object_key=? AND user_id=? FOR UPDATE',
            [row.object_key, row.user_id],
          );
          // deleting 的删除失败需继续完成；retired 的独占 key 再清理一次以覆盖迟到合并。
          return ledger && ['deleting', 'retired'].includes(ledger.state) ? { repeat: true } : null;
        },
        true,
      );
      if (claim) {
        await remove(row.object_key);
        if (!claim.repeat) await finishCloudObjectDeletion(database, claim);
      }
      // beginCloudObjectDeletion=false 包括已引用或已退休；前者不得删除。
      await database.query(
        `UPDATE cloud_multipart_uploads SET state='aborted',lease_token=NULL,lease_until=NULL,
        available_at=IF(?='aborted',NULL,DATE_ADD(NOW(),INTERVAL 1 DAY)) WHERE id=? AND lease_token=?`,
        [row.state, row.id, token],
      );
      // 注销后只保留回收所需的短期身份；第二次清理完成后删掉会话元数据。
      if (row.state === 'aborted')
        await database.query(
          `DELETE m FROM cloud_multipart_uploads m LEFT JOIN user u ON u.id=m.user_id
        WHERE m.id=? AND m.state='aborted' AND (u.id IS NULL OR (u.role='deleted' AND u.del_flag=1))`,
          [row.id],
        );
      return true;
    } catch (error) {
      await database
        .query('UPDATE cloud_multipart_uploads SET lease_until=NOW() WHERE id=? AND lease_token=?', [row.id, token])
        .catch(() => {});
      throw error;
    }
  }
  return {
    initialize,
    signParts,
    status,
    complete,
    abort,
    cleanup,
    reserveConfirmation,
    verifyPublication,
    lockForPublication,
    markConfirmed,
  };
}
export const cloudMultipartUploads = createCloudMultipartService();
