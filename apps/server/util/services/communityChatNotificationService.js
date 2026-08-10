import pool from '../../db/index.js';
import { COMMUNITY_CHAT_PRIMARY_ROOM_SLUG, getCommunityChatFeatureState } from '../communityChatFeature.js';
import { CommunityChatError } from './communityChatAccessService.js';

export const COMMUNITY_CHAT_NOTIFICATION_LEVELS = Object.freeze(['official', 'mentions_only', 'mentions', 'all']);
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
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [settingRows] = await connection.query(
      `SELECT global_notification_enabled AS enabled
         FROM community_chat_user_settings
        WHERE user_id = ?
        LIMIT 1 FOR UPDATE`,
      [user.id],
    );
    const previousEnabled = settingRows[0]
      ? Boolean(Number(settingRows[0].enabled || 0))
      : COMMUNITY_CHAT_NOTIFICATIONS_DEFAULT_ENABLED;

    await connection.query(
      `INSERT INTO community_chat_user_settings
         (user_id, global_notification_enabled, default_room_level)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         global_notification_enabled = VALUES(global_notification_enabled),
         default_room_level = VALUES(default_room_level),
         update_time = CURRENT_TIMESTAMP`,
      [user.id, enabled ? 1 : 0, normalizedLevel],
    );

    // 开关切换时以当前最新消息作为新的阅读基线：关闭不残留角标，重开也不会补算关闭期间的消息。
    if (previousEnabled !== enabled) {
      await connection.query(
        `INSERT INTO community_chat_reads (room_id, user_id, last_read_message_id)
         SELECT room.id, ?, COALESCE(MAX(message.id), 0)
           FROM community_chat_rooms room
           LEFT JOIN community_chat_messages message
             ON message.room_id = room.id AND message.status = 'active'
          WHERE room.slug = ? AND room.status = 'active'
          GROUP BY room.id
         ON DUPLICATE KEY UPDATE
           last_read_message_id = GREATEST(last_read_message_id, VALUES(last_read_message_id)),
           update_time = CURRENT_TIMESTAMP`,
        [user.id, COMMUNITY_CHAT_PRIMARY_ROOM_SLUG],
      );
    }

    // 关闭提醒等同于退出聊天室通知流：已有通知从通知中心软删除，且不再贡献铃铛角标。
    if (!enabled) {
      await connection.query(
        `UPDATE notification
            SET del_flag = 1, is_read = 1, read_time = COALESCE(read_time, NOW())
          WHERE user_id = ? AND del_flag = 0
            AND (type = 'community_chat' OR source_type = 'community_chat_message')`,
        [user.id],
      );
    }

    await connection.commit();
    return toPublicSettings({ enabled: enabled ? 1 : 0, level: normalizedLevel });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * 消息提交后只为“直接回复了我”或“显式提及了我”的定向消息生成站内通知。
 *
 * - 聊天室入口角标仍按 official / mentions_only / mentions / all 单独计算，不能把角标范围扩大成通知中心投递范围。
 * - 普通新消息不会进入 PC / 移动端通用通知中心；回复与 @ 使用相同的总开关、档位和屏蔽规则。
 * - 主开关缺省开启；用户主动关闭后，回复和 @ 都不生成通知。
 * - 通知使用 message public id 作为稳定来源键；同一消息同时回复并 @ 同一成员也只投递一次。
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
     SELECT UUID(), recipient.id, 'community_chat',
            CASE WHEN reply.user_id = recipient.id THEN '有人回复了你' ELSE '有人提及了你' END,
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
              'kind', CASE WHEN reply.user_id = recipient.id THEN 'reply' ELSE 'mention' END,
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
       LEFT JOIN community_chat_message_mentions mention ON mention.message_id = message.id
       JOIN user recipient ON (
                              recipient.id = reply.user_id
                              OR recipient.id = mention.mentioned_user_id
                            )
                            AND recipient.del_flag = 0
                            AND recipient.role <> 'visitor'
                            AND recipient.id <> message.user_id
       LEFT JOIN community_chat_user_settings settings ON settings.user_id = recipient.id
       LEFT JOIN community_chat_members recipient_membership ON recipient_membership.user_id = recipient.id
      WHERE message.public_id = ?
        AND message.status = 'active'
        AND COALESCE(settings.global_notification_enabled, 1) = 1
        AND (
          (
            COALESCE(settings.default_room_level, 'mentions') = 'official'
            AND (
              sender.role = 'root'
              OR (sender_membership.role = 'moderator' AND sender_membership.status = 'active')
            )
          )
          OR (
            COALESCE(settings.default_room_level, 'mentions') = 'mentions_only'
            AND NOT (
              sender.role = 'root'
              OR (sender_membership.role = 'moderator' AND sender_membership.status = 'active')
            )
          )
          OR COALESCE(settings.default_room_level, 'mentions') IN ('mentions', 'all')
        )
        AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(recipient.preferences, '$.notificationsInApp')), 'true') <> 'false'
        ${membershipAccessClause}
        AND NOT EXISTS (
          SELECT 1
            FROM community_chat_blocks blocked
           WHERE (blocked.user_id = recipient.id AND blocked.blocked_user_id = message.user_id)
              OR (blocked.user_id = message.user_id AND blocked.blocked_user_id = recipient.id)
        )
        AND (reply.user_id IS NOT NULL OR mention.mentioned_user_id IS NOT NULL)`,
    [normalizedPublicId, ...accessParams],
  );

  return { delivered: Number(result?.affectedRows || 0) };
}

export const __test__ = {
  toPublicSettings,
};
