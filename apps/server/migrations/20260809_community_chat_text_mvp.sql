-- 社区客厅文本 MVP：纯文本消息、幂等发送、回复引用、历史游标、阅读位置与站内未读。
-- MySQL 5.7 兼容；建表不会自动开放消息，仍需显式配置邀请制与 COMMUNITY_CHAT_MESSAGING_ENABLED=true。

CREATE TABLE IF NOT EXISTS `community_chat_messages` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) NOT NULL,
  `room_id` bigint unsigned NOT NULL,
  `user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `client_request_id` varchar(64) NOT NULL,
  `reply_to_id` bigint unsigned DEFAULT NULL,
  `content` text NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'active',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `edited_at` datetime DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_community_chat_message_public` (`public_id`),
  UNIQUE KEY `uk_community_chat_message_request` (`user_id`,`client_request_id`),
  KEY `idx_community_chat_message_room_status_id` (`room_id`,`status`,`id`),
  KEY `idx_community_chat_message_reply` (`reply_to_id`),
  KEY `idx_community_chat_message_user_time` (`user_id`,`create_time`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `community_chat_reads` (
  `room_id` bigint unsigned NOT NULL,
  `user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `last_read_message_id` bigint unsigned NOT NULL DEFAULT 0,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`room_id`,`user_id`),
  KEY `idx_community_chat_read_user_time` (`user_id`,`update_time`,`room_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
