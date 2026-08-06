-- 待办计划 v2 结构回滚（MySQL 5.7，人工执行，DDL 会隐式提交）
--
-- 执行前：
-- 1. 关闭 TODO_PLAN_V2、TODO_PLAN_V2_AI、TODO_PLAN_V2_CONVERSION 与 TODO_PLAN_V2_SCHEDULER；
-- 2. 备份本文件涉及的表；
-- 3. 确认可以永久丢弃所有 v2 系列、实例扩展字段、提醒 Job 与幂等回执。
--
-- 仅需停止新建或 Worker 时不要执行本文件，使用 Feature Flag 即可；本文件是最终结构回退。

DROP TABLE IF EXISTS todo_reminder_jobs;
DROP TABLE IF EXISTS todo_reminder_rules;
DROP TABLE IF EXISTS todo_series_resource_refs;
DROP TABLE IF EXISTS todo_plan_mutations;
DROP TABLE IF EXISTS todo_plan_requests;
DROP TABLE IF EXISTS todo_plan_runtime_metrics;
DROP TABLE IF EXISTS todo_series;

SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'todo_items' AND INDEX_NAME = 'uk_todo_series_occurrence');
SET @ddl := IF(@idx > 0, 'ALTER TABLE todo_items DROP INDEX uk_todo_series_occurrence', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification' AND INDEX_NAME = 'uk_notification_source');
SET @ddl := IF(@idx > 0, 'ALTER TABLE notification DROP INDEX uk_notification_source', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification' AND COLUMN_NAME = 'source_id');
SET @ddl := IF(@col > 0, 'ALTER TABLE notification DROP COLUMN source_id', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification' AND COLUMN_NAME = 'source_type');
SET @ddl := IF(@col > 0, 'ALTER TABLE notification DROP COLUMN source_type', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'todo_items' AND COLUMN_NAME = 'generated_by_todo_id');
SET @ddl := IF(@col > 0, 'ALTER TABLE todo_items DROP COLUMN generated_by_todo_id', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'todo_items' AND COLUMN_NAME = 'instance_state');
SET @ddl := IF(@col > 0, 'ALTER TABLE todo_items DROP COLUMN instance_state', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'todo_items' AND COLUMN_NAME = 'is_exception');
SET @ddl := IF(@col > 0, 'ALTER TABLE todo_items DROP COLUMN is_exception', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'todo_items' AND COLUMN_NAME = 'instance_timezone');
SET @ddl := IF(@col > 0, 'ALTER TABLE todo_items DROP COLUMN instance_timezone', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'todo_items' AND COLUMN_NAME = 'occurrence_date');
SET @ddl := IF(@col > 0, 'ALTER TABLE todo_items DROP COLUMN occurrence_date', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'todo_items' AND COLUMN_NAME = 'occurrence_no');
SET @ddl := IF(@col > 0, 'ALTER TABLE todo_items DROP COLUMN occurrence_no', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'todo_items' AND COLUMN_NAME = 'series_version');
SET @ddl := IF(@col > 0, 'ALTER TABLE todo_items DROP COLUMN series_version', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'todo_items' AND COLUMN_NAME = 'plan_version');
SET @ddl := IF(@col > 0, 'ALTER TABLE todo_items DROP COLUMN plan_version', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'todo_items' AND COLUMN_NAME = 'start_at');
SET @ddl := IF(@col > 0, 'ALTER TABLE todo_items DROP COLUMN start_at', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 恢复：重新执行 20260806_todo_plan_v2.sql；已删除的 v2 业务数据只能从备份恢复。
