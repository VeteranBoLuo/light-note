-- 仅关联新调用，保留旧调用 NULL；逐列与索引支持中断后重试。
SET @ddl = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ai_executions' AND COLUMN_NAME='organize_run_id'), 'SELECT 1', 'ALTER TABLE ai_executions ADD COLUMN organize_run_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ai_executions' AND COLUMN_NAME='organize_item_id'), 'SELECT 1', 'ALTER TABLE ai_executions ADD COLUMN organize_item_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl = IF(EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ai_executions' AND INDEX_NAME='idx_ai_execution_organize'), 'SELECT 1', 'ALTER TABLE ai_executions ADD KEY idx_ai_execution_organize (actor_user_id, organize_run_id, created_at)');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
