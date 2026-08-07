-- 回滚前必须先关闭 todo_single_task_schedule，并确认没有 mode=single_schedule 的规则。
-- 已产生的新规则默认保留，避免回滚 UI 时丢失提醒事实。
SELECT COUNT(*) AS active_single_schedule_rules
  FROM todo_reminder_rules
 WHERE mode = 'single_schedule' AND enabled = 1;
