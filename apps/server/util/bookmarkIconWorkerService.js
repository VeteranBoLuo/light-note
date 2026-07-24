/**
 * bookmarkIconWorkerService.js
 *
 * Worker 业务逻辑：从 bookmark_icon_jobs 表抢占任务，按 Origin 分组抓取，
 * 根据 favicon-api 结果更新任务状态。
 */

import { createHash } from 'crypto';
import pool from '../db/index.js';
import { fetchFaviconFromApi, normalizeOrigin, isRetryableError } from './bookmarkIconClient.js';
import { bookmarkIconLimiter } from './bookmarkIconLimiter.js';
import { saveIconToDisk } from './bookmarkIconService.js';

const MAX_ATTEMPTS = parseInt(process.env.BOOKMARK_ICON_MAX_ATTEMPTS || "4", 10);

/** 重试间隔（分钟级）：失败次数 → 等待分钟数 */
const RETRY_DELAYS = [0, 1, 5, 30];
const JITTER_PCT = 0.15; // 15% 随机抖动

function retryDelayMinutes(attempt) {
  const idx = Math.min(attempt, RETRY_DELAYS.length - 1);
  const base = RETRY_DELAYS[idx];
  const jitter = base * JITTER_PCT * (Math.random() * 2 - 1);
  return Math.max(0, base + jitter);
}

/**
 * 抢占待处理任务（MySQL 5.7 兼容：无 SKIP LOCKED，使用事务 FOR UPDATE）
 */
export async function claimTasks(workerId, batchSize, lockTimeoutMinutes) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 先清理超时的 processing 任务
    await connection.query(
      `UPDATE bookmark_icon_jobs
       SET status = 'retry_wait',
           available_at = DATE_ADD(NOW(), INTERVAL 1 MINUTE),
           locked_at = NULL,
           locked_by = NULL
       WHERE status = 'processing'
         AND locked_at IS NOT NULL
         AND locked_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
      [lockTimeoutMinutes],
    );

    // 抢任务
    const [rows] = await connection.query(
      `SELECT id, batch_id, user_id, bookmark_id, url_snapshot, origin_key, url_hash, attempts
       FROM bookmark_icon_jobs
       WHERE status = 'queued' AND available_at <= NOW()
       ORDER BY available_at, id
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

/**
 * 处理一批任务
 * 按 origin_key 分组，每组只请求 favicon-api 一次
 */
export async function processTaskBatch(tasks, workerId) {
  if (!tasks?.length) return { processed: 0 };

  // 按 Origin 分组
  const originGroups = new Map();
  for (const task of tasks) {
    const key = task.origin_key;
    if (!originGroups.has(key)) {
      originGroups.set(key, []);
    }
    originGroups.get(key).push(task);
  }

  let processed = 0;

  for (const [originKey, groupTasks] of originGroups) {
    const release = await bookmarkIconLimiter.acquire();
    try {
      const urlSnapshot = groupTasks[0].url_snapshot;
      const fetchResult = await fetchFaviconFromApi(urlSnapshot);

      for (const task of groupTasks) {
        await updateTaskResult(task, fetchResult, workerId);
        processed++;
      }
    } catch (err) {
      // 全局性错误（如 limiter 异常）
      for (const task of groupTasks) {
        await markTaskFailed(task, 'INTERNAL_ERROR', workerId);
        processed++;
      }
    } finally {
      release();
    }
  }

  return { processed };
}

async function updateTaskResult(task, fetchResult, workerId) {
  const { id, bookmark_id, user_id, url_snapshot, url_hash, attempts } = task;

  if (fetchResult.ok) {
    // 成功——保存图标到磁盘
    const saved = await saveIconToDisk(
      { id: bookmark_id, url: url_snapshot, icon_url: '' },
      fetchResult,
      user_id,
    );

    // 更新 job 状态 + 更新 bookmark
    const connection = await pool.getConnection();
    try {
      // 先校验书签未变化
      const [rows] = await connection.query(
        'SELECT id, url, del_flag FROM bookmark WHERE id = ? AND user_id = ? AND del_flag = 0 LIMIT 1',
        [bookmark_id, user_id],
      );
      const currentUrl = rows[0]?.url || '';
      const currentHash = createHash('sha256').update(currentUrl).digest('hex');

      if (currentHash !== url_hash) {
        // URL 已变化
        await connection.query(
          'UPDATE bookmark_icon_jobs SET status = ? WHERE id = ?',
          ['cancelled', id],
        );
        return;
      }

      // 更新 bookmark
      await connection.query(
        'UPDATE bookmark SET icon_url = ?, icon_checked_at = NOW() WHERE id = ? AND user_id = ? AND del_flag = 0',
        [saved.iconUrl, bookmark_id, user_id],
      );

      // 更新 job
      await connection.query(
        'UPDATE bookmark_icon_jobs SET status = ?, error_code = NULL WHERE id = ?',
        ['success', id],
      );
    } finally {
      connection.release();
    }
    return;
  }

  // 失败处理
  const errorCode = fetchResult.errorCode || 'INTERNAL_ERROR';

  if (!isRetryableError(errorCode)) {
    // 永久失败
    await updateJobAndBookmark(id, bookmark_id, user_id, url_hash, 'not_found', errorCode, attempts);
    return;
  }

  // retryable 错误
  const nextAttempt = attempts + 1;
  if (nextAttempt >= MAX_ATTEMPTS) {
    await updateJobAndBookmark(id, bookmark_id, user_id, url_hash, 'failed', errorCode, attempts);
    return;
  }

  // 设置重试等待
  const delayMin = retryDelayMinutes(nextAttempt);
  await connectionUpdate(
    'UPDATE bookmark_icon_jobs SET status = ?, attempts = ?, available_at = DATE_ADD(NOW(), INTERVAL ? MINUTE), error_code = ?, locked_at = NULL, locked_by = NULL WHERE id = ?',
    ['retry_wait', nextAttempt, delayMin, errorCode, id],
  );
}

async function updateJobAndBookmark(jobId, bookmarkId, userId, urlHash, status, errorCode, attempts) {
  const connection = await pool.getConnection();
  try {
    // 校验书签未变化
    const [rows] = await connection.query(
      'SELECT url FROM bookmark WHERE id = ? AND user_id = ? AND del_flag = 0 LIMIT 1',
      [bookmarkId, userId],
    );
    const currentHash = createHash('sha256').update(rows[0]?.url || '').digest('hex');

    if (status === 'not_found' || status === 'failed') {
      if (currentHash === urlHash) {
        // 更新检查时间
        await connection.query(
          'UPDATE bookmark SET icon_checked_at = NOW() WHERE id = ? AND user_id = ? AND del_flag = 0',
          [bookmarkId, userId],
        );
      }
      // URL 已变化——只取消任务，不改书签
      await connection.query(
        'UPDATE bookmark_icon_jobs SET status = ?, error_code = ? WHERE id = ?',
        [currentHash === urlHash ? status : 'cancelled', errorCode, jobId],
      );
    }
  } finally {
    connection.release();
  }
}

async function markTaskFailed(task, errorCode, workerId) {
  await connectionUpdate(
    'UPDATE bookmark_icon_jobs SET status = ?, error_code = ?, locked_at = NULL, locked_by = NULL WHERE id = ?',
    ['failed', errorCode, task.id],
  );
}

async function connectionUpdate(sql, params) {
  const connection = await pool.getConnection();
  try {
    await connection.query(sql, params);
  } finally {
    connection.release();
  }
}
