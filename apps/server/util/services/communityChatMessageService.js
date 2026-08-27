import { createHash, randomUUID } from 'node:crypto';
import { resolveCommunityChatOfficialSticker } from '@lightnote/shared/community-chat-stickers';
import pool from '../../db/index.js';
import { COMMUNITY_CHAT_PRIMARY_ROOM_SLUG, getCommunityChatFeatureState } from '../communityChatFeature.js';
import { levelForExp, rankOf } from '../growth.js';
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
import { ensureCommunityChatIdentity, normalizeCommunityChatUserPublicIds } from './communityChatIdentityService.js';
import {
  assertCommunityChatPollDeadlineRangeInDatabase,
  insertCommunityChatPoll,
  loadCommunityChatPolls,
  normalizeCommunityChatPollDraft,
} from './communityChatPollService.js';
import { loadCommunityChatReadCounts } from './communityChatReadReceiptService.js';

export {
  getCommunityChatMessageAuthorAchievements,
  getCommunityChatMessageAuthorProfile,
} from './communityChatProfileService.js';

const MAX_MESSAGE_LENGTH = 2000;
const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;
const MAX_MENTION_TARGETS = 5;
export const COMMUNITY_CHAT_RECALL_WINDOW_SECONDS = 120;
const ROOM_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9:_-]{8,64}$/;
const MESSAGE_KINDS = Object.freeze(['text', 'sticker', 'poll']);
const STICKER_SOURCES = Object.freeze(['official', 'custom']);
const CUSTOM_STICKER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function normalizeMentionEveryone(value) {
  if (value === undefined || value === null || value === false) return false;
  if (value === true) return true;
  throw chatError('INVALID_MENTION_EVERYONE', 400, '提及所有人的参数无效', 'Invalid mention-everyone value');
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

function normalizeMessageKind(value) {
  const kind = String(value || 'text').trim();
  if (!MESSAGE_KINDS.includes(kind)) {
    throw chatError('INVALID_MESSAGE_KIND', 400, '消息类型无效', 'Invalid message kind');
  }
  return kind;
}

function normalizeStickerSource(value, messageKind) {
  const source = String(value || '').trim();
  if (messageKind !== 'sticker') {
    if (source)
      throw chatError(
        'INVALID_STICKER_MESSAGE',
        400,
        '文字消息不能携带表情来源',
        'Text messages cannot include a sticker source',
      );
    return null;
  }
  if (!STICKER_SOURCES.includes(source)) {
    throw chatError('INVALID_STICKER_SOURCE', 400, '表情来源无效', 'Invalid sticker source');
  }
  return source;
}

function normalizeStickerKey(value, messageKind, stickerSource) {
  const stickerKey = String(value || '').trim();
  if (messageKind !== 'sticker') {
    if (stickerKey)
      throw chatError(
        'INVALID_STICKER_MESSAGE',
        400,
        '文字消息不能携带表情标识',
        'Text messages cannot include a sticker key',
      );
    return null;
  }
  if (stickerSource === 'official') {
    const officialSticker = resolveCommunityChatOfficialSticker(stickerKey);
    if (!officialSticker) {
      throw chatError('OFFICIAL_STICKER_NOT_FOUND', 400, '官方表情不存在', 'Official sticker not found');
    }
    return officialSticker.key;
  }
  const publicId = stickerKey.toLowerCase();
  if (!CUSTOM_STICKER_ID_PATTERN.test(publicId)) {
    throw chatError('INVALID_STICKER_KEY', 400, '自定义表情标识无效', 'Invalid custom sticker identifier');
  }
  return publicId;
}

function messagePayloadFingerprint(payload) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
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
    `SELECT room.id, room.slug, room.type, room.status, room.slow_mode_seconds AS slowModeSeconds,
            room.pinned_message_id AS pinnedMessageId, pinned.public_id AS pinnedMessagePublicId
       FROM community_chat_rooms room
       LEFT JOIN community_chat_messages pinned ON pinned.id = room.pinned_message_id
      WHERE room.slug = ? AND room.status = 'active'
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
         message.message_kind AS messageKind, message.sticker_source AS stickerSource,
         message.sticker_key AS stickerKey, message.mention_everyone AS mentionEveryone,
         message.read_receipt_enabled AS readReceiptEnabled,
         custom_sticker.public_id AS availableStickerPublicId,
         CONCAT(
           DATE_FORMAT(UTC_TIMESTAMP(3), '%Y-%m-%dT%H:%i:%s.'),
           LPAD(FLOOR(MICROSECOND(UTC_TIMESTAMP(3)) / 1000), 3, '0'),
           'Z'
         ) AS databaseNow,
         message.create_time AS createdAt, message.edited_at AS editedAt,
         message.recalled_at AS recalledAt, message.recalled_by AS recalledBy,
         account.role AS authorAccountRole,
         CASE WHEN account.del_flag = '0' THEN COALESCE(NULLIF(account.alias, ''), '') ELSE '' END AS authorName,
         author_identity.public_id AS authorUserPublicId,
         author_identity.community_id AS authorCommunityId,
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
         reply.message_kind AS replyMessageKind,
         CASE WHEN reply.status = 'active' THEN LEFT(reply.content, 280) ELSE '' END AS replyContent,
         CASE WHEN reply.status = 'active' THEN reply.status ELSE COALESCE(reply.status, '') END AS replyStatus,
         CASE
           WHEN reply.status = 'active' AND reply_account.del_flag = '0'
             THEN COALESCE(NULLIF(reply_account.alias, ''), '')
           ELSE ''
         END AS replyAuthorName,
         (
           SELECT GROUP_CONCAT(
                    HEX(
                      CASE
                        WHEN mentioned_account.del_flag = '0'
                          THEN COALESCE(NULLIF(mentioned_account.alias, ''), '轻笺用户')
                        ELSE '轻笺用户'
                      END
                    )
                    ORDER BY mention.create_time ASC, mention.mentioned_user_id ASC
                    SEPARATOR ','
                  )
             FROM community_chat_message_mentions mention
             LEFT JOIN user mentioned_account ON mentioned_account.id = mention.mentioned_user_id
            WHERE mention.message_id = message.id
         ) AS mentionNamesHex,
         (
           SELECT GROUP_CONCAT(
                    HEX(
                      CAST(
                        JSON_OBJECT(
                          'userPublicId', COALESCE(mentioned_identity.public_id, ''),
                          'displayName', COALESCE(
                            NULLIF(mention.display_name_snapshot, ''),
                            CASE
                              WHEN mentioned_account.del_flag = '0'
                                THEN COALESCE(NULLIF(mentioned_account.alias, ''), '轻笺用户')
                              ELSE '轻笺用户'
                            END
                          ),
                          'communityId', COALESCE(
                            NULLIF(mention.community_id_snapshot, ''),
                            mentioned_identity.community_id,
                            ''
                          )
                        ) AS CHAR
                      )
                    )
                    ORDER BY mention.sort_order ASC, mention.create_time ASC, mention.mentioned_user_id ASC
                    SEPARATOR ','
                  )
             FROM community_chat_message_mentions mention
             LEFT JOIN user mentioned_account ON mentioned_account.id = mention.mentioned_user_id
             LEFT JOIN community_chat_user_identities mentioned_identity
                    ON mentioned_identity.user_id = mention.mentioned_user_id
            WHERE mention.message_id = message.id
         ) AS mentionItemsHex,
         (
           SELECT COUNT(*)
             FROM community_chat_message_images reply_image
            WHERE reply_image.message_id = reply.id AND reply_image.status = 'attached'
         ) AS replyImageCount
    FROM community_chat_messages message
    LEFT JOIN user account ON account.id = message.user_id
    LEFT JOIN community_chat_user_identities author_identity ON author_identity.user_id = message.user_id
    LEFT JOIN community_chat_custom_stickers custom_sticker
           ON custom_sticker.public_id = message.sticker_key
          AND message.sticker_source = 'custom'
          AND custom_sticker.status IN ('active', 'removed')
    LEFT JOIN community_chat_members membership ON membership.user_id = message.user_id
    LEFT JOIN user_growth growth ON growth.user_id = message.user_id
    LEFT JOIN community_chat_messages reply ON reply.id = message.reply_to_id
    LEFT JOIN user reply_account ON reply_account.id = reply.user_id`;

function publicGrowthProfile(row) {
  const level = levelForExp(Number(row.authorExp || 0));
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

function publicMentionNames(row) {
  return String(row.mentionNamesHex || '')
    .split(',')
    .map((encodedName) => {
      try {
        return Buffer.from(encodedName, 'hex').toString('utf8').trim();
      } catch {
        return '';
      }
    })
    .filter(Boolean)
    .slice(0, MAX_MENTION_TARGETS);
}

function publicMentionItems(row) {
  return String(row.mentionItemsHex || '')
    .split(',')
    .map((encodedItem) => {
      try {
        const parsed = JSON.parse(Buffer.from(encodedItem, 'hex').toString('utf8'));
        const userPublicId = String(parsed?.userPublicId || '').trim();
        const displayName = String(parsed?.displayName || '').trim();
        const communityId = String(parsed?.communityId || '').trim();
        return userPublicId && displayName && communityId ? { userPublicId, displayName, communityId } : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .slice(0, MAX_MENTION_TARGETS);
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

function assertCanPinCommunityChatMessage(memberRole) {
  if (canModerateMessages(memberRole)) return;
  throw chatError(
    'COMMUNITY_CHAT_PIN_FORBIDDEN',
    403,
    '只有社区管理员可以管理置顶消息',
    'Only community moderators can manage pinned messages',
  );
}

function toPublicMessage(
  row,
  viewerUserId,
  blockedUserIds = new Set(),
  images = [],
  likes = {},
  { memberRole = 'visitor', now = Date.now(), authorAvatar = row.authorAvatar || '', poll = null, readCount } = {},
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
  const readReceiptEnabled = Boolean(
    row.status === 'active' && row.authorAccountRole === 'root' && Number(row.readReceiptEnabled || 0),
  );
  const mentionItems = contentVisible ? publicMentionItems(row) : [];
  let sticker = null;
  if (contentVisible && row.messageKind === 'sticker' && row.stickerKey) {
    if (row.stickerSource === 'official') {
      const officialSticker = resolveCommunityChatOfficialSticker(row.stickerKey);
      if (officialSticker) {
        sticker = {
          source: 'official',
          key: officialSticker.key,
          url: officialSticker.assetPath,
        };
      }
    } else if (row.stickerSource === 'custom' && row.availableStickerPublicId) {
      sticker = {
        source: 'custom',
        key: row.stickerKey,
        url: `/api/community-chat/stickers/${encodeURIComponent(row.stickerKey)}/content`,
      };
    }
  }
  return {
    publicId: row.publicId,
    content: contentVisible ? row.content : '',
    messageKind: row.messageKind || 'text',
    stickerSource: sticker?.source || null,
    stickerKey: sticker?.key || null,
    sticker,
    poll: contentVisible && row.messageKind === 'poll' ? poll : null,
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
    mentionEveryone: contentVisible && Boolean(Number(row.mentionEveryone || 0)),
    mentions: mentionItems.length
      ? mentionItems.map((item) => item.displayName)
      : contentVisible
        ? publicMentionNames(row)
        : [],
    mentionItems,
    likeCount: row.status === 'active' ? Number(likes.likeCount || 0) : 0,
    likedByMe: row.status === 'active' && Boolean(likes.likedByMe),
    likePreview: row.status === 'active' ? likes.likePreview || [] : [],
    readReceiptEnabled,
    ...(readReceiptEnabled && memberRole === 'admin' ? { readCount: Math.max(0, Number(readCount || 0)) } : {}),
    author: {
      name: row.authorName || '',
      userPublicId: row.authorUserPublicId || '',
      communityId: row.authorCommunityId || '',
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
          hasSticker: replyBlocked ? false : row.replyMessageKind === 'sticker',
          hasPoll: replyBlocked ? false : row.replyMessageKind === 'poll',
        }
      : null,
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

async function loadMessageByPublicId(
  db,
  publicId,
  viewerUserId,
  memberRole = 'member',
  feature = getCommunityChatFeatureState(),
  blockedUserIds = new Set(),
) {
  const [rows] = await db.query(`${MESSAGE_SELECT} WHERE message.public_id = ? LIMIT 1`, [publicId]);
  if (!rows[0]) return null;
  const viewerIsRoot = memberRole === 'admin';
  const [images, likes, polls, readCounts] = await Promise.all([
    loadMessageImages(db, rows),
    loadMessageLikes(db, rows, viewerUserId),
    loadCommunityChatPolls(db, rows, {
      viewerUserId,
      viewerIsRoot,
      pollsEnabled: feature.pollsEnabled,
    }),
    loadCommunityChatReadCounts(db, rows, { viewerIsRoot }),
  ]);
  const internalId = Number(rows[0].internalId);
  const authorAvatar = rows[0].authorHasAvatar
    ? `/api/community-chat/messages/${encodeURIComponent(rows[0].publicId)}/author-avatar`
    : '';
  return toPublicMessage(
    rows[0],
    viewerUserId,
    blockedUserIds,
    images.get(internalId) || [],
    likes.get(internalId) || {},
    {
      memberRole,
      authorAvatar,
      poll: polls.get(internalId) || null,
      readCount: readCounts.get(internalId),
    },
  );
}

export async function getCommunityChatMessage({ user, messagePublicId, env = process.env, db = pool }) {
  const normalizedPublicId = normalizePublicMessageId(messagePublicId);
  const { feature, memberRole } = await assertCommunityChatReadAccess({ user, env, db });
  const viewerUserId = user?.id && user?.role !== 'visitor' ? user.id : '';
  const visibilityClause = viewerUserId
    ? `AND NOT EXISTS (
          SELECT 1 FROM community_chat_blocks blocked
           WHERE blocked.user_id = ? AND blocked.blocked_user_id = message.user_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM community_chat_message_deletions deletion
           WHERE deletion.user_id = ? AND deletion.message_id = message.id
        )`
    : '';
  const target = await queryFirst(
    db,
    `SELECT message.public_id AS publicId
       FROM community_chat_messages message
       JOIN community_chat_rooms room ON room.id = message.room_id
      WHERE message.public_id = ?
        AND message.status IN ('active', 'recalled')
        AND room.slug = ?
        AND room.status = 'active'
        ${visibilityClause}
      LIMIT 1`,
    [normalizedPublicId, COMMUNITY_CHAT_PRIMARY_ROOM_SLUG, ...(viewerUserId ? [viewerUserId, viewerUserId] : [])],
  );
  if (!target) {
    throw chatError(
      'COMMUNITY_CHAT_MESSAGE_NOT_VISIBLE',
      404,
      '消息已不可用或当前不可见',
      'The message is unavailable or no longer visible',
    );
  }
  const blockedUserIds = viewerUserId ? await getCommunityChatBlockedUserIds({ userId: viewerUserId, db }) : new Set();
  const message = await loadMessageByPublicId(db, target.publicId, viewerUserId, memberRole, feature, blockedUserIds);
  if (!message) {
    throw chatError('COMMUNITY_CHAT_MESSAGE_NOT_VISIBLE', 404, '消息已不可用', 'The message is unavailable');
  }
  if (!['active', 'recalled'].includes(message.status)) {
    throw chatError(
      'COMMUNITY_CHAT_MESSAGE_NOT_VISIBLE',
      404,
      '消息已不可用或当前不可见',
      'The message is unavailable or no longer visible',
    );
  }
  return { message };
}

export async function getCommunityChatPinnedMessage({ user, roomSlug, env = process.env, db = pool }) {
  const normalizedRoomSlug = normalizeRoomSlug(roomSlug);
  const viewerUserId = user?.id && user?.role !== 'visitor' ? user.id : '';
  const viewerVisibilityClause = viewerUserId
    ? `AND NOT EXISTS (
          SELECT 1 FROM community_chat_blocks blocked
           WHERE blocked.user_id = ? AND blocked.blocked_user_id = pinned.user_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM community_chat_message_deletions deletion
           WHERE deletion.user_id = ? AND deletion.message_id = pinned.id
        )`
    : '';
  const [{ feature, memberRole }, room] = await Promise.all([
    assertCommunityChatReadAccess({ user, env, db }),
    loadRoom(db, normalizedRoomSlug),
  ]);
  if (!room.pinnedMessageId) return { roomSlug: room.slug, message: null };

  const target = await queryFirst(
    db,
    `SELECT pinned.public_id AS publicId
       FROM community_chat_messages pinned
      WHERE pinned.id = ? AND pinned.room_id = ? AND pinned.status = 'active'
        ${viewerVisibilityClause}
      LIMIT 1`,
    [room.pinnedMessageId, room.id, ...(viewerUserId ? [viewerUserId, viewerUserId] : [])],
  );
  if (!target) return { roomSlug: room.slug, message: null };
  const blockedUserIds = viewerUserId ? await getCommunityChatBlockedUserIds({ userId: viewerUserId, db }) : new Set();
  const message = await loadMessageByPublicId(db, target.publicId, viewerUserId, memberRole, feature, blockedUserIds);
  return { roomSlug: room.slug, message };
}

export async function pinCommunityChatMessage({ user, messagePublicId, env = process.env, db = pool }) {
  const normalizedMessagePublicId = normalizePublicMessageId(messagePublicId);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { feature, memberRole } = await assertCommunityChatMessagingAccess({
      user,
      env,
      db: connection,
      lock: true,
    });
    assertCanPinCommunityChatMessage(memberRole);
    const room = await loadRoom(connection, COMMUNITY_CHAT_PRIMARY_ROOM_SLUG, { lock: true });
    const target = await queryFirst(
      connection,
      `SELECT message.id, message.public_id AS publicId, message.user_id AS authorUserId
         FROM community_chat_messages message
        WHERE message.public_id = ? AND message.room_id = ? AND message.status = 'active'
        LIMIT 1 FOR UPDATE`,
      [normalizedMessagePublicId, room.id],
    );
    if (!target) {
      throw chatError(
        'COMMUNITY_CHAT_MESSAGE_NOT_PINNABLE',
        409,
        '这条消息当前不能置顶',
        'This message cannot be pinned',
      );
    }

    const alreadyPinned = Number(room.pinnedMessageId || 0) === Number(target.id);
    if (!alreadyPinned) {
      await connection.query(
        `UPDATE community_chat_rooms
            SET pinned_message_id = ?, pinned_by = ?, pinned_at = NOW()
          WHERE id = ?`,
        [target.id, user.id, room.id],
      );
      await connection.query(
        `INSERT INTO community_chat_moderation_actions
           (id, actor_user_id, target_user_id, message_id, action, reason, metadata)
         VALUES (?, ?, ?, ?, 'pin_message', 'moderator_pin', ?)`,
        [
          randomUUID(),
          user.id,
          target.authorUserId,
          target.id,
          JSON.stringify({ previousPinnedMessagePublicId: room.pinnedMessagePublicId || null }),
        ],
      );
    }
    const message = await loadMessageByPublicId(connection, target.publicId, user.id, memberRole, feature);
    await connection.commit();
    if (!alreadyPinned) {
      publishCommunityChatRealtimeEvent('message.updated', {
        roomSlug: room.slug,
        messagePublicId: target.publicId,
        reason: 'pin',
      });
    }
    return {
      roomSlug: room.slug,
      message,
      alreadyPinned,
      replacedMessagePublicId: alreadyPinned ? null : room.pinnedMessagePublicId || null,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function unpinCommunityChatMessage({ user, messagePublicId, env = process.env, db = pool }) {
  const normalizedMessagePublicId = normalizePublicMessageId(messagePublicId);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { memberRole } = await assertCommunityChatMessagingAccess({ user, env, db: connection, lock: true });
    assertCanPinCommunityChatMessage(memberRole);
    const room = await loadRoom(connection, COMMUNITY_CHAT_PRIMARY_ROOM_SLUG, { lock: true });
    if (!room.pinnedMessageId) {
      await connection.commit();
      return { roomSlug: room.slug, publicId: normalizedMessagePublicId, alreadyUnpinned: true };
    }
    if (room.pinnedMessagePublicId !== normalizedMessagePublicId) {
      throw chatError(
        'COMMUNITY_CHAT_PIN_CHANGED',
        409,
        '置顶消息已经变化，请刷新后重试',
        'The pinned message has changed. Refresh and try again',
      );
    }
    const target = await queryFirst(
      connection,
      `SELECT id, user_id AS authorUserId FROM community_chat_messages WHERE id = ? LIMIT 1 FOR UPDATE`,
      [room.pinnedMessageId],
    );
    await connection.query(
      `UPDATE community_chat_rooms
          SET pinned_message_id = NULL, pinned_by = NULL, pinned_at = NULL
        WHERE id = ? AND pinned_message_id = ?`,
      [room.id, room.pinnedMessageId],
    );
    if (target) {
      await connection.query(
        `INSERT INTO community_chat_moderation_actions
           (id, actor_user_id, target_user_id, message_id, action, reason, metadata)
         VALUES (?, ?, ?, ?, 'unpin_message', 'moderator_unpin', ?)`,
        [
          randomUUID(),
          user.id,
          target.authorUserId,
          target.id,
          JSON.stringify({ messagePublicId: normalizedMessagePublicId }),
        ],
      );
    }
    await connection.commit();
    publishCommunityChatRealtimeEvent('message.updated', {
      roomSlug: room.slug,
      messagePublicId: normalizedMessagePublicId,
      reason: 'unpin',
    });
    return { roomSlug: room.slug, publicId: normalizedMessagePublicId, alreadyUnpinned: false };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function loadIdempotentMessage(db, userId, clientRequestId, { lock = false } = {}) {
  return queryFirst(
    db,
    `SELECT message.id AS internalId, message.public_id AS publicId, message.room_id AS roomId, message.content,
            message.payload_fingerprint AS payloadFingerprint,
            message.mention_everyone AS mentionEveryone,
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

function assertMentionTargetCount(publicIds) {
  if (publicIds.length > MAX_MENTION_TARGETS) {
    throw chatError(
      'TOO_MANY_MENTION_TARGETS',
      400,
      `每条消息最多提及 ${MAX_MENTION_TARGETS} 位成员`,
      `A message can mention at most ${MAX_MENTION_TARGETS} members`,
    );
  }
}

function uniqueMentionTargets(targets) {
  const byUserId = new Map();
  for (const target of targets) {
    if (!target?.userId || byUserId.has(target.userId)) continue;
    byUserId.set(target.userId, target);
  }
  const result = [...byUserId.values()];
  assertMentionTargetCount(result);
  return result;
}

async function resolveMentionTargetsByUserPublicIds(db, { roomId, senderUserId, publicIds, feature }) {
  if (!publicIds.length) return [];
  const placeholders = publicIds.map(() => '?').join(',');
  const accessClause =
    feature.accessMode === 'invite_only'
      ? `AND (
           account.role = 'root'
           OR (membership.status = 'active' AND membership.rules_version = ?)
         )`
      : `AND COALESCE(membership.status, '') <> 'banned'`;
  const accessParams = feature.accessMode === 'invite_only' ? [feature.rulesVersion] : [];
  const [rows] = await db.query(
    `SELECT identity.public_id AS userPublicId, identity.community_id AS communityId,
            identity.user_id AS userId,
            COALESCE(NULLIF(account.alias, ''), '轻笺用户') AS displayName
       FROM community_chat_user_identities identity
       JOIN user account ON account.id = identity.user_id
                        AND account.del_flag = 0
                        AND account.role <> 'visitor'
      LEFT JOIN community_chat_members membership ON membership.user_id = identity.user_id
      WHERE identity.public_id IN (${placeholders})
        AND identity.user_id <> ?
        ${accessClause}
        AND NOT EXISTS (
          SELECT 1
            FROM community_chat_blocks blocked
           WHERE (blocked.user_id = ? AND blocked.blocked_user_id = identity.user_id)
              OR (blocked.user_id = identity.user_id AND blocked.blocked_user_id = ?)
        )
      FOR UPDATE`,
    [...publicIds, senderUserId, ...accessParams, senderUserId, senderUserId],
  );
  if (rows.length !== publicIds.length) {
    throw chatError(
      'MENTION_TARGET_UNAVAILABLE',
      409,
      '要提及的成员已不可用',
      'A member being mentioned is unavailable',
    );
  }
  const byPublicId = new Map(rows.map((row) => [String(row.userPublicId || '').toLowerCase(), row]));
  return uniqueMentionTargets(publicIds.map((publicId) => byPublicId.get(publicId)).filter(Boolean));
}

async function resolveMentionTargetsByMessagePublicIds(db, { roomId, senderUserId, publicIds, feature }) {
  if (!publicIds.length) return [];
  const placeholders = publicIds.map(() => '?').join(',');
  const accessClause =
    feature.accessMode === 'invite_only'
      ? `AND (
           account.role = 'root'
           OR (membership.status = 'active' AND membership.rules_version = ?)
         )`
      : `AND COALESCE(membership.status, '') <> 'banned'`;
  const accessParams = feature.accessMode === 'invite_only' ? [feature.rulesVersion] : [];
  const [rows] = await db.query(
    `SELECT message.public_id AS messagePublicId, message.user_id AS userId,
            COALESCE(NULLIF(account.alias, ''), '轻笺用户') AS displayName
       FROM community_chat_messages message
       JOIN user account ON account.id = message.user_id
                        AND account.del_flag = 0
                        AND account.role <> 'visitor'
       LEFT JOIN community_chat_members membership ON membership.user_id = message.user_id
      WHERE message.room_id = ?
        AND message.public_id IN (${placeholders})
        AND message.status IN ('active', 'recalled')
        AND message.user_id <> ?
        ${accessClause}
        AND NOT EXISTS (
          SELECT 1 FROM community_chat_blocks blocked
           WHERE (blocked.user_id = ? AND blocked.blocked_user_id = message.user_id)
              OR (blocked.user_id = message.user_id AND blocked.blocked_user_id = ?)
        )
      FOR UPDATE`,
    [roomId, ...publicIds, senderUserId, ...accessParams, senderUserId, senderUserId],
  );
  if (rows.length !== publicIds.length) {
    throw chatError(
      'MENTION_TARGET_UNAVAILABLE',
      409,
      '要提及的成员已不可用',
      'A member being mentioned is unavailable',
    );
  }
  const byMessagePublicId = new Map(rows.map((row) => [row.messagePublicId, row]));
  const targets = [];
  for (const messagePublicId of publicIds) {
    const row = byMessagePublicId.get(messagePublicId);
    if (!row) continue;
    const identity = await ensureCommunityChatIdentity({ userId: row.userId, db });
    targets.push({ ...row, ...identity });
  }
  return uniqueMentionTargets(targets);
}

function assertIdempotentPayload(
  existing,
  roomId,
  content,
  replyPublicId,
  mentionEveryone,
  existingImagePublicIds,
  imagePublicIds,
  payloadFingerprint,
) {
  if (existing.payloadFingerprint) {
    if (existing.payloadFingerprint === payloadFingerprint) return;
    throw chatError(
      'MESSAGE_REQUEST_ID_CONFLICT',
      409,
      '该发送请求标识已经用于另一条消息',
      'This message request identifier was already used for a different payload',
    );
  }
  if (
    Number(existing.roomId) !== Number(roomId) ||
    existing.content !== content ||
    (existing.replyPublicId || null) !== (replyPublicId || null) ||
    Boolean(Number(existing.mentionEveryone || 0)) !== mentionEveryone ||
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
  after,
  limit,
  env = process.env,
  db = pool,
}) {
  const normalizedRoomSlug = normalizeRoomSlug(roomSlug);
  const beforePublicId = normalizePublicMessageId(before, { optional: true });
  const focusPublicId = normalizePublicMessageId(focus, { optional: true });
  const afterPublicId = normalizePublicMessageId(after, { optional: true });
  if ([beforePublicId, focusPublicId, afterPublicId].filter(Boolean).length > 1) {
    throw chatError(
      'MESSAGE_CURSOR_CONFLICT',
      400,
      '历史游标、消息定位和后续游标不能同时使用',
      'History cursor, message focus, and newer cursor cannot be used together',
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
  let afterId = null;
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
  }
  if (afterPublicId) {
    const cursor = await queryFirst(
      db,
      `SELECT id FROM community_chat_messages WHERE room_id = ? AND public_id = ? LIMIT 1`,
      [room.id, afterPublicId],
    );
    if (!cursor) {
      throw chatError('MESSAGE_CURSOR_INVALID', 400, '后续消息游标已失效', 'The newer message cursor is invalid');
    }
    afterId = cursor.id;
  }

  let rows = [];
  let hasMore = false;
  if (focusId !== null) {
    // 定位消息时返回目标上下文，而不是“截至目标的历史页”。这样客户端既能继续向上翻历史，
    // 也能以最后一条可见消息为 after 游标继续向下浏览，不必整页跳回最新消息。
    const olderPageSize = Math.floor((pageSize - 1) / 2);
    const newerPageSize = pageSize - 1 - olderPageSize;
    const [olderRows] = await db.query(
      `${MESSAGE_SELECT}
        WHERE message.room_id = ? AND message.status IN ('active', 'recalled')
          ${viewerVisibilityClause}
          AND message.id <= ?
        ORDER BY message.id DESC
        LIMIT ?`,
      [room.id, ...viewerVisibilityParams, focusId, olderPageSize + 2],
    );
    hasMore = olderRows.length > olderPageSize + 1;
    if (hasMore) olderRows.pop();
    olderRows.reverse();

    const [newerRows] = await db.query(
      `${MESSAGE_SELECT}
        WHERE message.room_id = ? AND message.status IN ('active', 'recalled')
          ${viewerVisibilityClause}
          AND message.id > ?
        ORDER BY message.id ASC
        LIMIT ?`,
      [room.id, ...viewerVisibilityParams, focusId, newerPageSize + 1],
    );
    hasNewer = newerRows.length > newerPageSize;
    if (hasNewer) newerRows.pop();
    rows = [...olderRows, ...newerRows];
  } else if (afterId !== null) {
    const [newerRows] = await db.query(
      `${MESSAGE_SELECT}
        WHERE message.room_id = ? AND message.status IN ('active', 'recalled')
          ${viewerVisibilityClause}
          AND message.id > ?
        ORDER BY message.id ASC
        LIMIT ?`,
      [room.id, ...viewerVisibilityParams, afterId, pageSize + 1],
    );
    hasNewer = newerRows.length > pageSize;
    if (hasNewer) newerRows.pop();
    rows = newerRows;
  } else {
    const cursorClause = beforeId !== null ? 'AND message.id < ?' : '';
    const params =
      beforeId === null
        ? [room.id, ...viewerVisibilityParams, pageSize + 1]
        : [room.id, ...viewerVisibilityParams, beforeId, pageSize + 1];
    const [historyRows] = await db.query(
      `${MESSAGE_SELECT}
        WHERE message.room_id = ? AND message.status IN ('active', 'recalled')
          ${viewerVisibilityClause}
          ${cursorClause}
        ORDER BY message.id DESC
        LIMIT ?`,
      params,
    );
    hasMore = historyRows.length > pageSize;
    if (hasMore) historyRows.pop();
    historyRows.reverse();
    rows = historyRows;
  }
  const authorAvatarByUserId = new Map();
  for (const row of rows) {
    if (!row.authorHasAvatar || authorAvatarByUserId.has(row.userId)) continue;
    authorAvatarByUserId.set(
      row.userId,
      `/api/community-chat/messages/${encodeURIComponent(row.publicId)}/author-avatar`,
    );
  }
  const viewerIsRoot = memberRole === 'admin';
  const [images, likes, polls, readCounts] = await Promise.all([
    loadMessageImages(db, rows),
    loadMessageLikes(db, rows, viewerUserId),
    loadCommunityChatPolls(db, rows, {
      viewerUserId,
      viewerIsRoot,
      pollsEnabled: feature.pollsEnabled,
    }),
    loadCommunityChatReadCounts(db, rows, { viewerIsRoot }),
  ]);
  const items = rows.map((row) =>
    toPublicMessage(
      row,
      viewerUserId,
      blockedUserIds,
      images.get(Number(row.internalId)) || [],
      likes.get(Number(row.internalId)) || {},
      {
        memberRole,
        authorAvatar: authorAvatarByUserId.get(row.userId) || '',
        poll: polls.get(Number(row.internalId)) || null,
        readCount: readCounts.get(Number(row.internalId)),
      },
    ),
  );

  return {
    roomSlug: room.slug,
    items,
    hasMore,
    nextBefore: hasMore && items.length ? items[0].publicId : null,
    nextAfter: hasNewer && items.length ? items[items.length - 1].publicId : null,
    focusPublicId: focusPublicId || null,
    hasNewer,
    realtimeEnabled: feature.realtimeEnabled,
    pollingAfterMs: feature.realtimeEnabled ? null : 8000,
    // 投票截止写入与状态查询以数据库 UTC 时钟为准，页面倒计时必须跟随同一事实源；
    // 空房间没有截止状态可展示，才退回应用进程时钟。
    serverTime: rows[0]?.databaseNow || new Date().toISOString(),
  };
}

export async function createCommunityChatMessage({
  user,
  roomSlug,
  clientRequestId,
  content,
  replyToPublicId,
  mentionEveryone,
  mentionUserPublicIds,
  mentionMessagePublicIds,
  imagePublicIds,
  messageKind,
  stickerSource,
  stickerKey,
  poll,
  env = process.env,
  db = pool,
}) {
  const normalizedRoomSlug = normalizeRoomSlug(roomSlug);
  const normalizedRequestId = normalizeClientRequestId(clientRequestId);
  const normalizedMessageKind = normalizeMessageKind(messageKind);
  const normalizedStickerSource = normalizeStickerSource(stickerSource, normalizedMessageKind);
  const normalizedStickerKey = normalizeStickerKey(stickerKey, normalizedMessageKind, normalizedStickerSource);
  const normalizedImagePublicIds = normalizeImagePublicIds(imagePublicIds);
  const normalizedContent = normalizeMessageContent(content, {
    allowEmpty: normalizedImagePublicIds.length > 0 || normalizedMessageKind === 'sticker',
  });
  const normalizedPoll =
    normalizedMessageKind === 'poll'
      ? normalizeCommunityChatPollDraft(poll, { question: normalizedContent, validateDuration: false })
      : null;
  const normalizedReplyPublicId = normalizePublicMessageId(replyToPublicId, { optional: true });
  const normalizedMentionEveryone = normalizeMentionEveryone(mentionEveryone);
  const normalizedMentionUserPublicIds = normalizeCommunityChatUserPublicIds(mentionUserPublicIds);
  const normalizedMentionMessagePublicIds = normalizeMentionMessagePublicIds(mentionMessagePublicIds);
  assertMentionTargetCount(normalizedMentionUserPublicIds);

  if (normalizedMessageKind !== 'poll' && poll !== undefined && poll !== null) {
    throw chatError('INVALID_POLL', 400, '非投票消息不能携带投票参数', 'Only poll messages can include poll data');
  }
  if (normalizedMessageKind === 'poll' && user?.role !== 'root') {
    throw chatError('POLL_CREATE_ROOT_REQUIRED', 403, '只有 Root 可以发起投票', 'Only Root can create polls');
  }
  if (normalizedMessageKind === 'poll' && normalizedImagePublicIds.length) {
    throw chatError('INVALID_POLL', 400, '投票消息不能混合图片', 'Poll messages cannot include images');
  }

  if (normalizedMentionEveryone && user?.role !== 'root') {
    throw chatError(
      'MENTION_EVERYONE_ROOT_REQUIRED',
      403,
      '只有 Root 可以提及所有人',
      'Only Root can mention everyone',
    );
  }
  if (
    normalizedMentionEveryone &&
    (normalizedMentionUserPublicIds.length || normalizedMentionMessagePublicIds.length)
  ) {
    throw chatError(
      'MENTION_EVERYONE_CONFLICT',
      400,
      '提及所有人不能与成员提及混合使用',
      'Mentioning everyone cannot be combined with member mentions',
    );
  }

  if (
    normalizedMessageKind === 'sticker' &&
    (normalizedContent ||
      normalizedImagePublicIds.length ||
      normalizedMentionEveryone ||
      normalizedMentionUserPublicIds.length ||
      normalizedMentionMessagePublicIds.length)
  ) {
    throw chatError(
      'INVALID_STICKER_MESSAGE',
      400,
      '轻笺表情不能混合文字、图片或提及',
      'A Light Note sticker cannot be combined with text, images, or mentions',
    );
  }

  const multipleChoicePoll = normalizedPoll?.selectionMode === 'multiple';
  const payloadFingerprint = messagePayloadFingerprint({
    // 普通消息必须继续沿用 v2，保证新旧实例滚动发布期间的重试仍能命中同一幂等指纹；
    // 旧单选投票继续沿用 v3；只有多选新增字段进入 v4，避免同一单选请求跨版本重试冲突。
    version: multipleChoicePoll ? 4 : normalizedPoll ? 3 : 2,
    roomSlug: normalizedRoomSlug,
    messageKind: normalizedMessageKind,
    stickerSource: normalizedStickerSource,
    stickerKey: normalizedStickerKey,
    content: normalizedContent,
    replyToPublicId: normalizedReplyPublicId,
    ...(normalizedMentionEveryone ? { mentionEveryone: true } : {}),
    mentionUserPublicIds: normalizedMentionUserPublicIds,
    mentionMessagePublicIds: normalizedMentionMessagePublicIds,
    imagePublicIds: normalizedImagePublicIds,
    ...(normalizedPoll
      ? {
          poll: {
            endsAt: normalizedPoll.endsAtUtc,
            options: normalizedPoll.options,
            ...(multipleChoicePoll
              ? {
                  selectionMode: normalizedPoll.selectionMode,
                  maxSelections: normalizedPoll.maxSelections,
                }
              : {}),
          },
        }
      : {}),
  });

  const requestedFeature = getCommunityChatFeatureState(env);
  if (!requestedFeature.messagingEnabled) {
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
    if (user?.role === 'root' && (normalizedPoll || requestedFeature.readReceiptsEnabled)) {
      // Root 投票和已读采集位都依赖当前账号角色。先锁定账号事实，再进入消息事务，
      // 与账号注销的互斥锁建立顺序，避免注销过程中插入新的投票或 read_receipt_enabled=1 消息。
      const activeRoot = await queryFirst(
        connection,
        `SELECT id FROM user
          WHERE id = ? AND role = 'root' AND del_flag = 0
          LIMIT 1 FOR UPDATE`,
        [user.id],
      );
      if (!activeRoot) {
        throw chatError(
          'COMMUNITY_CHAT_ROOT_ACCOUNT_UNAVAILABLE',
          403,
          'Root 账号状态已变化，请重新登录后再试',
          'The Root account state changed. Sign in again and retry',
        );
      }
    }
    const { feature, memberRole } = await assertCommunityChatMessagingAccess({
      user,
      env,
      db: connection,
      lock: true,
    });
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
        normalizedMentionEveryone,
        existingImages,
        normalizedImagePublicIds,
        payloadFingerprint,
      );
      const message = await loadMessageByPublicId(connection, existing.publicId, user.id, memberRole, feature);
      await connection.commit();
      return { message, idempotent: true };
    }

    // 幂等重放先返回已经落库的投票；只有首次创建才复核子开关和相对当前时间的截止窗口。
    // 否则一次成功但响应丢失的请求，会因时间流逝或运维关开关从“可重放”变成失败。
    if (normalizedPoll) {
      if (!feature.pollsEnabled) {
        throw chatError('COMMUNITY_CHAT_POLLS_DISABLED', 403, '投票功能当前未开放', 'Polls are currently disabled');
      }
      await assertCommunityChatPollDeadlineRangeInDatabase(connection, normalizedPoll);
    }

    if (room.type === 'announcement' && !['admin', 'moderator'].includes(memberRole)) {
      throw chatError(
        'ANNOUNCEMENT_POST_FORBIDDEN',
        403,
        '公告频道仅允许官方与管理员发布',
        'Only official accounts and moderators can post announcements',
      );
    }

    const stableMentionTargets = await resolveMentionTargetsByUserPublicIds(connection, {
      roomId: room.id,
      senderUserId: user.id,
      publicIds: normalizedMentionUserPublicIds,
      feature,
    });
    const legacyMentionTargets = await resolveMentionTargetsByMessagePublicIds(connection, {
      roomId: room.id,
      senderUserId: user.id,
      publicIds: normalizedMentionMessagePublicIds,
      feature,
    });
    if (stableMentionTargets.length && legacyMentionTargets.length) {
      const stableIds = stableMentionTargets.map((target) => target.userId).sort();
      const legacyIds = legacyMentionTargets.map((target) => target.userId).sort();
      if (stableIds.length !== legacyIds.length || stableIds.some((value, index) => value !== legacyIds[index])) {
        throw chatError(
          'MENTION_TARGET_CONFLICT',
          409,
          '新旧提及参数指向的成员不一致',
          'The new and legacy mention fields refer to different members',
        );
      }
    }
    const mentionTargets = stableMentionTargets.length ? stableMentionTargets : legacyMentionTargets;
    const pendingImages = await resolvePendingImages(connection, {
      ownerUserId: user.id,
      publicIds: normalizedImagePublicIds,
    });
    if (normalizedStickerSource === 'custom') {
      const customSticker = await queryFirst(
        connection,
        `SELECT id
           FROM community_chat_custom_stickers
          WHERE public_id = ? AND user_id = ? AND status = 'active'
          LIMIT 1 FOR UPDATE`,
        [normalizedStickerKey, user.id],
      );
      if (!customSticker) {
        throw chatError(
          'CUSTOM_STICKER_UNAVAILABLE',
          409,
          '这个自定义表情已不可用',
          'This custom sticker is unavailable',
        );
      }
    }

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

    await ensureCommunityChatIdentity({ userId: user.id, db: connection });
    const publicId = randomUUID();
    const [insertResult] = await connection.query(
      `INSERT INTO community_chat_messages
         (public_id, room_id, user_id, client_request_id, payload_fingerprint,
          reply_to_id, message_kind, sticker_source, sticker_key, mention_everyone,
          read_receipt_enabled, content, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [
        publicId,
        room.id,
        user.id,
        normalizedRequestId,
        payloadFingerprint,
        replyToId,
        normalizedMessageKind,
        normalizedStickerSource,
        normalizedStickerKey,
        normalizedMentionEveryone ? 1 : 0,
        user.role === 'root' && feature.readReceiptsEnabled ? 1 : 0,
        normalizedContent,
      ],
    );
    const messageId = insertResult.insertId;
    if (normalizedPoll) {
      await insertCommunityChatPoll(connection, { messageId, poll: normalizedPoll });
    }
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
    if (mentionTargets.length) {
      const mentionValues = mentionTargets.map(() => '(?, ?, ?, ?, ?)').join(',');
      await connection.query(
        `INSERT IGNORE INTO community_chat_message_mentions
           (message_id, mentioned_user_id, sort_order, display_name_snapshot, community_id_snapshot)
         VALUES ${mentionValues}`,
        mentionTargets.flatMap((target, sortOrder) => [
          messageId,
          target.userId,
          sortOrder,
          target.displayName,
          target.communityId,
        ]),
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
    const message = await loadMessageByPublicId(connection, publicId, user.id, memberRole, feature);
    await connection.commit();
    publishCommunityChatRealtimeEvent('message.created', {
      roomSlug: normalizedRoomSlug,
      messagePublicId: publicId,
    });
    // 站内提醒是提交后的附加能力。尤其 Root 的 @所有人可能产生较大扇出，
    // 不能占用消息事务、拖慢响应，或因提醒链路失败把已成功消息伪装成发送失败。
    void deliverCommunityChatMessageNotifications({ messagePublicId: publicId, env, db }).catch((error) => {
      console.error('[community-chat] 站内提醒投递失败 code=%s', error?.code || error?.name || 'UNKNOWN');
    });
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
          normalizedMentionEveryone,
          existingImages,
          normalizedImagePublicIds,
          payloadFingerprint,
        );
        const message = await loadMessageByPublicId(db, existing.publicId, user.id, viewerMemberRole, requestedFeature);
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
    await connection.query(
      `UPDATE community_chat_rooms
          SET pinned_message_id = NULL, pinned_by = NULL, pinned_at = NULL
        WHERE pinned_message_id = ?`,
      [target.id],
    );
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
  normalizeStickerKey,
  normalizeStickerSource,
  normalizeMentionEveryone,
  normalizeMentionMessagePublicIds,
  normalizePageSize,
  normalizePublicMessageId,
  normalizeRoomSlug,
  canModerateMessages,
  toPublicMessage,
};
