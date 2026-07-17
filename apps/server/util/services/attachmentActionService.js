import crypto from 'node:crypto';
import path from 'node:path';
import { promises as fsP } from 'node:fs';
import { imageSize } from 'image-size';
import pool from '../../db/index.js';
import { getUserSpaceMb } from '../growth.js';
import { normalizeDocumentFileName, validateDocumentDescriptor } from '../aiDocument/parser.js';
import {
  bucketBaseUrl,
  copyObjectInObs,
  deleteObjectFromObs,
  getObjectBufferFromObs,
  getObjectMetadataFromObs,
} from '../obsClient.js';
import { NOTE_IMAGE_DIR } from '../noteImages.js';
import { actionIdempotencyImageFileName } from '../agent/actionIdempotency.js';
import { createNote } from './noteService.js';
import { triggerResourceCreateEffects } from './resourceCreateEffects.js';

const NOTE_IMAGE_BASE_URL = 'https://boluo66.top/uploads';
const IMAGE_TYPE_BY_EXTENSION = Object.freeze({ '.png': 'png', '.jpg': 'jpg', '.jpeg': 'jpg', '.webp': 'webp' });
const FOLDER_STRATEGIES = new Set(['existing', 'root', 'create_if_missing']);

function serviceError(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  return error;
}

function assertAvailableSource(source) {
  if (!source) throw serviceError('ATTACHMENT_NOT_FOUND', '附件不存在或不属于当前账号');
  if (source.expires_at && new Date(source.expires_at).getTime() <= Date.now()) {
    throw serviceError('ATTACHMENT_EXPIRED', '附件已过期，请重新上传');
  }
  if (source.status === 'awaiting_upload') {
    throw serviceError('ATTACHMENT_NOT_UPLOADED', '附件尚未完成上传');
  }
  return source;
}

async function selectOwnedSource(db, userId, attachmentId, lock = false) {
  const [rows] = await db.query(
    `SELECT * FROM ai_document_sources WHERE id = ? AND user_id = ? LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [attachmentId, userId],
  );
  return assertAvailableSource(rows[0]);
}

async function existingCloudFile(db, source, userId) {
  if (source.file_id == null) return null;
  const [rows] = await db.query(
    `SELECT f.id, f.file_name, f.file_type, f.file_size, f.obs_key,
            f.folder_id, folders.name AS folder_name
       FROM files f
       LEFT JOIN folders ON folders.id = f.folder_id
                        AND folders.create_by = f.create_by
                        AND folders.del_flag = 0
      WHERE f.id = ? AND f.create_by = ? AND f.del_flag = 0 LIMIT 1`,
    [source.file_id, userId],
  );
  return rows[0] || null;
}

function normalizeCloudFileName(requestedName, originalName) {
  const original = normalizeDocumentFileName(originalName);
  const originalExtension = path.extname(original).toLowerCase();
  if (requestedName && /[\\/]/.test(String(requestedName))) {
    throw serviceError('FILE_NAME_INVALID', '文件名不能包含路径分隔符 / 或 \\');
  }
  const requested = requestedName ? normalizeDocumentFileName(requestedName) : original;
  if (/[<>]/.test(requested)) throw serviceError('FILE_NAME_INVALID', '文件名不能包含 < 或 >');
  const requestedExtension = path.extname(requested).toLowerCase();
  if (requestedExtension && requestedExtension !== originalExtension) {
    throw serviceError('FILE_EXTENSION_MISMATCH', '保存到云空间时不能修改文件扩展名');
  }
  if (requestedExtension) return requested;
  const maxBaseLength = Math.max(1, 255 - originalExtension.length);
  return `${requested.slice(0, maxBaseLength)}${originalExtension}`;
}

function buildUniqueAiCloudObjectKey(userId, extension) {
  return `files/${userId}/ai/${crypto.randomUUID()}${extension}`;
}

async function uniqueCloudFileName(connection, userId, requestedName) {
  const extension = path.extname(requestedName);
  const base = requestedName.slice(0, requestedName.length - extension.length) || '文件';
  for (let index = 0; index < 1000; index += 1) {
    const suffix = index === 0 ? '' : ` (${index})`;
    const candidate = `${base.slice(0, Math.max(1, 255 - extension.length - suffix.length))}${suffix}${extension}`;
    const [rows] = await connection.query('SELECT id FROM files WHERE create_by = ? AND file_name = ? LIMIT 1', [
      userId,
      candidate,
    ]);
    if (!rows.length) return candidate;
  }
  throw serviceError('FILE_NAME_CONFLICT', '同名文件过多，请换一个名称后重试');
}

function normalizeFolderId(value) {
  if (value == null || String(value).trim() === '') return null;
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw serviceError('FOLDER_ID_INVALID', '文件夹 ID 无效');
  }
  return id;
}

function normalizeFolderName(value) {
  const name = String(value || '')
    .normalize('NFC')
    .trim();
  if (name.length > 255) throw serviceError('FOLDER_NAME_INVALID', '文件夹名称不能超过 255 个字符');
  return name;
}

function normalizeFolderStrategy(value) {
  const strategy = String(value || 'existing').trim();
  if (!FOLDER_STRATEGIES.has(strategy)) {
    throw serviceError('FOLDER_STRATEGY_INVALID', '文件夹处理方式无效');
  }
  return strategy;
}

async function resolveOwnedFolder(db, { userId, folderId, folderName, lock = false }) {
  const normalizedId = normalizeFolderId(folderId);
  // 由文件夹选择器传来的 ID 是权威参数；同时存在名称时不使用名称反向覆盖 ID。
  if (normalizedId != null) {
    const [rows] = await db.query(
      `SELECT id, name FROM folders
        WHERE id = ? AND create_by = ? AND del_flag = 0
        LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
      [normalizedId, userId],
    );
    if (!rows.length) throw serviceError('FOLDER_NOT_FOUND', '目标文件夹不存在或不属于当前账号');
    return { folderId: Number(rows[0].id), folderName: rows[0].name || '' };
  }

  const normalizedName = normalizeFolderName(folderName);
  if (!normalizedName) return { folderId: null, folderName: null };
  const [rows] = await db.query(
    `SELECT id, name FROM folders
      WHERE create_by = ? AND name = ? AND del_flag = 0
      ORDER BY id ASC LIMIT 2${lock ? ' FOR UPDATE' : ''}`,
    [userId, normalizedName],
  );
  if (!rows.length) throw serviceError('FOLDER_NOT_FOUND', `没有找到名为“${normalizedName}”的文件夹`);
  if (rows.length > 1) {
    throw serviceError('FOLDER_AMBIGUOUS', `存在多个名为“${normalizedName}”的文件夹，请从文件夹列表中选择`);
  }
  return { folderId: Number(rows[0].id), folderName: rows[0].name || normalizedName };
}

async function prepareTargetFolder({ userId, folderId, folderName, folderStrategy }) {
  const strategy = normalizeFolderStrategy(folderStrategy);
  if (strategy === 'root') return { folderId: null, folderName: null, folderStrategy: 'root' };

  if (strategy === 'create_if_missing') {
    const normalizedName = normalizeFolderName(folderName);
    if (!normalizedName) throw serviceError('FOLDER_NAME_REQUIRED', '缺少要创建的文件夹名称');
    try {
      const existing = await resolveOwnedFolder(pool, { userId, folderId, folderName: normalizedName });
      return { ...existing, folderStrategy: 'existing' };
    } catch (error) {
      if (error?.code !== 'FOLDER_NOT_FOUND') throw error;
      return { folderId: null, folderName: normalizedName, folderStrategy: 'create_if_missing' };
    }
  }

  const existing = await resolveOwnedFolder(pool, { userId, folderId, folderName });
  return {
    ...existing,
    folderStrategy: existing.folderId == null ? 'root' : 'existing',
  };
}

async function resolveWriteTargetFolder(connection, { userId, folderId, folderName, folderStrategy }) {
  const strategy = normalizeFolderStrategy(folderStrategy);
  if (strategy === 'root') return { folderId: null, folderName: null, folderCreated: false };
  if (strategy !== 'create_if_missing') {
    const existing = await resolveOwnedFolder(connection, { userId, folderId, folderName, lock: true });
    return { ...existing, folderCreated: false };
  }

  const normalizedName = normalizeFolderName(folderName);
  if (!normalizedName) throw serviceError('FOLDER_NAME_REQUIRED', '缺少要创建的文件夹名称');
  const [rows] = await connection.query(
    `SELECT id, name FROM folders
      WHERE create_by = ? AND name = ? AND del_flag = 0
      ORDER BY id ASC LIMIT 1 FOR UPDATE`,
    [userId, normalizedName],
  );
  if (rows.length) {
    return { folderId: Number(rows[0].id), folderName: rows[0].name || normalizedName, folderCreated: false };
  }
  const [insertResult] = await connection.query('INSERT INTO folders SET ?', [
    { name: normalizedName, create_by: userId, del_flag: 0 },
  ]);
  return { folderId: Number(insertResult.insertId), folderName: normalizedName, folderCreated: true };
}

function formatCloudFile(file, alreadySaved) {
  return {
    id: String(file.id),
    fileName: file.file_name,
    fileType: file.file_type,
    fileSize: Number(file.file_size || 0),
    folderId: file.folder_id == null ? null : String(file.folder_id),
    folderName: file.folder_name || null,
    folderCreated: Boolean(file.folder_created),
    alreadySaved,
  };
}

async function findCommittedCloudFileByObjectKey({ userId, objectKey }) {
  const [rows] = await pool.query(
    `SELECT f.id, f.file_name, f.file_type, f.file_size, f.obs_key,
            f.folder_id, folders.name AS folder_name
       FROM files f
       LEFT JOIN folders ON folders.id = f.folder_id
                        AND folders.create_by = f.create_by
                        AND folders.del_flag = 0
      WHERE f.create_by = ? AND f.obs_key = ? AND f.del_flag = 0
      LIMIT 1`,
    [userId, objectKey],
  );
  return rows[0] || null;
}

function markCommitOutcomeUnknown(error) {
  if (error && (typeof error === 'object' || typeof error === 'function')) {
    try {
      error.commitOutcomeUnknown = true;
      if (error.commitOutcomeUnknown) return error;
    } catch {
      // 冻结对象或只读异常会在下方包装，避免标记动作本身覆盖原始故障。
    }
  }
  const wrapped = new Error(error instanceof Error ? error.message : '提交结果暂时无法核验');
  wrapped.cause = error;
  wrapped.commitOutcomeUnknown = true;
  return wrapped;
}

export async function prepareSaveAttachmentToCloud({
  userId,
  attachmentId,
  fileName = '',
  folderId = null,
  folderName = '',
  folderStrategy = 'existing',
} = {}) {
  if (!userId) throw serviceError('USER_REQUIRED', '缺少用户');
  if (!attachmentId) throw serviceError('ATTACHMENT_ID_REQUIRED', '缺少附件 ID');

  const source = await selectOwnedSource(pool, userId, attachmentId);
  const existing = await existingCloudFile(pool, source, userId);
  if (existing) {
    return {
      attachmentId: String(attachmentId),
      cloudFileId: String(existing.id),
      fileName: existing.file_name,
      folderId: existing.folder_id == null ? null : String(existing.folder_id),
      folderName: existing.folder_name || null,
      folderStrategy: existing.folder_id == null ? 'root' : 'existing',
      sourceFileName: source.file_name,
      fileType: existing.file_type,
      fileSize: Number(existing.file_size || 0),
      alreadySaved: true,
    };
  }

  const descriptor = validateDocumentDescriptor({
    fileName: source.file_name,
    fileType: source.file_type,
    fileSize: source.file_size,
  });
  const targetFolder = await prepareTargetFolder({ userId, folderId, folderName, folderStrategy });
  return {
    attachmentId: String(attachmentId),
    fileName: normalizeCloudFileName(fileName, descriptor.fileName),
    folderId: targetFolder.folderId == null ? null : String(targetFolder.folderId),
    folderName: targetFolder.folderName,
    folderStrategy: targetFolder.folderStrategy,
    sourceFileName: descriptor.fileName,
    fileType: descriptor.fileType,
    fileSize: descriptor.fileSize,
    alreadySaved: false,
  };
}

export async function saveAttachmentToCloud({
  userId,
  userRole,
  attachmentId,
  fileName = '',
  folderId = null,
  folderName = '',
  folderStrategy = 'existing',
  request,
  suppressUserRewards = false,
} = {}) {
  const prepared = await prepareSaveAttachmentToCloud({
    userId,
    attachmentId,
    fileName,
    folderId,
    folderName,
    folderStrategy,
  });
  if (prepared.alreadySaved) {
    return {
      id: prepared.cloudFileId,
      fileName: prepared.fileName,
      fileType: prepared.fileType,
      fileSize: prepared.fileSize,
      folderId: prepared.folderId,
      folderName: prepared.folderName,
      alreadySaved: true,
    };
  }
  const quotaMb = await getUserSpaceMb(userId, userRole);
  const connection = await pool.getConnection();
  let targetKey = '';
  let copied = false;
  let createdFile = null;
  let existingFile = null;
  let transactionStarted = false;
  let commitAttempted = false;
  let transactionError = null;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    // 同一账号的 AI 保存操作串行选名和核算容量，避免并发产生同名对象或越过配额。
    await connection.query('SELECT id FROM user WHERE id = ? LIMIT 1 FOR UPDATE', [userId]);
    const source = await selectOwnedSource(connection, userId, attachmentId, true);
    const existing = await existingCloudFile(connection, source, userId);
    if (existing) {
      existingFile = existing;
      commitAttempted = true;
      await connection.commit();
    } else {
      const descriptor = validateDocumentDescriptor({
        fileName: source.file_name,
        fileType: source.file_type,
        fileSize: source.file_size,
      });
      const targetFolder = await resolveWriteTargetFolder(connection, {
        userId,
        folderId: prepared.folderId,
        folderName: prepared.folderName,
        folderStrategy: prepared.folderStrategy,
      });
      const [usageRows] = await connection.query(
        'SELECT COALESCE(SUM(file_size), 0) AS used FROM files WHERE create_by = ? AND del_flag = 0',
        [userId],
      );
      const usedBytes = Number(usageRows[0]?.used || 0);
      if (usedBytes + descriptor.fileSize > Number(quotaMb) * 1024 * 1024) {
        throw serviceError('STORAGE_QUOTA_EXCEEDED', `云空间已达上限（${quotaMb}MB），请先清理文件`);
      }
      const requestedName = normalizeCloudFileName(prepared.fileName, descriptor.fileName);
      const finalName = await uniqueCloudFileName(connection, userId, requestedName);
      // 展示文件名与对象键解耦，避免和普通直传同名文件并发覆写同一个 OBS 对象。
      targetKey = buildUniqueAiCloudObjectKey(userId, descriptor.extension);
      // 复制请求即使因回包丢失而抛错，目标对象也可能已生成；先标记，再由失败补偿做幂等删除。
      copied = true;
      await copyObjectInObs(source.object_key, targetKey);
      const [insertResult] = await connection.query('INSERT INTO files SET ?', [
        {
          create_by: userId,
          file_name: finalName,
          file_type: descriptor.fileType,
          file_size: descriptor.fileSize,
          directory: `${bucketBaseUrl}/files/${userId}/`,
          folder_id: targetFolder.folderId,
          del_flag: 0,
          obs_key: targetKey,
          share_token: crypto.randomBytes(16).toString('hex'),
        },
      ]);
      const fileId = insertResult.insertId;
      await connection.query('UPDATE ai_document_sources SET file_id = ? WHERE id = ? AND user_id = ?', [
        fileId,
        attachmentId,
        userId,
      ]);
      createdFile = {
        id: fileId,
        file_name: finalName,
        file_type: descriptor.fileType,
        file_size: descriptor.fileSize,
        folder_id: targetFolder.folderId,
        folder_name: targetFolder.folderName,
        folder_created: targetFolder.folderCreated,
      };
      commitAttempted = true;
      await connection.commit();
    }
  } catch (error) {
    transactionError = error;
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch {
        // 保留最初的业务/提交异常；最终提交状态由事务外查询判定。
      }
    }
  } finally {
    connection.release();
  }

  if (transactionError) {
    if (existingFile) return formatCloudFile(existingFile, true);
    if (copied && targetKey && commitAttempted) {
      try {
        const committedFile = await findCommittedCloudFileByObjectKey({ userId, objectKey: targetKey });
        if (committedFile) {
          createdFile = committedFile;
          transactionError = null;
        }
      } catch {
        // 核验服务不可用时不能删除对象：数据库可能已经提交，否则会制造已落库文件的永久损坏。
        throw markCommitOutcomeUnknown(transactionError);
      }
    }
    if (transactionError) {
      if (copied && targetKey) await deleteObjectFromObs(targetKey).catch(() => {});
      throw transactionError;
    }
  }

  if (existingFile) return formatCloudFile(existingFile, true);

  triggerResourceCreateEffects({
    request,
    userId,
    userRole,
    resourceType: 'file',
    resourceId: createdFile.id,
    suppressUserRewards,
  });
  return formatCloudFile(createdFile, false);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function defaultImageNoteTitle(fileName) {
  const base = path.basename(fileName, path.extname(fileName)).trim();
  return (base || '图片笔记').slice(0, 255);
}

function normalizeImageNoteFields({ title, description, fileName }) {
  const noteTitle = String(title || '').trim() || defaultImageNoteTitle(fileName);
  if (noteTitle.length > 255) throw serviceError('TITLE_TOO_LONG', '笔记标题不能超过 255 个字符');
  const noteDescription = String(description || '').trim();
  if (noteDescription.length > 5000) throw serviceError('CONTENT_TOO_LONG', '图片说明不能超过 5000 个字符');
  return { title: noteTitle, description: noteDescription };
}

export async function prepareCreateImageNoteFromAttachment({
  userId,
  attachmentId,
  title = '',
  description = '',
} = {}) {
  if (!userId) throw serviceError('USER_REQUIRED', '缺少用户');
  if (!attachmentId) throw serviceError('ATTACHMENT_ID_REQUIRED', '缺少附件 ID');
  const source = await selectOwnedSource(pool, userId, attachmentId);
  const descriptor = validateDocumentDescriptor({
    fileName: source.file_name,
    fileType: source.file_type,
    fileSize: source.file_size,
  });
  if (!descriptor.expectedType.startsWith('image/')) {
    throw serviceError('ATTACHMENT_NOT_IMAGE', '只有 PNG、JPG、JPEG 或 WebP 图片可以直接插入图片笔记');
  }
  const fields = normalizeImageNoteFields({ title, description, fileName: descriptor.fileName });
  return {
    attachmentId: String(attachmentId),
    ...fields,
    sourceFileName: descriptor.fileName,
    fileType: descriptor.fileType,
    fileSize: descriptor.fileSize,
  };
}

function validateImageBuffer(buffer, extension) {
  let dimensions;
  try {
    dimensions = imageSize(buffer);
  } catch {
    throw serviceError('FILE_CONTENT_INVALID', '图片内容无法识别或已经损坏');
  }
  if (
    dimensions.type !== IMAGE_TYPE_BY_EXTENSION[extension] ||
    !Number(dimensions.width || 0) ||
    !Number(dimensions.height || 0)
  ) {
    throw serviceError('FILE_CONTENT_INVALID', '图片扩展名与实际内容不一致');
  }
}

export async function createImageNoteFromAttachment({
  userId,
  userRole,
  attachmentId,
  title = '',
  description = '',
  request,
  suppressUserRewards = false,
  imageDir = NOTE_IMAGE_DIR,
  idempotencyKey = null,
} = {}) {
  const prepared = await prepareCreateImageNoteFromAttachment({ userId, attachmentId, title, description });
  const source = await selectOwnedSource(pool, userId, attachmentId);
  const descriptor = validateDocumentDescriptor({
    fileName: source.file_name,
    fileType: source.file_type,
    fileSize: source.file_size,
  });
  if (!descriptor.expectedType.startsWith('image/')) {
    throw serviceError('ATTACHMENT_NOT_IMAGE', '只有 PNG、JPG、JPEG 或 WebP 图片可以直接插入图片笔记');
  }
  const metadata = await getObjectMetadataFromObs(source.object_key);
  if (metadata.contentLength !== descriptor.fileSize) {
    throw serviceError('FILE_SIZE_MISMATCH', '附件大小与上传记录不一致，请重新上传');
  }
  const buffer = await getObjectBufferFromObs(source.object_key);
  if (buffer.length !== descriptor.fileSize) {
    throw serviceError('FILE_SIZE_MISMATCH', '附件下载不完整，请稍后重试');
  }
  // 这里仅校验图片文件真实性，不执行 OCR，也不套用 OCR 像素上限。
  validateImageBuffer(buffer, descriptor.extension);

  const noteTitle = prepared.title;
  const noteDescription = prepared.description;
  const storedFileName =
    actionIdempotencyImageFileName(idempotencyKey, descriptor.extension) ||
    `note-ai-${Date.now()}-${crypto.randomUUID()}${descriptor.extension}`;
  const imagePath = path.join(imageDir, storedFileName);
  const imageUrl = `${NOTE_IMAGE_BASE_URL}/${storedFileName}`;
  const content = `${noteDescription ? `<p>${escapeHtml(noteDescription).replace(/\n/g, '<br>')}</p>` : ''}<p><img src="${imageUrl}" alt="${escapeHtml(descriptor.fileName)}"></p>`;

  let imageCreated = false;
  try {
    try {
      await fsP.writeFile(imagePath, buffer, { mode: 0o644, flag: 'wx' });
      imageCreated = true;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
    const note = await createNote({
      userId,
      userRole,
      note: { title: noteTitle, content, type: 'html' },
      trustedImageUrls: [imageUrl],
      request,
      suppressUserRewards,
      idempotencyKey,
    });
    return { ...note, imageUrl };
  } catch (error) {
    // createNote 会在 commit 回包异常时按笔记 UUID + 用户核验；核验本身不可用时保留图片，
    // 避免误删可能已经被已提交笔记引用的外部资源。
    if (imageCreated && !error?.commitOutcomeUnknown) await fsP.unlink(imagePath).catch(() => {});
    throw error;
  }
}
