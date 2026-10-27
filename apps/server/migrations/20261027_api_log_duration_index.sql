-- API 日志最低耗时筛选的覆盖索引；不回填、修改或清理历史日志。
-- MySQL 5.7 幂等，显式要求在线添加，不能在线执行时失败而非退回锁表复制。
SET @api_log_duration_index_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'api_logs'
    AND index_name = 'idx_api_logs_duration_time'
);
SET @ddl := IF(
  @api_log_duration_index_exists = 0,
  'ALTER TABLE `api_logs` ADD KEY `idx_api_logs_duration_time` (`del_flag`, `duration_ms`, `request_time`, `user_id`), ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT ''idx_api_logs_duration_time already exists'''
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
