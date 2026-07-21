-- AI Change Set 可选保留期清理索引（在基础表迁移后执行）。
-- 清理器默认关闭；只有对应保留天数环境变量为正整数时才启用。
-- MySQL 5.7 兼容：使用 information_schema + PREPARE，允许安全重复执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @table_exists := (
  SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_change_sets'
);
SET @index_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_change_sets'
    AND INDEX_NAME = 'idx_ai_change_set_retention'
);
SET @ddl := IF(
  @table_exists = 1 AND @index_exists = 0,
  'ALTER TABLE ai_change_sets ADD KEY idx_ai_change_set_retention (status, update_time, conversation_id)',
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
