import { syncCloudImageById } from '../imagePreview/references.js';
import crypto from 'node:crypto';
import path from 'node:path';
import pool from '../../db/index.js';
import { getUserSpaceMb } from '../growth.js';
import { bucketBaseUrl, createUploadSignedUrl, deleteObjectFromObs, getObjectMetadataFromObs } from '../obsClient.js';
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
  for (let start = 0; start < 1000;) {
    // 常见的无冲突名称仍只检查一次；冲突后分批检查，避免每个后缀一次数据库往返。
    const size = start === 0 ? 1 : Math.min(32, 1000 - start);
    const candidates = Array.from({ length: size }, (_, offset) => {
      const index = start + offset;
      const suffix = index === 0 ? '' : ` (${index})`;
      return `${base.slice(0, Math.max(1, 255 - extension.length - suffix.length))}${suffix}${extension}`;
    });
    if (start === 0) {
      const [rows] = await connection.query(
        'SELECT id FROM files WHERE create_by = ? AND file_name = ? AND del_flag IN (0, 1) LIMIT 1',
        [userId, candidates[0]],
      );
      if (!rows.length) return candidates[0];
    } else {
      // 由数据库判等，保留现有大小写、重音与回收站占名语义；不能用 JS Set 比较文件名。
      const [rows] = await connection.query(
        `SELECT ${candidates.map((_, index) => `MAX(file_name = ?) AS occupied${index}`).join(', ')}
         FROM files WHERE create_by = ? AND del_flag IN (0, 1)
         AND file_name IN (${candidates.map(() => '?').join(', ')})`,
        [...candidates, userId, ...candidates],
      );
      const free = candidates.findIndex((_, index) => !Number(rows[0]?.[`occupied${index}`]));
      if (free !== -1) return candidates[free];
    }
    start += size;
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

// Fail fast instead of waiting while holding an owner row lock. This also covers
// maintenance callers which insert verified files inside an existing transaction.
async function withUploadObjectLock(connection, objectKey, operation) {
  const name = `ln-upload:${crypto.createHash('sha256').update(objectKey).digest('hex').slice(0, 48)}`;
  const [rows] = await connection.query('SELECT GET_LOCK(?, 0) AS acquired', [name]);
  if (Number(rows[0]?.acquired) !== 1) throw serviceError('UPLOAD_BUSY', '文件正在处理，请稍后重试');
  try {
    return await operation();
  } finally {
    try {
      const [released] = await connection.query('SELECT RELEASE_LOCK(?) AS released', [name]);
      if (Number(released[0]?.released) !== 1) connection.destroy();
    } catch {
      // A session lock must never return to the pool on an uncertain release.
      connection.destroy();
    }
  }
}

export async function abortManagedCloudUpload({ userId, objectKey } = {}) {
  const ownedKey = assertOwnedManagedObjectKey(userId, objectKey);
  const connection = await pool.getConnection();
  let existing = null;
  let transactionStarted = false;
  try {
    await withUploadObjectLock(connection, ownedKey, async () => {
      await connection.beginTransaction();
      transactionStarted = true;
      await connection.query('SELECT id FROM user WHERE id = ? LIMIT 1 FOR UPDATE', [userId]);
      existing = await findFileByObjectKey(connection, userId, ownedKey);
      await connection.commit();
      transactionStarted = false;
      // Object lock protects against insertion, while slow storage no longer
      // blocks unrelated uploads or account writes behind the owner row lock.
      if (!existing) await deleteObjectFromObs(ownedKey);
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
  return { deleted: true, alreadyConfirmed: false };
}

/** Caller holds the owner row lock and owns commit/rollback. Metadata and quota stay authoritative. */
export async function insertVerifiedCloudFile(
  connection,
  { userId, objectKey, fileName, fileType, folderId, quotaMB },
) {
  const ownedKey = assertOwnedManagedObjectKey(userId, objectKey);
  return withUploadObjectLock(connection, ownedKey, async () => {
    const metadata = await getObjectMetadataFromObs(ownedKey);
    const verifiedSize = normalizeFileSize(metadata?.contentLength);
    const targetFolderId = await assertOwnedFolder(connection, userId, folderId);
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
        obs_key: ownedKey,
      },
    ]);
    const createdFile = {
      id: insertResult.insertId,
      file_name: finalName,
      file_type: normalizeFileType(fileType),
      file_size: verifiedSize,
      folder_id: targetFolderId,
      obs_key: ownedKey,
    };
    return createdFile;
  });
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
      createdFile = await insertVerifiedCloudFile(connection, {
        userId,
        objectKey: ownedKey,
        fileName: normalizedName,
        fileType: normalizedType,
        folderId,
        quotaMB,
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
