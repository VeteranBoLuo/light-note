/** Internal SQL aliases only. Both list readers use the same pending Job fact. */
export function nextTodoReminderAtSql(todoAlias) {
  return `COALESCE(
    (SELECT MIN(j.scheduled_at_local)
       FROM todo_reminder_jobs j
      WHERE j.todo_id = ${todoAlias}.id AND j.user_id = ${todoAlias}.user_id
        AND j.status IN ('pending','processing')),
    (SELECT MIN(legacy_reminder.scheduled_at)
       FROM todo_reminders legacy_reminder
      WHERE legacy_reminder.todo_id = ${todoAlias}.id AND legacy_reminder.user_id = ${todoAlias}.user_id
        AND legacy_reminder.status IN ('pending','processing'))
  )`;
}
