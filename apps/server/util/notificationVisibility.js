// Keep historical subscription rows visible after the preference is switched off,
// but recheck the source and current role before exposing their saved text.
// MySQL 5.7 resolves the outer notification reference in WHERE, not a nested JOIN ON.
function chatNotificationSource(recipientRole) {
  return `EXISTS (
 SELECT 1 FROM community_chat_messages chat_message
 JOIN community_chat_rooms chat_room ON chat_room.id = chat_message.room_id AND chat_room.status = 'active'
 JOIN user chat_sender ON chat_sender.id = chat_message.user_id AND chat_sender.del_flag = 0
 JOIN user chat_recipient ON ${recipientRole} AND chat_recipient.del_flag = 0
 LEFT JOIN community_chat_members chat_membership ON chat_membership.user_id = chat_recipient.id
 WHERE chat_recipient.id = notification.user_id
   AND chat_message.public_id = CONVERT(notification.source_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
   AND chat_message.status = 'active' AND chat_message.user_id <> chat_recipient.id
   AND COALESCE(chat_membership.status, '') <> 'banned'
   AND NOT EXISTS (SELECT 1 FROM community_chat_blocks blocked
     WHERE (blocked.user_id = chat_recipient.id AND blocked.blocked_user_id = chat_sender.id)
        OR (blocked.user_id = chat_sender.id AND blocked.blocked_user_id = chat_recipient.id))
   AND NOT EXISTS (SELECT 1 FROM community_chat_message_deletions deletion
     WHERE deletion.message_id = chat_message.id AND deletion.user_id = chat_recipient.id)
)`;
}
const rootSubscriptionSource = chatNotificationSource("chat_recipient.role = 'root'");
const targetedSource = chatNotificationSource("chat_recipient.role <> 'visitor'");
export const COMMUNITY_CHAT_TARGETED_NOTIFICATION_SQL = `(
  (type <> 'community_chat' AND COALESCE(source_type, '') <> 'community_chat_message')
  OR (COALESCE(JSON_UNQUOTE(JSON_EXTRACT(meta, '$.kind')), '') IN ('reply', 'mention')
      AND (COALESCE(source_type, '') <> 'community_chat_message' OR ${targetedSource}))
  OR (type = 'community_chat' AND source_type = 'community_chat_message'
      AND JSON_UNQUOTE(JSON_EXTRACT(meta, '$.kind')) = 'subscription' AND ${rootSubscriptionSource})
)`;
export const COMMUNITY_CHAT_DELIVERY_NOTIFICATION_SQL = `(${COMMUNITY_CHAT_TARGETED_NOTIFICATION_SQL}
 AND (type <> 'community_chat' OR COALESCE(JSON_UNQUOTE(JSON_EXTRACT(meta, '$.kind')), '') <> 'subscription'
   OR (COALESCE(JSON_UNQUOTE(JSON_EXTRACT(meta, '$.subscriptionCancelled')), '0') <> '1'
     AND EXISTS (SELECT 1 FROM user chat_owner
       LEFT JOIN community_chat_user_settings chat_settings ON chat_settings.user_id = chat_owner.id
       WHERE chat_owner.id = notification.user_id AND chat_owner.role = 'root' AND chat_owner.del_flag = 0
       AND COALESCE(chat_settings.root_all_messages_enabled, 1) = 1
       AND COALESCE(chat_settings.global_notification_enabled, 1) = 1
       AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(chat_owner.preferences, '$.notificationsInApp')), 'true') <> 'false'))))`;
