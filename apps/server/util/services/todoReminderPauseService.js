import { Temporal } from '@js-temporal/polyfill';
import { todoReminderPauseTargetSql } from './todoReminderSql.js';

export async function setTodoReminderPause(connection, userId, { todoId, action }) {
  if (typeof todoId !== 'string' || !todoId || todoId.length > 36 || !['pause_week', 'resume'].includes(action)) {
    throw Object.assign(new Error('提醒操作参数无效'), { code: 'TODO_REMINDER_PAUSE_INVALID', status: 400 });
  }
  const [rows] = await connection.query(
    `SELECT ${todoReminderPauseTargetSql('i')} AS targetId,
            COALESCE(i.instance_timezone, 'Asia/Shanghai') AS timezone
       FROM todo_items i
      WHERE i.id = ? AND i.user_id = ? AND i.status = 'pending' AND i.del_flag = 0
        AND i.instance_state = 'normal'
      LIMIT 1 FOR UPDATE`,
    [todoId, userId],
  );
  const { targetId, timezone } = rows[0] || {};
  if (!targetId) {
    throw Object.assign(new Error('待办不可操作'), { code: 'TODO_REMINDER_PAUSE_NOT_FOUND', status: 404 });
  }

  if (action === 'pause_week') {
    const until = Temporal.Now.zonedDateTimeISO(timezone).add({ days: 7 }).withTimeZone('UTC').toPlainDateTime();
    await connection.query(
      `INSERT INTO todo_reminder_pauses (owner_id, target_id, paused_from_utc, paused_until_utc)
       VALUES (?, ?, UTC_TIMESTAMP(), ?)
       ON DUPLICATE KEY UPDATE
         paused_from_utc = IF(paused_until_utc > UTC_TIMESTAMP(), paused_from_utc, VALUES(paused_from_utc)),
         paused_until_utc = IF(paused_until_utc > UTC_TIMESTAMP(), paused_until_utc, VALUES(paused_until_utc))`,
      [userId, targetId, until.toString({ smallestUnit: 'second' }).replace('T', ' ')],
    );
  } else {
    // Preserve the cutoff even after resuming so missed jobs cannot be replayed after downtime.
    await connection.query(
      `UPDATE todo_reminder_pauses SET paused_until_utc = UTC_TIMESTAMP()
        WHERE owner_id = ? AND target_id = ? AND paused_until_utc > UTC_TIMESTAMP()`,
      [userId, targetId],
    );
  }
  const [[pause]] = await connection.query(
    `SELECT DATE_FORMAT(IF(paused_until_utc > UTC_TIMESTAMP(), paused_until_utc, NULL), '%Y-%m-%dT%H:%i:%sZ') AS reminderPausedUntil
       FROM todo_reminder_pauses WHERE owner_id = ? AND target_id = ?`,
    [userId, targetId],
  );
  return { todoId, reminderPausedUntil: pause?.reminderPausedUntil || null };
}
