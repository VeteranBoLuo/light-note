export function todoReminderPauseTargetSql(alias) {
  return `COALESCE(NULLIF(${alias}.series_id, ''), ${alias}.id)`;
}

export function todoReminderPauseJoinSql(alias) {
  return `LEFT JOIN todo_reminder_pauses reminder_pause
    ON reminder_pause.owner_id = ${alias}.user_id AND reminder_pause.target_id = ${todoReminderPauseTargetSql(alias)}`;
}

// Legacy todo times use the original UTC+08:00 storage convention.
const legacyReminderPauseCutoffSql = `DATE_ADD(reminder_pause.paused_until_utc, INTERVAL 8 HOUR)`;

function reminderAfterPauseSql(scheduledAt, cutoff = 'reminder_pause.paused_until_utc') {
  return `(reminder_pause.paused_until_utc IS NULL OR ${scheduledAt} >= ${cutoff})`;
}

export function v2ReminderAfterPauseSql(alias) {
  return `(${reminderAfterPauseSql(`${alias}.scheduled_at_utc`)} AND NOT COALESCE(
    ${alias}.retry_count > 0 AND ${alias}.original_scheduled_at_utc >= reminder_pause.paused_from_utc
      AND ${alias}.original_scheduled_at_utc < reminder_pause.paused_until_utc, 0))`;
}

export function legacyReminderAfterPauseSql(alias) {
  return reminderAfterPauseSql(`${alias}.scheduled_at`, legacyReminderPauseCutoffSql);
}

// Find the first legacy recurrence at or beyond the cutoff, anchored on the rule's original time.
export function legacyReminderAfterPauseAtSql(alias, { atClaim = false } = {}) {
  const scheduledAt = `${alias}.scheduled_at`;
  const interval = `${alias}.repeat_interval_minutes`;
  const anchor = `COALESCE(${alias}.schedule_start_at, ${scheduledAt})`;
  // While paused, only advance past slots that have actually elapsed so early resume can use the next one.
  const cutoff = atClaim
    ? `LEAST(${legacyReminderPauseCutoffSql}, DATE_ADD(NOW(), INTERVAL 1 SECOND))`
    : legacyReminderPauseCutoffSql;
  const firstAfterPause = `TIMESTAMPADD(MINUTE,
    CEIL(TIMESTAMPDIFF(SECOND, ${anchor}, ${cutoff}) / NULLIF(60 * ${interval}, 0)) * ${interval}, ${anchor})`;
  return `CASE WHEN ${legacyReminderAfterPauseSql(alias)} THEN ${scheduledAt}
    WHEN ${interval} > 0 AND ${firstAfterPause} <= ${alias}.repeat_end_at THEN ${firstAfterPause} END`;
}

/** Internal SQL aliases only. Both list readers use the same pending Job fact. */
export function nextTodoReminderAtSql(todoAlias) {
  return `COALESCE(
    (SELECT MIN(j.scheduled_at_local)
       FROM todo_reminder_jobs j
      WHERE j.todo_id = ${todoAlias}.id AND j.user_id = ${todoAlias}.user_id
        AND ${v2ReminderAfterPauseSql('j')}
        AND j.status IN ('pending','processing')),
    (SELECT MIN(${legacyReminderAfterPauseAtSql('legacy_reminder')})
       FROM todo_reminders legacy_reminder
      WHERE legacy_reminder.todo_id = ${todoAlias}.id AND legacy_reminder.user_id = ${todoAlias}.user_id
        AND legacy_reminder.status IN ('pending','processing'))
  )`;
}
