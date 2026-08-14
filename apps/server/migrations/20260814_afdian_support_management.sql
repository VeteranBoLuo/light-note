-- 爱发电赞助展示偏好、累计榜与后台管理所需结构。
-- MySQL 5.7 兼容，可安全重复执行；历史订单不伪造观察时间。

CREATE TABLE IF NOT EXISTS `support_public_preferences` (
  `user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `public_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `participate_in_ranking` tinyint unsigned NOT NULL DEFAULT 1,
  `show_identity` tinyint unsigned NOT NULL DEFAULT 0,
  `identity_consented_at` datetime DEFAULT NULL,
  `admin_hidden` tinyint unsigned NOT NULL DEFAULT 0,
  `admin_hidden_reason` varchar(255) DEFAULT NULL,
  `admin_hidden_by` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `admin_hidden_at` datetime DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uk_support_public_id` (`public_id`),
  KEY `idx_support_public_visibility` (`participate_in_ranking`,`admin_hidden`,`show_identity`,`update_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @support_provider_name_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='support_account_links' AND COLUMN_NAME='provider_name'
);
SET @support_provider_name_ddl := IF(
  @support_provider_name_exists = 0,
  'ALTER TABLE `support_account_links` ADD COLUMN `provider_name` varchar(100) DEFAULT NULL AFTER `provider_private_id`',
  'SELECT 1'
);
PREPARE stmt FROM @support_provider_name_ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @support_provider_avatar_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='support_account_links' AND COLUMN_NAME='provider_avatar_url'
);
SET @support_provider_avatar_ddl := IF(
  @support_provider_avatar_exists = 0,
  'ALTER TABLE `support_account_links` ADD COLUMN `provider_avatar_url` varchar(1024) DEFAULT NULL AFTER `provider_name`',
  'SELECT 1'
);
PREPARE stmt FROM @support_provider_avatar_ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @support_identity_refreshed_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='support_account_links' AND COLUMN_NAME='identity_refreshed_at'
);
SET @support_identity_refreshed_ddl := IF(
  @support_identity_refreshed_exists = 0,
  'ALTER TABLE `support_account_links` ADD COLUMN `identity_refreshed_at` datetime DEFAULT NULL AFTER `provider_avatar_url`',
  'SELECT 1'
);
PREPARE stmt FROM @support_identity_refreshed_ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @support_ranking_observed_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='support_orders' AND COLUMN_NAME='ranking_observed_at'
);
SET @support_ranking_observed_ddl := IF(
  @support_ranking_observed_exists = 0,
  'ALTER TABLE `support_orders` ADD COLUMN `ranking_observed_at` datetime DEFAULT NULL AFTER `verified_at`',
  'SELECT 1'
);
PREPARE stmt FROM @support_ranking_observed_ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @support_ranking_index_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='support_orders' AND INDEX_NAME='idx_support_order_ranking'
);
SET @support_ranking_index_ddl := IF(
  @support_ranking_index_exists = 0,
  'ALTER TABLE `support_orders` ADD KEY `idx_support_order_ranking` (`verification_state`,`provider_status`,`ranking_observed_at`,`light_note_user_id`)',
  'SELECT 1'
);
PREPARE stmt FROM @support_ranking_index_ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
