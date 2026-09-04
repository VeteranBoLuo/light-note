import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import {
  COMMUNITY_CHAT_ATTACHMENT_MAX_COUNT,
  COMMUNITY_CHAT_ATTACHMENT_MAX_PENDING_PER_USER,
  COMMUNITY_CHAT_ATTACHMENT_MAX_TOTAL_BYTES,
  COMMUNITY_CHAT_ATTACHMENT_PENDING_HOURS,
  COMMUNITY_CHAT_ATTACHMENT_RETENTION_DAYS,
  COMMUNITY_CHAT_BLOCKED_FILE_EXTENSIONS,
  COMMUNITY_CHAT_BLOCKED_FILE_MIME_TYPES,
} from '@lightnote/shared/community-chat-attachments';
import pool from '../../db/index.js';
import { COMMUNITY_CHAT_PRIMARY_ROOM_SLUG, getCommunityChatFeatureState } from '../communityChatFeature.js';
import { stableAgentErrorCode } from '../agent/logSafety.js';
import {
  createDownloadSignedUrl,
  createUploadSignedUrl,
  deleteObjectFromObs,
  getObjectMetadataFromObs,
} from '../obsClient.js';
import { deleteFilePreviewArtifactsForSource } from '../filePreview/service.js';
import {
  CommunityChatError,
  assertCommunityChatMessagingAccess,
  assertCommunityChatPostingEnabled,
  assertCommunityChatReadAccess,
} from './communityChatAccessService.js';
import { assertCommunityChatPostingAllowed } from './communityChatModerationService.js';

export {
  COMMUNITY_CHAT_ATTACHMENT_MAX_COUNT,
  COMMUNITY_CHAT_ATTACHMENT_MAX_PENDING_PER_USER,
  COMMUNITY_CHAT_ATTACHMENT_MAX_TOTAL_BYTES,
  COMMUNITY_CHAT_ATTACHMENT_PENDING_HOURS,
  COMMUNITY_CHAT_ATTACHMENT_RETENTION_DAYS,
};
export const COMMUNITY_CHAT_FILE_MAX_BYTES = COMMUNITY_CHAT_ATTACHMENT_MAX_TOTAL_BYTES;

const CLEANUP_INTERVAL_MS = 30 * 60 * 1000;
const PUBLIC_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const BLOCKED_EXTENSIONS = new Set(COMMUNITY_CHAT_BLOCKED_FILE_EXTENSIONS);
const BLOCKED_MIME_TYPES = new Set(COMMUNITY_CHAT_BLOCKED_FILE_MIME_TYPES);

const chatError = (code, status, zhMessage, enMessage) => new CommunityChatError(code, status, zhMessage, enMessage);
let cleanupTimer = null;
let cleanupRunning = false;

function assertRegisteredUser(user) {
  if (!user?.id || user.role === 'visitor') {
    throw chatError('LOGIN_REQUIRED', 403, '请先注册或登录', 'Please register or sign in first');
  }
}

function assertFilesEnabled(env) {
  if (!getCommunityChatFeatureState(env).filesEnabled) {
    throw chatError(
      'COMMUNITY_CHAT_FILES_DISABLED',
      403,
      '聊天室文件功能当前未开放',
      'Chat file attachments are currently disabled',
    );
  }
}

function normalizePublicId(value) {
  const publicId = String(value || '').trim();
  if (!PUBLIC_ID_PATTERN.test(publicId)) {
    throw chatError('INVALID_ATTACHMENT_ID', 400, '附件标识无效', 'Invalid attachment identifier');
  }
  return publicId.toLowerCase();
}

export function normalizeCommunityChatFileName(value) {
  const fileName = String(value || '')
    .normalize('NFC')
    .trim();
  if (!fileName) throw chatError('FILE_NAME_REQUIRED', 400, '文件名不能为空', 'File name is required');
  if (Array.from(fileName).length > 255) {
    throw chatError('FILE_NAME_TOO_LONG', 400, '文件名不能超过 255 个字符', 'File name cannot exceed 255 characters');
  }
  if (/[\\/:*?"<>|\x00-\x1F\x7F]/u.test(fileName) || fileName === '.' || fileName === '..') {
    throw chatError(
      'FILE_NAME_INVALID',
      400,
      '文件名包含路径、控制字符或其他无效内容',
      'File name contains a path, control character, or other invalid content',
    );
  }
  return fileName;
}

export function normalizeCommunityChatFileType(value) {
  const mime = String(value || 'application/octet-stream')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
  return /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/u.test(mime)
    ? mime.slice(0, 160)
    : 'application/octet-stream';
}

export function assertCommunityChatFileAllowed(fileName, fileType) {
  const extension = path.extname(fileName).slice(1).toLowerCase();
  const mime = normalizeCommunityChatFileType(fileType).split(';')[0].trim();
  if (BLOCKED_EXTENSIONS.has(extension) || BLOCKED_MIME_TYPES.has(mime)) {
    throw chatError(
      'COMMUNITY_CHAT_FILE_TYPE_BLOCKED',
      415,
      '聊天室不支持发送可执行文件或安装包',
      'Executable files and installers cannot be sent in chat',
    );
  }
}

function normalizeFileSize(value) {
  const fileSize = Number(value);
  if (!Number.isSafeInteger(fileSize) || fileSize <= 0) {
    throw chatError('COMMUNITY_CHAT_FILE_EMPTY', 400, '不能发送空文件', 'Empty files cannot be sent');
  }
  if (fileSize > COMMUNITY_CHAT_FILE_MAX_BYTES) {
    throw chatError('COMMUNITY_CHAT_FILE_TOO_LARGE', 413, '文件不能超过 20MB', 'Files must be 20MB or smaller');
  }
  return fileSize;
}

function ownerObjectSegment(userId) {
  return createHash('sha256').update(String(userId)).digest('hex').slice(0, 24);
}

function safeObjectExtension(fileName) {
  const extension = path.extname(fileName).toLowerCase();
  return /^\.[a-z0-9]{1,16}$/u.test(extension) ? extension : '';
}

function publicFile(row) {
  return {
    publicId: row.publicId,
    kind: 'file',
    fileName: row.fileName,
    fileType: row.contentType,
    fileSize: Number(row.fileSize || 0),
    availability: 'available',
    expiresAt: row.expiresAt,
  };
}

async function queryFirst(db, sql, params = []) {
  const [rows] = await db.query(sql, params);
  return rows[0] || null;
}

async function assertUploadAccess({ user, roomSlug, env, db }) {
  assertRegisteredUser(user);
  assertFilesEnabled(env);
  if (String(roomSlug || '').trim() !== COMMUNITY_CHAT_PRIMARY_ROOM_SLUG) {
    throw chatError('COMMUNITY_CHAT_ROOM_NOT_FOUND', 404, '聊天室不存在或已归档', 'Room not found or archived');
  }
  await assertCommunityChatMessagingAccess({ user, env, db });
  await assertCommunityChatPostingEnabled({ env, db });
  await assertCommunityChatPostingAllowed({ user, db });
  const room = await queryFirst(
    db,
    `SELECT id FROM community_chat_rooms WHERE slug = ? AND status = 'active' LIMIT 1`,
    [COMMUNITY_CHAT_PRIMARY_ROOM_SLUG],
  );
  if (!room) throw chatError('COMMUNITY_CHAT_ROOM_NOT_FOUND', 404, '聊天室不存在或已暂停', 'Room not found or paused');
  return room;
}

export async function prepareCommunityChatFileUpload({
  user,
  roomSlug,
  fileName,
  fileType,
  fileSize,
  env = process.env,
  db = pool,
  createSignedUrl = createUploadSignedUrl,
}) {
  const normalizedName = normalizeCommunityChatFileName(fileName);
  const normalizedType = normalizeCommunityChatFileType(fileType);
  const normalizedSize = normalizeFileSize(fileSize);
  assertCommunityChatFileAllowed(normalizedName, normalizedType);
  const room = await assertUploadAccess({ user, roomSlug, env, db });
  const publicId = randomUUID();
  const objectKey = `community-chat/files/${ownerObjectSegment(user.id)}/${publicId}${safeObjectExtension(normalizedName)}`;
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const owner = await queryFirst(connection, 'SELECT id FROM user WHERE id = ? AND del_flag = 0 LIMIT 1 FOR UPDATE', [
      user.id,
    ]);
    if (!owner) throw chatError('LOGIN_REQUIRED', 403, '当前账号已失效，请重新登录', 'Your account is unavailable');
    const pending = await queryFirst(
      connection,
      `SELECT (
         (SELECT COUNT(*) FROM community_chat_message_images
           WHERE owner_user_id = ? AND message_id IS NULL
             AND status IN ('uploading', 'pending', 'delete_pending', 'deleting')) +
         (SELECT COUNT(*) FROM community_chat_message_files
           WHERE owner_user_id = ? AND message_id IS NULL
             AND status IN ('uploading', 'pending', 'delete_pending', 'deleting'))
       ) AS pendingCount`,
      [user.id, user.id],
    );
    if (Number(pending?.pendingCount || 0) >= COMMUNITY_CHAT_ATTACHMENT_MAX_PENDING_PER_USER) {
      throw chatError(
        'COMMUNITY_CHAT_ATTACHMENT_PENDING_LIMIT',
        429,
        '待发送或待清理的附件已达上限，请移除附件或稍后重试',
        'You have too many pending attachments. Remove one or try again later.',
      );
    }
    await connection.query(
      `INSERT INTO community_chat_message_files
         (public_id, owner_user_id, room_id, object_key, file_name, content_type, file_size, status, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'uploading', DATE_ADD(NOW(), INTERVAL ? HOUR))`,
      [
        publicId,
        user.id,
        room.id,
        objectKey,
        normalizedName,
        normalizedType,
        normalizedSize,
        COMMUNITY_CHAT_ATTACHMENT_PENDING_HOURS,
      ],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  try {
    const signed = createSignedUrl({ objectKey, contentType: normalizedType, expires: 900 });
    if (!signed?.url)
      throw chatError('COMMUNITY_CHAT_UPLOAD_UNAVAILABLE', 503, '上传暂时不可用', 'Upload is unavailable');
    return {
      attachment: publicFile({
        publicId,
        fileName: normalizedName,
        contentType: normalizedType,
        fileSize: normalizedSize,
        expiresAt: new Date(Date.now() + COMMUNITY_CHAT_ATTACHMENT_PENDING_HOURS * 3600_000).toISOString(),
      }),
      uploadUrl: signed.url,
      headers: signed.headers || { 'Content-Type': normalizedType },
      expiresIn: signed.expiresIn || 900,
    };
  } catch (error) {
    await db.query(`DELETE FROM community_chat_message_files WHERE public_id = ? AND status = 'uploading'`, [publicId]);
    throw error;
  }
}

export async function confirmCommunityChatFileUpload({
  user,
  filePublicId,
  env = process.env,
  db = pool,
  getMetadata = getObjectMetadataFromObs,
}) {
  assertRegisteredUser(user);
  assertFilesEnabled(env);
  await assertCommunityChatMessagingAccess({ user, env, db });
  await assertCommunityChatPostingEnabled({ env, db });
  await assertCommunityChatPostingAllowed({ user, db });
  const publicId = normalizePublicId(filePublicId);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const owner = await queryFirst(connection, 'SELECT id FROM user WHERE id = ? AND del_flag = 0 LIMIT 1 FOR UPDATE', [
      user.id,
    ]);
    if (!owner) throw chatError('LOGIN_REQUIRED', 403, '当前账号已失效，请重新登录', 'Your account is unavailable');
    const file = await queryFirst(
      connection,
      `SELECT id, public_id AS publicId, object_key AS objectKey, file_name AS fileName,
              content_type AS contentType, file_size AS fileSize, status, message_id AS messageId,
              expires_at AS expiresAt, expires_at <= NOW() AS isExpired
         FROM community_chat_message_files
        WHERE public_id = ? AND owner_user_id = ? LIMIT 1 FOR UPDATE`,
      [publicId, user.id],
    );
    if (!file) throw chatError('COMMUNITY_CHAT_FILE_NOT_FOUND', 404, '文件不存在', 'File not found');
    if (file.status === 'pending' && file.messageId === null && !Number(file.isExpired)) {
      await connection.commit();
      return { ...publicFile(file), alreadyConfirmed: true };
    }
    if (file.status !== 'uploading' || file.messageId !== null || Number(file.isExpired)) {
      throw chatError('COMMUNITY_CHAT_FILE_UPLOAD_EXPIRED', 409, '文件上传已失效，请重新选择', 'File upload expired');
    }
    const metadata = await getMetadata(file.objectKey);
    const verifiedSize = normalizeFileSize(metadata?.contentLength);
    if (verifiedSize !== Number(file.fileSize)) {
      throw chatError(
        'COMMUNITY_CHAT_FILE_SIZE_MISMATCH',
        409,
        '文件大小与上传声明不一致',
        'Uploaded file size changed',
      );
    }
    const actualType = normalizeCommunityChatFileType(metadata?.contentType);
    if (actualType && actualType !== 'application/octet-stream' && actualType !== file.contentType) {
      throw chatError(
        'COMMUNITY_CHAT_FILE_TYPE_MISMATCH',
        409,
        '文件类型与上传声明不一致',
        'Uploaded file type changed',
      );
    }
    const [updated] = await connection.query(
      `UPDATE community_chat_message_files SET status = 'pending'
        WHERE id = ? AND status = 'uploading' AND message_id IS NULL AND expires_at > NOW()`,
      [file.id],
    );
    if (Number(updated?.affectedRows || 0) !== 1) {
      throw chatError('COMMUNITY_CHAT_FILE_UPLOAD_EXPIRED', 409, '文件上传已失效，请重新选择', 'File upload expired');
    }
    await connection.commit();
    return publicFile(file);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function removePendingFileObject({ publicId, objectKey, db, deleteObject }) {
  try {
    if (objectKey) await deleteObject(objectKey);
    await db.query(
      `DELETE FROM community_chat_message_files
        WHERE public_id = ? AND message_id IS NULL AND status IN ('delete_pending', 'deleting')`,
      [publicId],
    );
    return true;
  } catch {
    await db
      .query(
        `UPDATE community_chat_message_files SET status = 'delete_pending' WHERE public_id = ? AND message_id IS NULL`,
        [publicId],
      )
      .catch(() => {});
    return false;
  }
}

export async function discardCommunityChatFile({ user, filePublicId, db = pool, deleteObject = deleteObjectFromObs }) {
  assertRegisteredUser(user);
  const publicId = normalizePublicId(filePublicId);
  const connection = await db.getConnection();
  let objectKey = '';
  try {
    await connection.beginTransaction();
    const file = await queryFirst(
      connection,
      `SELECT object_key AS objectKey, status, message_id AS messageId
         FROM community_chat_message_files
        WHERE public_id = ? AND owner_user_id = ? LIMIT 1 FOR UPDATE`,
      [publicId, user.id],
    );
    if (!file) {
      await connection.commit();
      return { publicId, discarded: true };
    }
    if (file.messageId !== null || !['uploading', 'pending', 'delete_pending'].includes(file.status)) {
      throw chatError(
        'COMMUNITY_CHAT_FILE_ALREADY_ATTACHED',
        409,
        '已发送的文件不能移除',
        'A sent file cannot be discarded',
      );
    }
    objectKey = file.objectKey;
    await connection.query(
      `UPDATE community_chat_message_files
          SET status = 'delete_pending', expires_at = NOW()
        WHERE public_id = ?`,
      [publicId],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  const deleted = await removePendingFileObject({ publicId, objectKey, db, deleteObject });
  return { publicId, discarded: true, cleanupPending: !deleted };
}

export async function getCommunityChatFileSource({ user, filePublicId, env = process.env, db = pool }) {
  const publicId = normalizePublicId(filePublicId);
  const { memberRole } = await assertCommunityChatReadAccess({ user, env, db });
  const viewerUserId = user?.id && user.role !== 'visitor' ? user.id : '';
  const canViewRecalled = memberRole === 'admin' || memberRole === 'moderator';
  const file = await queryFirst(
    db,
    `SELECT file.id, file.public_id AS publicId, file.owner_user_id AS ownerUserId,
            file.object_key AS objectKey, file.file_name AS fileName,
            file.content_type AS contentType, file.file_size AS fileSize,
            file.status, file.message_id AS messageId, file.expires_at AS expiresAt,
            file.expires_at <= NOW() AS isExpired,
            GREATEST(0, TIMESTAMPDIFF(SECOND, NOW(), file.expires_at)) AS remainingSeconds
       FROM community_chat_message_files file
       LEFT JOIN community_chat_messages message ON message.id = file.message_id
       LEFT JOIN community_chat_rooms room ON room.id = message.room_id
      WHERE file.public_id = ?
        AND (
          (file.message_id IS NULL AND file.owner_user_id = ? AND file.status IN ('uploading', 'pending'))
          OR (
            file.message_id IS NOT NULL
            AND (message.status = 'active' OR (? = 1 AND message.status = 'recalled'))
            AND room.slug = ? AND room.status = 'active'
            AND NOT EXISTS (
              SELECT 1 FROM community_chat_blocks blocked
               WHERE blocked.user_id = ? AND blocked.blocked_user_id = message.user_id
            )
            AND NOT EXISTS (
              SELECT 1 FROM community_chat_message_deletions deletion
               WHERE deletion.user_id = ? AND deletion.message_id = message.id
            )
          )
        )
      LIMIT 1`,
    [publicId, viewerUserId, canViewRecalled ? 1 : 0, COMMUNITY_CHAT_PRIMARY_ROOM_SLUG, viewerUserId, viewerUserId],
  );
  if (!file) {
    throw chatError('COMMUNITY_CHAT_FILE_NOT_FOUND', 404, '文件不存在或当前不可查看', 'File not found or unavailable');
  }
  if (Number(file.isExpired) || file.status !== (file.messageId === null ? 'pending' : 'attached') || !file.objectKey) {
    throw chatError('COMMUNITY_CHAT_FILE_EXPIRED', 410, '资源已过期', 'The attachment has expired');
  }
  return file;
}

export async function getCommunityChatFileDownload({
  user,
  filePublicId,
  env = process.env,
  db = pool,
  createSignedUrl = createDownloadSignedUrl,
}) {
  const file = await getCommunityChatFileSource({ user, filePublicId, env, db });
  const remainingSeconds = Math.floor(Number(file.remainingSeconds));
  if (!Number.isFinite(remainingSeconds) || remainingSeconds <= 1) {
    throw chatError('COMMUNITY_CHAT_FILE_EXPIRED', 410, '资源已过期', 'The attachment has expired');
  }
  // OBS 只接受整数秒 TTL，预留 1 秒覆盖查询与签名耗时，保证 URL 不越过资源截止点。
  const expires = Math.min(600, remainingSeconds - 1);
  const signed = createSignedUrl({ objectKey: file.objectKey, expires });
  if (!signed?.url) throw chatError('COMMUNITY_CHAT_FILE_UNAVAILABLE', 503, '文件暂时无法下载', 'File is unavailable');
  return {
    ...publicFile(file),
    downloadUrl: signed.url,
    expiresIn: expires,
  };
}

async function expireAttachedFile({ row, db, deleteObject }) {
  try {
    await deleteFilePreviewArtifactsForSource({ sourceType: 'community_chat_file', fileId: row.id, db, deleteObject });
    if (row.objectKey) await deleteObject(row.objectKey);
    await db.query(
      `UPDATE community_chat_message_files
          SET status = 'expired', object_key = NULL, expired_at = COALESCE(expired_at, NOW())
        WHERE id = ? AND status = 'deleting'`,
      [row.id],
    );
    return true;
  } catch {
    await db
      .query(`UPDATE community_chat_message_files SET status = 'delete_pending' WHERE id = ? AND status = 'deleting'`, [
        row.id,
      ])
      .catch(() => {});
    return false;
  }
}

export async function cleanupExpiredCommunityChatFiles({
  db = pool,
  deleteObject = deleteObjectFromObs,
  limit = 50,
} = {}) {
  const safeLimit = Math.min(200, Math.max(1, Math.floor(Number(limit) || 50)));
  const [rows] = await db.query(
    `SELECT id, public_id AS publicId, object_key AS objectKey, message_id AS messageId
      FROM community_chat_message_files
      WHERE status IN ('uploading', 'pending', 'attached', 'delete_pending', 'deleting')
        AND expires_at <= NOW()
        AND (status <> 'deleting' OR update_time < DATE_SUB(NOW(), INTERVAL 10 MINUTE))
      ORDER BY expires_at ASC, id ASC LIMIT ?`,
    [safeLimit],
  );
  let removed = 0;
  let expired = 0;
  for (const row of rows) {
    const [claimed] = await db.query(
      `UPDATE community_chat_message_files SET status = 'deleting', update_time = NOW()
        WHERE id = ? AND status IN ('uploading', 'pending', 'attached', 'delete_pending', 'deleting')
          AND expires_at <= NOW()
          AND (status <> 'deleting' OR update_time < DATE_SUB(NOW(), INTERVAL 10 MINUTE))`,
      [row.id],
    );
    if (!Number(claimed?.affectedRows || 0)) continue;
    if (row.messageId === null || row.messageId === undefined) {
      if (await removePendingFileObject({ publicId: row.publicId, objectKey: row.objectKey, db, deleteObject }))
        removed += 1;
    } else if (await expireAttachedFile({ row, db, deleteObject })) expired += 1;
  }
  return { scanned: rows.length, removed, expired };
}

export async function startCommunityChatFileCleanupScheduler({
  db = pool,
  deleteObject = deleteObjectFromObs,
  intervalMs = CLEANUP_INTERVAL_MS,
  limit = 100,
} = {}) {
  if (cleanupTimer) return cleanupTimer;
  const safeInterval = Math.max(60_000, Math.floor(Number(intervalMs) || CLEANUP_INTERVAL_MS));
  const runCleanup = async () => {
    if (cleanupRunning) return;
    cleanupRunning = true;
    try {
      await cleanupExpiredCommunityChatFiles({ db, deleteObject, limit });
    } catch (error) {
      console.error('[community-chat] 过期聊天文件清理失败 code=%s', stableAgentErrorCode(error));
    } finally {
      cleanupRunning = false;
    }
  };
  await runCleanup();
  cleanupTimer = setInterval(() => void runCleanup(), safeInterval);
  cleanupTimer.unref?.();
  return cleanupTimer;
}

export const __test__ = {
  normalizePublicId,
  normalizeFileSize,
  publicFile,
  safeObjectExtension,
};
