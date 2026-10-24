import {
  lockCloudObjectForPublication,
  beginCloudObjectDeletion,
  finishCloudObjectDeletion,
} from './cloudObjectPublication.js';
import { assertOwnedCloudFolder } from './cloudFolderAccess.js';
import { uniqueCloudFileName, assertCloudFileDisplayName } from './cloudFileNameService.js';
import { syncCloudImageById } from '../imagePreview/references.js';
import crypto from 'node:crypto';
import path from 'node:path';
import pool from '../../db/index.js';
import { getUserSpaceMb } from '../growth.js';
import { bucketBaseUrl, createUploadSignedUrl, deleteObjectFromObs, getObjectMetadataFromObs } from '../obsClient.js';
import { BYTES_PER_MB, getAccountedStorageBytes, storageBytesToMb } from '../storageUsage.js';
import { enqueueResources } from '../resourceInbox.js';
import { triggerResourceCreateEffects } from './resourceCreateEffects.js';
import { freezeCloudUpload, publishedUploadKey, trackCloudUpload } from './cloudUploadFinalization.js';
import { withUploadObjectLock } from './cloudUploadObjectLock.js';

const MANAGED_UPLOAD_PREFIX = 'uploads';
const MANAGED_OBJECT_KEY_PATTERN = /^files\/([^/]+)\/uploads\/([0-9a-f-]{36})(\.[a-z0-9]{1,16})?$/iu;

function serviceError(code, message, details = {}) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function normalizeFileName(value) {
  const fileName = String(value || '')
    .normalize('NFC')
    .trim();
  return assertCloudFileDisplayName(fileName);
}

function normalizeFileType(value) {
  return (
    String(value || 'application/octet-stream')
      .replace(/[\r\n]/gu, '')
      .trim()
      .slice(0, 255) || 'application/octet-stream'
  );
}

function normalizeFileSize(value) {
  const fileSize = Number(value);
  if (!Number.isSafeInteger(fileSize) || fileSize < 0) {
    throw serviceError('FILE_SIZE_INVALID', '文件大小无效');
  }
  return fileSize;
}

function safeObjectExtension(fileName) {
  const extension = path.extname(fileName).toLowerCase();
  return /^\.[a-z0-9]{1,16}$/u.test(extension) ? extension : '';
}

export function buildManagedCloudObjectKey(userId, fileName, uploadId = crypto.randomUUID()) {
  if (!userId) throw serviceError('USER_REQUIRED', '缺少用户信息');
  const normalizedName = normalizeFileName(fileName);
  return `files/${userId}/${MANAGED_UPLOAD_PREFIX}/${uploadId}${safeObjectExtension(normalizedName)}`;
}

export function assertOwnedManagedObjectKey(userId, objectKey) {
  const match = MANAGED_OBJECT_KEY_PATTERN.exec(String(objectKey || ''));
  if (
    !match ||
    match[1] !== String(userId) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(match[2])
  ) {
    throw serviceError('UPLOAD_KEY_INVALID', '上传凭据无效或已过期');
  }
  return String(objectKey);
}

async function findFileByObjectKey(db, userId, objectKey) {
  const [rows] = await db.query(
    `SELECT id, file_name, file_type, file_size, folder_id, obs_key, del_flag
       FROM files
      WHERE create_by = ? AND obs_key IN (?, ?)
      LIMIT 1`,
    [userId, objectKey, publishedUploadKey(userId, objectKey)],
  );
  return rows[0] || null;
}

async function hasPendingFileInbox(db, userId, fileId) {
  const [rows] = await db.query(
    `SELECT 1
       FROM resource_inbox
      WHERE user_id = ? AND resource_type = 'file' AND resource_id = ? AND status = 'pending'
      LIMIT 1`,
    [userId, String(fileId)],
  );
  return rows.length > 0;
}

function formatResult(file, alreadyConfirmed = false, { addToInbox = false, inbox = null } = {}) {
  return {
    fileId: String(file.id),
    filename: file.file_name,
    fileType: file.file_type,
    fileSize: Number(file.file_size || 0),
    folderId: file.folder_id == null ? null : String(file.folder_id),
    status: '已上传',
    alreadyConfirmed,
    addedToInbox: Boolean(addToInbox),
    ...(inbox ? { inbox } : {}),
  };
}

function quotaError(quotaMB, usedBytes, incomingBytes) {
  return serviceError(
    'STORAGE_QUOTA_EXCEEDED',
    `云空间容量不足（总容量 ${quotaMB}MB），回收站文件同样占用容量；请清理回收站、提升等级或兑换扩容包后重试`,
    {
      httpStatus: 413,
      details: {
        errorCode: 'STORAGE_QUOTA_EXCEEDED',
        quotaMB: Number(quotaMB),
        usedMB: storageBytesToMb(usedBytes),
        shortfallMB: storageBytesToMb(Math.max(0, usedBytes + incomingBytes - Number(quotaMB) * BYTES_PER_MB)),
      },
    },
  );
}

export async function prepareManagedCloudUpload({ userId, userRole, fileName, fileType, fileSize } = {}) {
  if (!userId) throw serviceError('USER_REQUIRED', '缺少用户信息');
  const normalizedName = normalizeFileName(fileName);
  const normalizedType = normalizeFileType(fileType);
  const normalizedSize = normalizeFileSize(fileSize);
  const [usedBytes, quotaMB] = await Promise.all([
    getAccountedStorageBytes(pool, userId),
    getUserSpaceMb(userId, userRole),
  ]);
  if (usedBytes + normalizedSize > Number(quotaMB) * BYTES_PER_MB) {
    throw quotaError(quotaMB, usedBytes, normalizedSize);
  }
  const objectKey = buildManagedCloudObjectKey(userId, normalizedName);
  await trackCloudUpload(pool, userId, objectKey);
  const signed = createUploadSignedUrl({ objectKey, contentType: normalizedType });
  return {
    filename: normalizedName,
    fileType: normalizedType,
    objectKey,
    uploadUrl: signed.url,
    headers: signed.headers,
    expiresIn: signed.expiresIn,
  };
}

export async function abortManagedCloudUpload({ userId, objectKey } = {}) {
  const ownedKey = assertOwnedManagedObjectKey(userId, objectKey);
  const connection = await pool.getConnection();
  let existing = null;
  let claim = null;
  let transactionStarted = false;
  try {
    await withUploadObjectLock(connection, ownedKey, async () => {
      await connection.beginTransaction();
      transactionStarted = true;
      await connection.query('SELECT id FROM user WHERE id = ? LIMIT 1 FOR UPDATE', [userId]);
      existing = await findFileByObjectKey(connection, userId, ownedKey);
      if (!existing) claim = await beginCloudObjectDeletion(connection, userId, ownedKey);
      await connection.commit();
      transactionStarted = false;
      // Object lock protects against insertion, while slow storage no longer
      // blocks unrelated uploads or account writes behind the owner row lock.
      if (claim) {
        await deleteObjectFromObs(ownedKey);
        await finishCloudObjectDeletion(connection, claim);
      }
    });
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch {
        // 保留核验或对象存储异常；回滚不能撤销已经完成的对象删除。
      }
    }
    throw error;
  } finally {
    connection.release();
  }
  if (existing) {
    return {
      deleted: false,
      alreadyConfirmed: true,
      ...formatResult(existing, true),
    };
  }
  return { deleted: Boolean(claim), alreadyConfirmed: false };
}

/** Caller holds the owner row lock and owns commit/rollback. Metadata and quota stay authoritative. */
export async function insertVerifiedCloudFile(
  connection,
  { userId, objectKey, fileName, fileType, folderId, quotaMB, frozenUpload = null },
) {
  const ownedKey = assertOwnedManagedObjectKey(userId, objectKey);
  const publish = async () => {
    await lockCloudObjectForPublication(connection, userId, ownedKey);
    const metadata = frozenUpload || (await getObjectMetadataFromObs(ownedKey));
    const publicationKey = frozenUpload?.objectKey || ownedKey;
    if (publicationKey !== ownedKey) await lockCloudObjectForPublication(connection, userId, publicationKey);
    const verifiedSize = normalizeFileSize(metadata?.contentLength);
    const targetFolderId = await assertOwnedCloudFolder(connection, userId, folderId);
    const usedBytes = await getAccountedStorageBytes(connection, userId);
    if (usedBytes + verifiedSize > Number(quotaMB) * BYTES_PER_MB) {
      throw quotaError(quotaMB, usedBytes, verifiedSize);
    }
    const finalName = await uniqueCloudFileName(connection, userId, normalizeFileName(fileName));
    const [insertResult] = await connection.query('INSERT INTO files SET ?', [
      {
        create_by: userId,
        file_name: finalName,
        file_type: normalizeFileType(fileType),
        file_size: verifiedSize,
        directory: `${bucketBaseUrl}/files/${userId}/`,
        folder_id: targetFolderId,
        del_flag: 0,
        obs_key: publicationKey,
      },
    ]);
    const createdFile = {
      id: insertResult.insertId,
      file_name: finalName,
      file_type: normalizeFileType(fileType),
      file_size: verifiedSize,
      folder_id: targetFolderId,
      obs_key: publicationKey,
    };
    return createdFile;
  };
  return frozenUpload ? publish() : withUploadObjectLock(connection, ownedKey, publish);
}

export async function confirmManagedCloudUpload({
  userId,
  userRole,
  objectKey,
  fileName,
  fileType,
  folderId,
  request,
  addToInbox = false,
  inboxSource = 'quick_capture',
} = {}) {
  const ownedKey = assertOwnedManagedObjectKey(userId, objectKey);
  const normalizedName = normalizeFileName(fileName);
  const normalizedType = normalizeFileType(fileType);
  const alreadyConfirmed = await findFileByObjectKey(pool, userId, ownedKey);
  if (Number(alreadyConfirmed?.del_flag) === 1)
    throw serviceError('UPLOAD_FILE_TRASHED', '文件已在回收站，请先恢复', { status: 409 });
  if (alreadyConfirmed && !addToInbox) return formatResult(alreadyConfirmed, true);

  await trackCloudUpload(pool, userId, ownedKey);
  const frozenUpload = alreadyConfirmed ? null : await freezeCloudUpload(pool, userId, ownedKey);

  const quotaMB = await getUserSpaceMb(userId, userRole);
  const connection = await pool.getConnection();
  let transactionStarted = false;
  let commitAttempted = false;
  let createdFile = null;
  let alreadyConfirmedInTransaction = false;
  let transactionError = null;
  let inbox = null;
  try {
    // 账号行锁已串行化选名与容量；RC 避免不同账号的空索引区间互相锁住插入。
    await connection.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    await connection.beginTransaction();
    transactionStarted = true;
    await connection.query('SELECT id FROM user WHERE id = ? LIMIT 1 FOR UPDATE', [userId]);

    const confirmedWhileWaiting = await findFileByObjectKey(connection, userId, ownedKey);
    if (Number(confirmedWhileWaiting?.del_flag) === 1)
      throw serviceError('UPLOAD_FILE_TRASHED', '文件已在回收站，请先恢复', { status: 409 });
    if (confirmedWhileWaiting) {
      createdFile = confirmedWhileWaiting;
      alreadyConfirmedInTransaction = true;
    } else {
      // 初查已有文件时没有冻结新副本；文件若已删除，不能回落到内部维护的原键写入路径。
      if (!frozenUpload)
        throw serviceError('UPLOAD_OBJECT_RETIRED', '原文件状态已变化，请重新上传', { status: 409 });
      createdFile = await insertVerifiedCloudFile(connection, {
        userId,
        objectKey: ownedKey,
        fileName: normalizedName,
        fileType: normalizedType,
        folderId,
        quotaMB,
        frozenUpload,
      });
    }
    if (addToInbox) {
      inbox = await enqueueResources(connection, {
        userId,
        items: [{ resourceType: 'file', resourceId: String(createdFile.id) }],
        source: inboxSource,
      });
    }
    await syncCloudImageById(connection, createdFile.id);
    commitAttempted = true;
    await connection.commit();
  } catch (error) {
    transactionError = error;
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch {
        // 保留原始业务/提交异常，最终提交状态在事务外按对象键核验。
      }
    }
  } finally {
    connection.release();
  }

  if (transactionError) {
    if (commitAttempted) {
      let committed = null;
      try {
        committed = await findFileByObjectKey(pool, userId, ownedKey);
        if (committed && !addToInbox) return formatResult(committed, true);
        if (committed && (await hasPendingFileInbox(pool, userId, committed.id))) {
          return formatResult(committed, true, { addToInbox: true });
        }
      } catch {
        transactionError.commitOutcomeUnknown = true;
        throw transactionError;
      }
      if (committed) {
        // 文件已存在但待整理关系尚未确认，保留对象并允许客户端以同一 objectKey 安全重试。
        transactionError.retrySafe = true;
        throw transactionError;
      }
    }
    // 回滚后另一请求可能已经确认同一对象；清理也必须重新加锁核验。
    if (!alreadyConfirmed) await abortManagedCloudUpload({ userId, objectKey: ownedKey }).catch(() => {});
    throw transactionError;
  }

  if (alreadyConfirmedInTransaction) return formatResult(createdFile, true, { addToInbox, inbox });

  await triggerResourceCreateEffects({
    request,
    userId,
    userRole,
    resourceType: 'file',
    resourceId: createdFile.id,
  });
  return formatResult(createdFile, false, { addToInbox, inbox });
}
