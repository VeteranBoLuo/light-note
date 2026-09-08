import { randomUUID } from 'node:crypto';
import pool from '../db/index.js';
import { archiveBookmark, ensureBookmarkSnapshotTable } from './snapshot.js';
import { archiveFailure } from './bookmarkArchivePolicy.js';
import { invalidatePersonalKnowledgeCache } from './personalKnowledgeSearch.js';

export const ARCHIVE_JOB_SCHEMA = `CREATE TABLE IF NOT EXISTS bookmark_archive_jobs (
  bookmark_id VARCHAR(64) NOT NULL PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  url VARCHAR(2048) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lease_token VARCHAR(36) DEFAULT NULL,
  lease_expires_at DATETIME DEFAULT NULL,
  reason_code VARCHAR(64) DEFAULT NULL,
  source VARCHAR(20) DEFAULT NULL,
  char_count INT NOT NULL DEFAULT 0,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_archive_due (status, next_attempt_at),
  KEY idx_archive_owner (user_id, status),
  KEY idx_archive_lease (lease_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

export async function ensureBookmarkArchiveSchema() {
  await ensureBookmarkSnapshotTable();
  await pool.query(ARCHIVE_JOB_SCHEMA);
}

const activeStatuses = ['pending', 'running', 'retry_wait'];
export function archiveRetryDelay(reason, attempts) {
  return archiveFailure(reason).retryable && attempts < 3 ? (attempts === 1 ? 30 : 120) : null;
}

// 同一用户串行入队，避免重复点击和批量重试突破待处理上限。
export async function enqueueBookmarkArchive(userId, bookmarkId, options = {}) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await enqueueBookmarkArchiveInTransaction(connection, userId, bookmarkId, options);
    if (result) await connection.commit();
    return result;
  } finally {
    try {
      await connection.rollback();
    } finally {
      connection.release();
    }
  }
}

// 调用方负责事务提交；与整理建议的应用状态在同一个事务中保存。
export async function enqueueBookmarkArchiveInTransaction(connection, userId, bookmarkId, { failedOnly = false } = {}) {
  const [users] = await connection.query('SELECT id FROM user WHERE id = ? AND del_flag = 0 FOR UPDATE', [userId]);
  if (!users.length) return null;
  const [bookmarks] = await connection.query(
    'SELECT url FROM bookmark WHERE id = ? AND user_id = ? AND del_flag = 0 FOR UPDATE',
    [bookmarkId, userId],
  );
  if (!bookmarks[0]?.url) return null;
  const [jobs] = await connection.query('SELECT * FROM bookmark_archive_jobs WHERE bookmark_id = ? FOR UPDATE', [
    bookmarkId,
  ]);
  const job = jobs[0];
  if (failedOnly && (!job || job.status !== 'failed')) return null;
  if (job?.url === bookmarks[0].url && activeStatuses.includes(job.status)) {
    return { ok: true, status: job.status };
  }
  const [[count]] = await connection.query(
    "SELECT COUNT(*) AS count FROM bookmark_archive_jobs WHERE user_id = ? AND status IN ('pending','running','retry_wait')",
    [userId],
  );
  const full = Number(count.count) >= 100;
  await connection.query(
    `INSERT INTO bookmark_archive_jobs (bookmark_id, user_id, url, status, reason_code) VALUES (?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), url = VALUES(url), status = VALUES(status), reason_code = VALUES(reason_code), attempts = 0,
    next_attempt_at = CURRENT_TIMESTAMP, lease_token = NULL, lease_expires_at = NULL,
    source = NULL, char_count = 0`,
    [bookmarkId, userId, bookmarks[0].url, full ? 'failed' : 'pending', full ? 'QUEUE_FULL' : null],
  );
  return full ? archiveFailure('QUEUE_FULL') : { ok: true, status: 'pending' };
}

export async function getBookmarkArchiveStatus(userId, bookmarkId) {
  const [rows] = await pool.query(
    `SELECT j.status, j.attempts, j.reason_code, j.next_attempt_at, j.source, j.char_count
    FROM bookmark_archive_jobs j JOIN bookmark b ON CONVERT(b.id USING utf8mb4) COLLATE utf8mb4_unicode_ci = j.bookmark_id
      AND CONVERT(b.user_id USING utf8mb4) COLLATE utf8mb4_unicode_ci = j.user_id
    WHERE j.user_id = ? AND j.bookmark_id = ? AND b.del_flag = 0 AND BINARY b.url = BINARY j.url`,
    [userId, bookmarkId],
  );
  const [counts] = await pool.query(
    `SELECT COUNT(*) AS count FROM bookmark_archive_jobs j
    JOIN bookmark b ON CONVERT(b.id USING utf8mb4) COLLATE utf8mb4_unicode_ci = j.bookmark_id
      AND CONVERT(b.user_id USING utf8mb4) COLLATE utf8mb4_unicode_ci = j.user_id
    WHERE j.user_id = ? AND j.status = 'failed' AND b.del_flag = 0`,
    [userId],
  );
  const task = rows[0];
  return {
    archiveTask: task ? { ...task, msg: task.reason_code ? archiveFailure(task.reason_code).msg : null } : null,
    failedCount: Number(counts[0]?.count || 0),
  };
}

export async function retryFailedBookmarkArchives(userId) {
  const [rows] = await pool.query(
    `SELECT j.bookmark_id FROM bookmark_archive_jobs j
    JOIN bookmark b ON CONVERT(b.id USING utf8mb4) COLLATE utf8mb4_unicode_ci = j.bookmark_id
      AND CONVERT(b.user_id USING utf8mb4) COLLATE utf8mb4_unicode_ci = j.user_id
    WHERE j.user_id = ? AND j.status = 'failed' AND b.del_flag = 0 ORDER BY j.update_time LIMIT 20`,
    [userId],
  );
  let queued = 0;
  for (const row of rows) {
    if ((await enqueueBookmarkArchive(userId, row.bookmark_id, { failedOnly: true }))?.ok) queued++;
  }
  return { ok: true, queued };
}

// MySQL 5.7 使用原子 UPDATE 领取；租约过期可恢复，旧 Worker 的结果不能覆盖新任务。
export async function claimBookmarkArchive() {
  await pool.query(`UPDATE bookmark_archive_jobs SET status = 'failed', reason_code = 'INTERRUPTED', lease_token = NULL,
    lease_expires_at = NULL WHERE status = 'running' AND lease_expires_at < NOW() AND attempts >= 3`);
  const token = randomUUID();
  const [result] = await pool.query(
    `UPDATE bookmark_archive_jobs SET status = 'running', attempts = attempts + 1,
    lease_token = ?, lease_expires_at = DATE_ADD(NOW(), INTERVAL 5 MINUTE)
    WHERE attempts < 3 AND ((status IN ('pending','retry_wait') AND next_attempt_at <= NOW())
      OR (status = 'running' AND lease_expires_at < NOW())) ORDER BY next_attempt_at LIMIT 1`,
    [token],
  );
  if (!result.affectedRows) return null;
  const [rows] = await pool.query('SELECT * FROM bookmark_archive_jobs WHERE lease_token = ?', [token]);
  return rows[0] || null;
}

export async function finishBookmarkArchive(job, result) {
  const connection = await pool.getConnection();
  let saved = false;
  try {
    await connection.beginTransaction();
    const [users] = await connection.query('SELECT id FROM user WHERE id = ? AND del_flag = 0 FOR UPDATE', [
      job.user_id,
    ]);
    const [bookmarks] = await connection.query(
      'SELECT url FROM bookmark WHERE id = ? AND user_id = ? AND del_flag = 0 FOR UPDATE',
      [job.bookmark_id, job.user_id],
    );
    const [jobs] = await connection.query('SELECT * FROM bookmark_archive_jobs WHERE bookmark_id = ? FOR UPDATE', [
      job.bookmark_id,
    ]);
    if (jobs[0]?.lease_token !== job.lease_token || jobs[0]?.status !== 'running') return false;
    if (!users.length || bookmarks[0]?.url !== job.url || (result.ok && result.url !== job.url)) {
      result = archiveFailure('RESOURCE_CHANGED');
    }
    if (result.ok) {
      await connection.query(
        `INSERT INTO bookmark_snapshot (bookmark_id, user_id, url, title, content, char_count, source)
        VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE url = VALUES(url), title = VALUES(title),
        content = VALUES(content), char_count = VALUES(char_count), source = VALUES(source), summary = NULL, summary_at = NULL,
        update_time = CURRENT_TIMESTAMP`,
        [
          job.bookmark_id,
          job.user_id,
          job.url,
          result.title,
          result.content,
          result.charCount,
          result.source || 'static_html',
        ],
      );
      saved = true;
    }
    const delay = result.ok ? null : archiveRetryDelay(result.reason, job.attempts);
    await connection.query(
      `UPDATE bookmark_archive_jobs SET status = ?, reason_code = ?, source = ?, char_count = ?,
      next_attempt_at = DATE_ADD(NOW(), INTERVAL ? SECOND), lease_token = NULL, lease_expires_at = NULL
      WHERE bookmark_id = ? AND lease_token = ?`,
      [
        result.ok ? 'succeeded' : delay === null ? 'failed' : 'retry_wait',
        result.ok ? null : archiveFailure(result.reason).reason,
        result.ok ? result.source || 'static_html' : null,
        result.ok ? result.charCount : 0,
        delay || 0,
        job.bookmark_id,
        job.lease_token,
      ],
    );
    await connection.commit();
  } finally {
    try {
      await connection.rollback();
    } finally {
      connection.release();
    }
  }
  if (saved) await invalidatePersonalKnowledgeCache(job.user_id).catch(() => undefined);
  return saved;
}

export async function processBookmarkArchive() {
  const job = await claimBookmarkArchive();
  if (!job) return false;
  let result;
  try {
    result = await archiveBookmark(job.user_id, job.bookmark_id, { persist: false, retry: false });
  } catch {
    result = archiveFailure('FETCH_FAILED');
  }
  await finishBookmarkArchive(job, result);
  return true;
}
