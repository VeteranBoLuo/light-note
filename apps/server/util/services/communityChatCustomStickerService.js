import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import pool from '../../db/index.js';
import { stableAgentErrorCode } from '../agent/logSafety.js';
import { createDownloadSignedUrl, deleteObjectFromObs, putObjectToObs } from '../obsClient.js';
import {
  CommunityChatError,
  assertCommunityChatMessagingAccess,
  assertCommunityChatReadAccess,
} from './communityChatAccessService.js';
import { assertCommunityChatPostingAllowed } from './communityChatModerationService.js';
import { validateCommunityChatImage } from './communityChatImageService.js';

export const COMMUNITY_CHAT_CUSTOM_STICKER_MAX_BYTES = 2 * 1024 * 1024;
export const COMMUNITY_CHAT_CUSTOM_STICKER_MAX_COUNT = 100;
const CUSTOM_STICKER_MAX_EDGE = 4096;
const CUSTOM_STICKER_MAX_PIXELS = 8_000_000;
const CUSTOM_STICKER_CLEANUP_INTERVAL_MS = 30 * 60 * 1000;
const PUBLIC_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const chatError = (code, status, zhMessage, enMessage) => new CommunityChatError(code, status, zhMessage, enMessage);
let customStickerCleanupTimer = null;
let customStickerCleanupRunning = false;

function assertRegisteredUser(user) {
  if (!user?.id || user.role === 'visitor') {
    throw chatError('LOGIN_REQUIRED', 403, '请先注册或登录', 'Please register or sign in first');
  }
}

function normalizePublicId(value) {
  const publicId = String(value || '')
    .trim()
    .toLowerCase();
  if (!PUBLIC_ID_PATTERN.test(publicId)) {
    throw chatError('INVALID_CUSTOM_STICKER_ID', 400, '自定义表情标识无效', 'Invalid custom sticker identifier');
  }
  return publicId;
}

function normalizeName(value) {
  const name = String(value || '')
    .normalize('NFKC')
    .trim();
  if (Array.from(name).length > 40) {
    throw chatError(
      'CUSTOM_STICKER_NAME_TOO_LONG',
      400,
      '表情名称不能超过 40 个字符',
      'Sticker name must not exceed 40 characters',
    );
  }
  return name;
}

function ownerObjectSegment(userId) {
  return createHash('sha256').update(String(userId)).digest('hex').slice(0, 24);
}

function publicSticker(row) {
  const publicId = String(row.publicId || '');
  return {
    publicId,
    name: String(row.name || ''),
    url: `/api/community-chat/stickers/${encodeURIComponent(publicId)}/content`,
    contentType: String(row.contentType || ''),
    fileSize: Number(row.fileSize || 0),
    width: Number(row.width || 0),
    height: Number(row.height || 0),
    createdAt: row.createdAt || null,
  };
}

async function queryFirst(db, sql, params = []) {
  const [rows] = await db.query(sql, params);
  return rows[0] || null;
}

export async function listCommunityChatCustomStickers({ user, env = process.env, db = pool }) {
  assertRegisteredUser(user);
  await assertCommunityChatMessagingAccess({ user, env, db });
  const [rows] = await db.query(
    `SELECT public_id AS publicId, name, content_type AS contentType, file_size AS fileSize,
            width, height, create_time AS createdAt
       FROM community_chat_custom_stickers
      WHERE user_id = ? AND status = 'active'
      ORDER BY sort_order ASC, id ASC`,
    [user.id],
  );
  return {
    items: rows.map(publicSticker),
    maxCount: COMMUNITY_CHAT_CUSTOM_STICKER_MAX_COUNT,
    maxBytes: COMMUNITY_CHAT_CUSTOM_STICKER_MAX_BYTES,
  };
}

export async function uploadCommunityChatCustomSticker({
  user,
  file,
  name,
  env = process.env,
  db = pool,
  putObject = putObjectToObs,
  deleteObject = deleteObjectFromObs,
}) {
  try {
    assertRegisteredUser(user);
    await assertCommunityChatMessagingAccess({ user, env, db });
    await assertCommunityChatPostingAllowed({ user, db });
    const normalizedName = normalizeName(name);
    const validated = await validateCommunityChatImage(file);
    if (validated.fileSize > COMMUNITY_CHAT_CUSTOM_STICKER_MAX_BYTES) {
      throw chatError(
        'CUSTOM_STICKER_TOO_LARGE',
        413,
        '自定义表情不能超过 2MB',
        'Custom stickers must be 2MB or smaller',
      );
    }
    if (
      validated.width > CUSTOM_STICKER_MAX_EDGE ||
      validated.height > CUSTOM_STICKER_MAX_EDGE ||
      validated.width * validated.height > CUSTOM_STICKER_MAX_PIXELS
    ) {
      throw chatError(
        'CUSTOM_STICKER_DIMENSIONS_INVALID',
        400,
        '自定义表情尺寸过大，请压缩后重试',
        'The custom sticker dimensions are too large. Compress it and try again.',
      );
    }

    const connection = await db.getConnection();
    let record = null;
    try {
      await connection.beginTransaction();
      const existing = await queryFirst(
        connection,
        `SELECT public_id AS publicId, object_key AS objectKey, name,
                content_type AS contentType, file_size AS fileSize, width, height,
                status, create_time AS createdAt
           FROM community_chat_custom_stickers
          WHERE user_id = ? AND content_sha256 = ?
          LIMIT 1 FOR UPDATE`,
        [user.id, validated.contentSha256],
      );
      if (existing?.status === 'active') {
        await connection.commit();
        return { sticker: publicSticker(existing), duplicate: true };
      }
      if (existing?.status === 'removed') {
        await connection.query(
          `UPDATE community_chat_custom_stickers
              SET status = 'active', name = ?, update_time = CURRENT_TIMESTAMP
            WHERE public_id = ? AND user_id = ?`,
          [normalizedName || existing.name || '', existing.publicId, user.id],
        );
        await connection.commit();
        return {
          sticker: publicSticker({ ...existing, status: 'active', name: normalizedName || existing.name || '' }),
          duplicate: true,
        };
      }
      if (existing) {
        throw chatError(
          'CUSTOM_STICKER_UPLOAD_IN_PROGRESS',
          409,
          '相同表情正在上传或清理，请稍后重试',
          'An identical sticker is being uploaded or cleaned up. Try again later.',
        );
      }

      const summary = await queryFirst(
        connection,
        `SELECT COUNT(*) AS activeCount, COALESCE(MAX(sort_order), 0) AS maxSortOrder
           FROM community_chat_custom_stickers
          WHERE user_id = ? AND status = 'active'
          FOR UPDATE`,
        [user.id],
      );
      if (Number(summary?.activeCount || 0) >= COMMUNITY_CHAT_CUSTOM_STICKER_MAX_COUNT) {
        throw chatError(
          'CUSTOM_STICKER_LIMIT_REACHED',
          409,
          `个人表情最多保存 ${COMMUNITY_CHAT_CUSTOM_STICKER_MAX_COUNT} 个`,
          `You can save up to ${COMMUNITY_CHAT_CUSTOM_STICKER_MAX_COUNT} custom stickers`,
        );
      }

      const publicId = randomUUID();
      const objectKey = `community-chat-stickers/${ownerObjectSegment(user.id)}/${publicId}.${validated.extension}`;
      const sortOrder = Number(summary?.maxSortOrder || 0) + 10;
      await connection.query(
        `INSERT INTO community_chat_custom_stickers
           (public_id, user_id, object_key, content_sha256, content_type, file_size,
            width, height, name, status, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploading', ?)`,
        [
          publicId,
          user.id,
          objectKey,
          validated.contentSha256,
          validated.contentType,
          validated.fileSize,
          validated.width,
          validated.height,
          normalizedName,
          sortOrder,
        ],
      );
      await connection.commit();
      record = { publicId, objectKey, name: normalizedName, ...validated, createdAt: new Date().toISOString() };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    try {
      await putObject(record.objectKey, file.path, record.contentType);
      const [updated] = await db.query(
        `UPDATE community_chat_custom_stickers
            SET status = 'active'
          WHERE public_id = ? AND user_id = ? AND status = 'uploading'`,
        [record.publicId, user.id],
      );
      if (Number(updated?.affectedRows || 0) !== 1) {
        throw chatError(
          'CUSTOM_STICKER_UPLOAD_STATE_INVALID',
          409,
          '表情上传状态已失效，请重试',
          'The sticker upload state expired. Try again.',
        );
      }
      return { sticker: publicSticker(record), duplicate: false };
    } catch (error) {
      await db.query(
        `UPDATE community_chat_custom_stickers
            SET status = 'delete_pending'
          WHERE public_id = ? AND status IN ('uploading', 'active')`,
        [record.publicId],
      );
      try {
        await deleteObject(record.objectKey);
        await db.query(`DELETE FROM community_chat_custom_stickers WHERE public_id = ? AND status = 'delete_pending'`, [
          record.publicId,
        ]);
      } catch {
        // 权威记录保留为 delete_pending，交给后续清理任务重试。
      }
      throw error;
    }
  } finally {
    if (file?.path) await fs.unlink(file.path).catch(() => {});
  }
}

export async function removeCommunityChatCustomSticker({
  user,
  stickerPublicId,
  env = process.env,
  db = pool,
  deleteObject = deleteObjectFromObs,
}) {
  assertRegisteredUser(user);
  await assertCommunityChatMessagingAccess({ user, env, db });
  const publicId = normalizePublicId(stickerPublicId);
  const connection = await db.getConnection();
  let objectKey = '';
  let retainedForMessages = false;
  try {
    await connection.beginTransaction();
    const sticker = await queryFirst(
      connection,
      `SELECT object_key AS objectKey, status
         FROM community_chat_custom_stickers
        WHERE public_id = ? AND user_id = ?
        LIMIT 1 FOR UPDATE`,
      [publicId, user.id],
    );
    if (!sticker || sticker.status === 'removed') {
      await connection.commit();
      return { publicId, removed: true, retainedForMessages: Boolean(sticker) };
    }
    if (sticker.status !== 'active') {
      throw chatError(
        'CUSTOM_STICKER_UNAVAILABLE',
        409,
        '这个表情正在处理，请稍后重试',
        'This sticker is being processed',
      );
    }
    const reference = await queryFirst(
      connection,
      `SELECT 1
         FROM community_chat_messages
        WHERE message_kind = 'sticker'
          AND sticker_source = 'custom'
          AND sticker_key = ?
          AND status IN ('active', 'recalled')
        LIMIT 1`,
      [publicId],
    );
    objectKey = sticker.objectKey;
    retainedForMessages = Boolean(reference);
    await connection.query(
      `UPDATE community_chat_custom_stickers
          SET status = ?
        WHERE public_id = ? AND user_id = ? AND status = 'active'`,
      [retainedForMessages ? 'removed' : 'deleting', publicId, user.id],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  if (!retainedForMessages) {
    try {
      await deleteObject(objectKey);
      await db.query(`DELETE FROM community_chat_custom_stickers WHERE public_id = ? AND status = 'deleting'`, [
        publicId,
      ]);
    } catch {
      await db.query(
        `UPDATE community_chat_custom_stickers SET status = 'delete_pending' WHERE public_id = ? AND status = 'deleting'`,
        [publicId],
      );
      return { publicId, removed: true, retainedForMessages: false, cleanupPending: true };
    }
  }
  return { publicId, removed: true, retainedForMessages };
}

export async function getCommunityChatCustomStickerDownload({
  user,
  stickerPublicId,
  env = process.env,
  db = pool,
  createSignedUrl = createDownloadSignedUrl,
}) {
  const publicId = normalizePublicId(stickerPublicId);
  const { memberRole } = await assertCommunityChatReadAccess({ user, env, db });
  const viewerUserId = user?.id && user.role !== 'visitor' ? user.id : '';
  const canViewRecalled = memberRole === 'admin' || memberRole === 'moderator';
  const sticker = await queryFirst(
    db,
    `SELECT sticker.object_key AS objectKey, sticker.content_type AS contentType
       FROM community_chat_custom_stickers sticker
      WHERE sticker.public_id = ?
        AND (
          (sticker.user_id = ? AND sticker.status = 'active')
          OR EXISTS (
            SELECT 1
              FROM community_chat_messages message
              JOIN community_chat_rooms room ON room.id = message.room_id
             WHERE message.message_kind = 'sticker'
               AND message.sticker_source = 'custom'
               AND message.sticker_key = sticker.public_id
               AND (message.status = 'active' OR (? = 1 AND message.status = 'recalled'))
               AND room.status = 'active'
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
    [publicId, viewerUserId, canViewRecalled ? 1 : 0, viewerUserId, viewerUserId],
  );
  if (!sticker) {
    throw chatError('CUSTOM_STICKER_NOT_FOUND', 404, '表情不存在或当前不可查看', 'Sticker not found or unavailable');
  }
  const signed = createSignedUrl({ objectKey: sticker.objectKey, expires: 300 });
  if (!signed?.url) {
    throw chatError('CUSTOM_STICKER_UNAVAILABLE', 503, '表情暂时无法打开', 'Sticker is temporarily unavailable');
  }
  return { signedUrl: signed.url, contentType: sticker.contentType };
}

export async function cleanupCommunityChatCustomStickers({
  db = pool,
  deleteObject = deleteObjectFromObs,
  limit = 50,
} = {}) {
  const safeLimit = Math.min(200, Math.max(1, Math.floor(Number(limit) || 50)));
  const [rows] = await db.query(
    `SELECT sticker.public_id AS publicId, sticker.object_key AS objectKey
       FROM community_chat_custom_stickers sticker
      WHERE sticker.status = 'delete_pending'
         OR (
           sticker.status IN ('uploading', 'deleting')
           AND sticker.update_time <= DATE_SUB(NOW(), INTERVAL 15 MINUTE)
         )
         OR (
           sticker.status = 'removed'
           AND NOT EXISTS (
             SELECT 1
               FROM community_chat_messages message
              WHERE message.message_kind = 'sticker'
                AND message.sticker_source = 'custom'
                AND message.sticker_key = sticker.public_id
                AND message.status IN ('active', 'recalled')
           )
         )
      ORDER BY sticker.update_time ASC, sticker.id ASC
      LIMIT ?`,
    [safeLimit],
  );
  let removed = 0;
  for (const row of rows) {
    const [claimed] = await db.query(
      `UPDATE community_chat_custom_stickers sticker
          SET status = 'deleting', update_time = CURRENT_TIMESTAMP
        WHERE sticker.public_id = ?
          AND (
            sticker.status = 'delete_pending'
            OR (
              sticker.status IN ('uploading', 'deleting')
              AND sticker.update_time <= DATE_SUB(NOW(), INTERVAL 15 MINUTE)
            )
            OR (
              sticker.status = 'removed'
              AND NOT EXISTS (
                SELECT 1
                  FROM community_chat_messages message
                 WHERE message.message_kind = 'sticker'
                   AND message.sticker_source = 'custom'
                   AND message.sticker_key = sticker.public_id
                   AND message.status IN ('active', 'recalled')
              )
            )
          )`,
      [row.publicId],
    );
    if (!Number(claimed?.affectedRows || 0)) continue;
    try {
      await deleteObject(row.objectKey);
      await db.query(
        `DELETE FROM community_chat_custom_stickers
          WHERE public_id = ? AND status = 'deleting'`,
        [row.publicId],
      );
      removed += 1;
    } catch {
      await db.query(
        `UPDATE community_chat_custom_stickers
            SET status = 'delete_pending'
          WHERE public_id = ? AND status = 'deleting'`,
        [row.publicId],
      );
    }
  }
  return { scanned: rows.length, removed };
}

export async function startCommunityChatCustomStickerCleanupScheduler({
  db = pool,
  deleteObject = deleteObjectFromObs,
  intervalMs = CUSTOM_STICKER_CLEANUP_INTERVAL_MS,
  limit = 100,
} = {}) {
  if (customStickerCleanupTimer) return customStickerCleanupTimer;
  const safeIntervalMs = Math.max(60_000, Math.floor(Number(intervalMs) || CUSTOM_STICKER_CLEANUP_INTERVAL_MS));
  const runCleanup = async () => {
    if (customStickerCleanupRunning) return;
    customStickerCleanupRunning = true;
    try {
      await cleanupCommunityChatCustomStickers({ db, deleteObject, limit });
    } catch (error) {
      console.error('[community-chat] 自定义表情清理失败 code=%s', stableAgentErrorCode(error));
    } finally {
      customStickerCleanupRunning = false;
    }
  };

  await runCleanup();
  customStickerCleanupTimer = setInterval(() => void runCleanup(), safeIntervalMs);
  customStickerCleanupTimer.unref?.();
  return customStickerCleanupTimer;
}

export const __test__ = { normalizeName, normalizePublicId, publicSticker };
