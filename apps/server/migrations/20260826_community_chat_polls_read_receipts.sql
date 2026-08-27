-- Root 投票与逐消息已读回执。所有截止时间显式保存为 UTC，避免依赖数据库会话时区。
-- MySQL 5.7 不支持 ADD COLUMN IF NOT EXISTS，因此消息开关列使用 information_schema 幂等补齐。

SET @chat_read_receipt_enabled_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE()
     AND TABLE_NAME='community_chat_messages'
     AND COLUMN_NAME='read_receipt_enabled'
);
SET @chat_read_receipt_enabled_ddl := IF(
  @chat_read_receipt_enabled_exists = 0,
  'ALTER TABLE `community_chat_messages` ADD COLUMN `read_receipt_enabled` tinyint unsigned NOT NULL DEFAULT 0 AFTER `mention_everyone`',
  'SELECT 1'
);
PREPARE stmt FROM @chat_read_receipt_enabled_ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `community_chat_polls` (
  `message_id` bigint unsigned NOT NULL,
  `ends_at_utc` datetime(3) NOT NULL,
  `closed_at_utc` datetime(3) DEFAULT NULL,
  `closed_by` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`message_id`),
  KEY `idx_community_chat_poll_deadline` (`ends_at_utc`,`message_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `community_chat_poll_options` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `message_id` bigint unsigned NOT NULL,
  `label` varchar(80) NOT NULL,
  `sort_order` tinyint unsigned NOT NULL DEFAULT 0,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_community_chat_poll_option_public` (`public_id`),
  UNIQUE KEY `uk_community_chat_poll_option_order` (`message_id`,`sort_order`),
  KEY `idx_community_chat_poll_option_message` (`message_id`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `community_chat_poll_votes` (
  `message_id` bigint unsigned NOT NULL,
  `user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `option_id` bigint unsigned NOT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`message_id`,`user_id`),
  KEY `idx_community_chat_poll_vote_option` (`message_id`,`option_id`),
  KEY `idx_community_chat_poll_vote_user_time` (`user_id`,`update_time`,`message_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `community_chat_message_read_receipts` (
  `message_id` bigint unsigned NOT NULL,
  `user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `first_seen_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`message_id`,`user_id`),
  KEY `idx_community_chat_receipt_user_time` (`user_id`,`first_seen_at`,`message_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
