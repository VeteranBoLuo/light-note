import pool from '../../db/index.js';
import { readFile } from 'node:fs/promises';
import { createNotification } from '../notification.js';
import { maskEmail } from '../emailDelivery.js';
import { notificationSchedulerEnabled } from '../notificationSchedulerPolicy.js';
import {
  emailDigest,
  emailIdentity,
  parseAccountEmail,
  isGitHubPlaceholderEmail,
  inspectEmailDomain,
} from './accountEmailPolicy.js';

export async function accountEmailHealthSchemaReady(db = pool) {
  const [[row]] = await db.query(`SELECT COUNT(*) AS total FROM information_schema.columns
    WHERE table_schema = DATABASE() AND ((table_name = 'account_email_health_runs' AND column_name IN ('period', 'after_user_id', 'completed'))
      OR (table_name = 'account_email_health_notices' AND column_name IN ('user_id', 'email_hash', 'issue_code')))`);
  if (Number(row.total) !== 6) return false;
  const [indexes] =
    await db.query(`SELECT table_name AS tableName, index_name AS indexName, GROUP_CONCAT(column_name ORDER BY seq_in_index) AS columns_list,
    MAX(non_unique) AS non_unique, SUM(sub_part IS NOT NULL) AS prefixed FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND ((table_name IN ('account_email_health_notices', 'account_email_health_runs') AND index_name = 'PRIMARY')
      OR (table_name = 'email_delivery_logs' AND index_name = 'idx_email_delivery_recipient_time')) GROUP BY table_name, index_name`);
  return (
    indexes.some(
      (item) =>
        item.tableName === 'account_email_health_notices' &&
        item.columns_list === 'user_id,email_hash,issue_code' &&
        Number(item.non_unique) === 0 &&
        Number(item.prefixed) === 0,
    ) &&
    indexes.some(
      (item) =>
        item.tableName === 'email_delivery_logs' &&
        item.columns_list === 'recipient_email,create_time,id' &&
        Number(item.prefixed) === 0,
    ) &&
    indexes.some(
      (item) =>
        item.tableName === 'account_email_health_runs' &&
        item.columns_list === 'period' &&
        Number(item.non_unique) === 0,
    )
  );
}

// 只供显式迁移脚本与隔离测试调用；启动和请求路径仅检查结构。
export async function migrateAccountEmailHealthSchema(db = pool) {
  const source = await readFile(new URL('../../migrations/20261023_account_email_health.sql', import.meta.url), 'utf8');
  for (const sql of source
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean))
    await db.query(sql);
  const [indexes] = await db.query(`SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE()
    AND table_name = 'email_delivery_logs' AND index_name = 'idx_email_delivery_recipient_time' LIMIT 1`);
  if (!indexes.length)
    await db.query(
      'ALTER TABLE email_delivery_logs ADD INDEX idx_email_delivery_recipient_time (recipient_email, create_time, id)',
    );
}

async function notifyIssue(connection, user, issue, notify) {
  await connection.beginTransaction();
  try {
    const [[current]] = await connection.query('SELECT email, role, del_flag FROM user WHERE id = ? FOR UPDATE', [
      user.id,
    ]);
    if (
      !current ||
      Number(current.del_flag) !== 0 ||
      !['user', 'test', 'root'].includes(current.role) ||
      current.email !== user.email
    ) {
      await connection.rollback();
      return false;
    }
    const hash = emailDigest(emailIdentity(user.email));
    const [inserted] = await connection.query(
      `INSERT IGNORE INTO account_email_health_notices
      (user_id, email_hash, issue_code) VALUES (?, ?, ?)`,
      [user.id, hash, issue],
    );
    if (inserted.affectedRows) {
      await notify(
        user.id,
        {
          type: 'email_health',
          title: '请检查账号邮箱',
          content: '账号邮箱可能无法接收邮件，请确认或更换，以便忘记密码时找回账号。',
          link: '/settings?section=account',
          meta: { issueCode: issue, maskedEmail: maskEmail(user.email) },
          sourceType: 'account_email_health',
          sourceId: emailDigest(`${hash}:${issue}`),
        },
        connection,
      );
    }
    await connection.commit();
    return Boolean(inserted.affectedRows);
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

/** 每个 UTC 自然月一次，按主键小批量续跑；连接级互斥覆盖多个 API 实例和重启。 */
export async function runAccountEmailHealthBatch({
  db = pool,
  now = new Date(),
  batchSize = 25,
  inspectDomain = inspectEmailDomain,
  notify = createNotification,
} = {}) {
  const period = now.toISOString().slice(0, 7);
  const connection = await db.getConnection();
  let locked = false;
  try {
    const [[lock]] = await connection.query(
      "SELECT GET_LOCK(CONCAT('ln:email-health:', LEFT(SHA2(DATABASE(), 256), 32)), 0) AS acquired",
    );
    locked = Number(lock.acquired) === 1;
    if (!locked) return { checked: 0, notified: 0, busy: true };
    await connection.query('DELETE FROM account_email_health_runs WHERE period < ?', [period]);
    await connection.query('INSERT IGNORE INTO account_email_health_runs (period) VALUES (?)', [period]);
    const [[run]] = await connection.query(
      'SELECT after_user_id, completed FROM account_email_health_runs WHERE period = ?',
      [period],
    );
    if (Number(run.completed)) return { checked: 0, notified: 0, completed: true };
    const limit = Math.min(100, Math.max(1, Math.trunc(batchSize) || 25));
    const [users] = await connection.query(
      `SELECT id, email, github_id FROM user
      WHERE id > ? AND role IN ('user', 'test', 'root') AND del_flag = 0 ORDER BY id LIMIT ?`,
      [run.after_user_id, limit],
    );
    // 每批只查一次退信，不对未发送过邮件的地址进行 SMTP 探测。
    const emails = [...new Set(users.map((user) => user.email).filter(Boolean))];
    const failed = new Set();
    if (emails.length) {
      const [deliveries] = await connection.query(
        `SELECT recipient_email FROM email_delivery_logs e
        WHERE recipient_email IN (?) AND error_code = 'EMAIL_MAILBOX_NOT_FOUND'
          AND NOT EXISTS (SELECT 1 FROM email_delivery_logs later WHERE later.recipient_email = e.recipient_email
            AND (later.create_time > e.create_time OR (later.create_time = e.create_time
              AND COALESCE(later.error_code, '') <> 'EMAIL_MAILBOX_NOT_FOUND')))`,
        [emails],
      );
      for (const row of deliveries) failed.add(emailIdentity(row.recipient_email));
    }
    let notified = 0;
    const domains = new Map();
    for (const user of users) {
      // GitHub 内部占位地址不是用户填写错误，不向这些地址发信或判无效。
      if (user.github_id && isGitHubPlaceholderEmail(user.email)) continue;
      const parsed = parseAccountEmail(user.email, { healthCheck: true });
      let issue = !parsed ? 'INVALID_FORMAT' : failed.has(emailIdentity(user.email)) ? 'MAILBOX_NOT_FOUND' : null;
      if (parsed?.domain && !issue) {
        if (!domains.has(parsed.domain)) domains.set(parsed.domain, await inspectDomain(parsed.domain));
        issue = domains.get(parsed.domain);
      }
      if (issue && (await notifyIssue(connection, user, issue, notify))) notified++;
    }
    const completed = users.length < limit;
    await connection.query(`UPDATE account_email_health_runs SET after_user_id = ?, completed = ? WHERE period = ?`, [
      users.at(-1)?.id || run.after_user_id,
      completed ? 1 : 0,
      period,
    ]);
    return { checked: users.length, notified, completed };
  } finally {
    if (locked)
      await connection
        .query("SELECT RELEASE_LOCK(CONCAT('ln:email-health:', LEFT(SHA2(DATABASE(), 256), 32)))")
        .catch(() => {});
    connection.release();
  }
}

export function startAccountEmailHealthScheduler({ db = pool, env = process.env } = {}) {
  if (!notificationSchedulerEnabled(env)) return () => {};
  let running = false;
  async function tick() {
    if (running) return;
    running = true;
    try {
      if (await accountEmailHealthSchemaReady(db)) await runAccountEmailHealthBatch({ db });
    } catch (error) {
      console.warn(
        '[account-email-health] check failed code=%s',
        /^[A-Z0-9_]+$/.test(error?.code) ? error.code : 'CHECK_FAILED',
      );
    } finally {
      running = false;
    }
  }
  const timer = setInterval(tick, 60_000);
  timer.unref?.();
  void tick();
  return () => clearInterval(timer);
}
