-- 给 operation_logs 补 ip 列(幂等;表已存在的环境用此迁移,DBA 手动执行,部署脚本不跑迁移)
-- 加列后 recordOperationLogs 会写入真实客户端 IP;历史行 ip 为 NULL(无法按 IP 追溯)
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operation_logs' AND COLUMN_NAME = 'ip');
SET @ddl := IF(@col = 0,
  "ALTER TABLE `operation_logs` ADD COLUMN `ip` varchar(255) CHARACTER SET utf8 DEFAULT NULL COMMENT 'ip地址' AFTER `create_by`",
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
