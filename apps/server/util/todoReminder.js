import pool from '../db/index.js';
import { notificationSchedulerEnabled } from './notificationSchedulerPolicy.js';
import { createNotification } from './notification.js';
import { sendTrackedEmail } from './emailDelivery.js';
import { formatTodoDueAt, normalizeTodoLocale } from './todoDateFormat.js';
import {
  legacyReminderAfterPauseSql,
  legacyReminderAfterPauseAtSql,
  todoReminderPauseJoinSql,
} from './services/todoReminderSql.js';

const POLL_INTERVAL_MS = 5_000;
const RECOVERY_INTERVAL_MS = 60_000;
const BATCH_SIZE = 50;
let running = false;
let recovering = false;

function asDate(value) {
  if (value instanceof Date) return value;
  return new Date(String(value || '').replace(' ', 'T'));
}

function parsePreferences(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function channelEnabled(preferences, channel) {
  if (channel === 'in_app') return preferences.notificationsInApp !== false;
  if (channel === 'email') return preferences.notificationsEmail !== false;
  return true;
}

export function calculateNextSchedule(scheduledAt, intervalMinutes, repeatEndAt, now = new Date()) {
  const intervalMs = Number(intervalMinutes) * 60_000;
  const end = asDate(repeatEndAt);
  let next = new Date(asDate(scheduledAt).getTime() + intervalMs);
  if (!Number.isFinite(next.getTime()) || !Number.isFinite(end.getTime()) || intervalMs <= 0) return null;
  while (next.getTime() <= now.getTime()) next = new Date(next.getTime() + intervalMs);
  return next.getTime() <= end.getTime() ? next : null;
}

async function finishReminderWithoutDelivery(connection, reminder) {
  const next = reminder.nextAfterPause;
  if (next) {
    // The old unique index retains historical rows at a given channel/time. A collision already owns that slot.
    const [result] = await connection.query(
      `UPDATE IGNORE todo_reminders SET scheduled_at = ?, retry_count = 0, last_error = NULL
        WHERE id = ? AND status = 'pending'`,
      [next, reminder.id],
    );
    if (result.affectedRows) return;
  }
  await connection.query(
    "UPDATE todo_reminders SET status = 'cancelled', last_error = 'reminder_paused' WHERE id = ? AND status = 'pending'",
    [reminder.id],
  );
}

async function claimReminder(id) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [reminderRows] = await connection.query(
      `SELECT r.id, r.todo_id AS todoId, r.user_id AS userId, r.channel, r.scheduled_at AS scheduledAt,
              r.schedule_start_at AS scheduleStartAt, r.repeat_interval_minutes AS intervalMinutes,
              r.repeat_end_at AS repeatEndAt, r.target_email AS targetEmail, r.retry_count AS retryCount,
              i.title, i.description, i.due_at AS dueAt, i.status AS todoStatus, i.del_flag AS todoDeleted,
              NOT ${legacyReminderAfterPauseSql('r')} AS skippedByReminderPause,
              (UTC_TIMESTAMP() < reminder_pause.paused_until_utc AND r.scheduled_at > NOW()) AS deferredDuringPause,
              ${legacyReminderAfterPauseAtSql('r', { atClaim: true })} AS nextAfterPause
         FROM todo_reminders r
         JOIN todo_items i ON i.id = r.todo_id AND i.user_id = r.user_id
         ${todoReminderPauseJoinSql('i')}
        WHERE r.id = ? AND r.status = 'pending'
          AND (r.scheduled_at <= NOW() OR r.last_error = 'quiet hours deferred')
        LIMIT 1 FOR UPDATE`,
      [id],
    );
    const reminder = reminderRows[0];
    if (!reminder) {
      await connection.rollback();
      return null;
    }
    if (reminder.todoStatus !== 'pending' || reminder.todoDeleted) {
      await connection.query("UPDATE todo_reminders SET status = 'cancelled' WHERE id = ?", [id]);
      await connection.commit();
      return null;
    }
    if (reminder.deferredDuringPause) {
      // The historical recovery path can look ahead of the normal due-time scanner.
      await connection.query('UPDATE todo_reminders SET last_error = NULL WHERE id = ?', [id]);
      await connection.commit();
      return null;
    }
    if (reminder.skippedByReminderPause) {
      await finishReminderWithoutDelivery(connection, reminder);
      await connection.commit();
      return null;
    }
    const [userRows] = await connection.query('SELECT preferences FROM user WHERE id = ? AND del_flag = 0 LIMIT 1', [
      reminder.userId,
    ]);
    const preferences = parsePreferences(userRows[0]?.preferences);
    if (!channelEnabled(preferences, reminder.channel)) {
      await connection.query(
        "UPDATE todo_reminders SET status = 'cancelled', last_error = 'channel disabled' WHERE id = ?",
        [id],
      );
      await connection.commit();
      return null;
    }
    await connection.query("UPDATE todo_reminders SET status = 'processing', update_time = NOW() WHERE id = ?", [id]);
    await connection.commit();
    return {
      ...reminder,
      locale: normalizeTodoLocale(preferences.lang),
      todo: { title: reminder.title, description: reminder.description, dueAt: reminder.dueAt },
    };
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

export function buildTodoReminderEmail(reminder, siteUrl = process.env.SITE_URL || 'https://boluo66.top') {
  const locale = normalizeTodoLocale(reminder?.locale);
  const english = locale === 'en-US';
  const title = String(reminder?.todo?.title || '');
  const description = reminder?.todo?.description ? String(reminder.todo.description).slice(0, 1000) : '';
  const dueAt = formatTodoDueAt(reminder?.todo?.dueAt, locale);
  const link = `/inbox?tab=todo&todoId=${encodeURIComponent(reminder?.todoId || '')}`;
  const cleanSiteUrl = String(siteUrl).replace(/\/$/, '');
  const lines = english
    ? ['Your Light Note todo reminder is due.', '', `Todo: ${title}`]
    : ['你设置的待办提醒已到时间。', '', `待办：${title}`];
  if (description) lines.push(english ? `Description: ${description}` : `说明：${description}`);
  if (dueAt) lines.push(english ? `Due: ${dueAt}` : `截止时间：${dueAt}`);
  lines.push(
    '',
    `${english ? 'Open Light Note “Inbox” to handle it: ' : '打开轻笺“待处理”查看：'}${cleanSiteUrl}${link}`,
  );
  return {
    subject: `${english ? 'Light Note todo reminder: ' : '轻笺待办提醒：'}${title.slice(0, 120)}`,
    text: lines.join('\n'),
  };
}

async function deliverReminder(reminder) {
  const link = `/inbox?tab=todo&todoId=${encodeURIComponent(reminder.todoId)}`;
  if (reminder.channel === 'in_app') {
    await createNotification(reminder.userId, {
      type: 'todo_reminder',
      title: '待办提醒',
      content: String(reminder.todo.title || '').slice(0, 200),
      link,
      meta: { todoId: reminder.todoId },
    });
    return;
  }
  if (reminder.channel === 'email') {
    if (!reminder.targetEmail) throw new Error('邮件提醒缺少收件地址');
    const siteUrl = String(process.env.SITE_URL || 'https://boluo66.top').replace(/\/$/, '');
    const email = buildTodoReminderEmail(reminder, siteUrl);
    await sendTrackedEmail({
      emailType: 'todo_reminder',
      userId: reminder.userId,
      recipient: reminder.targetEmail,
      subject: email.subject,
      businessType: 'todo',
      businessId: reminder.todoId,
      attemptNo: Number(reminder.retryCount || 0) + 1,
      text: email.text,
    });
    return;
  }
  throw new Error(`不支持的提醒渠道：${reminder.channel}`);
}

async function markDelivered(reminder) {
  const next = reminder.intervalMinutes
    ? calculateNextSchedule(
        reminder.scheduleStartAt || reminder.scheduledAt,
        reminder.intervalMinutes,
        reminder.repeatEndAt,
      )
    : null;
  if (next) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      // 旧版单次提醒会为每个计划时间保留历史记录。周期计划推进到同一时间时，
      // 复用该历史行，避免撞上 (todo_id, channel, scheduled_at) 唯一索引。
      const [existingRows] = await connection.query(
        `SELECT id FROM todo_reminders
         WHERE todo_id = ? AND channel = ? AND scheduled_at = ? AND id <> ?
         LIMIT 1 FOR UPDATE`,
        [reminder.todoId, reminder.channel, next, reminder.id],
      );
      if (existingRows[0]) {
        await connection.query(
          `UPDATE todo_reminders SET status = 'sent', sent_at = NOW(), retry_count = 0, last_error = NULL
           WHERE id = ? AND status = 'processing'`,
          [reminder.id],
        );
        await connection.query(
          `UPDATE todo_reminders
           SET user_id = ?, schedule_start_at = ?, repeat_interval_minutes = ?, repeat_end_at = ?,
               target_email = ?, status = 'pending', retry_count = 0, last_error = NULL, sent_at = NULL
           WHERE id = ?`,
          [
            reminder.userId,
            reminder.scheduleStartAt || reminder.scheduledAt,
            reminder.intervalMinutes,
            reminder.repeatEndAt,
            reminder.targetEmail,
            existingRows[0].id,
          ],
        );
      } else {
        await connection.query(
          `UPDATE todo_reminders
           SET status = 'pending', scheduled_at = ?, sent_at = NOW(), retry_count = 0, last_error = NULL
           WHERE id = ? AND status = 'processing'`,
          [next, reminder.id],
        );
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback().catch(() => {});
      throw error;
    } finally {
      connection.release();
    }
  } else {
    await pool.query(
      `UPDATE todo_reminders SET status = 'sent', sent_at = NOW(), retry_count = 0, last_error = NULL
       WHERE id = ? AND status = 'processing'`,
      [reminder.id],
    );
  }
}

async function markFailed(reminder, error) {
  const message = String(error?.message || 'unknown').slice(0, 500);
  await pool.query(
    `UPDATE todo_reminders
     SET status = IF(retry_count >= 2, 'failed', 'pending'),
         retry_count = retry_count + 1,
         scheduled_at = IF(retry_count >= 2, scheduled_at, DATE_ADD(NOW(), INTERVAL 5 MINUTE)),
         last_error = ?
     WHERE id = ? AND status = 'processing'`,
    [message, reminder.id],
  );
}

async function processReminder(id) {
  let reminder;
  try {
    reminder = await claimReminder(id);
    if (!reminder) return;
    await deliverReminder(reminder);
    await markDelivered(reminder);
  } catch (error) {
    if (reminder) await markFailed(reminder, error).catch(() => {});
    console.error('[todo-reminder] 处理失败:', error?.message || error);
  }
}

export async function processDueTodoReminders() {
  if (!notificationSchedulerEnabled()) return;
  if (running) return;
  running = true;
  try {
    const [rows] = await pool.query(
      `SELECT id FROM todo_reminders
       WHERE status = 'pending' AND scheduled_at <= NOW()
       ORDER BY scheduled_at ASC LIMIT ?`,
      [BATCH_SIZE],
    );
    for (const row of rows) await processReminder(row.id);
  } catch (error) {
    console.error('[todo-reminder] 扫描失败 code=%s', error?.code || 'UNKNOWN');
  } finally {
    running = false;
  }
}

export async function recoverTodoReminders() {
  if (!notificationSchedulerEnabled() || recovering) return;
  recovering = true;
  try {
    // 历史租约恢复和旧免打扰兼容留在分钟级维护通道。
    await pool.query(
      `UPDATE todo_reminders SET status = 'pending', last_error = 'processing timeout recovery'
       WHERE status = 'processing' AND update_time < DATE_SUB(NOW(), INTERVAL 10 MINUTE)`,
    );
    const [rows] = await pool.query(
      `SELECT id FROM todo_reminders
       WHERE status = 'pending' AND last_error = 'quiet hours deferred'
       ORDER BY scheduled_at ASC LIMIT ?`,
      [BATCH_SIZE],
    );
    for (const row of rows) await processReminder(row.id);
  } catch (error) {
    console.error('[todo-reminder] 恢复失败 code=%s', error?.code || 'UNKNOWN');
  } finally {
    recovering = false;
  }
}

export function startTodoReminderScheduler() {
  if (!notificationSchedulerEnabled()) return;
  const timer = setInterval(() => processDueTodoReminders(), POLL_INTERVAL_MS);
  const recoveryTimer = setInterval(() => recoverTodoReminders(), RECOVERY_INTERVAL_MS);
  timer.unref?.();
  recoveryTimer.unref?.();
  void recoverTodoReminders();
  void processDueTodoReminders();
  return () => {
    clearInterval(timer);
    clearInterval(recoveryTimer);
  };
}
