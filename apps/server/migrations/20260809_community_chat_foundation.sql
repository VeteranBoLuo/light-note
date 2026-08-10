-- 社区客厅 Stage 0：公开浏览、登录发言、通知默认开启为 mentions 档与单一公共消息流。
-- MySQL 5.7 兼容；功能开关与迁移分离，建表不会自动开放聊天室。
-- 手工迁移主路径；应用启动期 ensureCommunityChatSchema.js 仅幂等补齐同一组新表与官方频道。

CREATE TABLE IF NOT EXISTS `community_chat_rooms` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `slug` varchar(64) NOT NULL,
  `name_zh` varchar(80) NOT NULL,
  `name_en` varchar(80) NOT NULL,
  `description_zh` varchar(280) NOT NULL DEFAULT '',
  `description_en` varchar(280) NOT NULL DEFAULT '',
  `type` varchar(24) NOT NULL DEFAULT 'text',
  `status` varchar(24) NOT NULL DEFAULT 'active',
  `default_notification_level` varchar(16) NOT NULL DEFAULT 'mentions',
  `slow_mode_seconds` smallint unsigned NOT NULL DEFAULT 0,
  `last_message_id` bigint unsigned DEFAULT NULL,
  `sort_order` int unsigned NOT NULL DEFAULT 0,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_community_chat_room_slug` (`slug`),
  KEY `idx_community_chat_room_status_sort` (`status`, `sort_order`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `community_chat_access_requests` (
  `id` char(36) NOT NULL,
  `user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'pending',
  `request_message` varchar(500) NOT NULL DEFAULT '',
  `reviewed_by` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `review_note` varchar(500) NOT NULL DEFAULT '',
  `reviewed_at` datetime DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_community_chat_access_user` (`user_id`),
  KEY `idx_community_chat_access_status_time` (`status`, `create_time`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `community_chat_members` (
  `user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `role` varchar(16) NOT NULL DEFAULT 'member',
  `status` varchar(16) NOT NULL DEFAULT 'invited',
  `invited_by` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `rules_version` varchar(32) DEFAULT NULL,
  `rules_accepted_at` datetime DEFAULT NULL,
  `joined_at` datetime DEFAULT NULL,
  `revoked_at` datetime DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  KEY `idx_community_chat_member_status_role` (`status`, `role`, `update_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `community_chat_user_settings` (
  `user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `global_notification_enabled` tinyint unsigned NOT NULL DEFAULT 1,
  `browser_notification_enabled` tinyint unsigned NOT NULL DEFAULT 0,
  `android_notification_enabled` tinyint unsigned NOT NULL DEFAULT 0,
  `lock_screen_preview` varchar(16) NOT NULL DEFAULT 'hidden',
  `default_room_level` varchar(16) NOT NULL DEFAULT 'mentions',
  `dnd_enabled` tinyint unsigned NOT NULL DEFAULT 0,
  `dnd_start` time NOT NULL DEFAULT '22:00:00',
  `dnd_end` time NOT NULL DEFAULT '08:00:00',
  `timezone_offset_minutes` smallint NOT NULL DEFAULT 0,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `community_chat_access_audit` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `actor_user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `target_user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `action` varchar(32) NOT NULL,
  `reason` varchar(500) NOT NULL DEFAULT '',
  `metadata` json DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_community_chat_audit_target_time` (`target_user_id`, `create_time`, `id`),
  KEY `idx_community_chat_audit_actor_time` (`actor_user_id`, `create_time`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `community_chat_rooms`
  (`slug`, `name_zh`, `name_en`, `description_zh`, `description_en`, `type`, `default_notification_level`, `sort_order`)
VALUES
  ('general', '轻笺聊天室', 'Light Note Chat', '聊使用问题、实用技巧、功能想法和日常见闻。', 'Discuss product questions, useful workflows, ideas, and everyday topics.', 'text', 'mentions', 10)
ON DUPLICATE KEY UPDATE
  `name_zh` = VALUES(`name_zh`),
  `name_en` = VALUES(`name_en`),
  `description_zh` = VALUES(`description_zh`),
  `description_en` = VALUES(`description_en`),
  `type` = VALUES(`type`),
  `status` = 'active',
  `default_notification_level` = VALUES(`default_notification_level`),
  `sort_order` = VALUES(`sort_order`);
