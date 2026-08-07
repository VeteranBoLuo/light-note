-- 2026-08-07 默认单待办的版本化提醒计划（MySQL 5.7，可重复执行）
--
-- 仅扩展现有 reminder rule 事实，不新建调度表；历史 v2 规则保持原字段解释。

SET @schedule_json_exists := (
  SELECT COUNT(*)
    FROM information_schema.columns
   WHERE table_schema = DATABASE()
     AND table_name = 'todo_reminder_rules'
     AND column_name = 'schedule_json'
);
SET @schedule_json_ddl := IF(
  @schedule_json_exists = 0,
  'ALTER TABLE todo_reminder_rules ADD COLUMN schedule_json JSON DEFAULT NULL AFTER max_count',
  'SELECT 1'
);
PREPARE todo_single_schedule_stmt FROM @schedule_json_ddl;
EXECUTE todo_single_schedule_stmt;
DEALLOCATE PREPARE todo_single_schedule_stmt;
