-- 给 conversion_events 补 ip 列(幂等;表已存在的环境用此迁移,DBA 手动执行)
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'conversion_events' AND COLUMN_NAME = 'ip');
SET @ddl := IF(@col = 0,
  "ALTER TABLE `conversion_events` ADD COLUMN `ip` varchar(64) DEFAULT NULL AFTER `context`",
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
