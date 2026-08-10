-- 公共聊天室消息互动：点赞、个人删除与可审计撤回。
-- MySQL 5.7 兼容；个人删除只影响当前用户的历史，撤回保留原始正文/图片供管理员审核查看。

SET @community_chat_recalled_at_exists := (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'community_chat_messages'
     AND COLUMN_NAME = 'recalled_at'
);
SET @community_chat_recalled_at_ddl := IF(
  @community_chat_recalled_at_exists = 0,
  'ALTER TABLE `community_chat_messages` ADD COLUMN `recalled_at` datetime DEFAULT NULL AFTER `edited_at`',
  'SELECT 1'
);
PREPARE stmt FROM @community_chat_recalled_at_ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @community_chat_recalled_by_exists := (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'community_chat_messages'
     AND COLUMN_NAME = 'recalled_by'
);
SET @community_chat_recalled_by_ddl := IF(
  @community_chat_recalled_by_exists = 0,
  'ALTER TABLE `community_chat_messages` ADD COLUMN `recalled_by` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL AFTER `recalled_at`',
  'SELECT 1'
);
PREPARE stmt FROM @community_chat_recalled_by_ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `community_chat_message_likes` (
  `message_id` bigint unsigned NOT NULL,
  `user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`message_id`,`user_id`),
  KEY `idx_community_chat_like_user_time` (`user_id`,`create_time`,`message_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `community_chat_message_deletions` (
  `message_id` bigint unsigned NOT NULL,
  `user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`message_id`,`user_id`),
  KEY `idx_community_chat_deletion_user_time` (`user_id`,`create_time`,`message_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
