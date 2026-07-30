-- 2026-07-30 待办分组排序、重复任务实例与操作撤销（MySQL 5.7，可重复执行）

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'todo_items' AND COLUMN_NAME = 'sort_order');
SET @ddl := IF(@col = 0, "ALTER TABLE todo_items ADD COLUMN sort_order bigint NOT NULL DEFAULT 0 COMMENT '用户自定义顺序，值越小越靠前' AFTER priority", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'todo_items' AND COLUMN_NAME = 'series_id');
SET @ddl := IF(@col = 0, "ALTER TABLE todo_items ADD COLUMN series_id char(36) DEFAULT NULL COMMENT '重复任务系列 ID；重复提醒不使用此字段' AFTER completed_at", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'todo_items' AND COLUMN_NAME = 'recurrence_rule');
SET @ddl := IF(@col = 0, "ALTER TABLE todo_items ADD COLUMN recurrence_rule json DEFAULT NULL COMMENT '重复任务规则，与 todo_reminders 周期提醒相互独立' AFTER series_id", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'todo_items' AND COLUMN_NAME = 'recurrence_instance_at');
SET @ddl := IF(@col = 0, "ALTER TABLE todo_items ADD COLUMN recurrence_instance_at datetime DEFAULT NULL COMMENT '当前重复任务实例时间' AFTER recurrence_rule", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'todo_items' AND INDEX_NAME = 'idx_todo_custom_order');
SET @ddl := IF(@idx = 0, "ALTER TABLE todo_items ADD KEY idx_todo_custom_order (user_id, status, sort_order, id)", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'todo_items' AND INDEX_NAME = 'uk_todo_series_instance');
SET @ddl := IF(@idx = 0, "ALTER TABLE todo_items ADD UNIQUE KEY uk_todo_series_instance (series_id, recurrence_instance_at)", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE todo_items
SET sort_order = CAST(UNIX_TIMESTAMP(create_time) AS UNSIGNED) * 1000
WHERE sort_order = 0;

-- status 字段原本已经是 varchar(16)，只在需要时同步新暂停状态的字段说明。
SET @status_comment := (
  SELECT COLUMN_COMMENT
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'todo_reminders' AND COLUMN_NAME = 'status'
);
SET @ddl := IF(
  @status_comment <> 'pending/processing/sent/failed/cancelled/paused_complete/paused_delete',
  "ALTER TABLE todo_reminders MODIFY COLUMN status varchar(16) NOT NULL DEFAULT 'pending' COMMENT 'pending/processing/sent/failed/cancelled/paused_complete/paused_delete'",
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
