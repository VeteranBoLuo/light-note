-- 管理员签到排行榜读取有效签到账本时按 source/status 过滤并按 user/day 顺序聚合。
-- MySQL 5.7 不支持 ADD INDEX IF NOT EXISTS；以 information_schema 检查后幂等添加。

SET @table_exists := (
  SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'growth_events'
);
SET @index_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'growth_events'
    AND INDEX_NAME = 'idx_checkin_ranking'
);
SET @ddl := IF(
  @table_exists = 1 AND @index_exists = 0,
  'ALTER TABLE `growth_events` ADD KEY `idx_checkin_ranking` (`source`, `status`, `user_id`, `day`)',
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
