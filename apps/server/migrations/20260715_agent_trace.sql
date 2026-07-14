-- Agent / 笔记助手追踪字段（幂等、兼容 MySQL 5.7）。
-- 每个字段和索引独立检测，允许迁移执行一半后安全重跑。

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agent_logs' AND COLUMN_NAME = 'request_id');
SET @ddl := IF(@col = 0, "ALTER TABLE `agent_logs` ADD COLUMN `request_id` varchar(64) DEFAULT NULL AFTER `id`", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agent_logs' AND COLUMN_NAME = 'provider');
SET @ddl := IF(@col = 0, "ALTER TABLE `agent_logs` ADD COLUMN `provider` varchar(32) DEFAULT NULL AFTER `request_id`", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agent_logs' AND COLUMN_NAME = 'model');
SET @ddl := IF(@col = 0, "ALTER TABLE `agent_logs` ADD COLUMN `model` varchar(128) DEFAULT NULL AFTER `provider`", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agent_logs' AND COLUMN_NAME = 'task_type');
SET @ddl := IF(@col = 0, "ALTER TABLE `agent_logs` ADD COLUMN `task_type` varchar(32) NOT NULL DEFAULT 'agent' AFTER `model`", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agent_logs' AND COLUMN_NAME = 'toolset_version');
SET @ddl := IF(@col = 0, "ALTER TABLE `agent_logs` ADD COLUMN `toolset_version` varchar(32) DEFAULT NULL AFTER `task_type`", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agent_logs' AND COLUMN_NAME = 'selected_tools');
SET @ddl := IF(@col = 0, "ALTER TABLE `agent_logs` ADD COLUMN `selected_tools` text DEFAULT NULL AFTER `toolset_version`", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agent_logs' AND COLUMN_NAME = 'finish_reason');
SET @ddl := IF(@col = 0, "ALTER TABLE `agent_logs` ADD COLUMN `finish_reason` varchar(64) DEFAULT NULL AFTER `selected_tools`", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agent_logs' AND COLUMN_NAME = 'first_token_ms');
SET @ddl := IF(@col = 0, "ALTER TABLE `agent_logs` ADD COLUMN `first_token_ms` int DEFAULT NULL AFTER `finish_reason`", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agent_logs' AND COLUMN_NAME = 'planner_ms');
SET @ddl := IF(@col = 0, "ALTER TABLE `agent_logs` ADD COLUMN `planner_ms` int DEFAULT NULL AFTER `first_token_ms`", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agent_logs' AND COLUMN_NAME = 'tool_ms');
SET @ddl := IF(@col = 0, "ALTER TABLE `agent_logs` ADD COLUMN `tool_ms` int DEFAULT NULL AFTER `planner_ms`", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agent_logs' AND COLUMN_NAME = 'final_ms');
SET @ddl := IF(@col = 0, "ALTER TABLE `agent_logs` ADD COLUMN `final_ms` int DEFAULT NULL AFTER `tool_ms`", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agent_logs' AND COLUMN_NAME = 'usage_status');
SET @ddl := IF(@col = 0, "ALTER TABLE `agent_logs` ADD COLUMN `usage_status` varchar(32) DEFAULT NULL AFTER `final_ms`", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agent_logs' AND COLUMN_NAME = 'aborted_stage');
SET @ddl := IF(@col = 0, "ALTER TABLE `agent_logs` ADD COLUMN `aborted_stage` varchar(32) DEFAULT NULL AFTER `usage_status`", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agent_logs' AND INDEX_NAME = 'idx_agent_logs_request_id');
SET @ddl := IF(@idx = 0, "ALTER TABLE `agent_logs` ADD KEY `idx_agent_logs_request_id` (`request_id`)", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agent_logs' AND INDEX_NAME = 'idx_agent_logs_provider_status');
SET @ddl := IF(@idx = 0, "ALTER TABLE `agent_logs` ADD KEY `idx_agent_logs_provider_status` (`provider`, `status`)", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
