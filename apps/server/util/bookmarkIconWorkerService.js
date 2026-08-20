/**
 * bookmarkIconWorkerService.js
 *
 * Worker 业务逻辑：从 bookmark_icon_jobs 表抢占任务，按 Origin 分组并发抓取，
 * 根据 favicon-api 结果更新任务状态。独立进程运行，使用自己的并发池。
 */

import { createHash } from 'crypto';
import pool from '../db/index.js';
import { fetchFaviconFromApi, normalizeOrigin, isRetryableError } from './bookmarkIconClient.js';
import { cleanupBookmarkIconFiles, cleanupPreviousBookmarkIcon, saveIconToDisk } from './bookmarkIconService.js';

const MAX_ATTEMPTS = parseInt(process.env.BOOKMARK_ICON_MAX_ATTEMPTS || '4', 10);
const WORKER_CONCURRENCY = Math.max(1, Number.parseInt(process.env.BOOKMARK_ICON_WORKER_CONCURRENCY || '10', 10));
const SUB_GROUP_CONCURRENCY = 4;

/**
 * 通用并发池，限制同时运行的 worker 函数数量。
 */
async function runPool(items, concurrency, worker) {
  if (!items.length) return;
  let cursor = 0;
  const runners = Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

/**
 * 计算重试时间（毫秒级，无浮点分钟）
 */
function computeRetryAt(attempt) {
  const delaysMs = [60_000, 5 * 60_000, 30 * 60_000];
  const base = delaysMs[Math.min(attempt - 1, delaysMs.length - 1)];
  const jitter = base * 0.15 * (Math.random() * 2 - 1);
  return new Date(Date.now() + base + jitter);
}

// ── 任务抢占 ──────────────────────────────────────────────

export async function claimTasks(workerId, batchSize, lockTimeoutMinutes) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 先清理超时的 processing 任务：恢复到 queued（而不是 retry_wait，否则不会被领取）
    await connection.query(
      `UPDATE bookmark_icon_jobs
       SET status = 'queued',
           available_at = NOW(),
           locked_at = NULL,
           locked_by = NULL
       WHERE status = 'processing'
         AND locked_at IS NOT NULL
         AND locked_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
      [lockTimeoutMinutes],
    );

    // 抢任务：包括 queued 和到期的 retry_wait
    const [rows] = await connection.query(
      `SELECT id, batch_id, user_id, bookmark_id, url_snapshot, origin_key, url_hash, attempts
       FROM bookmark_icon_jobs
       WHERE status IN ('queued', 'retry_wait') AND available_at <= NOW()
       ORDER BY available_at ASC, id ASC
       LIMIT ? FOR UPDATE`,
      [batchSize],
    );

    if (!rows?.length) {
      await connection.commit();
      return [];
    }

    const ids = rows.map((r) => r.id);
    await connection.query(
      `UPDATE bookmark_icon_jobs
       SET status = 'processing', locked_at = NOW(), locked_by = ?
       WHERE id IN (${ids.map(() => '?').join(',')})`,
      [workerId, ...ids],
    );

    await connection.commit();
    return rows;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

// ── 批量处理 ──────────────────────────────────────────────

async function filterTasksNeedingFetch(tasks, workerId) {
  const jobIds = tasks.map((task) => task.id).filter((id) => id !== undefined && id !== null);
  if (!jobIds.length) return [];
  const placeholders = jobIds.map(() => '?').join(',');

  // 编辑页可能已在前台即时补好图标。先把这些任务安全终结，避免 Worker 再请求同一站点。
  await pool.query(
    `UPDATE bookmark_icon_jobs j
     INNER JOIN bookmark b
       ON b.id = j.bookmark_id
      AND b.user_id = j.user_id
      AND b.del_flag = 0
     SET j.status = 'success',
         j.error_code = NULL,
         j.finished_at = NOW(3),
         j.locked_at = NULL,
         j.locked_by = NULL
     WHERE j.id IN (${placeholders})
       AND j.status = 'processing'
       AND j.locked_by = ?
       AND b.url = j.url_snapshot
       AND b.icon_url IS NOT NULL
       AND b.icon_url <> ''`,
    [...jobIds, workerId],
  );

  const [remainingRows] = await pool.query(
    `SELECT id
     FROM bookmark_icon_jobs
     WHERE id IN (${placeholders})
       AND status = 'processing'
       AND locked_by = ?`,
    [...jobIds, workerId],
  );
  const remainingIds = new Set((remainingRows || []).map((row) => String(row.id)));
  return tasks.filter((task) => remainingIds.has(String(task.id)));
}

export async function processTaskBatch(tasks, workerId) {
  if (!tasks?.length) return { processed: 0 };

  const pendingTasks = await filterTasksNeedingFetch(tasks, workerId);

  // 按 Origin 分组
  const originGroups = new Map();
  for (const task of pendingTasks) {
    const key = task.origin_key;
    if (!originGroups.has(key)) originGroups.set(key, []);
    originGroups.get(key).push(task);
  }

  const entries = [...originGroups.entries()];
  let processed = tasks.length - pendingTasks.length;

  // 并发处理所有 Origin（受 WORKER_CONCURRENCY 限制）
  await runPool(entries, WORKER_CONCURRENCY, async ([, groupTasks]) => {
    let fetchResult;
    try {
      fetchResult = await fetchFaviconFromApi(groupTasks[0].url_snapshot);
    } catch {
      fetchResult = { ok: false, errorCode: 'INTERNAL_ERROR', retryable: true };
    }

    // 同 Origin 的多个书签也小并发写库
    await runPool(groupTasks, SUB_GROUP_CONCURRENCY, async (task) => {
      await updateTaskResult(task, fetchResult, workerId);
      processed += 1;
    });
  });

  return { processed };
}

// ── 任务结果更新 ──────────────────────────────────────────

export async function updateTaskResult(task, fetchResult, workerId) {
  const { id, bookmark_id, user_id, url_snapshot, url_hash, attempts } = task;

  if (fetchResult.ok) {
    // 网络抓取期间不持有数据库连接；落盘前重新读取当前书签快照。
    let currentBookmark;
    const verifyConn = await pool.getConnection();
    try {
      const [rows] = await verifyConn.query(
        'SELECT id, url, icon_url, del_flag FROM bookmark WHERE id = ? AND user_id = ? AND del_flag = 0 LIMIT 1',
        [bookmark_id, user_id],
      );
      if (!rows?.length) {
        await verifyConn.query(
          `UPDATE bookmark_icon_jobs
           SET status = 'cancelled',
               error_code = 'BOOKMARK_UNAVAILABLE',
               finished_at = NOW(3),
               locked_at = NULL,
               locked_by = NULL
           WHERE id = ? AND user_id = ? AND status = 'processing' AND locked_by = ?`,
          [id, user_id, workerId],
        );
        return;
      }
      currentBookmark = rows[0];
      if (String(currentBookmark.url || '') !== String(url_snapshot || '')) {
        await verifyConn.query(
          `UPDATE bookmark_icon_jobs
           SET status = 'cancelled',
               error_code = 'BOOKMARK_URL_CHANGED',
               finished_at = NOW(3),
               locked_at = NULL,
               locked_by = NULL
           WHERE id = ? AND user_id = ? AND status = 'processing' AND locked_by = ?`,
          [id, user_id, workerId],
        );
        return;
      }
    } finally {
      verifyConn.release();
    }

    // URL 未变化——保存图标到磁盘
    let saved;
    try {
      saved = await saveIconToDisk(
        {
          id: bookmark_id,
          url: url_snapshot,
          icon_url: currentBookmark.icon_url || '',
        },
        fetchResult,
      );
    } catch {
      // 落盘失败，标为 failed
      await pool.query(
        `UPDATE bookmark_icon_jobs
         SET status = 'failed',
             error_code = 'BOOKMARK_ICON_PERSIST_FAILED',
             finished_at = NOW(3),
             locked_at = NULL,
             locked_by = NULL
         WHERE id = ? AND user_id = ? AND status = 'processing' AND locked_by = ?`,
        [id, user_id, workerId],
      );
      return;
    }

    // 锁定 job 后，以 URL 条件更新 bookmark；书签与 job 终态在同一事务提交。
    const updateConn = await pool.getConnection();
    let committedSuccess = false;
    let shouldCleanupNewIcon = false;
    let transactionError = null;
    try {
      await updateConn.beginTransaction();
      const [jobRows] = await updateConn.query(
        `SELECT status, locked_by
         FROM bookmark_icon_jobs
         WHERE id = ? AND user_id = ?
         FOR UPDATE`,
        [id, user_id],
      );
      if (!jobRows?.length || jobRows[0].status !== 'processing' || jobRows[0].locked_by !== workerId) {
        await updateConn.commit();
        shouldCleanupNewIcon = true;
      } else {
        const [bookmarkResult] = await updateConn.query(
          `UPDATE bookmark
           SET icon_url = ?, icon_checked_at = NOW()
           WHERE id = ? AND user_id = ? AND del_flag = 0 AND url = ?`,
          [saved.iconUrl, bookmark_id, user_id, url_snapshot],
        );
        if (Number(bookmarkResult?.affectedRows || 0) !== 1) {
          await updateConn.query(
            `UPDATE bookmark_icon_jobs
             SET status = 'cancelled',
                 error_code = 'BOOKMARK_URL_CHANGED',
                 finished_at = NOW(3),
                 locked_at = NULL,
                 locked_by = NULL
             WHERE id = ? AND user_id = ? AND status = 'processing' AND locked_by = ?`,
            [id, user_id, workerId],
          );
          await updateConn.commit();
          shouldCleanupNewIcon = true;
        } else {
          const [jobResult] = await updateConn.query(
            `UPDATE bookmark_icon_jobs
             SET status = 'success',
                 error_code = NULL,
                 finished_at = NOW(3),
                 locked_at = NULL,
                 locked_by = NULL
             WHERE id = ? AND user_id = ? AND status = 'processing' AND locked_by = ?`,
            [id, user_id, workerId],
          );
          if (Number(jobResult?.affectedRows || 0) !== 1) {
            const error = new Error('BOOKMARK_ICON_JOB_LOCK_LOST');
            error.code = 'BOOKMARK_ICON_JOB_LOCK_LOST';
            throw error;
          }
          await updateConn.commit();
          committedSuccess = true;
        }
      }
    } catch (txErr) {
      await updateConn.rollback();
      shouldCleanupNewIcon = true;
      transactionError = txErr;
    } finally {
      updateConn.release();
    }

    if (shouldCleanupNewIcon) {
      await cleanupBookmarkIconFiles([{ id: bookmark_id, iconUrl: saved.iconUrl }]).catch(() => {});
      if (transactionError) throw transactionError;
      return;
    }

    // commit 后才清理旧图标
    if (committedSuccess && saved.oldIconUrl && saved.oldFilePath !== saved.newFilePath) {
      await cleanupPreviousBookmarkIcon(saved.oldIconUrl, bookmark_id, saved.iconUrl).catch(() => {});
    }
    return;
  }

  // ── 失败处理 ──────────────────────────────────────────
  const errorCode = fetchResult.errorCode || 'INTERNAL_ERROR';
  const nextAttempt = attempts + 1;

  if (!isRetryableError(errorCode)) {
    // 不可重试——标记终态
    await terminalJob(id, bookmark_id, user_id, url_hash, 'not_found', errorCode, nextAttempt, workerId);
    return;
  }

  // retryable
  if (nextAttempt >= MAX_ATTEMPTS) {
    await terminalJob(id, bookmark_id, user_id, url_hash, 'failed', errorCode, nextAttempt, workerId);
    return;
  }

  // 设置重试
  const retryAt = computeRetryAt(nextAttempt);
  await pool.query(
    `UPDATE bookmark_icon_jobs
     SET status = 'retry_wait',
         attempts = ?,
         available_at = ?,
         error_code = ?,
         finished_at = NULL,
         locked_at = NULL,
         locked_by = NULL
     WHERE id = ? AND user_id = ? AND status = 'processing' AND locked_by = ?`,
    [nextAttempt, retryAt, errorCode, id, user_id, workerId],
  );
}

/**
 * 终态处理：not_found 或 failed。同事务更新 bookmark 检查时间。
 */
async function terminalJob(jobId, bookmarkId, userId, urlHash, status, errorCode, attempt, workerId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [jobRows] = await conn.query(
      `SELECT id
       FROM bookmark_icon_jobs
       WHERE id = ? AND user_id = ? AND status = 'processing' AND locked_by = ?
       FOR UPDATE`,
      [jobId, userId, workerId],
    );
    if (!jobRows?.length) {
      await conn.commit();
      return;
    }
    const [rows] = await conn.query('SELECT url FROM bookmark WHERE id = ? AND user_id = ? AND del_flag = 0 LIMIT 1', [
      bookmarkId,
      userId,
    ]);
    const currentHash = createHash('sha256')
      .update(rows[0]?.url || '')
      .digest('hex');

    if (currentHash === urlHash && rows?.length) {
      await conn.query('UPDATE bookmark SET icon_checked_at = NOW() WHERE id = ? AND user_id = ? AND del_flag = 0', [
        bookmarkId,
        userId,
      ]);
      await conn.query(
        `UPDATE bookmark_icon_jobs
         SET status = ?, attempts = ?, error_code = ?, finished_at = NOW(3), locked_at = NULL, locked_by = NULL
         WHERE id = ? AND user_id = ? AND status = 'processing' AND locked_by = ?`,
        [status, attempt, errorCode, jobId, userId, workerId],
      );
    } else {
      await conn.query(
        `UPDATE bookmark_icon_jobs
         SET status = 'cancelled', attempts = ?, error_code = ?, finished_at = NOW(3), locked_at = NULL, locked_by = NULL
         WHERE id = ? AND user_id = ? AND status = 'processing' AND locked_by = ?`,
        [attempt, errorCode, jobId, userId, workerId],
      );
    }
    await conn.commit();
  } catch (txErr) {
    await conn.rollback();
    throw txErr;
  } finally {
    conn.release();
  }
}
