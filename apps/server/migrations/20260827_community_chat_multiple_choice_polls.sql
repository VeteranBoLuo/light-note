-- 聊天室多选投票：保留旧单选票表的 (message_id, user_id) 唯一约束，
-- 多选使用独立明细表，避免迁移与滚动发布期间改变旧实例的单选写入语义。
-- MySQL 5.7 不支持 ADD COLUMN IF NOT EXISTS，因此通过 information_schema 幂等补列。

SET @chat_poll_selection_mode_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE()
     AND TABLE_NAME='community_chat_polls'
     AND COLUMN_NAME='selection_mode'
);
SET @chat_poll_selection_mode_ddl := IF(
  @chat_poll_selection_mode_exists = 0,
  'ALTER TABLE `community_chat_polls` ADD COLUMN `selection_mode` varchar(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT ''single'' AFTER `message_id`',
  'SELECT 1'
);
PREPARE stmt FROM @chat_poll_selection_mode_ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @chat_poll_max_selections_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE()
     AND TABLE_NAME='community_chat_polls'
     AND COLUMN_NAME='max_selections'
);
SET @chat_poll_max_selections_ddl := IF(
  @chat_poll_max_selections_exists = 0,
  'ALTER TABLE `community_chat_polls` ADD COLUMN `max_selections` tinyint unsigned NOT NULL DEFAULT 1 AFTER `selection_mode`',
  'SELECT 1'
);
PREPARE stmt FROM @chat_poll_max_selections_ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `community_chat_poll_multi_votes` (
  `message_id` bigint unsigned NOT NULL,
  `user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `option_id` bigint unsigned NOT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`message_id`,`user_id`,`option_id`),
  KEY `idx_community_chat_poll_multi_vote_option` (`message_id`,`option_id`),
  KEY `idx_community_chat_poll_multi_vote_user_time` (`user_id`,`update_time`,`message_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
