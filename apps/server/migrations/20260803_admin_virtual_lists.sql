-- 后台虚拟列表游标与用户最近活跃排序。
-- MySQL 5.7 幂等迁移：先补列并回填，再补稳定排序索引。

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'user' AND column_name = 'last_active_time'
);
SET @ddl := IF(
  @column_exists = 0,
  'ALTER TABLE `user` ADD COLUMN `last_active_time` DATETIME NULL AFTER `create_time`',
  'SELECT ''user.last_active_time already exists'''
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 会话退出后会被删除，因此把当前会话、API、操作日志的最大时间一次性固化到 user。
UPDATE `user` u
LEFT JOIN (
  SELECT activity.user_id, MAX(activity.active_at) AS active_at
  FROM (
    SELECT user_id, last_active_time AS active_at FROM user_sessions
    UNION ALL
    SELECT user_id, request_time AS active_at FROM api_logs WHERE del_flag = '0'
    UNION ALL
    SELECT create_by AS user_id, create_time AS active_at FROM operation_logs WHERE del_flag = '0'
  ) activity
  WHERE activity.user_id IS NOT NULL AND activity.active_at IS NOT NULL
  GROUP BY activity.user_id
) latest ON latest.user_id = u.id
SET u.last_active_time = GREATEST(
  COALESCE(u.last_active_time, '1970-01-01 00:00:00'),
  COALESCE(latest.active_at, '1970-01-01 00:00:00'),
  COALESCE(u.create_time, CURRENT_TIMESTAMP)
)
WHERE u.last_active_time IS NULL;

SET @column_ready := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'user'
    AND column_name = 'last_active_time'
    AND is_nullable = 'NO'
    AND UPPER(column_default) IN ('CURRENT_TIMESTAMP', 'CURRENT_TIMESTAMP()')
);
SET @ddl := IF(
  @column_ready = 0,
  'ALTER TABLE `user` MODIFY COLUMN `last_active_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER `create_time`',
  'SELECT ''user.last_active_time already normalized'''
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'user' AND index_name = 'idx_user_active_list'
);
SET @ddl := IF(
  @idx_exists = 0,
  'ALTER TABLE `user` ADD KEY `idx_user_active_list` (`del_flag`, `last_active_time`, `id`)',
  'SELECT ''idx_user_active_list already exists'''
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'user' AND index_name = 'idx_user_created_list'
);
SET @ddl := IF(
  @idx_exists = 0,
  'ALTER TABLE `user` ADD KEY `idx_user_created_list` (`del_flag`, `create_time`, `id`)',
  'SELECT ''idx_user_created_list already exists'''
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'api_logs' AND index_name = 'idx_api_logs_admin_list'
);
SET @ddl := IF(
  @idx_exists = 0,
  'ALTER TABLE `api_logs` ADD KEY `idx_api_logs_admin_list` (`del_flag`, `request_time`, `id`)',
  'SELECT ''idx_api_logs_admin_list already exists'''
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'operation_logs' AND index_name = 'idx_operation_logs_admin_list'
);
SET @ddl := IF(
  @idx_exists = 0,
  'ALTER TABLE `operation_logs` ADD KEY `idx_operation_logs_admin_list` (`del_flag`, `create_time`, `id`)',
  'SELECT ''idx_operation_logs_admin_list already exists'''
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'agent_logs' AND index_name = 'idx_agent_logs_admin_list'
);
SET @table_exists := (
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'agent_logs'
);
SET @ddl := IF(
  @table_exists = 1 AND @idx_exists = 0,
  'ALTER TABLE `agent_logs` ADD KEY `idx_agent_logs_admin_list` (`created_at`, `id`)',
  'SELECT ''agent_logs missing or idx_agent_logs_admin_list already exists'''
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
