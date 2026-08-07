import pool from '../db/index.js';
import { ensureSeriesBuffer, ensureSingleReminderBuffer } from './services/todoSeriesService.js';
import { incrementTodoPlanMetric } from './todoPlanMetrics.js';

const POLL_INTERVAL_MS = 10 * 60 * 1000;
const BATCH_SIZE = 50;
let running = false;

async function fillSeries(seriesId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await ensureSeriesBuffer(connection, seriesId);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback().catch(() => {});
    await pool
      .query('UPDATE todo_series SET last_generation_error = ? WHERE id = ?', [
        String(error?.code || 'GENERATION_FAILED').slice(0, 64),
        seriesId,
      ])
      .catch(() => {});
    await incrementTodoPlanMetric(pool, 'series_generation_failures').catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

async function fillSingleReminder(ruleId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await ensureSingleReminderBuffer(connection, ruleId);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback().catch(() => {});
    await incrementTodoPlanMetric(pool, 'series_generation_failures').catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

export async function processTodoSeriesBuffers() {
  if (running) return;
  running = true;
  try {
    const [rows] = await pool.query(
      `SELECT id FROM todo_series
        WHERE status = 'active' AND repeat_mode = 'scheduled'
          AND JSON_UNQUOTE(JSON_EXTRACT(schedule_rule, '$.plan.end.mode')) = 'never'
          AND (generated_through_date IS NULL OR generated_through_date < DATE_ADD(CURDATE(), INTERVAL 30 DAY))
        ORDER BY generated_through_date, id LIMIT ?`,
      [BATCH_SIZE],
    );
    for (const row of rows) {
      await fillSeries(row.id).catch((error) => {
        console.error('[todo-series-v2] 补齐失败 series=%s code=%s', row.id, error?.code || 'UNKNOWN');
      });
    }
    const [singleRules] = await pool.query(
      `SELECT r.id
         FROM todo_reminder_rules r
         JOIN todo_items i ON i.id = r.todo_id AND i.user_id = r.user_id
         LEFT JOIN (
           SELECT rule_id, MAX(original_scheduled_at_utc) AS generated_through
             FROM todo_reminder_jobs
            WHERE status IN ('pending','processing','paused','sent')
            GROUP BY rule_id
         ) jobs ON jobs.rule_id = r.id
        WHERE r.enabled = 1 AND r.mode = 'single_schedule'
          AND i.status = 'pending' AND i.del_flag = 0
          AND JSON_UNQUOTE(JSON_EXTRACT(r.schedule_json, '$.schedule.mode')) = 'repeat'
          AND JSON_UNQUOTE(JSON_EXTRACT(r.schedule_json, '$.schedule.repeat.stop.type')) IN
              ('completion','completion_or_due','manual')
          AND (jobs.generated_through IS NULL OR jobs.generated_through < DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 DAY))
        ORDER BY jobs.generated_through, r.id LIMIT ?`,
      [BATCH_SIZE],
    );
    for (const rule of singleRules) {
      await fillSingleReminder(rule.id).catch((error) => {
        console.error('[todo-single-reminder] 补齐失败 rule=%s code=%s', rule.id, error?.code || 'UNKNOWN');
      });
    }
  } catch (error) {
    console.error('[todo-series-v2] 扫描失败 code=%s', error?.code || 'UNKNOWN');
  } finally {
    running = false;
  }
}

export function startTodoSeriesScheduler() {
  const timer = setInterval(() => processTodoSeriesBuffers(), POLL_INTERVAL_MS);
  timer.unref?.();
  setTimeout(() => processTodoSeriesBuffers(), 30_000).unref?.();
}
