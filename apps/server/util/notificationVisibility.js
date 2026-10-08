// 通知中心与原生同步共用：聊天室普通消息只驱动角标，仅回复和显式 @ 进入通知中心。
export const COMMUNITY_CHAT_TARGETED_NOTIFICATION_SQL = `(
  (type <> 'community_chat' AND COALESCE(source_type, '') <> 'community_chat_message')
  OR COALESCE(JSON_UNQUOTE(JSON_EXTRACT(meta, '$.kind')), '') IN ('reply', 'mention')
)`;
