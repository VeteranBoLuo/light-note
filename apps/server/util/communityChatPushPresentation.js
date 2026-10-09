import { getCommunityChatFeatureState } from './communityChatFeature.js';

const publicIdPattern = /^[a-f\d-]{36}$/i;
const plain = (value, limit) => Array.from(String(value || '')
  .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim())
  .slice(0, limit).join('');

function kindOf(notification) {
  let meta = notification.meta;
  if (typeof meta === 'string') {
    try { meta = JSON.parse(meta); } catch { return null; }
  }
  return ['reply', 'mention'].includes(meta?.kind) ? meta.kind : null;
}

export function communityChatPushPresentation(message, kind) {
  const sender = plain(message.sender_name, 24) || '轻笺用户';
  const text = plain(message.content, 100);
  let body = text;
  if (message.message_kind === 'poll') body = `[投票] ${text || '新投票'}`;
  else if (!text && Number(message.has_image)) body = '[图片]';
  else if (!text && Number(message.has_file)) body = '[文件]';
  else if (!text && message.message_kind === 'sticker') body = '[表情]';
  else if (!text) body = '[新消息]';
  return {
    title: `${sender}${kind === 'reply' ? '回复了你' : '提及了你'}`,
    body,
    visibility: 'SECRET',
  };
}

// A saved notification is not authority to disclose chat text after a recall, block or membership change.
export async function readCommunityChatPushPresentations(db, userId, notifications, env = process.env) {
  const feature = getCommunityChatFeatureState(env);
  if (!feature.messagingEnabled) return new Map();
  const candidates = notifications.filter((n) => n.type === 'community_chat' &&
    n.source_type === 'community_chat_message' && publicIdPattern.test(String(n.source_id || '')) && kindOf(n));
  if (!candidates.length) return new Map();
  const ids = [...new Set(candidates.map((n) => n.source_id))];
  const access = feature.accessMode === 'invite_only'
    ? "AND (recipient.role = 'root' OR (membership.status = 'active' AND membership.rules_version = ?))"
    : "AND COALESCE(membership.status, '') <> 'banned'";
  const [rows] = await db.query(
    `SELECT message.public_id, message.content, message.message_kind,
            sender.alias AS sender_name,
            EXISTS (SELECT 1 FROM community_chat_message_images image
                     WHERE image.message_id = message.id AND image.status = 'attached') AS has_image,
            EXISTS (SELECT 1 FROM community_chat_message_files file
                     WHERE file.message_id = message.id AND file.status = 'attached') AS has_file
       FROM community_chat_messages message
       JOIN community_chat_rooms room ON room.id = message.room_id AND room.status = 'active'
       JOIN user sender ON sender.id = message.user_id AND sender.del_flag = 0
       JOIN user recipient ON recipient.id = ? AND recipient.del_flag = 0 AND recipient.role <> 'visitor'
       JOIN community_chat_user_identities identity ON identity.user_id = recipient.id
       LEFT JOIN community_chat_members membership ON membership.user_id = recipient.id
       LEFT JOIN community_chat_user_settings settings ON settings.user_id = recipient.id
       LEFT JOIN community_chat_messages reply ON reply.id = message.reply_to_id
      WHERE message.public_id IN (?) AND message.status = 'active'
        AND message.user_id <> recipient.id
        AND COALESCE(settings.global_notification_enabled, 1) = 1
        AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(recipient.preferences, '$.notificationsInApp')), 'true') <> 'false'
        ${access}
        AND NOT EXISTS (SELECT 1 FROM community_chat_blocks blocked
             WHERE (blocked.user_id = recipient.id AND blocked.blocked_user_id = sender.id)
                OR (blocked.user_id = sender.id AND blocked.blocked_user_id = recipient.id))
        AND NOT EXISTS (SELECT 1 FROM community_chat_message_deletions deletion
             WHERE deletion.message_id = message.id AND deletion.user_id = recipient.id)
        AND (reply.user_id = recipient.id OR message.mention_everyone = 1
             OR EXISTS (SELECT 1 FROM community_chat_message_mentions mention
                 WHERE mention.message_id = message.id AND mention.mentioned_user_id = recipient.id))`,
    [userId, ids, ...(feature.accessMode === 'invite_only' ? [feature.rulesVersion] : [])],
  );
  const messages = new Map(rows.map((row) => [row.public_id, row]));
  return new Map(candidates.flatMap((notification) => {
    const message = messages.get(notification.source_id);
    return message ? [[notification.id, communityChatPushPresentation(message, kindOf(notification))]] : [];
  }));
}
