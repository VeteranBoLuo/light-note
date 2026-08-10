-- 后台产品洞察只做聚合读取；为留存与功能采用查询补齐所有者 + 时间复合索引。
-- MySQL 5.7 不支持 ADD INDEX IF NOT EXISTS，使用 information_schema 保持可重复执行。

SET @idx := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema=DATABASE() AND table_name='api_logs' AND index_name='idx_api_logs_user_time'
);
SET @ddl := IF(
  @idx = 0,
  'ALTER TABLE `api_logs` ADD KEY `idx_api_logs_user_time` (`user_id`,`request_time`)',
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema=DATABASE() AND table_name='conversion_events' AND index_name='idx_conversion_user_event_time'
);
SET @ddl := IF(
  @idx = 0,
  'ALTER TABLE `conversion_events` ADD KEY `idx_conversion_user_event_time` (`user_id`,`event`,`create_time`)',
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema=DATABASE() AND table_name='bookmark' AND index_name='idx_bookmark_owner_create'
);
SET @ddl := IF(
  @idx = 0,
  'ALTER TABLE `bookmark` ADD KEY `idx_bookmark_owner_create` (`create_time`,`del_flag`,`user_id`)',
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema=DATABASE() AND table_name='files' AND index_name='idx_files_owner_create'
);
SET @ddl := IF(
  @idx = 0,
  'ALTER TABLE `files` ADD KEY `idx_files_owner_create` (`create_time`,`del_flag`,`create_by`)',
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema=DATABASE() AND table_name='ai_product_events' AND index_name='idx_ai_product_subject_time'
);
SET @ddl := IF(
  @idx = 0,
  'ALTER TABLE `ai_product_events` ADD KEY `idx_ai_product_subject_time` (`subject_user_id`,`create_time`,`event_name`,`admin_context_mode`)',
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
