import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { imageSize } from 'image-size';
import pool from '../../db/index.js';
import { COMMUNITY_CHAT_PRIMARY_ROOM_SLUG } from '../communityChatFeature.js';
import { stableAgentErrorCode } from '../agent/logSafety.js';
import { createDownloadSignedUrl, deleteObjectFromObs, putObjectToObs } from '../obsClient.js';
import {
  CommunityChatError,
  assertCommunityChatMessagingAccess,
  assertCommunityChatPostingEnabled,
  assertCommunityChatReadAccess,
} from './communityChatAccessService.js';
import { assertCommunityChatPostingAllowed } from './communityChatModerationService.js';

export const COMMUNITY_CHAT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const COMMUNITY_CHAT_IMAGE_MAX_COUNT = 4;
export const COMMUNITY_CHAT_IMAGE_MAX_PENDING_PER_USER = 12;
export const COMMUNITY_CHAT_IMAGE_PENDING_HOURS = 24;

const MAX_IMAGE_PIXELS = 20_000_000;
const MAX_IMAGE_EDGE = 12_000;
const IMAGE_CLEANUP_INTERVAL_MS = 30 * 60 * 1000;
const PUBLIC_ID_PATTERN = /^[A-Za-z0-9-]{1,36}$/;
const IMAGE_TYPES = Object.freeze({
  jpg: { contentType: 'image/jpeg', extension: 'jpg' },
  jpeg: { contentType: 'image/jpeg', extension: 'jpg' },
  png: { contentType: 'image/png', extension: 'png' },
  webp: { contentType: 'image/webp', extension: 'webp' },
});

const chatError = (code, status, zhMessage, enMessage) => new CommunityChatError(code, status, zhMessage, enMessage);
let imageCleanupTimer = null;
let imageCleanupRunning = false;

function assertRegisteredUser(user) {
  if (!user?.id || user.role === 'visitor') {
    throw chatError('LOGIN_REQUIRED', 403, '请先注册或登录', 'Please register or sign in first');
  }
}

function normalizePublicId(value) {
  const publicId = String(value || '').trim();
  if (!PUBLIC_ID_PATTERN.test(publicId)) {
    throw chatError('INVALID_IMAGE_ID', 400, '图片标识无效', 'Invalid image identifier');
  }
  return publicId;
}

async function queryFirst(db, sql, params = []) {
  const [rows] = await db.query(sql, params);
  return rows[0] || null;
}

function validateDimensions(dimensions) {
  const width = Number(dimensions?.width || 0);
  const height = Number(dimensions?.height || 0);
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_IMAGE_EDGE ||
    height > MAX_IMAGE_EDGE ||
    width * height > MAX_IMAGE_PIXELS
  ) {
    throw chatError(
      'COMMUNITY_CHAT_IMAGE_DIMENSIONS_INVALID',
      400,
      '图片尺寸过大或无法识别，请压缩后重试',
      'Image dimensions are invalid or too large. Compress the image and try again.',
    );
  }
  return { width, height };
}

export async function validateCommunityChatImage(file) {
  if (!file?.path || !Number(file.size)) {
    throw chatError('COMMUNITY_CHAT_IMAGE_REQUIRED', 400, '请选择要发送的图片', 'Select an image to send');
  }
  if (Number(file.size) > COMMUNITY_CHAT_IMAGE_MAX_BYTES) {
    throw chatError('COMMUNITY_CHAT_IMAGE_TOO_LARGE', 413, '单张图片不能超过 5MB', 'Each image must be 5MB or smaller');
  }

  let buffer;
  try {
    buffer = await fs.readFile(file.path);
  } catch {
    throw chatError('COMMUNITY_CHAT_IMAGE_UNREADABLE', 400, '图片读取失败，请重新选择', 'The image could not be read');
  }
  if (!buffer.length || buffer.length !== Number(file.size) || buffer.length > COMMUNITY_CHAT_IMAGE_MAX_BYTES) {
    throw chatError(
      'COMMUNITY_CHAT_IMAGE_SIZE_MISMATCH',
      400,
      '图片内容不完整，请重新选择',
      'Image content is incomplete',
    );
  }

  let dimensions;
  try {
    dimensions = imageSize(buffer);
  } catch {
    throw chatError(
      'COMMUNITY_CHAT_IMAGE_CONTENT_INVALID',
      400,
      '仅支持真实的 JPG、PNG 或 WebP 图片',
      'Only valid JPG, PNG, or WebP images are supported',
    );
  }
  const imageType = IMAGE_TYPES[String(dimensions?.type || '').toLowerCase()];
  if (!imageType || String(file.mimetype || '').toLowerCase() !== imageType.contentType) {
    throw chatError(
      'COMMUNITY_CHAT_IMAGE_CONTENT_INVALID',
      400,
      '图片格式与实际内容不一致，仅支持 JPG、PNG 或 WebP',
      'Image format does not match its content. Only JPG, PNG, and WebP are supported.',
    );
  }
  return {
    ...validateDimensions(dimensions),
    contentType: imageType.contentType,
    extension: imageType.extension,
    fileSize: buffer.length,
  };
}

function ownerObjectSegment(userId) {
  return createHash('sha256').update(String(userId)).digest('hex').slice(0, 24);
}

function publicImage(image) {
  return {
    publicId: image.publicId,
    url: `/api/community-chat/images/${encodeURIComponent(image.publicId)}`,
    contentType: image.contentType,
    fileSize: Number(image.fileSize || 0),
    width: Number(image.width || 0),
    height: Number(image.height || 0),
  };
}

async function removeTrackedObject({ publicId, objectKey, db, deleteObject }) {
  try {
    await deleteObject(objectKey);
    await db.query(
      `DELETE FROM community_chat_message_images
        WHERE public_id = ? AND status IN ('delete_pending', 'deleting')`,
      [publicId],
    );
    return true;
  } catch {
    await db
      .query(
        `UPDATE community_chat_message_images
            SET status = 'delete_pending', expires_at = NOW()
          WHERE public_id = ? AND status = 'deleting'`,
        [publicId],
      )
      .catch(() => {});
    return false;
  }
}

/**
 * 上传阶段只产生 24 小时有效的 pending 附件；真正发送消息时再在消息事务内绑定。
 * 先登记再写对象存储，确保任何中断都留下可清理的权威记录。
 */
export async function uploadCommunityChatImage({
  user,
  roomSlug,
  file,
  env = process.env,
  db = pool,
  putObject = putObjectToObs,
  deleteObject = deleteObjectFromObs,
}) {
  try {
    assertRegisteredUser(user);
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
    if (!room) {
      throw chatError('COMMUNITY_CHAT_ROOM_NOT_FOUND', 404, '聊天室不存在或已暂停', 'Room not found or paused');
    }

    const validated = await validateCommunityChatImage(file);
    const publicId = randomUUID();
    const objectKey = `community-chat/${ownerObjectSegment(user.id)}/${publicId}.${validated.extension}`;
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const owner = await queryFirst(
        connection,
        'SELECT id FROM user WHERE id = ? AND del_flag = 0 LIMIT 1 FOR UPDATE',
        [user.id],
      );
      if (!owner) {
        throw chatError(
          'LOGIN_REQUIRED',
          403,
          '当前账号已失效，请重新登录',
          'Your account is unavailable. Sign in again.',
        );
      }
      const pending = await queryFirst(
        connection,
        `SELECT COUNT(*) AS pendingCount
           FROM community_chat_message_images
          WHERE owner_user_id = ?
            AND message_id IS NULL
            AND status IN ('uploading', 'pending', 'delete_pending', 'deleting')`,
        [user.id],
      );
      if (Number(pending?.pendingCount || 0) >= COMMUNITY_CHAT_IMAGE_MAX_PENDING_PER_USER) {
        throw chatError(
          'COMMUNITY_CHAT_IMAGE_PENDING_LIMIT',
          429,
          '待发送或待清理的图片已达上限，请移除图片或稍后重试',
          'You have too many pending images. Remove images or try again later.',
        );
      }
      await connection.query(
        `INSERT INTO community_chat_message_images
           (public_id, owner_user_id, object_key, content_type, file_size, width, height, status, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'uploading', DATE_ADD(NOW(), INTERVAL ? HOUR))`,
        [
          publicId,
          user.id,
          objectKey,
          validated.contentType,
          validated.fileSize,
          validated.width,
          validated.height,
          COMMUNITY_CHAT_IMAGE_PENDING_HOURS,
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
      await putObject(objectKey, file.path, validated.contentType);
      const [updated] = await db.query(
        `UPDATE community_chat_message_images
            SET status = 'pending'
          WHERE public_id = ? AND owner_user_id = ? AND status = 'uploading'`,
        [publicId, user.id],
      );
      if (Number(updated?.affectedRows || 0) !== 1) {
        throw chatError(
          'COMMUNITY_CHAT_IMAGE_UPLOAD_STATE_INVALID',
          409,
          '图片上传状态已失效，请重新选择',
          'The image upload state expired. Select the image again.',
        );
      }
      return publicImage({ publicId, ...validated });
    } catch (error) {
      await db.query(
        `UPDATE community_chat_message_images
            SET status = 'delete_pending', expires_at = NOW()
          WHERE public_id = ? AND status IN ('uploading', 'pending')`,
        [publicId],
      );
      await removeTrackedObject({ publicId, objectKey, db, deleteObject });
      throw error;
    }
  } finally {
    if (file?.path) await fs.unlink(file.path).catch(() => {});
  }
}

export async function getCommunityChatImageDownload({
  user,
  imagePublicId,
  env = process.env,
  db = pool,
  createSignedUrl = createDownloadSignedUrl,
}) {
  const normalizedPublicId = normalizePublicId(imagePublicId);
  await assertCommunityChatReadAccess({ user, env, db });
  const viewerUserId = user?.id && user.role !== 'visitor' ? user.id : '';
  const image = await queryFirst(
    db,
    `SELECT image.public_id AS publicId, image.object_key AS objectKey,
            image.content_type AS contentType, image.file_size AS fileSize,
            image.width, image.height, image.status
       FROM community_chat_message_images image
       LEFT JOIN community_chat_messages message ON message.id = image.message_id
       LEFT JOIN community_chat_rooms room ON room.id = message.room_id
      WHERE image.public_id = ?
        AND (
          (
            image.status = 'pending'
            AND image.owner_user_id = ?
            AND image.message_id IS NULL
            AND image.expires_at > NOW()
          )
          OR (
            image.status = 'attached'
            AND message.status = 'active'
            AND room.slug = ?
            AND room.status = 'active'
            AND NOT EXISTS (
              SELECT 1 FROM community_chat_blocks blocked
               WHERE blocked.user_id = ? AND blocked.blocked_user_id = message.user_id
            )
          )
        )
      LIMIT 1`,
    [normalizedPublicId, viewerUserId, COMMUNITY_CHAT_PRIMARY_ROOM_SLUG, viewerUserId],
  );
  if (!image) {
    throw chatError(
      'COMMUNITY_CHAT_IMAGE_NOT_FOUND',
      404,
      '图片不存在或当前不可查看',
      'Image not found or unavailable',
    );
  }
  const signed = createSignedUrl({ objectKey: image.objectKey, expires: 300 });
  if (!signed?.url) {
    throw chatError('COMMUNITY_CHAT_IMAGE_UNAVAILABLE', 503, '图片暂时无法打开', 'Image is temporarily unavailable');
  }
  return { ...publicImage(image), signedUrl: signed.url };
}

export async function discardCommunityChatImage({
  user,
  imagePublicId,
  db = pool,
  deleteObject = deleteObjectFromObs,
}) {
  assertRegisteredUser(user);
  const normalizedPublicId = normalizePublicId(imagePublicId);
  const connection = await db.getConnection();
  let objectKey = '';
  try {
    await connection.beginTransaction();
    const image = await queryFirst(
      connection,
      `SELECT object_key AS objectKey, status
         FROM community_chat_message_images
        WHERE public_id = ? AND owner_user_id = ?
        LIMIT 1 FOR UPDATE`,
      [normalizedPublicId, user.id],
    );
    if (!image) {
      await connection.commit();
      return { publicId: normalizedPublicId, discarded: true };
    }
    if (!['uploading', 'pending', 'delete_pending'].includes(image.status)) {
      throw chatError(
        'COMMUNITY_CHAT_IMAGE_ALREADY_ATTACHED',
        409,
        '已发送的图片不能移除',
        'A sent image cannot be discarded',
      );
    }
    objectKey = image.objectKey;
    await connection.query(
      `UPDATE community_chat_message_images
          SET status = 'delete_pending', expires_at = NOW()
        WHERE public_id = ?`,
      [normalizedPublicId],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const deleted = await removeTrackedObject({ publicId: normalizedPublicId, objectKey, db, deleteObject });
  return { publicId: normalizedPublicId, discarded: true, cleanupPending: !deleted };
}

export async function cleanupExpiredCommunityChatImages({
  db = pool,
  deleteObject = deleteObjectFromObs,
  limit = 50,
} = {}) {
  const safeLimit = Math.min(200, Math.max(1, Math.floor(Number(limit) || 50)));
  const [rows] = await db.query(
    `SELECT public_id AS publicId, object_key AS objectKey
       FROM community_chat_message_images
      WHERE status IN ('uploading', 'pending', 'delete_pending', 'deleting')
        AND expires_at IS NOT NULL
        AND expires_at <= NOW()
      ORDER BY expires_at ASC, id ASC
      LIMIT ?`,
    [safeLimit],
  );
  let removed = 0;
  for (const row of rows) {
    const [claimed] = await db.query(
      `UPDATE community_chat_message_images
          SET status = 'deleting', expires_at = DATE_ADD(NOW(), INTERVAL 5 MINUTE)
        WHERE public_id = ?
          AND status IN ('uploading', 'pending', 'delete_pending', 'deleting')
          AND expires_at IS NOT NULL
          AND expires_at <= NOW()`,
      [row.publicId],
    );
    if (!Number(claimed?.affectedRows || 0)) continue;
    if (await removeTrackedObject({ publicId: row.publicId, objectKey: row.objectKey, db, deleteObject })) removed += 1;
  }
  return { scanned: rows.length, removed };
}

export async function startCommunityChatImageCleanupScheduler({
  db = pool,
  deleteObject = deleteObjectFromObs,
  intervalMs = IMAGE_CLEANUP_INTERVAL_MS,
  limit = 100,
} = {}) {
  if (imageCleanupTimer) return imageCleanupTimer;
  const safeIntervalMs = Math.max(60_000, Math.floor(Number(intervalMs) || IMAGE_CLEANUP_INTERVAL_MS));
  const runCleanup = async () => {
    if (imageCleanupRunning) return;
    imageCleanupRunning = true;
    try {
      await cleanupExpiredCommunityChatImages({ db, deleteObject, limit });
    } catch (error) {
      console.error('[community-chat] 过期聊天图片清理失败 code=%s', stableAgentErrorCode(error));
    } finally {
      imageCleanupRunning = false;
    }
  };

  await runCleanup();
  imageCleanupTimer = setInterval(() => void runCleanup(), safeIntervalMs);
  imageCleanupTimer.unref?.();
  return imageCleanupTimer;
}

export const __test__ = {
  normalizePublicId,
  publicImage,
  validateDimensions,
};
