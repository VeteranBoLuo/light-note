-- 社区公开身份、稳定提及、表情消息与账号私有自定义表情库契约。
-- MySQL 5.7 兼容：公开关系键使用不可变 UUID；community_id 仅用于展示和搜索。

CREATE TABLE IF NOT EXISTS `community_chat_user_identities` (
  `user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `public_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `community_id` varchar(11) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uk_community_chat_identity_public` (`public_id`),
  UNIQUE KEY `uk_community_chat_identity_community` (`community_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @chat_payload_fingerprint_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='community_chat_messages' AND COLUMN_NAME='payload_fingerprint'
);
SET @chat_payload_fingerprint_ddl := IF(
  @chat_payload_fingerprint_exists = 0,
  'ALTER TABLE `community_chat_messages` ADD COLUMN `payload_fingerprint` char(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL AFTER `client_request_id`',
  'SELECT 1'
);
PREPARE stmt FROM @chat_payload_fingerprint_ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @chat_message_kind_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='community_chat_messages' AND COLUMN_NAME='message_kind'
);
SET @chat_message_kind_ddl := IF(
  @chat_message_kind_exists = 0,
  'ALTER TABLE `community_chat_messages` ADD COLUMN `message_kind` varchar(16) NOT NULL DEFAULT ''text'' AFTER `reply_to_id`',
  'SELECT 1'
);
PREPARE stmt FROM @chat_message_kind_ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @chat_sticker_source_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='community_chat_messages' AND COLUMN_NAME='sticker_source'
);
SET @chat_sticker_source_ddl := IF(
  @chat_sticker_source_exists = 0,
  'ALTER TABLE `community_chat_messages` ADD COLUMN `sticker_source` varchar(16) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL AFTER `message_kind`',
  'SELECT 1'
);
PREPARE stmt FROM @chat_sticker_source_ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @chat_sticker_key_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='community_chat_messages' AND COLUMN_NAME='sticker_key'
);
SET @chat_sticker_key_ddl := IF(
  @chat_sticker_key_exists = 0,
  'ALTER TABLE `community_chat_messages` ADD COLUMN `sticker_key` varchar(80) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL AFTER `sticker_source`',
  'SELECT 1'
);
PREPARE stmt FROM @chat_sticker_key_ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @chat_mention_everyone_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='community_chat_messages' AND COLUMN_NAME='mention_everyone'
);
SET @chat_mention_everyone_ddl := IF(
  @chat_mention_everyone_exists = 0,
  'ALTER TABLE `community_chat_messages` ADD COLUMN `mention_everyone` tinyint unsigned NOT NULL DEFAULT 0 AFTER `sticker_key`',
  'SELECT 1'
);
PREPARE stmt FROM @chat_mention_everyone_ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `community_chat_custom_stickers` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `object_key` varchar(512) NOT NULL,
  `content_sha256` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `content_type` varchar(64) NOT NULL,
  `file_size` int unsigned NOT NULL,
  `width` int unsigned NOT NULL,
  `height` int unsigned NOT NULL,
  `name` varchar(40) NOT NULL DEFAULT '',
  `status` varchar(24) NOT NULL DEFAULT 'uploading',
  `sort_order` int unsigned NOT NULL DEFAULT 0,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_community_chat_custom_sticker_public` (`public_id`),
  UNIQUE KEY `uk_community_chat_custom_sticker_content` (`user_id`,`content_sha256`),
  KEY `idx_community_chat_custom_sticker_owner_status` (`user_id`,`status`,`sort_order`,`id`),
  KEY `idx_community_chat_custom_sticker_status_time` (`status`,`update_time`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @chat_mention_sort_order_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='community_chat_message_mentions' AND COLUMN_NAME='sort_order'
);
SET @chat_mention_sort_order_ddl := IF(
  @chat_mention_sort_order_exists = 0,
  'ALTER TABLE `community_chat_message_mentions` ADD COLUMN `sort_order` tinyint unsigned NOT NULL DEFAULT 0 AFTER `mentioned_user_id`',
  'SELECT 1'
);
PREPARE stmt FROM @chat_mention_sort_order_ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @chat_mention_name_snapshot_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='community_chat_message_mentions' AND COLUMN_NAME='display_name_snapshot'
);
SET @chat_mention_name_snapshot_ddl := IF(
  @chat_mention_name_snapshot_exists = 0,
  'ALTER TABLE `community_chat_message_mentions` ADD COLUMN `display_name_snapshot` varchar(80) NOT NULL DEFAULT '''' AFTER `sort_order`',
  'SELECT 1'
);
PREPARE stmt FROM @chat_mention_name_snapshot_ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @chat_mention_community_snapshot_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='community_chat_message_mentions' AND COLUMN_NAME='community_id_snapshot'
);
SET @chat_mention_community_snapshot_ddl := IF(
  @chat_mention_community_snapshot_exists = 0,
  'ALTER TABLE `community_chat_message_mentions` ADD COLUMN `community_id_snapshot` varchar(11) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL DEFAULT '''' AFTER `display_name_snapshot`',
  'SELECT 1'
);
PREPARE stmt FROM @chat_mention_community_snapshot_ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 既有账号的随机社区 ID 由发布前的显式 Node 回填脚本生成；SQL migration 不伪造弱随机码。
