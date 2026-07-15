import pool from '../db/index.js';
import nodeMail, { smtpUser } from './nodemailer.js';
import { createNotification } from './notification.js';

const POLL_INTERVAL_MS = 60 * 1000;
const BATCH_SIZE = 50;
let running = false;

function asDate(value) {
  if (value instanceof Date) return value;
  return new Date(String(value || '').replace(' ', 'T'));
}

export function calculateNextSchedule(scheduledAt, intervalMinutes, repeatEndAt, now = new Date()) {
  const intervalMs = Number(intervalMinutes) * 60_000;
  const end = asDate(repeatEndAt);
  let next = new Date(asDate(scheduledAt).getTime() + intervalMs);
  if (!Number.isFinite(next.getTime()) || !Number.isFinite(end.getTime()) || intervalMs <= 0) return null;
  while (next.getTime() <= now.getTime()) next = new Date(next.getTime() + intervalMs);
  return next.getTime() <= end.getTime() ? next : null;
}

async function claimReminder(id) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [reminderRows] = await connection.query(
      `SELECT id, todo_id AS todoId, user_id AS userId, channel, scheduled_at AS scheduledAt,
              schedule_start_at AS scheduleStartAt, repeat_interval_minutes AS intervalMinutes,
              repeat_end_at AS repeatEndAt,
              target_email AS targetEmail, retry_count AS retryCount
       FROM todo_reminders WHERE id = ? AND status = 'pending' FOR UPDATE`,
      [id],
    );
    const reminder = reminderRows[0];
    if (!reminder) {
      await connection.rollback();
      return null;
    }
    const [todoRows] = await connection.query(
      `SELECT title, description, due_at AS dueAt FROM todo_items
       WHERE id = ? AND user_id = ? AND status = 'pending' AND del_flag = 0 LIMIT 1`,
      [reminder.todoId, reminder.userId],
    );
    if (!todoRows.length) {
      await connection.query("UPDATE todo_reminders SET status = 'cancelled' WHERE id = ?", [id]);
      await connection.commit();
      return null;
    }
    await connection.query("UPDATE todo_reminders SET status = 'processing', update_time = NOW() WHERE id = ?", [id]);
    await connection.commit();
    return { ...reminder, todo: todoRows[0] };
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
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
    const dueText = reminder.todo.dueAt ? `\n截止时间：${String(reminder.todo.dueAt)}` : '';
    const description = reminder.todo.description ? `\n说明：${String(reminder.todo.description).slice(0, 1000)}` : '';
    const siteUrl = String(process.env.SITE_URL || 'https://boluo66.top').replace(/\/$/, '');
    await nodeMail.sendMail({
      from: `"轻笺"<${smtpUser}>`,
      to: reminder.targetEmail,
      subject: `轻笺待办提醒：${String(reminder.todo.title || '').slice(0, 120)}`,
      text: `你设置的待办提醒已到时间。\n\n待办：${String(reminder.todo.title || '')}${description}${dueText}\n\n打开轻笺“待处理”查看：${siteUrl}${link}`,
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
  if (running) return;
  running = true;
  try {
    // 进程在投递中途退出时，processing 不应永久卡死；十分钟后回到待处理重试。
    await pool.query(
      `UPDATE todo_reminders SET status = 'pending', last_error = 'processing timeout recovery'
       WHERE status = 'processing' AND update_time < DATE_SUB(NOW(), INTERVAL 10 MINUTE)`,
    );
    const [rows] = await pool.query(
      `SELECT id FROM todo_reminders
       WHERE status = 'pending' AND scheduled_at <= NOW()
       ORDER BY scheduled_at ASC LIMIT ?`,
      [BATCH_SIZE],
    );
    for (const row of rows) await processReminder(row.id);
  } catch (error) {
    console.error('[todo-reminder] 扫描失败:', error?.message || error);
  } finally {
    running = false;
  }
}

export function startTodoReminderScheduler() {
  const timer = setInterval(() => processDueTodoReminders(), POLL_INTERVAL_MS);
  timer.unref?.();
  setTimeout(() => processDueTodoReminders(), 15_000).unref?.();
}
