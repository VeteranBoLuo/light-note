-- 聊天室临时附件：普通文件、图片元数据保留及统一预览来源。
-- MySQL 5.7 兼容；历史图片只回填 30 天期限，不在 migration 中删除 OBS 对象。

CREATE TABLE IF NOT EXISTS `community_chat_message_files` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `owner_user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `room_id` bigint unsigned NOT NULL,
  `message_id` bigint unsigned DEFAULT NULL,
  `object_key` varchar(512) DEFAULT NULL,
  `file_name` varchar(255) NOT NULL,
  `content_type` varchar(160) NOT NULL DEFAULT 'application/octet-stream',
  `file_size` bigint unsigned NOT NULL,
  `status` varchar(24) NOT NULL DEFAULT 'uploading',
  `sort_order` tinyint unsigned NOT NULL DEFAULT 0,
  `expires_at` datetime NOT NULL,
  `expired_at` datetime DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_community_chat_file_public` (`public_id`),
  UNIQUE KEY `uk_community_chat_file_object` (`object_key`),
  KEY `idx_community_chat_file_owner_status_expiry` (`owner_user_id`,`status`,`expires_at`,`id`),
  KEY `idx_community_chat_file_message_status_sort` (`message_id`,`status`,`sort_order`,`id`),
  KEY `idx_community_chat_file_status_expiry` (`status`,`expires_at`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @has_image_file_name := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'community_chat_message_images' AND COLUMN_NAME = 'file_name'
);
SET @sql := IF(
  @has_image_file_name = 0,
  "ALTER TABLE community_chat_message_images ADD COLUMN file_name varchar(255) NOT NULL DEFAULT '' AFTER object_key",
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_image_expired_at := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'community_chat_message_images' AND COLUMN_NAME = 'expired_at'
);
SET @sql := IF(
  @has_image_expired_at = 0,
  'ALTER TABLE community_chat_message_images ADD COLUMN expired_at datetime DEFAULT NULL AFTER expires_at',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

ALTER TABLE `community_chat_message_images`
  MODIFY COLUMN `object_key` varchar(512) DEFAULT NULL;

UPDATE `community_chat_message_images`
   SET `file_name` = CASE `content_type`
     WHEN 'image/png' THEN '图片.png'
     WHEN 'image/webp' THEN '图片.webp'
     ELSE '图片.jpg'
   END
 WHERE `file_name` = '';

UPDATE `community_chat_message_images` image
JOIN `community_chat_messages` message ON message.id = image.message_id
   SET image.expires_at = DATE_ADD(message.create_time, INTERVAL 30 DAY)
 WHERE image.message_id IS NOT NULL
   AND image.expires_at IS NULL;

SET @has_image_cleanup_index := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'community_chat_message_images'
     AND INDEX_NAME = 'idx_community_chat_image_status_expiry'
);
SET @sql := IF(
  @has_image_cleanup_index = 0,
  'ALTER TABLE community_chat_message_images ADD KEY idx_community_chat_image_status_expiry (status,expires_at,id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_preview_source_type := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'file_preview_artifacts' AND COLUMN_NAME = 'source_type'
);
SET @sql := IF(
  @has_preview_source_type = 0,
  "ALTER TABLE file_preview_artifacts ADD COLUMN source_type varchar(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'cloud_file' AFTER id",
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

ALTER TABLE `file_preview_artifacts`
  MODIFY COLUMN `file_id` bigint unsigned NOT NULL;

SET @preview_index_columns := (
  SELECT GROUP_CONCAT(column_name ORDER BY seq_in_index SEPARATOR ',')
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'file_preview_artifacts'
     AND INDEX_NAME = 'uk_file_preview_artifact'
);
SET @sql := IF(
  @preview_index_columns = 'source_type,file_id,strategy,strategy_version',
  'SELECT 1',
  IF(
    @preview_index_columns IS NULL,
    'ALTER TABLE file_preview_artifacts ADD UNIQUE KEY uk_file_preview_artifact (source_type,file_id,strategy,strategy_version)',
    'ALTER TABLE file_preview_artifacts DROP INDEX uk_file_preview_artifact, ADD UNIQUE KEY uk_file_preview_artifact (source_type,file_id,strategy,strategy_version)'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
