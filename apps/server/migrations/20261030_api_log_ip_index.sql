-- API 日志按 IP 统计、清理与关联账号查询的索引；不回填、修改或清理历史日志。
-- 无该索引时按 IP 物理清理会全表扫描并给扫过的每一行加锁，阻塞全站请求的日志写入。
-- MySQL 5.7 幂等，显式要求在线添加，不能在线执行时失败而非退回锁表复制。
SET @api_log_ip_index_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'api_logs'
    AND index_name = 'idx_api_logs_ip_time'
);
SET @ddl := IF(
  @api_log_ip_index_exists = 0,
  'ALTER TABLE `api_logs` ADD KEY `idx_api_logs_ip_time` (`ip`, `request_time`), ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT ''idx_api_logs_ip_time already exists'''
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
