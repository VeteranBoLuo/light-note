-- API 日志隐私、emoji 兼容与保留期清理索引。
-- MySQL 5.7 幂等：文本列已是 utf8mb4 时不重建表，索引已存在时不重复创建。

SET @api_log_text_needs_utf8mb4 := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'api_logs'
    AND column_name IN ('url', 'req', 'system')
    AND character_set_name <> 'utf8mb4'
);
SET @ddl := IF(
  @api_log_text_needs_utf8mb4 > 0,
  'ALTER TABLE `api_logs`
     MODIFY COLUMN `url` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT ''调用的接口路径'',
     MODIFY COLUMN `req` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
     MODIFY COLUMN `system` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT ''系统信息''',
  'SELECT ''api_logs text columns already use utf8mb4'''
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @api_log_retention_index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'api_logs'
    AND index_name = 'idx_api_logs_retention'
);
SET @ddl := IF(
  @api_log_retention_index_exists = 0,
  'ALTER TABLE `api_logs` ADD KEY `idx_api_logs_retention` (`request_time`, `id`)',
  'SELECT ''idx_api_logs_retention already exists'''
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
