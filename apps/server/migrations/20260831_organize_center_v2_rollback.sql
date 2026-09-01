-- 仅用于尚未产生新版本写入的紧急回滚。默认回滚页面/路由时应保留这些附加事实。
DROP TABLE IF EXISTS organize_action_requests;
DROP TABLE IF EXISTS organize_issue_suppressions;

SET @schema_name = DATABASE();
SET @has_health_index = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'bookmark_health' AND INDEX_NAME = 'idx_bookmark_health_observed'
);
SET @sql = IF(@has_health_index > 0,
  'ALTER TABLE `bookmark_health` DROP KEY `idx_bookmark_health_observed`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_override_at = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'bookmark_health' AND COLUMN_NAME = 'override_at');
SET @sql = IF(@has_override_at > 0, 'ALTER TABLE `bookmark_health` DROP COLUMN `override_at`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @has_user_override = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'bookmark_health' AND COLUMN_NAME = 'user_override');
SET @sql = IF(@has_user_override > 0, 'ALTER TABLE `bookmark_health` DROP COLUMN `user_override`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @has_checked_hash = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'bookmark_health' AND COLUMN_NAME = 'checked_url_hash');
SET @sql = IF(@has_checked_hash > 0, 'ALTER TABLE `bookmark_health` DROP COLUMN `checked_url_hash`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @has_observed_code = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'bookmark_health' AND COLUMN_NAME = 'observed_code');
SET @sql = IF(@has_observed_code > 0, 'ALTER TABLE `bookmark_health` DROP COLUMN `observed_code`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @has_observed_status = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'bookmark_health' AND COLUMN_NAME = 'observed_status');
SET @sql = IF(@has_observed_status > 0, 'ALTER TABLE `bookmark_health` DROP COLUMN `observed_status`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_url_hash_index = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'bookmark' AND INDEX_NAME = 'idx_bookmark_exact_url');
SET @sql = IF(@has_url_hash_index > 0, 'ALTER TABLE `bookmark` DROP KEY `idx_bookmark_exact_url`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @has_url_hash = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'bookmark' AND COLUMN_NAME = 'url_exact_hash');
SET @sql = IF(@has_url_hash > 0, 'ALTER TABLE `bookmark` DROP COLUMN `url_exact_hash`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
