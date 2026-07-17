import crypto from 'node:crypto';
import path from 'node:path';
import { promises as fsP } from 'node:fs';
import { imageSize } from 'image-size';
import pool from '../../db/index.js';
import { getUserSpaceMb } from '../growth.js';
import { normalizeDocumentFileName, validateDocumentDescriptor } from '../aiDocument/parser.js';
import {
  bucketBaseUrl,
  buildObjectKey,
  copyObjectInObs,
  deleteObjectFromObs,
  getObjectBufferFromObs,
  getObjectMetadataFromObs,
} from '../obsClient.js';
import { NOTE_IMAGE_DIR } from '../noteImages.js';
import { createNote } from './noteService.js';
import { triggerResourceCreateEffects } from './resourceCreateEffects.js';

const NOTE_IMAGE_BASE_URL = 'https://boluo66.top/uploads';
const IMAGE_TYPE_BY_EXTENSION = Object.freeze({ '.png': 'png', '.jpg': 'jpg', '.jpeg': 'jpg', '.webp': 'webp' });

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
    `SELECT id, file_name, file_type, file_size, obs_key
       FROM files WHERE id = ? AND create_by = ? AND del_flag = 0 LIMIT 1`,
    [source.file_id, userId],
  );
  return rows[0] || null;
}

function normalizeCloudFileName(requestedName, originalName) {
  const original = normalizeDocumentFileName(originalName);
  const originalExtension = path.extname(original).toLowerCase();
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

function formatCloudFile(file, alreadySaved) {
  return {
    id: String(file.id),
    fileName: file.file_name,
    fileType: file.file_type,
    fileSize: Number(file.file_size || 0),
    alreadySaved,
  };
}

export async function saveAttachmentToCloud({
  userId,
  userRole,
  attachmentId,
  fileName = '',
  request,
  suppressUserRewards = false,
} = {}) {
  if (!userId) throw serviceError('USER_REQUIRED', '缺少用户');
  if (!attachmentId) throw serviceError('ATTACHMENT_ID_REQUIRED', '缺少附件 ID');

  const initialSource = await selectOwnedSource(pool, userId, attachmentId);
  const initialExisting = await existingCloudFile(pool, initialSource, userId);
  if (initialExisting) return formatCloudFile(initialExisting, true);
  const descriptor = validateDocumentDescriptor({
    fileName: initialSource.file_name,
    fileType: initialSource.file_type,
    fileSize: initialSource.file_size,
  });
  const quotaMb = await getUserSpaceMb(userId, userRole);
  const requestedName = normalizeCloudFileName(fileName, descriptor.fileName);
  const connection = await pool.getConnection();
  let targetKey = '';
  let copied = false;
  let createdFile = null;
  try {
    await connection.beginTransaction();
    // 同一账号的 AI 保存操作串行选名和核算容量，避免并发产生同名对象或越过配额。
    await connection.query('SELECT id FROM user WHERE id = ? LIMIT 1 FOR UPDATE', [userId]);
    const source = await selectOwnedSource(connection, userId, attachmentId, true);
    const existing = await existingCloudFile(connection, source, userId);
    if (existing) {
      await connection.commit();
      return formatCloudFile(existing, true);
    }
    const [usageRows] = await connection.query(
      'SELECT COALESCE(SUM(file_size), 0) AS used FROM files WHERE create_by = ? AND del_flag = 0',
      [userId],
    );
    const usedBytes = Number(usageRows[0]?.used || 0);
    if (usedBytes + descriptor.fileSize > Number(quotaMb) * 1024 * 1024) {
      throw serviceError('STORAGE_QUOTA_EXCEEDED', `云空间已达上限（${quotaMb}MB），请先清理文件`);
    }
    const finalName = await uniqueCloudFileName(connection, userId, requestedName);
    targetKey = buildObjectKey(userId, finalName);
    await copyObjectInObs(source.object_key, targetKey);
    copied = true;
    const [insertResult] = await connection.query('INSERT INTO files SET ?', [
      {
        create_by: userId,
        file_name: finalName,
        file_type: descriptor.fileType,
        file_size: descriptor.fileSize,
        directory: `${bucketBaseUrl}/files/${userId}/`,
        folder_id: null,
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
    await connection.commit();
    createdFile = {
      id: fileId,
      file_name: finalName,
      file_type: descriptor.fileType,
      file_size: descriptor.fileSize,
    };
  } catch (error) {
    await connection.rollback();
    if (copied && targetKey) await deleteObjectFromObs(targetKey).catch(() => {});
    throw error;
  } finally {
    connection.release();
  }

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

  const noteTitle = String(title || '').trim() || defaultImageNoteTitle(descriptor.fileName);
  if (noteTitle.length > 255) throw serviceError('TITLE_TOO_LONG', '笔记标题不能超过 255 个字符');
  const noteDescription = String(description || '').trim();
  if (noteDescription.length > 5000) throw serviceError('CONTENT_TOO_LONG', '图片说明不能超过 5000 个字符');
  const storedFileName = `note-ai-${Date.now()}-${crypto.randomUUID()}${descriptor.extension}`;
  const imagePath = path.join(imageDir, storedFileName);
  const imageUrl = `${NOTE_IMAGE_BASE_URL}/${storedFileName}`;
  const content = `${noteDescription ? `<p>${escapeHtml(noteDescription).replace(/\n/g, '<br>')}</p>` : ''}<p><img src="${imageUrl}" alt="${escapeHtml(descriptor.fileName)}"></p>`;

  await fsP.writeFile(imagePath, buffer, { mode: 0o644, flag: 'wx' });
  try {
    const note = await createNote({
      userId,
      userRole,
      note: { title: noteTitle, content, type: 'html' },
      trustedImageUrls: [imageUrl],
      request,
      suppressUserRewards,
    });
    return { ...note, imageUrl };
  } catch (error) {
    await fsP.unlink(imagePath).catch(() => {});
    throw error;
  }
}
