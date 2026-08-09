import pool from '../../db/index.js';
import { getCommunityChatFeatureState } from '../communityChatFeature.js';
import { CommunityChatError } from './communityChatAccessService.js';

export const COMMUNITY_CHAT_NOTIFICATION_LEVELS = Object.freeze(['official', 'mentions', 'all']);
export const COMMUNITY_CHAT_DEFAULT_NOTIFICATION_LEVEL = 'mentions';
export const COMMUNITY_CHAT_NOTIFICATIONS_DEFAULT_ENABLED = true;

const chatError = (code, status, zhMessage, enMessage) => new CommunityChatError(code, status, zhMessage, enMessage);

function assertRegisteredUser(user) {
  if (!user?.id || user.role === 'visitor') {
    throw chatError('LOGIN_REQUIRED', 403, '请先注册或登录', 'Please register or sign in first');
  }
}

export function normalizeCommunityChatNotificationLevel(value, { strict = false } = {}) {
  const normalized = String(value || '').trim();
  if (COMMUNITY_CHAT_NOTIFICATION_LEVELS.includes(normalized)) return normalized;
  if (!strict) return COMMUNITY_CHAT_DEFAULT_NOTIFICATION_LEVEL;
  throw chatError('INVALID_NOTIFICATION_LEVEL', 400, '聊天室提醒范围无效', 'Invalid community chat notification level');
}

function toPublicSettings(row = null) {
  const enabled = row ? Boolean(Number(row.enabled || 0)) : COMMUNITY_CHAT_NOTIFICATIONS_DEFAULT_ENABLED;
  return {
    enabled,
    level: normalizeCommunityChatNotificationLevel(row?.level),
    defaultEnabled: COMMUNITY_CHAT_NOTIFICATIONS_DEFAULT_ENABLED,
    replyCountsAsMention: true,
    channels: {
      inApp: { available: true, enabled },
      browser: { available: false, enabled: false },
      android: { available: false, enabled: false },
    },
  };
}

export async function getCommunityChatNotificationSettings({ user, db = pool }) {
  assertRegisteredUser(user);
  const [rows] = await db.query(
    `SELECT global_notification_enabled AS enabled, default_room_level AS level
       FROM community_chat_user_settings
      WHERE user_id = ?
      LIMIT 1`,
    [user.id],
  );
  return toPublicSettings(rows[0] || null);
}

export async function updateCommunityChatNotificationSettings({ user, enabled, level, db = pool }) {
  assertRegisteredUser(user);
  if (typeof enabled !== 'boolean') {
    throw chatError('INVALID_NOTIFICATION_ENABLED', 400, '聊天室提醒开关无效', 'Invalid notification switch');
  }
  const normalizedLevel = normalizeCommunityChatNotificationLevel(level, { strict: true });
  await db.query(
    `INSERT INTO community_chat_user_settings
       (user_id, global_notification_enabled, default_room_level)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       global_notification_enabled = VALUES(global_notification_enabled),
       default_room_level = VALUES(default_room_level),
       update_time = CURRENT_TIMESTAMP`,
    [user.id, enabled ? 1 : 0, normalizedLevel],
  );
  return toPublicSettings({ enabled: enabled ? 1 : 0, level: normalizedLevel });
}

/**
 * 消息提交后按用户主动选择的提醒范围生成站内通知。
 *
 * - 主开关缺省开启；未创建设置行的用户使用 mentions 推荐档，主动关闭后始终尊重用户选择。
 * - official: 仅 Root / 有效版主消息。
 * - mentions: official + 显式提及 + 引用回复目标。
 * - all: 所有其他人的消息。
 * - 通知使用 message public id 作为稳定来源键，重复执行也不会重复投递。
 * - 浏览器与 Android 通知尚未开放，meta 明确标记为 in_app_only。
 */
export async function deliverCommunityChatMessageNotifications({ messagePublicId, env = process.env, db = pool }) {
  const normalizedPublicId = String(messagePublicId || '').trim();
  if (!normalizedPublicId) return { delivered: 0 };

  const feature = getCommunityChatFeatureState(env);
  if (!feature.messagingEnabled) return { delivered: 0 };

  const membershipAccessClause =
    feature.accessMode === 'invite_only'
      ? `AND (
           recipient.role = 'root'
           OR (
             recipient_membership.status = 'active'
             AND recipient_membership.rules_version = ?
           )
         )`
      : `AND COALESCE(recipient_membership.status, '') <> 'banned'`;
  const accessParams = feature.accessMode === 'invite_only' ? [feature.rulesVersion] : [];

  const [result] = await db.query(
    `INSERT IGNORE INTO notification
       (id, user_id, type, title, content, link, meta, is_read, source_type, source_id)
     SELECT UUID(), recipient.id, 'community_chat', '聊天室有新消息',
            CONCAT(
              COALESCE(NULLIF(sender.alias, ''), '轻笺用户'),
              '：',
              CASE
                WHEN CHAR_LENGTH(TRIM(message.content)) > 0
                  THEN LEFT(REPLACE(REPLACE(message.content, CHAR(13), ' '), CHAR(10), ' '), 160)
                WHEN EXISTS (
                  SELECT 1 FROM community_chat_message_images notification_image
                   WHERE notification_image.message_id = message.id
                     AND notification_image.status = 'attached'
                ) THEN '[图片]'
                ELSE '[新消息]'
              END
            ),
            CONCAT('/community-chat?message=', message.public_id),
            JSON_OBJECT(
              'version', 1,
              'delivery', 'in_app_only',
              'kind', CASE
                WHEN reply.user_id = recipient.id THEN 'reply'
                WHEN EXISTS (
                  SELECT 1
                    FROM community_chat_message_mentions mention_kind
                   WHERE mention_kind.message_id = message.id
                     AND mention_kind.mentioned_user_id = recipient.id
                ) THEN 'mention'
                WHEN sender.role = 'root'
                  OR (sender_membership.role = 'moderator' AND sender_membership.status = 'active')
                  THEN 'official'
                ELSE 'all'
              END,
              'messagePublicId', message.public_id,
              'roomSlug', room.slug,
              'senderName', COALESCE(NULLIF(sender.alias, ''), '轻笺用户')
            ),
            0,
            'community_chat_message',
            message.public_id
       FROM community_chat_messages message
       JOIN community_chat_rooms room ON room.id = message.room_id AND room.status = 'active'
       JOIN user sender ON sender.id = message.user_id AND sender.del_flag = 0
       LEFT JOIN community_chat_members sender_membership ON sender_membership.user_id = sender.id
       LEFT JOIN community_chat_messages reply ON reply.id = message.reply_to_id
       JOIN user recipient ON recipient.del_flag = 0
                              AND recipient.role <> 'visitor'
                              AND recipient.id <> message.user_id
       LEFT JOIN community_chat_user_settings settings ON settings.user_id = recipient.id
       LEFT JOIN community_chat_members recipient_membership ON recipient_membership.user_id = recipient.id
      WHERE message.public_id = ?
        AND message.status = 'active'
        AND COALESCE(settings.global_notification_enabled, 1) = 1
        AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(recipient.preferences, '$.notificationsInApp')), 'true') <> 'false'
        ${membershipAccessClause}
        AND NOT EXISTS (
          SELECT 1
            FROM community_chat_blocks blocked
           WHERE (blocked.user_id = recipient.id AND blocked.blocked_user_id = message.user_id)
              OR (blocked.user_id = message.user_id AND blocked.blocked_user_id = recipient.id)
        )
        AND (
          sender.role = 'root'
          OR (sender_membership.role = 'moderator' AND sender_membership.status = 'active')
          OR COALESCE(settings.default_room_level, 'mentions') = 'all'
          OR (
            COALESCE(settings.default_room_level, 'mentions') = 'mentions'
            AND (
              reply.user_id = recipient.id
              OR EXISTS (
                SELECT 1
                  FROM community_chat_message_mentions mention_target
                 WHERE mention_target.message_id = message.id
                   AND mention_target.mentioned_user_id = recipient.id
              )
            )
          )
        )`,
    [normalizedPublicId, ...accessParams],
  );

  return { delivered: Number(result?.affectedRows || 0) };
}

export const __test__ = {
  toPublicSettings,
};
