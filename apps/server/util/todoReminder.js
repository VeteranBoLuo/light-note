import pool from '../db/index.js';
import { createNotification } from './notification.js';

const POLL_INTERVAL_MS = 60 * 1000;
const BATCH_SIZE = 50;
let running = false;

async function processReminder(id) {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [reminderRows] = await connection.query(
      `SELECT id, todo_id, user_id, retry_count
       FROM todo_reminders WHERE id = ? AND status = 'pending' FOR UPDATE`,
      [id],
    );
    const reminder = reminderRows[0];
    if (!reminder) {
      await connection.rollback();
      return;
    }
    await connection.query("UPDATE todo_reminders SET status = 'processing' WHERE id = ?", [id]);
    const [todoRows] = await connection.query(
      `SELECT title FROM todo_items
       WHERE id = ? AND user_id = ? AND status = 'pending' AND del_flag = 0 LIMIT 1`,
      [reminder.todo_id, reminder.user_id],
    );
    if (!todoRows.length) {
      await connection.query("UPDATE todo_reminders SET status = 'cancelled' WHERE id = ?", [id]);
      await connection.commit();
      return;
    }
    await createNotification(
      reminder.user_id,
      {
        type: 'todo_reminder',
        title: '待办提醒',
        content: String(todoRows[0].title || '').slice(0, 200),
        link: `/inbox?tab=todo&todoId=${encodeURIComponent(reminder.todo_id)}`,
        meta: { todoId: reminder.todo_id },
      },
      connection,
    );
    await connection.query(
      "UPDATE todo_reminders SET status = 'sent', sent_at = NOW(), last_error = NULL WHERE id = ?",
      [id],
    );
    await connection.commit();
  } catch (error) {
    if (connection) {
      await connection.rollback().catch(() => {});
      const message = String(error?.message || 'unknown').slice(0, 500);
      await pool.query(
        `UPDATE todo_reminders
         SET status = IF(retry_count >= 2, 'failed', 'pending'),
             retry_count = retry_count + 1,
             scheduled_at = IF(retry_count >= 2, scheduled_at, DATE_ADD(NOW(), INTERVAL 5 MINUTE)),
             last_error = ?
         WHERE id = ? AND status IN ('pending','processing')`,
        [message, id],
      ).catch(() => {});
    }
    console.error('[todo-reminder] 处理失败:', error?.message || error);
  } finally {
    connection?.release();
  }
}

export async function processDueTodoReminders() {
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
