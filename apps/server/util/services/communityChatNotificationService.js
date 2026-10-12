import { huaweiPushEnabled } from '../huaweiPushPolicy.js';
import { browserPushEnabled } from '../browserPushPolicy.js';
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

function toPublicSettings(row = null, user = null) {
  const enabled = row ? Boolean(Number(row.enabled || 0)) : COMMUNITY_CHAT_NOTIFICATIONS_DEFAULT_ENABLED;
  return {
    enabled,
    ...(user?.role === 'root' ? { rootAllMessages: Number(row?.rootAllMessages ?? 1) === 1 } : {}),
    level: normalizeCommunityChatNotificationLevel(row?.level),
    defaultEnabled: COMMUNITY_CHAT_NOTIFICATIONS_DEFAULT_ENABLED,
    replyCountsAsMention: true,
    channels: {
      inApp: { available: true, enabled },
      browser: { available: browserPushEnabled(), enabled: false },
      android: { available: false, enabled: false },
    },
  };
}

export async function getCommunityChatNotificationSettings({ user, db = pool }) {
  assertRegisteredUser(user);
  const [rows] = await db.query(
    `SELECT global_notification_enabled AS enabled, default_room_level AS level, root_all_messages_enabled AS rootAllMessages
       FROM community_chat_user_settings
      WHERE user_id = ?
      LIMIT 1`,
    [user.id],
  );
  return toPublicSettings(rows[0] || null, user);
}

export async function updateCommunityChatNotificationSettings({ user, enabled, level, rootAllMessages, db = pool }) {
  assertRegisteredUser(user);
  if (typeof enabled !== 'boolean') {
    throw chatError('INVALID_NOTIFICATION_ENABLED', 400, '聊天室提醒开关无效', 'Invalid notification switch');
  }
  if (rootAllMessages !== undefined && (user.role !== 'root' || typeof rootAllMessages !== 'boolean')) {
    throw chatError(user.role !== 'root' ? 'ROOT_REQUIRED' : 'INVALID_ROOT_SUBSCRIPTION', user.role !== 'root' ? 403 : 400,
      '聊天室全量订阅设置无效', 'Invalid root chat subscription');
  }
  const normalizedLevel = normalizeCommunityChatNotificationLevel(level, { strict: true });
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    if (user.role === 'root') {
      const [[current]] = await connection.query('SELECT role FROM user WHERE id = ? AND del_flag = 0 FOR UPDATE', [user.id]);
      if (current?.role !== 'root') throw chatError('ROOT_REQUIRED', 403, '没有操作权限', 'Root role required');
    }

    const [settingRows] = await connection.query(
      `SELECT global_notification_enabled AS enabled, root_all_messages_enabled AS rootAllMessages
         FROM community_chat_user_settings
        WHERE user_id = ?
        LIMIT 1 FOR UPDATE`,
      [user.id],
    );
    const previousEnabled = settingRows[0]
      ? Boolean(Number(settingRows[0].enabled || 0))
      : COMMUNITY_CHAT_NOTIFICATIONS_DEFAULT_ENABLED;

    const nextRootAllMessages = rootAllMessages ?? (Number(settingRows[0]?.rootAllMessages ?? 1) === 1);
    await connection.query(
      `INSERT INTO community_chat_user_settings
         (user_id, global_notification_enabled, default_room_level, root_all_messages_enabled)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         global_notification_enabled = VALUES(global_notification_enabled),
         default_room_level = VALUES(default_room_level),
         root_all_messages_enabled = VALUES(root_all_messages_enabled),
         update_time = CURRENT_TIMESTAMP`,
      [user.id, enabled ? 1 : 0, normalizedLevel, nextRootAllMessages ? 1 : 0],
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

    if (rootAllMessages === false) {
      // Keep inbox history, but permanently suppress this subscription's unsent alerts even after re-enabling.
      await connection.query(`UPDATE notification SET browser_push_pending = 0,
        meta = JSON_SET(meta, '$.subscriptionCancelled', 1)
        WHERE user_id = ? AND type = 'community_chat'
          AND JSON_UNQUOTE(JSON_EXTRACT(meta, '$.kind')) = 'subscription'`, [user.id]);
      await connection.query(`UPDATE browser_push_jobs j JOIN notification n
        ON j.notification_id = CONVERT(n.id USING utf8mb4) COLLATE utf8mb4_general_ci
        SET j.status = 'cancelled', j.lease_until = NULL
        WHERE n.user_id = ? AND n.type = 'community_chat'
          AND JSON_UNQUOTE(JSON_EXTRACT(n.meta, '$.kind')) = 'subscription'
          AND j.status IN ('pending', 'sending')`, [user.id]);
    }
    await connection.commit();
    return toPublicSettings({ enabled: enabled ? 1 : 0, level: normalizedLevel, rootAllMessages: nextRootAllMessages ? 1 : 0 }, user);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/** Targeted interactions and root subscriptions share one source/recipient idempotency key. */
export async function deliverCommunityChatMessageNotifications({
  messagePublicId,
  messagePreview,
  env = process.env,
  db = pool,
}) {
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
  const normalizedMessagePreview =
    messagePreview === undefined
      ? null
      : String(messagePreview || '')
          .replace(/\s+/g, ' ')
          .trim();
  const pollPreviewSql =
    normalizedMessagePreview === null
      ? `LEFT(REPLACE(REPLACE(message.content, CHAR(13), ' '), CHAR(10), ' '), 154)`
      : `LEFT(?, 154)`;
  const textPreviewSql =
    normalizedMessagePreview === null
      ? `LEFT(REPLACE(REPLACE(message.content, CHAR(13), ' '), CHAR(10), ' '), 160)`
      : `LEFT(?, 160)`;
  const previewParams = normalizedMessagePreview === null ? [] : [normalizedMessagePreview, normalizedMessagePreview];

  const [result] = await db.query(
    `INSERT IGNORE INTO notification
       (id, user_id, type, title, content, link, meta, is_read, source_type, source_id, browser_push_pending, browser_push_created_at)
     SELECT UUID(), recipient.id, 'community_chat',
            CASE WHEN reply.user_id = recipient.id THEN '有人回复了你'
                 WHEN message.mention_everyone = 1 OR EXISTS (SELECT 1 FROM community_chat_message_mentions own_mention WHERE own_mention.message_id = message.id AND own_mention.mentioned_user_id = recipient.id) THEN '有人提及了你'
                 ELSE '聊天室有新消息' END,
            CONCAT(
              COALESCE(NULLIF(sender.alias, ''), '轻笺用户'),
              '：',
              CASE
                WHEN message.message_kind = 'poll'
                  THEN CONCAT('[投票] ', ${pollPreviewSql})
                WHEN CHAR_LENGTH(TRIM(message.content)) > 0
                  THEN ${textPreviewSql}
                WHEN EXISTS (
                  SELECT 1 FROM community_chat_message_images notification_image
                   WHERE notification_image.message_id = message.id
                     AND notification_image.status = 'attached'
                ) THEN '[图片]'
                WHEN EXISTS (SELECT 1 FROM community_chat_message_files notification_file
                  WHERE notification_file.message_id = message.id AND notification_file.status = 'attached') THEN '[文件]'
                WHEN message.message_kind = 'sticker' THEN '[表情]'
                ELSE '[新消息]'
              END
            ),
            CONCAT('/community-chat?message=', message.public_id),
            JSON_OBJECT(
              'version', 1,
              'delivery', 'notification_center',
              'kind', CASE WHEN reply.user_id = recipient.id THEN 'reply'
                           WHEN message.mention_everyone = 1 OR EXISTS (SELECT 1 FROM community_chat_message_mentions own_mention WHERE own_mention.message_id = message.id AND own_mention.mentioned_user_id = recipient.id) THEN 'mention'
                           ELSE 'subscription' END,
              'mentionEveryone', IF(message.mention_everyone = 1, 1, 0),
              'messagePublicId', message.public_id,
              'roomSlug', room.slug,
              'senderName', COALESCE(NULLIF(sender.alias, ''), '轻笺用户')
            ),
            0,
            'community_chat_message',
            message.public_id,
            ${browserPushEnabled(env) || huaweiPushEnabled(env) ? 1 : 0}, CURRENT_TIMESTAMP(6)
       FROM community_chat_messages message
       JOIN community_chat_rooms room ON room.id = message.room_id AND room.status = 'active'
       JOIN user sender ON sender.id = message.user_id AND sender.del_flag = 0
       LEFT JOIN community_chat_members sender_membership ON sender_membership.user_id = sender.id
       LEFT JOIN community_chat_messages reply ON reply.id = message.reply_to_id
       LEFT JOIN community_chat_message_mentions mention ON mention.message_id = message.id
       JOIN user recipient ON (recipient.role = 'root' OR message.mention_everyone = 1
                               OR recipient.id = reply.user_id OR recipient.id = mention.mentioned_user_id)
                            AND recipient.del_flag = 0
                            AND recipient.role <> 'visitor'
                            AND recipient.id <> message.user_id
       LEFT JOIN community_chat_user_identities recipient_identity ON recipient_identity.user_id = recipient.id
       LEFT JOIN community_chat_user_settings settings ON settings.user_id = recipient.id
       LEFT JOIN community_chat_members recipient_membership ON recipient_membership.user_id = recipient.id
      WHERE message.public_id = ?
        AND message.status = 'active'
        AND (recipient.role = 'root' OR recipient_identity.user_id IS NOT NULL)
        AND (message.mention_everyone = 0 OR settings.user_id IS NOT NULL
             OR (recipient.role = 'root' AND COALESCE(settings.root_all_messages_enabled, 1) = 1))
        AND COALESCE(settings.global_notification_enabled, 1) = 1
        AND (
          (recipient.role = 'root' AND COALESCE(settings.root_all_messages_enabled, 1) = 1)
          OR (
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
        AND (
          (recipient.role = 'root' AND COALESCE(settings.root_all_messages_enabled, 1) = 1)
          OR message.mention_everyone = 1
          OR reply.user_id = recipient.id
          OR mention.mentioned_user_id = recipient.id
        )`,
    [...previewParams, normalizedPublicId, ...accessParams],
  );

  return { delivered: Number(result?.affectedRows || 0) };
}

export const __test__ = {
  toPublicSettings,
};
