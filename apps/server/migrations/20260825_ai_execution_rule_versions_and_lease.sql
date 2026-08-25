-- AI Execution 规则版本与租约：历史账单可按规则重放，进程中断的 running 执行可安全回收。
-- MySQL 5.7 无 ADD COLUMN/INDEX IF NOT EXISTS，按 information_schema 幂等执行。

SET @col := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=DATABASE() AND table_name='ai_executions' AND column_name='billing_rule_version'
);
SET @ddl := IF(
  @col = 0,
  'ALTER TABLE `ai_executions` ADD COLUMN `billing_rule_version` INT NOT NULL DEFAULT 1 AFTER `skill_version`',
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=DATABASE() AND table_name='ai_executions' AND column_name='validation_rule_version'
);
SET @ddl := IF(
  @col = 0,
  'ALTER TABLE `ai_executions` ADD COLUMN `validation_rule_version` INT NOT NULL DEFAULT 1 AFTER `billing_rule_version`',
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=DATABASE() AND table_name='ai_executions' AND column_name='lease_expires_at'
);
SET @ddl := IF(
  @col = 0,
  'ALTER TABLE `ai_executions` ADD COLUMN `lease_expires_at` DATETIME DEFAULT NULL AFTER `quota_reservation_key`',
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 旧进程遗留的 running 行以最后更新时间为租约起点；超过一小时的行会被回收器立即认领。
UPDATE ai_executions
SET lease_expires_at=DATE_ADD(updated_at, INTERVAL 60 MINUTE)
WHERE status='running' AND lease_expires_at IS NULL;

SET @idx := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema=DATABASE() AND table_name='ai_executions' AND index_name='idx_ai_execution_lease'
);
SET @ddl := IF(
  @idx = 0,
  'ALTER TABLE `ai_executions` ADD KEY `idx_ai_execution_lease` (`status`,`lease_expires_at`)',
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
