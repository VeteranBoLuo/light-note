import crypto from 'node:crypto';
import path from 'node:path';
import pool from '../../db/index.js';
import { getUserSpaceMb } from '../growth.js';
import {
  bucketBaseUrl,
  createUploadSignedUrl,
  deleteObjectFromObs,
  getObjectMetadataFromObs,
} from '../obsClient.js';
import { BYTES_PER_MB, getAccountedStorageBytes, storageBytesToMb } from '../storageUsage.js';
import { enqueueResources } from '../resourceInbox.js';
import { triggerResourceCreateEffects } from './resourceCreateEffects.js';

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
  if (!fileName) throw serviceError('FILE_NAME_REQUIRED', '请输入文件名');
  if (fileName.length > 255) throw serviceError('FILE_NAME_TOO_LONG', '文件名不能超过 255 个字符');
  if (/[\\/<>\u0000-\u001f\u007f]/u.test(fileName)) {
    throw serviceError('FILE_NAME_INVALID', '文件名不能包含路径分隔符、控制字符、< 或 >');
  }
  if (fileName === '.' || fileName === '..') throw serviceError('FILE_NAME_INVALID', '文件名无效');
  return fileName;
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

function normalizeFolderId(value) {
  if (value == null || String(value).trim() === '') return null;
  const folderId = Number(value);
  if (!Number.isSafeInteger(folderId) || folderId <= 0) {
    throw serviceError('FOLDER_ID_INVALID', '目标文件夹无效');
  }
  return folderId;
}

async function assertOwnedFolder(connection, userId, folderId) {
  const normalizedId = normalizeFolderId(folderId);
  if (normalizedId == null) return null;
  const [rows] = await connection.query(
    'SELECT id FROM folders WHERE id = ? AND create_by = ? AND del_flag = 0 LIMIT 1 FOR UPDATE',
    [normalizedId, userId],
  );
  if (!rows.length) throw serviceError('FOLDER_NOT_FOUND', '目标文件夹不存在或不属于当前账号');
  return normalizedId;
}

async function uniqueCloudFileName(connection, userId, requestedName) {
  const extension = path.extname(requestedName);
  const base = requestedName.slice(0, requestedName.length - extension.length) || '文件';
  for (let index = 0; index < 1000; index += 1) {
    const suffix = index === 0 ? '' : ` (${index})`;
    const candidate = `${base.slice(0, Math.max(1, 255 - extension.length - suffix.length))}${suffix}${extension}`;
    const [rows] = await connection.query(
      'SELECT id FROM files WHERE create_by = ? AND file_name = ? AND del_flag IN (0, 1) LIMIT 1',
      [userId, candidate],
    );
    if (!rows.length) return candidate;
  }
  throw serviceError('FILE_NAME_CONFLICT', '同名文件过多，请修改名称后重试');
}

async function findFileByObjectKey(db, userId, objectKey) {
  const [rows] = await db.query(
    `SELECT id, file_name, file_type, file_size, folder_id, obs_key
       FROM files
      WHERE create_by = ? AND obs_key = ? AND del_flag = 0
      LIMIT 1`,
    [userId, objectKey],
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
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    // 与确认共用账号行锁：确认超时但服务端仍在执行时，中止不能抢先删掉即将落库的对象。
    await connection.query('SELECT id FROM user WHERE id = ? LIMIT 1 FOR UPDATE', [userId]);
    existing = await findFileByObjectKey(connection, userId, ownedKey);
    await connection.commit();
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch {
        // 只读核验失败时保持对象，不做风险清理。
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
  await deleteObjectFromObs(ownedKey).catch(() => {});
  return { deleted: true, alreadyConfirmed: false };
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
  if (alreadyConfirmed && !addToInbox) return formatResult(alreadyConfirmed, true);

  const quotaMB = await getUserSpaceMb(userId, userRole);
  const connection = await pool.getConnection();
  let transactionStarted = false;
  let commitAttempted = false;
  let createdFile = null;
  let alreadyConfirmedInTransaction = false;
  let transactionError = null;
  let verifiedSize = 0;
  let inbox = null;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    await connection.query('SELECT id FROM user WHERE id = ? LIMIT 1 FOR UPDATE', [userId]);

    const confirmedWhileWaiting = await findFileByObjectKey(connection, userId, ownedKey);
    if (confirmedWhileWaiting) {
      createdFile = confirmedWhileWaiting;
      alreadyConfirmedInTransaction = true;
    } else {
      // 元数据核验放在与 abort 共用的账号锁内，避免“HEAD 已成功 → abort 删除 → DB 再落库”的竞态。
      const metadata = await getObjectMetadataFromObs(ownedKey);
      verifiedSize = normalizeFileSize(metadata?.contentLength);
      const targetFolderId = await assertOwnedFolder(connection, userId, folderId);
      const usedBytes = await getAccountedStorageBytes(connection, userId);
      if (usedBytes + verifiedSize > Number(quotaMB) * BYTES_PER_MB) {
        throw quotaError(quotaMB, usedBytes, verifiedSize);
      }
      const finalName = await uniqueCloudFileName(connection, userId, normalizedName);
      const [insertResult] = await connection.query('INSERT INTO files SET ?', [
        {
          create_by: userId,
          file_name: finalName,
          file_type: normalizedType,
          file_size: verifiedSize,
          directory: `${bucketBaseUrl}/files/${userId}/`,
          folder_id: targetFolderId,
          del_flag: 0,
          obs_key: ownedKey,
        },
      ]);
      createdFile = {
        id: insertResult.insertId,
        file_name: finalName,
        file_type: normalizedType,
        file_size: verifiedSize,
        folder_id: targetFolderId,
        obs_key: ownedKey,
      };
    }
    if (addToInbox) {
      inbox = await enqueueResources(connection, {
        userId,
        items: [{ resourceType: 'file', resourceId: String(createdFile.id) }],
        source: inboxSource,
      });
    }
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
    if (!alreadyConfirmed) await deleteObjectFromObs(ownedKey).catch(() => {});
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
