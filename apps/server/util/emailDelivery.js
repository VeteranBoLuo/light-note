import pool from '../db/index.js';
import { insertData } from './common.js';
import nodeMail, { smtpUser } from './nodemailer.js';
import { redactSensitiveText } from './agent/logSafety.js';

const DEFAULT_PROVIDER = 'qq_smtp';
const DEFAULT_FROM = `"轻笺"<${smtpUser}>`;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = 180;

function stableEmailErrorCode(error) {
  const directCode = String(error?.code || '')
    .trim()
    .toUpperCase();
  if (/^[A-Z][A-Z0-9_]{1,63}$/u.test(directCode)) return directCode;
  const message = String(error?.message || error || '').toUpperCase();
  if (/TIMEOUT|ETIMEDOUT|DEADLINE/u.test(message)) return 'SMTP_TIMEOUT';
  if (/AUTH|LOGIN|535|401|403/u.test(message)) return 'SMTP_AUTH_FAILED';
  if (/RATE|LIMIT|QUOTA|429/u.test(message)) return 'SMTP_RATE_LIMITED';
  if (/ECONN|NETWORK|SOCKET|DNS|ENOTFOUND/u.test(message)) return 'SMTP_NETWORK_ERROR';
  return 'SMTP_SEND_FAILED';
}

function safeEmailError(error) {
  return redactSensitiveText(error?.message || error || 'unknown', 500) || 'unknown';
}

function safeProviderValue(value, maxLength = 500) {
  return redactSensitiveText(value || '', maxLength) || null;
}

async function updateLogBestEffort(db, sql, params, phase) {
  try {
    await db.query(sql, params);
  } catch (error) {
    console.error(`[email-delivery] ${phase}:`, safeEmailError(error));
  }
}

/**
 * 统一发送并记录系统邮件。记录失败不得阻断核心邮件；SMTP 已受理后，
 * 即使状态回写失败也不能把业务判成失败，避免调用方重试造成重复邮件。
 */
export async function sendTrackedEmail(
  {
    emailType,
    userId = null,
    recipient,
    subject,
    businessType = null,
    businessId = null,
    attemptNo = 1,
    html = null,
    text = null,
    from = DEFAULT_FROM,
  },
  { db = pool, transport = nodeMail } = {},
) {
  const normalizedRecipient = String(recipient || '')
    .trim()
    .slice(0, 254);
  const normalizedSubject = String(subject || '')
    .trim()
    .slice(0, 255);
  if (!normalizedRecipient || !normalizedSubject || !emailType) {
    throw new Error('邮件追踪参数不完整');
  }

  const row = insertData({
    emailType: String(emailType).slice(0, 32),
    userId: userId || null,
    recipientEmail: normalizedRecipient,
    subject: normalizedSubject,
    businessType: businessType ? String(businessType).slice(0, 32) : null,
    businessId: businessId ? String(businessId).slice(0, 64) : null,
    provider: DEFAULT_PROVIDER,
    status: 'sending',
    attemptNo: Math.max(1, Number(attemptNo) || 1),
  });

  let logCreated = false;
  try {
    await db.query('INSERT INTO email_delivery_logs SET ?', [row]);
    logCreated = true;
  } catch (error) {
    console.error('[email-delivery] 创建记录失败:', safeEmailError(error));
  }

  try {
    const result = await transport.sendMail({
      from,
      to: normalizedRecipient,
      subject: normalizedSubject,
      ...(html ? { html } : {}),
      ...(text ? { text } : {}),
    });
    if (logCreated) {
      await updateLogBestEffort(
        db,
        `UPDATE email_delivery_logs
         SET status = 'accepted', provider_message_id = ?, provider_response = ?,
             error_code = NULL, error_message = NULL, accepted_at = NOW()
         WHERE id = ? AND status = 'sending'`,
        [safeProviderValue(result?.messageId, 255), safeProviderValue(result?.response, 500), row.id],
        'SMTP 已受理但状态回写失败',
      );
    }
    return result;
  } catch (error) {
    if (logCreated) {
      await updateLogBestEffort(
        db,
        `UPDATE email_delivery_logs
         SET status = 'failed', error_code = ?, error_message = ?
         WHERE id = ? AND status = 'sending'`,
        [stableEmailErrorCode(error), safeEmailError(error), row.id],
        '失败状态回写失败',
      );
    }
    throw error;
  }
}

export function maskEmail(value) {
  const email = String(value || '').trim();
  const at = email.lastIndexOf('@');
  if (at <= 0) return email ? '***' : '';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visible}***@${domain}`;
}

export const EMAIL_EFFECTIVE_STATUS_SQL =
  "CASE WHEN e.status = 'sending' AND e.update_time < DATE_SUB(NOW(), INTERVAL 10 MINUTE) THEN 'unknown' ELSE e.status END";

export async function cleanupEmailDeliveryLogs({
  db = pool,
  retentionDays = Number(process.env.EMAIL_DELIVERY_LOG_RETENTION_DAYS) || DEFAULT_RETENTION_DAYS,
  batchSize = 500,
  now = new Date(),
} = {}) {
  const safeRetentionDays = Math.min(Math.max(Math.trunc(Number(retentionDays) || DEFAULT_RETENTION_DAYS), 1), 3650);
  const safeBatchSize = Math.min(Math.max(Math.trunc(Number(batchSize) || 500), 1), 5000);
  const cutoff = new Date(now.getTime() - safeRetentionDays * 24 * 60 * 60 * 1000);
  const [result] = await db.query(
    `DELETE FROM email_delivery_logs
     WHERE create_time < ?
     ORDER BY create_time ASC
     LIMIT ?`,
    [cutoff, safeBatchSize],
  );
  return {
    deleted: Number(result?.affectedRows || 0),
    backlogPossible: Number(result?.affectedRows || 0) >= safeBatchSize,
    retentionDays: safeRetentionDays,
  };
}

export function startEmailDeliveryLogCleanupScheduler() {
  const run = () =>
    cleanupEmailDeliveryLogs().then((result) => {
      if (result.backlogPossible) {
        console.warn('[email-delivery] 清理达到单轮上限，可能仍有历史记录积压');
      }
    });
  const timer = setInterval(
    () => run().catch((error) => console.error('[email-delivery] 清理失败:', safeEmailError(error))),
    CLEANUP_INTERVAL_MS,
  );
  timer.unref?.();
  setTimeout(
    () => run().catch((error) => console.error('[email-delivery] 首轮清理失败:', safeEmailError(error))),
    90_000,
  ).unref?.();
}
