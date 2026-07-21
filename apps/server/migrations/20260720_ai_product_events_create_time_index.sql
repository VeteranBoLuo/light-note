-- 遥测保留期清理 `DELETE FROM ai_product_events WHERE create_time < ... LIMIT ?` 仅按 create_time 过滤，
-- 而现有三个索引都以 event_name / owner / context 为最左列（create_time 只作次列），无法服务该范围删除，
-- 事件累积后每次清理都会全表扫描。补一个 create_time 独立索引专供保留期清理。
-- MySQL 5.7 兼容：使用 information_schema + PREPARE，允许安全重复执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @table_exists := (
  SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_product_events'
);
SET @index_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_product_events'
    AND INDEX_NAME = 'idx_ai_product_event_create_time'
);
SET @ddl := IF(
  @table_exists = 1 AND @index_exists = 0,
  'ALTER TABLE ai_product_events ADD KEY idx_ai_product_event_create_time (create_time)',
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
