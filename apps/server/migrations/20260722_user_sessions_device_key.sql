-- 登录设备归并：同一浏览器设备重复登录不再累积为多条“设备”。
-- 服务端仅存 X-Device-Id 的 SHA-256 摘要 device_key；原始设备标识不入库。
-- 项目没有自动迁移 runner，请在部署新后端前由 DBA/owner 手工执行；幂等。
-- 历史 session 没有可信设备标识，不能安全回填或删除，仍由列表层按 IP + 规范化 UA 保守聚合。

SET @has_device_key := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_sessions' AND COLUMN_NAME = 'device_key'
);
SET @add_device_key_sql := IF(
  @has_device_key = 0,
  'ALTER TABLE `user_sessions` ADD COLUMN `device_key` CHAR(64) NULL AFTER `user_agent`',
  'SELECT ''user_sessions.device_key already exists'''
);
PREPARE stmt FROM @add_device_key_sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_user_device_index := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_sessions' AND INDEX_NAME = 'idx_user_sessions_user_device_key'
);
SET @add_user_device_index_sql := IF(
  @has_user_device_index = 0,
  'ALTER TABLE `user_sessions` ADD KEY `idx_user_sessions_user_device_key` (`user_id`, `device_key`)',
  'SELECT ''idx_user_sessions_user_device_key already exists'''
);
PREPARE stmt FROM @add_user_device_index_sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
