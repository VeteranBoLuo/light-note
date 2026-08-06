import crypto from 'crypto';
import { Temporal } from '@js-temporal/polyfill';
import pool from '../db/index.js';
import { sendTrackedEmail } from './emailDelivery.js';
import { createNotification } from './notification.js';
import { buildTodoReminderEmail, notificationQuietUntil } from './todoReminder.js';
import { normalizeTodoLocale } from './todoDateFormat.js';
import { incrementTodoPlanMetric } from './todoPlanMetrics.js';

const POLL_INTERVAL_MS = 60_000;
const LEASE_MINUTES = 10;
const BATCH_SIZE = 50;
const MAX_RETRIES = 2;
let running = false;

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
  return false;
}

function sqlUtc(value) {
  const instant = Temporal.Instant.from(value instanceof Date ? value.toISOString() : value);
  const utc = instant.toZonedDateTimeISO('UTC');
  const pad = (part) => String(part).padStart(2, '0');
  return `${utc.year}-${pad(utc.month)}-${pad(utc.day)} ${pad(utc.hour)}:${pad(utc.minute)}:00`;
}

function sqlLocal(value, timezone) {
  const instant = Temporal.Instant.from(value instanceof Date ? value.toISOString() : value);
  const local = instant.toZonedDateTimeISO(timezone || 'Asia/Shanghai');
  const pad = (part) => String(part).padStart(2, '0');
  return `${local.year}-${pad(local.month)}-${pad(local.day)} ${pad(local.hour)}:${pad(local.minute)}:00`;
}

function dbUtc(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 19).replace('T', ' ');
  return String(value).replace('T', ' ').replace(/Z$/u, '').slice(0, 19);
}

function isAmbiguousSmtpError(error) {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || error || '').toUpperCase();
  return /TIMEOUT|ETIMEDOUT|ECONNRESET|EPIPE|SOCKET|CONNECTION CLOSED/u.test(`${code} ${message}`);
}

async function markClaimSkipped(connection, jobId, reason) {
  await connection.query(
    `UPDATE todo_reminder_jobs
        SET status = 'skipped', cancel_reason = ?, lease_token = NULL, lease_until = NULL
      WHERE id = ?`,
    [reason, jobId],
  );
}

async function claimJob(id) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT j.*, r.quiet_policy AS quietPolicy, r.target_email AS targetEmail,
              DATE_FORMAT(j.stop_at_utc, '%Y-%m-%d %H:%i:%s') AS stopAtUtc,
              i.title, i.description, i.due_at AS dueAt, i.status AS todoStatus,
              i.del_flag AS todoDeleted, i.instance_state AS instanceState,
              s.status AS seriesStatus, u.preferences
         FROM todo_reminder_jobs j
         JOIN todo_items i ON i.id = j.todo_id AND i.user_id = j.user_id
         LEFT JOIN todo_reminder_rules r ON r.id = j.rule_id
         LEFT JOIN todo_series s ON s.id = j.series_id
         JOIN user u ON u.id = j.user_id AND u.del_flag = 0
        WHERE j.id = ? AND j.status = 'pending' AND j.scheduled_at_utc <= UTC_TIMESTAMP()
        LIMIT 1 FOR UPDATE`,
      [id],
    );
    const job = rows[0];
    if (!job) {
      await connection.rollback();
      return null;
    }
    if (job.cancel_reason === 'instance_updated') {
      await markClaimSkipped(connection, id, 'superseded_rule');
      await connection.commit();
      return null;
    }
    if (job.series_id && job.seriesStatus === 'paused') {
      await connection.query(
        "UPDATE todo_reminder_jobs SET status = 'paused', cancel_reason = 'series_paused' WHERE id = ?",
        [id],
      );
      await connection.commit();
      return null;
    }
    if (
      job.todoStatus !== 'pending' ||
      job.todoDeleted ||
      job.instanceState === 'skipped' ||
      (job.series_id && job.seriesStatus !== 'active')
    ) {
      await markClaimSkipped(connection, id, job.seriesStatus === 'paused' ? 'series_paused' : 'todo_inactive');
      await connection.commit();
      return null;
    }
    const preferences = parsePreferences(job.preferences);
    if (!channelEnabled(preferences, job.channel)) {
      await markClaimSkipped(connection, id, 'channel_disabled');
      await connection.commit();
      return null;
    }
    const quietUntil = notificationQuietUntil(preferences);
    if (quietUntil) {
      const deferredUtc = sqlUtc(quietUntil);
      const beyondStop = job.stopAtUtc && deferredUtc > job.stopAtUtc;
      if (job.quietPolicy === 'skip' || beyondStop) {
        await markClaimSkipped(connection, id, beyondStop ? 'quiet_window_expired' : 'quiet_policy_skip');
        await incrementTodoPlanMetric(connection, 'quiet_hours_skipped');
      } else {
        await connection.query(
          `UPDATE todo_reminder_jobs
              SET scheduled_at_utc = ?, scheduled_at_local = ?, cancel_reason = 'quiet_hours_deferred'
            WHERE id = ?`,
          [deferredUtc, sqlLocal(quietUntil, job.timezone), id],
        );
        await incrementTodoPlanMetric(connection, 'quiet_hours_deferred');
        // 同一项同一渠道在免打扰期间积压的催办合并为一次，避免静默时段结束后瞬间轰炸。
        const [coalesced] = await connection.query(
          `UPDATE todo_reminder_jobs
              SET status = 'skipped', cancel_reason = 'quiet_hours_coalesced'
            WHERE todo_id = ? AND rule_id = ? AND channel = ? AND id <> ? AND status = 'pending'
              AND scheduled_at_utc <= ?`,
          [job.todo_id, job.rule_id, job.channel, id, deferredUtc],
        );
        await incrementTodoPlanMetric(connection, 'quiet_hours_skipped', Number(coalesced?.affectedRows || 0));
      }
      await connection.commit();
      return null;
    }
    const leaseToken = crypto.randomUUID();
    await connection.query(
      `UPDATE todo_reminder_jobs
          SET status = 'processing', lease_token = ?, lease_until = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE)
        WHERE id = ?`,
      [leaseToken, LEASE_MINUTES, id],
    );
    await connection.commit();
    return {
      id: job.id,
      leaseToken,
      userId: job.user_id,
      todoId: job.todo_id,
      channel: job.channel,
      targetEmail: job.targetEmail,
      retryCount: Number(job.retry_count || 0),
      title: job.title,
      description: job.description,
      dueAt: job.dueAt,
      locale: normalizeTodoLocale(preferences.lang),
    };
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

async function deliverJob(job) {
  const link = `/inbox?tab=todo&todoId=${encodeURIComponent(job.todoId)}`;
  if (job.channel === 'in_app') {
    await createNotification(job.userId, {
      type: 'todo_reminder',
      title: '待办提醒',
      content: String(job.title || '').slice(0, 200),
      link,
      meta: { todoId: job.todoId, reminderJobId: job.id },
      sourceType: 'todo_reminder_job',
      sourceId: job.id,
    });
    return null;
  }
  if (job.channel === 'email') {
    if (!job.targetEmail) throw Object.assign(new Error('邮件提醒缺少收件地址'), { code: 'EMAIL_TARGET_MISSING' });
    const email = buildTodoReminderEmail(
      {
        todoId: job.todoId,
        locale: job.locale,
        todo: { title: job.title, description: job.description, dueAt: job.dueAt },
      },
      process.env.SITE_URL || 'https://boluo66.top',
    );
    return sendTrackedEmail({
      emailType: 'todo_reminder_v2',
      userId: job.userId,
      recipient: job.targetEmail,
      subject: email.subject,
      businessType: 'todo_reminder_job',
      businessId: job.id,
      attemptNo: job.retryCount + 1,
      text: email.text,
    });
  }
  throw Object.assign(new Error('不支持的提醒渠道'), { code: 'CHANNEL_INVALID' });
}

async function markSent(job, result) {
  await pool.query(
    `UPDATE todo_reminder_jobs
        SET status = 'sent', sent_at = UTC_TIMESTAMP(), provider_message_id = ?,
            lease_token = NULL, lease_until = NULL, last_error = NULL
      WHERE id = ? AND status = 'processing' AND lease_token = ?`,
    [result?.messageId ? String(result.messageId).slice(0, 255) : null, job.id, job.leaseToken],
  );
}

async function markFailed(job, error) {
  const errorCode = String(error?.code || 'DELIVERY_FAILED').slice(0, 64);
  if (job.channel === 'email' && isAmbiguousSmtpError(error)) {
    await pool.query(
      `UPDATE todo_reminder_jobs
          SET status = 'unknown', last_error = ?, retry_count = retry_count + 1,
              lease_token = NULL, lease_until = NULL
        WHERE id = ? AND status = 'processing' AND lease_token = ?`,
      [errorCode, job.id, job.leaseToken],
    );
    return;
  }
  await pool.query(
    `UPDATE todo_reminder_jobs
        SET status = IF(retry_count + 1 > ?, 'failed', 'pending'),
            scheduled_at_utc = IF(retry_count + 1 > ?, scheduled_at_utc, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 5 MINUTE)),
            retry_count = retry_count + 1, last_error = ?, lease_token = NULL, lease_until = NULL
      WHERE id = ? AND status = 'processing' AND lease_token = ?`,
    [MAX_RETRIES, MAX_RETRIES, errorCode, job.id, job.leaseToken],
  );
}

async function processJob(id) {
  let job;
  try {
    job = await claimJob(id);
    if (!job) return;
    const result = await deliverJob(job);
    await markSent(job, result);
  } catch (error) {
    if (job) await markFailed(job, error).catch(() => {});
    console.error('[todo-reminder-v2] 处理失败 code=%s', error?.code || 'UNKNOWN');
  }
}

export async function processDueTodoReminderJobs() {
  if (running) return;
  running = true;
  try {
    // 站内通知可凭 source_id 幂等重试；邮件在进程崩溃后无法判断 SMTP 是否已受理，必须转 unknown，禁止自动重发。
    await pool.query(
      `UPDATE todo_reminder_jobs
          SET status = IF(channel = 'email', 'unknown', 'pending'),
              last_error = 'lease_expired', lease_token = NULL, lease_until = NULL
        WHERE status = 'processing' AND lease_until < UTC_TIMESTAMP()`,
    );
    const [rows] = await pool.query(
      `SELECT id FROM todo_reminder_jobs
        WHERE status = 'pending' AND scheduled_at_utc <= UTC_TIMESTAMP()
        ORDER BY scheduled_at_utc, id LIMIT ?`,
      [BATCH_SIZE],
    );
    for (const row of rows) await processJob(row.id);
  } catch (error) {
    console.error('[todo-reminder-v2] 扫描失败 code=%s', error?.code || 'UNKNOWN');
  } finally {
    running = false;
  }
}

export function startTodoReminderV2Scheduler() {
  const timer = setInterval(() => processDueTodoReminderJobs(), POLL_INTERVAL_MS);
  timer.unref?.();
  setTimeout(() => processDueTodoReminderJobs(), 20_000).unref?.();
}

export const todoReminderV2Internals = {
  channelEnabled,
  claimJob,
  dbUtc,
  isAmbiguousSmtpError,
  markFailed,
  sqlLocal,
  sqlUtc,
};
