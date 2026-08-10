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
const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;
const MAX_MENTION_TARGETS = 5;
export const COMMUNITY_CHAT_RECALL_WINDOW_SECONDS = 120;
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
         message.recalled_at AS recalledAt, message.recalled_by AS recalledBy,
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
             THEN 1
           ELSE 0
         END AS authorHasAvatar,
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

async function loadMessageLikes(db, rows, viewerUserId) {
  const messageIds = [
    ...new Set(rows.map((row) => Number(row.internalId)).filter((id) => Number.isInteger(id) && id > 0)),
  ];
  const byMessageId = new Map();
  if (!messageIds.length) return byMessageId;
  const placeholders = messageIds.map(() => '?').join(',');
  const [likeRows] = await db.query(
    `SELECT likes.message_id AS messageId, COUNT(*) AS likeCount,
            MAX(CASE WHEN likes.user_id = ? THEN 1 ELSE 0 END) AS likedByMe,
            GROUP_CONCAT(
              HEX(
                CASE
                  WHEN account.del_flag = '0' THEN COALESCE(NULLIF(account.alias, ''), '轻笺用户')
                  ELSE '轻笺用户'
                END
              )
              ORDER BY likes.create_time DESC, likes.user_id DESC
              SEPARATOR ','
            ) AS likerNamesHex
       FROM community_chat_message_likes likes
       LEFT JOIN user account ON account.id = likes.user_id
      WHERE likes.message_id IN (${placeholders})
      GROUP BY likes.message_id`,
    [viewerUserId || '', ...messageIds],
  );
  for (const row of likeRows) {
    const likePreview = String(row.likerNamesHex || '')
      .split(',')
      .map((encodedName) => {
        try {
          return Buffer.from(encodedName, 'hex').toString('utf8').trim();
        } catch {
          return '';
        }
      })
      .filter(Boolean)
      .slice(0, 3);
    byMessageId.set(Number(row.messageId), {
      likeCount: Number(row.likeCount || 0),
      likedByMe: Boolean(Number(row.likedByMe || 0)),
      likePreview,
    });
  }
  return byMessageId;
}

function canModerateMessages(memberRole) {
  return memberRole === 'admin' || memberRole === 'moderator';
}

function toPublicMessage(
  row,
  viewerUserId,
  blockedUserIds = new Set(),
  images = [],
  likes = {},
  { memberRole = 'visitor', now = Date.now(), authorAvatar = row.authorAvatar || '' } = {},
) {
  const replyBlocked = Boolean(row.replyUserId && blockedUserIds.has(row.replyUserId));
  const growth = publicGrowthProfile(row);
  const isOwn = row.userId === viewerUserId;
  const isRecalled = row.status === 'recalled';
  const canViewRecalledContent = isRecalled && canModerateMessages(memberRole);
  const contentVisible = !isRecalled || canViewRecalledContent;
  const createdAtMs = new Date(row.createdAt).getTime();
  const recallDeadlineAt =
    row.status === 'active' && isOwn && !canModerateMessages(memberRole) && Number.isFinite(createdAtMs)
      ? new Date(createdAtMs + COMMUNITY_CHAT_RECALL_WINDOW_SECONDS * 1000).toISOString()
      : null;
  const recallExpired = Boolean(
    recallDeadlineAt &&
    Number.isFinite(new Date(recallDeadlineAt).getTime()) &&
    new Date(recallDeadlineAt).getTime() < now,
  );
  const canRecall = row.status === 'active' && (canModerateMessages(memberRole) || isOwn);
  const canDelete = memberRole !== 'visitor' && ['active', 'recalled'].includes(row.status);
  return {
    publicId: row.publicId,
    content: contentVisible ? row.content : '',
    status: row.status,
    createdAt: row.createdAt,
    editedAt: row.editedAt || null,
    recalledAt: row.recalledAt || null,
    recalledByAdmin: Boolean(isRecalled && row.recalledBy && row.recalledBy !== row.userId),
    canViewRecalledContent,
    canRecall,
    recallExpired,
    canDelete,
    recallDeadlineAt,
    isOwn,
    images: contentVisible ? images : [],
    likeCount: row.status === 'active' ? Number(likes.likeCount || 0) : 0,
    likedByMe: row.status === 'active' && Boolean(likes.likedByMe),
    likePreview: row.status === 'active' ? likes.likePreview || [] : [],
    author: {
      name: row.authorName || '',
      role: row.authorRole || 'member',
      avatar: authorAvatar,
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
        AND message.status IN ('active', 'recalled')
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

/**
 * 头像通过消息公有 ID 延迟读取，避免一页消息重复携带同一份 base64 头像。
 * 列表正文先以短 URL 返回，同一作者在当前窗口复用 URL，浏览器再独立缓存头像。
 */
export async function getCommunityChatMessageAuthorAvatar({ user, messagePublicId, env = process.env, db = pool }) {
  const normalizedMessagePublicId = normalizePublicMessageId(messagePublicId);
  await assertCommunityChatReadAccess({ user, env, db });
  const viewerUserId = user?.id && user?.role !== 'visitor' ? user.id : '';
  const viewerVisibilityClause = viewerUserId
    ? `AND NOT EXISTS (
          SELECT 1 FROM community_chat_blocks blocked
           WHERE blocked.user_id = ? AND blocked.blocked_user_id = message.user_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM community_chat_message_deletions deletion
           WHERE deletion.user_id = ? AND deletion.message_id = message.id
        )`
    : '';
  const avatar = await queryFirst(
    db,
    `SELECT account.head_picture AS source
       FROM community_chat_messages message
       JOIN community_chat_rooms room ON room.id = message.room_id
       JOIN user account ON account.id = message.user_id AND account.del_flag = 0
      WHERE message.public_id = ?
        AND message.status IN ('active', 'recalled')
        AND room.slug = ?
        AND room.status = 'active'
        AND (
          account.head_picture LIKE 'https://%'
          OR account.head_picture LIKE 'http://%'
          OR (
            account.head_picture LIKE 'data:image/%;base64,%'
            AND OCTET_LENGTH(account.head_picture) <= 524288
          )
        )
        ${viewerVisibilityClause}
      LIMIT 1`,
    [
      normalizedMessagePublicId,
      COMMUNITY_CHAT_PRIMARY_ROOM_SLUG,
      ...(viewerUserId ? [viewerUserId, viewerUserId] : []),
    ],
  );
  if (!avatar?.source) {
    throw chatError('COMMUNITY_CHAT_AUTHOR_AVATAR_NOT_FOUND', 404, '头像当前不可用', 'Avatar is unavailable');
  }
  return { source: String(avatar.source) };
}

async function loadMessageByPublicId(db, publicId, viewerUserId, memberRole = 'member') {
  const [rows] = await db.query(`${MESSAGE_SELECT} WHERE message.public_id = ? LIMIT 1`, [publicId]);
  if (!rows[0]) return null;
  const [images, likes] = await Promise.all([loadMessageImages(db, rows), loadMessageLikes(db, rows, viewerUserId)]);
  const internalId = Number(rows[0].internalId);
  const authorAvatar = rows[0].authorHasAvatar
    ? `/api/community-chat/messages/${encodeURIComponent(rows[0].publicId)}/author-avatar`
    : '';
  return toPublicMessage(rows[0], viewerUserId, new Set(), images.get(internalId) || [], likes.get(internalId) || {}, {
    memberRole,
    authorAvatar,
  });
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
  const viewerUserId = user?.id && user?.role !== 'visitor' ? user.id : '';
  const viewerVisibilityClause = viewerUserId
    ? `AND NOT EXISTS (
          SELECT 1 FROM community_chat_blocks blocked
           WHERE blocked.user_id = ? AND blocked.blocked_user_id = message.user_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM community_chat_message_deletions deletion
           WHERE deletion.user_id = ? AND deletion.message_id = message.id
        )`
    : '';
  const viewerVisibilityParams = viewerUserId ? [viewerUserId, viewerUserId] : [];
  const [{ feature, memberRole }, room, blockedUserIds] = await Promise.all([
    assertCommunityChatReadAccess({ user, env, db }),
    loadRoom(db, normalizedRoomSlug),
    viewerUserId ? getCommunityChatBlockedUserIds({ userId: viewerUserId, db }) : Promise.resolve(new Set()),
  ]);

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
          AND message.status IN ('active', 'recalled')
          ${viewerVisibilityClause}
        LIMIT 1`,
      [room.id, focusPublicId, ...viewerVisibilityParams],
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
            AND message.status IN ('active', 'recalled')
            ${viewerVisibilityClause}
          ORDER BY message.id ASC
          LIMIT 1`,
        [room.id, focusId, ...viewerVisibilityParams],
      ),
    );
  }

  const cursorClause = beforeId !== null ? 'AND message.id < ?' : focusId !== null ? 'AND message.id <= ?' : '';
  const cursorId = beforeId ?? focusId;
  const params =
    cursorId === null
      ? [room.id, ...viewerVisibilityParams, pageSize + 1]
      : [room.id, ...viewerVisibilityParams, cursorId, pageSize + 1];
  const [rows] = await db.query(
    `${MESSAGE_SELECT}
      WHERE message.room_id = ? AND message.status IN ('active', 'recalled')
        ${viewerVisibilityClause}
        ${cursorClause}
      ORDER BY message.id DESC
      LIMIT ?`,
    params,
  );
  const hasMore = rows.length > pageSize;
  if (hasMore) rows.pop();
  rows.reverse();
  const authorAvatarByUserId = new Map();
  for (const row of rows) {
    if (!row.authorHasAvatar || authorAvatarByUserId.has(row.userId)) continue;
    authorAvatarByUserId.set(
      row.userId,
      `/api/community-chat/messages/${encodeURIComponent(row.publicId)}/author-avatar`,
    );
  }
  const [images, likes] = await Promise.all([loadMessageImages(db, rows), loadMessageLikes(db, rows, viewerUserId)]);
  const items = rows.map((row) =>
    toPublicMessage(
      row,
      viewerUserId,
      blockedUserIds,
      images.get(Number(row.internalId)) || [],
      likes.get(Number(row.internalId)) || {},
      { memberRole, authorAvatar: authorAvatarByUserId.get(row.userId) || '' },
    ),
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
  let viewerMemberRole = 'member';
  try {
    await connection.beginTransaction();
    const { memberRole } = await assertCommunityChatMessagingAccess({ user, env, db: connection, lock: true });
    viewerMemberRole = memberRole;
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
      const message = await loadMessageByPublicId(connection, existing.publicId, user.id, memberRole);
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
    const message = await loadMessageByPublicId(connection, publicId, user.id, memberRole);
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
        const message = await loadMessageByPublicId(db, existing.publicId, user.id, viewerMemberRole);
        if (message) return { message, idempotent: true };
      }
    }
    throw error;
  } finally {
    connection.release();
  }
}

export async function toggleCommunityChatMessageLike({ user, messagePublicId, env = process.env, db = pool }) {
  const normalizedMessagePublicId = normalizePublicMessageId(messagePublicId);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await assertCommunityChatMessagingAccess({ user, env, db: connection, lock: true });
    await assertCommunityChatPostingEnabled({ env, db: connection, lock: true });
    await assertCommunityChatPostingAllowed({ user, db: connection, lock: true });
    const target = await queryFirst(
      connection,
      `SELECT message.id, message.public_id AS publicId, room.slug AS roomSlug
         FROM community_chat_messages message
         JOIN community_chat_rooms room ON room.id = message.room_id
        WHERE message.public_id = ?
          AND message.status = 'active'
          AND room.slug = ?
          AND room.status = 'active'
        LIMIT 1 FOR UPDATE`,
      [normalizedMessagePublicId, COMMUNITY_CHAT_PRIMARY_ROOM_SLUG],
    );
    if (!target) {
      throw chatError(
        'COMMUNITY_CHAT_MESSAGE_NOT_INTERACTIVE',
        409,
        '这条消息已不可点赞',
        'This message can no longer be liked',
      );
    }

    const existing = await queryFirst(
      connection,
      `SELECT 1
         FROM community_chat_message_likes
        WHERE message_id = ? AND user_id = ?
        LIMIT 1 FOR UPDATE`,
      [target.id, user.id],
    );
    if (existing) {
      await connection.query(`DELETE FROM community_chat_message_likes WHERE message_id = ? AND user_id = ?`, [
        target.id,
        user.id,
      ]);
    } else {
      await connection.query(`INSERT INTO community_chat_message_likes (message_id, user_id) VALUES (?, ?)`, [
        target.id,
        user.id,
      ]);
    }
    const likes = await loadMessageLikes(connection, [{ internalId: target.id }], user.id);
    const interaction = likes.get(Number(target.id)) || { likeCount: 0, likedByMe: false, likePreview: [] };
    await connection.commit();
    publishCommunityChatRealtimeEvent('message.updated', {
      roomSlug: target.roomSlug,
      messagePublicId: target.publicId,
      reason: 'like',
    });
    return {
      publicId: target.publicId,
      likedByMe: Boolean(interaction.likedByMe),
      likeCount: Number(interaction.likeCount || 0),
      likePreview: interaction.likePreview || [],
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function recallCommunityChatMessage({ user, messagePublicId, env = process.env, db = pool }) {
  const normalizedMessagePublicId = normalizePublicMessageId(messagePublicId);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { memberRole } = await assertCommunityChatMessagingAccess({ user, env, db: connection, lock: true });
    const canModerate = canModerateMessages(memberRole);
    const target = await queryFirst(
      connection,
      `SELECT message.id, message.public_id AS publicId, message.user_id AS authorUserId,
              message.status, message.recalled_by AS recalledBy,
              TIMESTAMPDIFF(SECOND, message.create_time, NOW()) AS elapsedSeconds,
              room.slug AS roomSlug
         FROM community_chat_messages message
         JOIN community_chat_rooms room ON room.id = message.room_id
        WHERE message.public_id = ?
          AND room.slug = ?
          AND room.status = 'active'
        LIMIT 1 FOR UPDATE`,
      [normalizedMessagePublicId, COMMUNITY_CHAT_PRIMARY_ROOM_SLUG],
    );
    if (!target) {
      throw chatError('COMMUNITY_CHAT_MESSAGE_NOT_FOUND', 404, '消息不存在', 'Message not found');
    }
    const isOwn = target.authorUserId === user.id;
    if (!canModerate && !isOwn) {
      throw chatError(
        'MESSAGE_RECALL_FORBIDDEN',
        403,
        '只能撤回自己发送的消息',
        'You can only recall your own message',
      );
    }
    if (target.status === 'recalled' && (canModerate || target.recalledBy === user.id)) {
      await connection.commit();
      return { publicId: target.publicId, status: 'recalled', alreadyRecalled: true };
    }
    if (target.status !== 'active') {
      throw chatError(
        'MESSAGE_RECALL_UNAVAILABLE',
        409,
        '这条消息已不可撤回',
        'This message can no longer be recalled',
      );
    }
    if (!canModerate && Number(target.elapsedSeconds) > COMMUNITY_CHAT_RECALL_WINDOW_SECONDS) {
      throw chatError(
        'MESSAGE_RECALL_EXPIRED',
        409,
        '消息发送超过 2 分钟，已不能撤回',
        'Messages can only be recalled within two minutes',
      );
    }

    const [updated] = await connection.query(
      `UPDATE community_chat_messages
          SET status = 'recalled', recalled_at = NOW(), recalled_by = ?
        WHERE id = ? AND status = 'active'`,
      [user.id, target.id],
    );
    if (Number(updated?.affectedRows || 0) !== 1) {
      throw chatError('MESSAGE_RECALL_CONFLICT', 409, '消息状态已变化，请刷新后重试', 'Message state changed');
    }
    // 通知中心只展示“直接回复 / 显式提及”。消息本身被撤回后，对应定向通知必须同步消失，
    // 不能让收件人再通过通知读取已经撤回的正文摘要。
    await connection.query(
      `UPDATE notification
          SET del_flag = 1, is_read = 1, read_time = COALESCE(read_time, NOW())
        WHERE source_type = 'community_chat_message' AND source_id = ? AND del_flag = 0`,
      [target.publicId],
    );
    if (canModerate) {
      await connection.query(
        `INSERT INTO community_chat_moderation_actions
           (id, actor_user_id, target_user_id, message_id, action, reason, metadata)
         VALUES (?, ?, ?, ?, 'recall_message', 'moderator_recall', JSON_OBJECT('previousMessageStatus', 'active'))`,
        [randomUUID(), user.id, target.authorUserId, target.id],
      );
    }
    const recalled = await queryFirst(
      connection,
      `SELECT recalled_at AS recalledAt FROM community_chat_messages WHERE id = ? LIMIT 1`,
      [target.id],
    );
    await connection.commit();
    publishCommunityChatRealtimeEvent('message.updated', {
      roomSlug: target.roomSlug,
      messagePublicId: target.publicId,
      reason: 'recall',
    });
    return {
      publicId: target.publicId,
      status: 'recalled',
      recalledAt: recalled?.recalledAt || null,
      recalledByAdmin: canModerate && !isOwn,
      alreadyRecalled: false,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * “删除”是当前用户的本地会话整理动作：消息只从自己的聊天记录消失，其他成员仍可见。
 * 真正改变全局可见性的动作是撤回（公开占位、管理员保留原文）或管理员全局隐藏。
 */
export async function deleteCommunityChatMessage({ user, messagePublicId, env = process.env, db = pool }) {
  const normalizedMessagePublicId = normalizePublicMessageId(messagePublicId);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await assertCommunityChatMessagingAccess({ user, env, db: connection, lock: true });

    const target = await queryFirst(
      connection,
      `SELECT message.id, message.public_id AS publicId, message.status
         FROM community_chat_messages message
         JOIN community_chat_rooms room ON room.id = message.room_id
        WHERE message.public_id = ?
          AND room.slug = ?
          AND room.status = 'active'
        LIMIT 1 FOR UPDATE`,
      [normalizedMessagePublicId, COMMUNITY_CHAT_PRIMARY_ROOM_SLUG],
    );
    if (!target) {
      throw chatError('COMMUNITY_CHAT_MESSAGE_NOT_FOUND', 404, '消息不存在', 'Message not found');
    }
    if (!['active', 'recalled'].includes(target.status)) {
      throw chatError('MESSAGE_DELETE_UNAVAILABLE', 409, '这条消息已不可删除', 'This message can no longer be deleted');
    }

    const [deleted] = await connection.query(
      `INSERT IGNORE INTO community_chat_message_deletions (message_id, user_id)
       VALUES (?, ?)`,
      [target.id, user.id],
    );
    await connection.query(
      `UPDATE notification
          SET del_flag = 1, is_read = 1, read_time = COALESCE(read_time, NOW())
        WHERE user_id = ? AND source_type = 'community_chat_message' AND source_id = ? AND del_flag = 0`,
      [user.id, target.publicId],
    );
    await connection.commit();
    return {
      publicId: target.publicId,
      status: 'deleted_for_me',
      alreadyDeleted: Number(deleted?.affectedRows || 0) === 0,
    };
  } catch (error) {
    await connection.rollback();
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
              AND NOT EXISTS (
                SELECT 1 FROM community_chat_message_deletions deletion
                 WHERE deletion.user_id = ? AND deletion.message_id = community_chat_messages.id
              )
            LIMIT 1`,
          [room.id, normalizedMessagePublicId, user.id],
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
          AND NOT EXISTS (
            SELECT 1 FROM community_chat_message_deletions deletion
             WHERE deletion.user_id = ? AND deletion.message_id = message.id
          )
          AND message.id > COALESCE(
            (SELECT last_read_message_id FROM community_chat_reads WHERE room_id = ? AND user_id = ? LIMIT 1),
            0
          )`,
      [room.id, user.id, user.id, user.id, room.id, user.id],
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
  canModerateMessages,
  toPublicMessage,
};
