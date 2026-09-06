-- 通用整理 v2：独立检查每列与索引，支持中断后重试；旧记录保持 v1。
SET @ddl = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='organize_suggestion_runs' AND COLUMN_NAME='started_at'), 'SELECT 1', 'ALTER TABLE organize_suggestion_runs ADD COLUMN started_at DATETIME DEFAULT NULL');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='organize_suggestion_runs' AND COLUMN_NAME='run_version'), 'SELECT 1', 'ALTER TABLE organize_suggestion_runs ADD COLUMN run_version INT NOT NULL DEFAULT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='organize_suggestion_runs' AND COLUMN_NAME='rule_phase'), 'SELECT 1', 'ALTER TABLE organize_suggestion_runs ADD COLUMN rule_phase VARCHAR(24) NOT NULL DEFAULT ''completed''');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='organize_suggestion_runs' AND COLUMN_NAME='pause_reason'), 'SELECT 1', 'ALTER TABLE organize_suggestion_runs ADD COLUMN pause_reason VARCHAR(40) DEFAULT NULL');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='organize_suggestion_runs' AND COLUMN_NAME='rule_lease_token'), 'SELECT 1', 'ALTER TABLE organize_suggestion_runs ADD COLUMN rule_lease_token CHAR(36) DEFAULT NULL');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='organize_suggestion_runs' AND COLUMN_NAME='rule_lease_expires_at'), 'SELECT 1', 'ALTER TABLE organize_suggestion_runs ADD COLUMN rule_lease_expires_at DATETIME DEFAULT NULL');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl = IF(EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='organize_suggestion_runs' AND INDEX_NAME='idx_organize_rule_queue'), 'SELECT 1', 'ALTER TABLE organize_suggestion_runs ADD KEY idx_organize_rule_queue (run_version,rule_phase,rule_lease_expires_at)');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='organize_suggestion_items' AND COLUMN_NAME='rule_status'), 'SELECT 1', 'ALTER TABLE organize_suggestion_items ADD COLUMN rule_status VARCHAR(24) NOT NULL DEFAULT ''completed''');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl = IF(EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='organize_suggestion_items' AND INDEX_NAME='idx_organize_rule_items'), 'SELECT 1', 'ALTER TABLE organize_suggestion_items ADD KEY idx_organize_rule_items (run_id,rule_status,id)');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
