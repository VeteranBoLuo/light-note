-- 公共聊天室单条全局置顶消息。
-- MySQL 5.7 兼容；房间只保存当前置顶指针，正文仍以消息表为唯一事实来源。

SET @community_chat_pinned_message_id_exists := (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'community_chat_rooms'
     AND COLUMN_NAME = 'pinned_message_id'
);
SET @community_chat_pinned_message_id_ddl := IF(
  @community_chat_pinned_message_id_exists = 0,
  'ALTER TABLE `community_chat_rooms` ADD COLUMN `pinned_message_id` bigint unsigned DEFAULT NULL AFTER `last_message_id`',
  'SELECT 1'
);
PREPARE stmt FROM @community_chat_pinned_message_id_ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @community_chat_pinned_by_exists := (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'community_chat_rooms'
     AND COLUMN_NAME = 'pinned_by'
);
SET @community_chat_pinned_by_ddl := IF(
  @community_chat_pinned_by_exists = 0,
  'ALTER TABLE `community_chat_rooms` ADD COLUMN `pinned_by` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL AFTER `pinned_message_id`',
  'SELECT 1'
);
PREPARE stmt FROM @community_chat_pinned_by_ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @community_chat_pinned_at_exists := (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'community_chat_rooms'
     AND COLUMN_NAME = 'pinned_at'
);
SET @community_chat_pinned_at_ddl := IF(
  @community_chat_pinned_at_exists = 0,
  'ALTER TABLE `community_chat_rooms` ADD COLUMN `pinned_at` datetime DEFAULT NULL AFTER `pinned_by`',
  'SELECT 1'
);
PREPARE stmt FROM @community_chat_pinned_at_ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
