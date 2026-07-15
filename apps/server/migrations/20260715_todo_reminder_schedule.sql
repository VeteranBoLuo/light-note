-- 2026-07-15 待办单次/周期、站内/邮件提醒扩展（MySQL 5.7 兼容、可重复执行）

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'todo_reminders' AND COLUMN_NAME = 'schedule_start_at');
SET @ddl := IF(@col = 0, "ALTER TABLE todo_reminders ADD COLUMN schedule_start_at datetime DEFAULT NULL COMMENT '提醒计划首次执行时间' AFTER scheduled_at", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'todo_reminders' AND COLUMN_NAME = 'repeat_interval_minutes');
SET @ddl := IF(@col = 0, "ALTER TABLE todo_reminders ADD COLUMN repeat_interval_minutes int DEFAULT NULL COMMENT '周期提醒间隔分钟数，NULL 表示单次' AFTER schedule_start_at", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'todo_reminders' AND COLUMN_NAME = 'repeat_end_at');
SET @ddl := IF(@col = 0, "ALTER TABLE todo_reminders ADD COLUMN repeat_end_at datetime DEFAULT NULL COMMENT '周期提醒结束时间' AFTER repeat_interval_minutes", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'todo_reminders' AND COLUMN_NAME = 'target_email');
SET @ddl := IF(@col = 0, "ALTER TABLE todo_reminders ADD COLUMN target_email varchar(254) DEFAULT NULL COMMENT '邮件提醒收件地址' AFTER repeat_end_at", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE todo_reminders
SET schedule_start_at = scheduled_at
WHERE schedule_start_at IS NULL;
