import { randomUUID } from 'node:crypto';
import pool from '../../db/index.js';
import { COMMUNITY_CHAT_PRIMARY_ROOM_SLUG, getCommunityChatFeatureState } from '../communityChatFeature.js';
import { ACHIEVEMENTS, MAX_LEVEL, levelForExp, rankOf } from '../growth.js';
import { titleName } from '../points.js';
import {
  CommunityChatError,
  assertCommunityChatMessagingAccess,
  assertCommunityChatPostingEnabled,
  assertCommunityChatReadAccess,
} from './communityChatAccessService.js';
import { assertCommunityChatPostingAllowed, getCommunityChatBlockedUserIds } from './communityChatModerationService.js';
import { publishCommunityChatRealtimeEvent } from '../communityChat/realtimeBroker.js';
import { deliverCommunityChatMessageNotifications } from './communityChatNotificationService.js';
import { COMMUNITY_CHAT_IMAGE_MAX_COUNT } from './communityChatImageService.js';

const MAX_MESSAGE_LENGTH = 2000;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const MAX_MENTION_TARGETS = 5;
const ROOM_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9:_-]{8,64}$/;

const chatError = (code, status, zhMessage, enMessage) => new CommunityChatError(code, status, zhMessage, enMessage);

function normalizeIdentifier(value, maxLength, fieldName) {
  const normalized = String(value || '').trim();
  if (!normalized || Array.from(normalized).length > maxLength) {
    throw chatError('INVALID_INPUT', 400, `${fieldName}无效`, `Invalid ${fieldName}`);
  }
  return normalized;
}

function normalizeRoomSlug(value) {
  const slug = normalizeIdentifier(value, 64, '频道');
  if (!ROOM_SLUG_PATTERN.test(slug)) {
    throw chatError('INVALID_ROOM', 400, '频道标识无效', 'Invalid room identifier');
  }
  if (slug !== COMMUNITY_CHAT_PRIMARY_ROOM_SLUG) {
    throw chatError('COMMUNITY_CHAT_ROOM_NOT_FOUND', 404, '聊天室不存在或已归档', 'Room not found or archived');
  }
  return slug;
}

function normalizeClientRequestId(value) {
  const requestId = normalizeIdentifier(value, 64, '请求标识');
  if (!REQUEST_ID_PATTERN.test(requestId)) {
    throw chatError('INVALID_REQUEST_ID', 400, '发送请求标识无效', 'Invalid message request identifier');
  }
  return requestId;
}

function normalizePublicMessageId(value, { optional = false } = {}) {
  const publicId = String(value || '').trim();
  if (!publicId && optional) return null;
  if (!publicId || publicId.length > 36 || !/^[A-Za-z0-9-]+$/.test(publicId)) {
    throw chatError('INVALID_MESSAGE_ID', 400, '消息标识无效', 'Invalid message identifier');
  }
  return publicId;
}

function normalizeMentionMessagePublicIds(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw chatError('INVALID_MENTION_TARGETS', 400, '提及对象无效', 'Invalid mention targets');
  }
  const normalized = [...new Set(value.map((item) => normalizePublicMessageId(item)))];
  if (normalized.length > MAX_MENTION_TARGETS) {
    throw chatError(
      'TOO_MANY_MENTION_TARGETS',
      400,
      `每条消息最多提及 ${MAX_MENTION_TARGETS} 位成员`,
      `A message can mention at most ${MAX_MENTION_TARGETS} members`,
    );
  }
  return normalized;
}

function normalizeImagePublicIds(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw chatError('INVALID_IMAGE_ATTACHMENTS', 400, '图片附件无效', 'Invalid image attachments');
  }
  const normalized = [...new Set(value.map((item) => normalizePublicMessageId(item)))];
  if (normalized.length > COMMUNITY_CHAT_IMAGE_MAX_COUNT) {
    throw chatError(
      'TOO_MANY_IMAGE_ATTACHMENTS',
      400,
      `每条消息最多发送 ${COMMUNITY_CHAT_IMAGE_MAX_COUNT} 张图片`,
      `A message can include at most ${COMMUNITY_CHAT_IMAGE_MAX_COUNT} images`,
    );
  }
  return normalized;
}

function normalizeMessageContent(value, { allowEmpty = false } = {}) {
  const content = String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
  const length = Array.from(content).length;
  if (!length && !allowEmpty) {
    throw chatError('MESSAGE_EMPTY', 400, '消息内容不能为空', 'Message content cannot be empty');
  }
  if (length > MAX_MESSAGE_LENGTH) {
    throw chatError(
      'MESSAGE_TOO_LONG',
      400,
      `消息不能超过 ${MAX_MESSAGE_LENGTH} 个字符`,
      `Messages cannot exceed ${MAX_MESSAGE_LENGTH} characters`,
    );
  }
  return content;
}

function normalizePageSize(value) {
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(value) || DEFAULT_PAGE_SIZE)));
}

async function queryFirst(db, sql, params = []) {
  const [rows] = await db.query(sql, params);
  return rows[0] || null;
}

async function loadRoom(db, roomSlug, { lock = false } = {}) {
  const room = await queryFirst(
    db,
    `SELECT id, slug, type, status, slow_mode_seconds AS slowModeSeconds
       FROM community_chat_rooms
      WHERE slug = ? AND status = 'active'
      LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [roomSlug],
  );
  if (!room) {
    throw chatError('COMMUNITY_CHAT_ROOM_NOT_FOUND', 404, '频道不存在或已暂停', 'Room not found or paused');
  }
  return room;
}

const MESSAGE_SELECT = `
  SELECT message.id AS internalId, message.public_id AS publicId, message.room_id AS roomId,
         message.user_id AS userId, message.content, message.status,
         message.create_time AS createdAt, message.edited_at AS editedAt,
         account.role AS authorAccountRole,
         CASE WHEN account.del_flag = '0' THEN COALESCE(NULLIF(account.alias, ''), '') ELSE '' END AS authorName,
         CASE
           WHEN account.role = 'root' THEN 'official'
           WHEN membership.role = 'moderator' AND membership.status = 'active' THEN 'moderator'
           ELSE 'member'
         END AS authorRole,
         CASE
           WHEN account.del_flag = '0'
             AND (
               account.head_picture LIKE 'https://%'
               OR account.head_picture LIKE 'http://%'
               OR (
                 account.head_picture LIKE 'data:image/%;base64,%'
                 AND OCTET_LENGTH(account.head_picture) <= 524288
               )
             )
             THEN account.head_picture
           ELSE ''
         END AS authorAvatar,
         COALESCE(growth.exp, 0) AS authorExp,
         growth.equipped_title AS authorTitleId,
         growth.equipped_frame AS authorFrameId,
         reply.public_id AS replyPublicId,
         reply.user_id AS replyUserId,
         CASE WHEN reply.status = 'active' THEN LEFT(reply.content, 280) ELSE '' END AS replyContent,
         CASE WHEN reply.status = 'active' THEN reply.status ELSE COALESCE(reply.status, '') END AS replyStatus,
         CASE
           WHEN reply.status = 'active' AND reply_account.del_flag = '0'
             THEN COALESCE(NULLIF(reply_account.alias, ''), '')
           ELSE ''
         END AS replyAuthorName,
         (
           SELECT COUNT(*)
             FROM community_chat_message_images reply_image
            WHERE reply_image.message_id = reply.id AND reply_image.status = 'attached'
         ) AS replyImageCount
    FROM community_chat_messages message
    LEFT JOIN user account ON account.id = message.user_id
    LEFT JOIN community_chat_members membership ON membership.user_id = message.user_id
    LEFT JOIN user_growth growth ON growth.user_id = message.user_id
    LEFT JOIN community_chat_messages reply ON reply.id = message.reply_to_id
    LEFT JOIN user reply_account ON reply_account.id = reply.user_id`;

function publicGrowthProfile(row) {
  const level = row.authorAccountRole === 'root' ? MAX_LEVEL : levelForExp(Number(row.authorExp || 0));
  return {
    level,
    levelName: rankOf(level).name,
    title: titleName(row.authorTitleId) || null,
  };
}

function toPublicImage(row) {
  return {
    publicId: row.publicId,
    url: `/api/community-chat/images/${encodeURIComponent(row.publicId)}`,
    contentType: row.contentType,
    fileSize: Number(row.fileSize || 0),
    width: Number(row.width || 0),
    height: Number(row.height || 0),
  };
}

async function loadMessageImages(db, rows) {
  const messageIds = [
    ...new Set(rows.map((row) => Number(row.internalId)).filter((id) => Number.isInteger(id) && id > 0)),
  ];
  const byMessageId = new Map();
  if (!messageIds.length) return byMessageId;
  const placeholders = messageIds.map(() => '?').join(',');
  const [imageRows] = await db.query(
    `SELECT message_id AS messageId, public_id AS publicId, content_type AS contentType,
            file_size AS fileSize, width, height
       FROM community_chat_message_images
      WHERE message_id IN (${placeholders}) AND status = 'attached'
      ORDER BY message_id ASC, sort_order ASC, id ASC`,
    messageIds,
  );
  for (const image of imageRows) {
    const messageId = Number(image.messageId);
    const items = byMessageId.get(messageId) || [];
    items.push(toPublicImage(image));
    byMessageId.set(messageId, items);
  }
  return byMessageId;
}

function toPublicMessage(row, viewerUserId, blockedUserIds = new Set(), images = []) {
  const replyBlocked = Boolean(row.replyUserId && blockedUserIds.has(row.replyUserId));
  const growth = publicGrowthProfile(row);
  return {
    publicId: row.publicId,
    content: row.content,
    status: row.status,
    createdAt: row.createdAt,
    editedAt: row.editedAt || null,
    isOwn: row.userId === viewerUserId,
    images,
    author: {
      name: row.authorName || '',
      role: row.authorRole || 'member',
      avatar: row.authorAvatar || '',
      frameId: row.authorFrameId || null,
      ...growth,
    },
    reply: row.replyPublicId
      ? {
          publicId: row.replyPublicId,
          content: replyBlocked ? '' : row.replyContent || '',
          status: replyBlocked ? 'blocked' : row.replyStatus || 'unavailable',
          authorName: replyBlocked ? '' : row.replyAuthorName || '',
          hasImages: replyBlocked ? false : Boolean(Number(row.replyImageCount || 0)),
        }
      : null,
  };
}

/**
 * 通过消息公有 ID 解析作者公开名片。客户端永远拿不到内部账号 ID、邮箱、经验值或资源统计。
 */
export async function getCommunityChatMessageAuthorProfile({ user, messagePublicId, env = process.env, db = pool }) {
  const normalizedMessagePublicId = normalizePublicMessageId(messagePublicId);
  await assertCommunityChatReadAccess({ user, env, db });
  const viewerUserId = user?.id && user?.role !== 'visitor' ? user.id : '';
  const profile = await queryFirst(
    db,
    `SELECT message.user_id AS authorUserId,
            account.role AS authorAccountRole,
            CASE WHEN account.del_flag = '0' THEN COALESCE(NULLIF(account.alias, ''), '') ELSE '' END AS authorName,
            CASE
              WHEN account.role = 'root' THEN 'official'
              WHEN membership.role = 'moderator' AND membership.status = 'active' THEN 'moderator'
              ELSE 'member'
            END AS authorRole,
            CASE
              WHEN account.del_flag = '0'
                AND (
                  account.head_picture LIKE 'https://%'
                  OR account.head_picture LIKE 'http://%'
                  OR (
                    account.head_picture LIKE 'data:image/%;base64,%'
                    AND OCTET_LENGTH(account.head_picture) <= 524288
                  )
                )
                THEN account.head_picture
              ELSE ''
            END AS authorAvatar,
            COALESCE(growth.exp, 0) AS authorExp,
            growth.equipped_title AS authorTitleId,
            growth.equipped_frame AS authorFrameId
       FROM community_chat_messages message
       JOIN community_chat_rooms room ON room.id = message.room_id
       JOIN user account ON account.id = message.user_id
       LEFT JOIN community_chat_members membership ON membership.user_id = message.user_id
       LEFT JOIN user_growth growth ON growth.user_id = message.user_id
      WHERE message.public_id = ?
        AND message.status = 'active'
        AND room.slug = ?
        AND room.status = 'active'
        AND account.del_flag = '0'
        AND NOT EXISTS (
          SELECT 1 FROM community_chat_blocks blocked
           WHERE blocked.user_id = ? AND blocked.blocked_user_id = message.user_id
        )
      LIMIT 1`,
    [normalizedMessagePublicId, COMMUNITY_CHAT_PRIMARY_ROOM_SLUG, viewerUserId],
  );
  if (!profile) {
    throw chatError(
      'COMMUNITY_CHAT_AUTHOR_PROFILE_NOT_FOUND',
      404,
      '该用户资料当前不可查看',
      'This member profile is not available',
    );
  }

  const [achievementRows] = await db.query(
    `SELECT ref, MAX(id) AS latestId
       FROM points_log
      WHERE user_id = ? AND reason IN ('achievement', 'ach_unlock') AND ref IS NOT NULL
      GROUP BY ref
      ORDER BY latestId DESC`,
    [profile.authorUserId],
  );
  const knownAchievements = new Map(ACHIEVEMENTS.map((achievement) => [achievement.key, achievement]));
  const unlockedKeys = new Set(
    achievementRows.map((row) => String(row.ref || '')).filter((key) => knownAchievements.has(key)),
  );
  const growth = publicGrowthProfile(profile);
  for (const achievement of ACHIEVEMENTS) {
    if (achievement.group === 'level' && growth.level >= achievement.target) unlockedKeys.add(achievement.key);
  }
  const achievements = ACHIEVEMENTS.filter((achievement) => unlockedKeys.has(achievement.key)).map(
    ({ key, group }) => ({ key, group }),
  );

  return {
    name: profile.authorName || '',
    role: profile.authorRole || 'member',
    avatar: profile.authorAvatar || '',
    frameId: profile.authorFrameId || null,
    ...growth,
    achievements,
    achievementCount: achievements.length,
  };
}

async function loadMessageByPublicId(db, publicId, viewerUserId) {
  const [rows] = await db.query(`${MESSAGE_SELECT} WHERE message.public_id = ? LIMIT 1`, [publicId]);
  if (!rows[0]) return null;
  const images = await loadMessageImages(db, rows);
  return toPublicMessage(rows[0], viewerUserId, new Set(), images.get(Number(rows[0].internalId)) || []);
}

async function loadIdempotentMessage(db, userId, clientRequestId, { lock = false } = {}) {
  return queryFirst(
    db,
    `SELECT message.id AS internalId, message.public_id AS publicId, message.room_id AS roomId, message.content,
            message.reply_to_id AS replyToId, reply.public_id AS replyPublicId
       FROM community_chat_messages message
       LEFT JOIN community_chat_messages reply ON reply.id = message.reply_to_id
      WHERE message.user_id = ? AND message.client_request_id = ?
      LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [userId, clientRequestId],
  );
}

async function loadAttachedImagePublicIds(db, messageId) {
  const [rows] = await db.query(
    `SELECT public_id AS publicId
       FROM community_chat_message_images
      WHERE message_id = ? AND status = 'attached'
      ORDER BY sort_order ASC, id ASC`,
    [messageId],
  );
  return rows.map((row) => row.publicId);
}

async function resolvePendingImages(db, { ownerUserId, publicIds }) {
  if (!publicIds.length) return [];
  const placeholders = publicIds.map(() => '?').join(',');
  const [rows] = await db.query(
    `SELECT id, public_id AS publicId, status, message_id AS messageId, expires_at AS expiresAt
       FROM community_chat_message_images
      WHERE owner_user_id = ? AND public_id IN (${placeholders})
      FOR UPDATE`,
    [ownerUserId, ...publicIds],
  );
  const byPublicId = new Map(rows.map((row) => [row.publicId, row]));
  const now = Date.now();
  const ordered = publicIds.map((publicId) => byPublicId.get(publicId));
  if (
    ordered.some(
      (image) =>
        !image ||
        image.status !== 'pending' ||
        image.messageId !== null ||
        !image.expiresAt ||
        new Date(image.expiresAt).getTime() <= now,
    )
  ) {
    throw chatError(
      'COMMUNITY_CHAT_IMAGE_UNAVAILABLE',
      409,
      '有图片已失效或不属于当前账号，请重新选择',
      'An image expired or does not belong to this account. Select it again.',
    );
  }
  return ordered;
}

async function resolveMentionTargetUserIds(db, { roomId, senderUserId, publicIds }) {
  if (!publicIds.length) return [];
  const placeholders = publicIds.map(() => '?').join(',');
  const [rows] = await db.query(
    `SELECT message.public_id AS publicId, message.user_id AS userId
       FROM community_chat_messages message
       JOIN user account ON account.id = message.user_id AND account.del_flag = 0
      WHERE message.room_id = ?
        AND message.public_id IN (${placeholders})
        AND message.status = 'active'
        AND message.user_id <> ?
        AND NOT EXISTS (
          SELECT 1
            FROM community_chat_blocks blocked
           WHERE blocked.user_id = ? AND blocked.blocked_user_id = message.user_id
        )
      FOR UPDATE`,
    [roomId, ...publicIds, senderUserId, senderUserId],
  );
  if (rows.length !== publicIds.length) {
    throw chatError(
      'MENTION_TARGET_UNAVAILABLE',
      409,
      '要提及的成员已不可用',
      'A member being mentioned is unavailable',
    );
  }
  return [...new Set(rows.map((row) => String(row.userId || '')).filter(Boolean))];
}

function assertIdempotentPayload(existing, roomId, content, replyPublicId, existingImagePublicIds, imagePublicIds) {
  if (
    Number(existing.roomId) !== Number(roomId) ||
    existing.content !== content ||
    (existing.replyPublicId || null) !== (replyPublicId || null) ||
    existingImagePublicIds.length !== imagePublicIds.length ||
    existingImagePublicIds.some((publicId, index) => publicId !== imagePublicIds[index])
  ) {
    throw chatError(
      'MESSAGE_REQUEST_ID_CONFLICT',
      409,
      '该发送请求标识已经用于另一条消息',
      'This message request identifier was already used for a different payload',
    );
  }
}

export async function listCommunityChatMessages({
  user,
  roomSlug,
  before,
  focus,
  limit,
  env = process.env,
  db = pool,
}) {
  const normalizedRoomSlug = normalizeRoomSlug(roomSlug);
  const beforePublicId = normalizePublicMessageId(before, { optional: true });
  const focusPublicId = normalizePublicMessageId(focus, { optional: true });
  if (beforePublicId && focusPublicId) {
    throw chatError(
      'MESSAGE_CURSOR_CONFLICT',
      400,
      '历史游标和消息定位不能同时使用',
      'History cursor and message focus cannot be used together',
    );
  }
  const pageSize = normalizePageSize(limit);
  const { feature } = await assertCommunityChatReadAccess({ user, env, db });
  const room = await loadRoom(db, normalizedRoomSlug);
  const viewerUserId = user?.id && user?.role !== 'visitor' ? user.id : '';
  const blockedUserIds = viewerUserId ? await getCommunityChatBlockedUserIds({ userId: viewerUserId, db }) : new Set();

  let beforeId = null;
  let focusId = null;
  let hasNewer = false;
  if (beforePublicId) {
    const cursor = await queryFirst(
      db,
      `SELECT id FROM community_chat_messages WHERE room_id = ? AND public_id = ? LIMIT 1`,
      [room.id, beforePublicId],
    );
    if (!cursor) {
      throw chatError('MESSAGE_CURSOR_INVALID', 400, '历史消息游标已失效', 'The message history cursor is invalid');
    }
    beforeId = cursor.id;
  }
  if (focusPublicId) {
    const focusedMessage = await queryFirst(
      db,
      `SELECT message.id
         FROM community_chat_messages message
        WHERE message.room_id = ?
          AND message.public_id = ?
          AND message.status = 'active'
          AND NOT EXISTS (
            SELECT 1 FROM community_chat_blocks blocked
             WHERE blocked.user_id = ? AND blocked.blocked_user_id = message.user_id
          )
        LIMIT 1`,
      [room.id, focusPublicId, viewerUserId],
    );
    if (!focusedMessage) {
      throw chatError(
        'COMMUNITY_CHAT_MESSAGE_NOT_VISIBLE',
        404,
        '来源消息已不可用或当前不可见',
        'The source message is unavailable or no longer visible',
      );
    }
    focusId = focusedMessage.id;
    hasNewer = Boolean(
      await queryFirst(
        db,
        `SELECT message.id
           FROM community_chat_messages message
          WHERE message.room_id = ?
            AND message.id > ?
            AND message.status = 'active'
            AND NOT EXISTS (
              SELECT 1 FROM community_chat_blocks blocked
               WHERE blocked.user_id = ? AND blocked.blocked_user_id = message.user_id
            )
          ORDER BY message.id ASC
          LIMIT 1`,
        [room.id, focusId, viewerUserId],
      ),
    );
  }

  const cursorClause = beforeId !== null ? 'AND message.id < ?' : focusId !== null ? 'AND message.id <= ?' : '';
  const cursorId = beforeId ?? focusId;
  const params =
    cursorId === null ? [room.id, viewerUserId, pageSize + 1] : [room.id, viewerUserId, cursorId, pageSize + 1];
  const [rows] = await db.query(
    `${MESSAGE_SELECT}
      WHERE message.room_id = ? AND message.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM community_chat_blocks blocked
           WHERE blocked.user_id = ? AND blocked.blocked_user_id = message.user_id
        )
        ${cursorClause}
      ORDER BY message.id DESC
      LIMIT ?`,
    params,
  );
  const hasMore = rows.length > pageSize;
  if (hasMore) rows.pop();
  rows.reverse();
  const images = await loadMessageImages(db, rows);
  const items = rows.map((row) =>
    toPublicMessage(row, viewerUserId, blockedUserIds, images.get(Number(row.internalId)) || []),
  );

  return {
    roomSlug: room.slug,
    items,
    hasMore,
    nextBefore: hasMore && items.length ? items[0].publicId : null,
    focusPublicId: focusPublicId || null,
    hasNewer,
    realtimeEnabled: feature.realtimeEnabled,
    pollingAfterMs: feature.realtimeEnabled ? null : 8000,
    serverTime: new Date().toISOString(),
  };
}

export async function createCommunityChatMessage({
  user,
  roomSlug,
  clientRequestId,
  content,
  replyToPublicId,
  mentionMessagePublicIds,
  imagePublicIds,
  env = process.env,
  db = pool,
}) {
  const normalizedRoomSlug = normalizeRoomSlug(roomSlug);
  const normalizedRequestId = normalizeClientRequestId(clientRequestId);
  const normalizedImagePublicIds = normalizeImagePublicIds(imagePublicIds);
  const normalizedContent = normalizeMessageContent(content, { allowEmpty: normalizedImagePublicIds.length > 0 });
  const normalizedReplyPublicId = normalizePublicMessageId(replyToPublicId, { optional: true });
  const normalizedMentionPublicIds = normalizeMentionMessagePublicIds(mentionMessagePublicIds);

  if (!getCommunityChatFeatureState(env).messagingEnabled) {
    throw chatError(
      'COMMUNITY_CHAT_MESSAGING_CLOSED',
      403,
      '聊天室消息试点当前未开放',
      'The community messaging pilot is currently closed',
    );
  }

  const connection = await db.getConnection();
  let expectedRoomId = null;
  try {
    await connection.beginTransaction();
    const { memberRole } = await assertCommunityChatMessagingAccess({ user, env, db: connection, lock: true });
    await assertCommunityChatPostingEnabled({ env, db: connection, lock: true });
    await assertCommunityChatPostingAllowed({ user, db: connection, lock: true });
    const room = await loadRoom(connection, normalizedRoomSlug, { lock: true });
    expectedRoomId = room.id;

    const existing = await loadIdempotentMessage(connection, user.id, normalizedRequestId, { lock: true });
    if (existing) {
      const existingImages = await loadAttachedImagePublicIds(connection, existing.internalId);
      assertIdempotentPayload(
        existing,
        room.id,
        normalizedContent,
        normalizedReplyPublicId,
        existingImages,
        normalizedImagePublicIds,
      );
      const message = await loadMessageByPublicId(connection, existing.publicId, user.id);
      await connection.commit();
      return { message, idempotent: true };
    }

    if (room.type === 'announcement' && !['admin', 'moderator'].includes(memberRole)) {
      throw chatError(
        'ANNOUNCEMENT_POST_FORBIDDEN',
        403,
        '公告频道仅允许官方与管理员发布',
        'Only official accounts and moderators can post announcements',
      );
    }

    const mentionedUserIds = await resolveMentionTargetUserIds(connection, {
      roomId: room.id,
      senderUserId: user.id,
      publicIds: normalizedMentionPublicIds,
    });
    const pendingImages = await resolvePendingImages(connection, {
      ownerUserId: user.id,
      publicIds: normalizedImagePublicIds,
    });

    let replyToId = null;
    if (normalizedReplyPublicId) {
      const reply = await queryFirst(
        connection,
        `SELECT id FROM community_chat_messages
          WHERE room_id = ? AND public_id = ? AND status = 'active'
            AND NOT EXISTS (
              SELECT 1 FROM community_chat_blocks blocked
               WHERE blocked.user_id = ? AND blocked.blocked_user_id = community_chat_messages.user_id
            )
          LIMIT 1 FOR UPDATE`,
        [room.id, normalizedReplyPublicId, user.id],
      );
      if (!reply) {
        throw chatError(
          'REPLY_MESSAGE_UNAVAILABLE',
          409,
          '要回复的消息已不可用',
          'The message being replied to is unavailable',
        );
      }
      replyToId = reply.id;
    }

    const slowModeSeconds = Math.max(0, Number(room.slowModeSeconds || 0));
    if (slowModeSeconds > 0 && !['admin', 'moderator'].includes(memberRole)) {
      const latestOwnMessage = await queryFirst(
        connection,
        `SELECT TIMESTAMPDIFF(SECOND, create_time, NOW()) AS elapsedSeconds
           FROM community_chat_messages
          WHERE room_id = ? AND user_id = ? AND status = 'active'
          ORDER BY id DESC
          LIMIT 1`,
        [room.id, user.id],
      );
      if (latestOwnMessage && Number(latestOwnMessage.elapsedSeconds) < slowModeSeconds) {
        throw chatError(
          'COMMUNITY_CHAT_SLOW_MODE',
          429,
          '发送过于频繁，请稍后再试',
          'You are sending too quickly. Please wait and try again.',
        );
      }
    }

    const publicId = randomUUID();
    const [insertResult] = await connection.query(
      `INSERT INTO community_chat_messages
         (public_id, room_id, user_id, client_request_id, reply_to_id, content, status)
       VALUES (?, ?, ?, ?, ?, ?, 'active')`,
      [publicId, room.id, user.id, normalizedRequestId, replyToId, normalizedContent],
    );
    const messageId = insertResult.insertId;
    for (const [sortOrder, image] of pendingImages.entries()) {
      const [attached] = await connection.query(
        `UPDATE community_chat_message_images
            SET message_id = ?, status = 'attached', sort_order = ?, expires_at = NULL
          WHERE id = ? AND owner_user_id = ? AND status = 'pending' AND message_id IS NULL`,
        [messageId, sortOrder, image.id, user.id],
      );
      if (Number(attached?.affectedRows || 0) !== 1) {
        throw chatError(
          'COMMUNITY_CHAT_IMAGE_UNAVAILABLE',
          409,
          '有图片已失效，请重新选择',
          'An image is no longer available. Select it again.',
        );
      }
    }
    if (mentionedUserIds.length) {
      const mentionValues = mentionedUserIds.map(() => '(?, ?)').join(',');
      await connection.query(
        `INSERT IGNORE INTO community_chat_message_mentions (message_id, mentioned_user_id)
         VALUES ${mentionValues}`,
        mentionedUserIds.flatMap((mentionedUserId) => [messageId, mentionedUserId]),
      );
    }
    await connection.query(`UPDATE community_chat_rooms SET last_message_id = ? WHERE id = ?`, [messageId, room.id]);
    await connection.query(
      `INSERT INTO community_chat_reads (room_id, user_id, last_read_message_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         last_read_message_id = GREATEST(last_read_message_id, VALUES(last_read_message_id)),
         update_time = CURRENT_TIMESTAMP`,
      [room.id, user.id, messageId],
    );
    const message = await loadMessageByPublicId(connection, publicId, user.id);
    await connection.commit();
    publishCommunityChatRealtimeEvent('message.created', {
      roomSlug: normalizedRoomSlug,
      messagePublicId: publicId,
    });
    try {
      await deliverCommunityChatMessageNotifications({ messagePublicId: publicId, env, db });
    } catch (error) {
      // 消息已经提交；提醒是附加能力，失败不能把成功消息伪装成发送失败。
      console.error('[community-chat] 站内提醒投递失败 code=%s', error?.code || error?.name || 'UNKNOWN');
    }
    return { message, idempotent: false };
  } catch (error) {
    await connection.rollback();
    if (error?.code === 'ER_DUP_ENTRY' && expectedRoomId !== null && typeof db.query === 'function') {
      const existing = await loadIdempotentMessage(db, user.id, normalizedRequestId);
      if (existing) {
        const existingImages = await loadAttachedImagePublicIds(db, existing.internalId);
        assertIdempotentPayload(
          existing,
          expectedRoomId,
          normalizedContent,
          normalizedReplyPublicId,
          existingImages,
          normalizedImagePublicIds,
        );
        const message = await loadMessageByPublicId(db, existing.publicId, user.id);
        if (message) return { message, idempotent: true };
      }
    }
    throw error;
  } finally {
    connection.release();
  }
}

export async function markCommunityChatRoomRead({ user, roomSlug, lastMessagePublicId, env = process.env, db = pool }) {
  const normalizedRoomSlug = normalizeRoomSlug(roomSlug);
  const normalizedMessagePublicId = normalizePublicMessageId(lastMessagePublicId, { optional: true });
  if (!getCommunityChatFeatureState(env).messagingEnabled) {
    throw chatError(
      'COMMUNITY_CHAT_MESSAGING_CLOSED',
      403,
      '聊天室消息试点当前未开放',
      'The community messaging pilot is currently closed',
    );
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await assertCommunityChatMessagingAccess({ user, env, db: connection, lock: true });
    const room = await loadRoom(connection, normalizedRoomSlug);
    const target = normalizedMessagePublicId
      ? await queryFirst(
          connection,
          `SELECT id, public_id AS publicId
             FROM community_chat_messages
            WHERE room_id = ? AND public_id = ? AND status = 'active'
            LIMIT 1`,
          [room.id, normalizedMessagePublicId],
        )
      : await queryFirst(
          connection,
          `SELECT id, public_id AS publicId
             FROM community_chat_messages
            WHERE room_id = ? AND status = 'active'
            ORDER BY id DESC
            LIMIT 1`,
          [room.id],
        );
    if (normalizedMessagePublicId && !target) {
      throw chatError('READ_MESSAGE_INVALID', 400, '已读位置不属于当前频道', 'The read position is not in this room');
    }

    if (target) {
      await connection.query(
        `INSERT INTO community_chat_reads (room_id, user_id, last_read_message_id)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
           last_read_message_id = GREATEST(last_read_message_id, VALUES(last_read_message_id)),
           update_time = CURRENT_TIMESTAMP`,
        [room.id, user.id, target.id],
      );
    }
    const unread = await queryFirst(
      connection,
      `SELECT COUNT(*) AS unreadCount
         FROM community_chat_messages message
        WHERE message.room_id = ? AND message.status = 'active' AND message.user_id <> ?
          AND NOT EXISTS (
            SELECT 1 FROM community_chat_blocks blocked
             WHERE blocked.user_id = ? AND blocked.blocked_user_id = message.user_id
          )
          AND message.id > COALESCE(
            (SELECT last_read_message_id FROM community_chat_reads WHERE room_id = ? AND user_id = ? LIMIT 1),
            0
          )`,
      [room.id, user.id, user.id, room.id, user.id],
    );
    await connection.commit();
    return {
      roomSlug: room.slug,
      lastReadMessagePublicId: target?.publicId || null,
      unreadCount: Number(unread?.unreadCount || 0),
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export const __test__ = {
  normalizeClientRequestId,
  normalizeImagePublicIds,
  normalizeMessageContent,
  normalizeMentionMessagePublicIds,
  normalizePageSize,
  normalizePublicMessageId,
  normalizeRoomSlug,
};
