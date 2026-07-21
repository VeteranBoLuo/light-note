-- Change Set 原子失败诊断与安全重试状态。
-- MySQL 5.7 不支持 ADD COLUMN IF NOT EXISTS，统一通过 information_schema 幂等执行。

SET @table_exists := (
  SELECT COUNT(*)
    FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_change_sets'
);

SET @column_exists := (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_change_sets' AND COLUMN_NAME = 'preview_revision'
);
SET @ddl := IF(
  @table_exists = 1 AND @column_exists = 0,
  'ALTER TABLE ai_change_sets ADD COLUMN preview_revision INT UNSIGNED NOT NULL DEFAULT 1',
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_change_sets' AND COLUMN_NAME = 'retry_json'
);
SET @ddl := IF(
  @table_exists = 1 AND @column_exists = 0,
  'ALTER TABLE ai_change_sets ADD COLUMN retry_json JSON NULL',
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_change_sets' AND COLUMN_NAME = 'attempt_count'
);
SET @ddl := IF(
  @table_exists = 1 AND @column_exists = 0,
  'ALTER TABLE ai_change_sets ADD COLUMN attempt_count INT UNSIGNED NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_change_sets' AND COLUMN_NAME = 'last_attempt_at'
);
SET @ddl := IF(
  @table_exists = 1 AND @column_exists = 0,
  'ALTER TABLE ai_change_sets ADD COLUMN last_attempt_at DATETIME NULL',
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
