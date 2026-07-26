/**
 * 书签图标补全批次的创建、查询与重试管理。
 * 在导入事务提交后调用，独立于 Worker。
 */

import { createHash, randomUUID } from 'crypto';
import pool from '../db/index.js';
import { normalizeOrigin } from './bookmarkIconClient.js';

const ICON_BATCH_INSERT_RETRY_LIMIT = 3;
const ICON_BATCH_INSERT_RETRY_BASE_MS = 40;

export function bookmarkIconBackgroundJobsEnabled() {
  return process.env.BOOKMARK_ICON_BACKGROUND_JOBS_ENABLED !== 'false';
}

function isRetryableInsertContention(error) {
  return (
    error?.code === 'ER_LOCK_DEADLOCK' ||
    error?.code === 'ER_LOCK_WAIT_TIMEOUT' ||
    Number(error?.errno) === 1213 ||
    Number(error?.errno) === 1205
  );
}

async function insertIconJobChunk(sql, params) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await pool.query(sql, params);
    } catch (error) {
      if (!isRetryableInsertContention(error) || attempt >= ICON_BATCH_INSERT_RETRY_LIMIT) {
        throw error;
      }
      const delayMs = ICON_BATCH_INSERT_RETRY_BASE_MS * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * 为新建/受影响的书签创建图标补全任务。
 * 核心逻辑：
 * - 只给没有 icon_url 的书签创建任务（明确需要补全）
 * - 幂等：同 bookmark + url_hash 不会重复插入
 *
 * @param {string} userId
 * @param {Array<{id:string, url:string}>} bookmarks - 新建或受影响的书签
 * @returns {Promise<{batchId:string, total:number, status:string}>}
 */
export async function createIconBatch(userId, bookmarks) {
  const batchId = randomUUID();
  if (!bookmarkIconBackgroundJobsEnabled()) {
    return { batchId, total: 0, status: 'no_tasks' };
  }
  const tasks = [];

  for (const bm of bookmarks) {
    if (!bm?.id || !bm?.url) continue;
    const originKey = normalizeOrigin(bm.url);
    if (!originKey) continue;
    const urlHash = createHash('sha256').update(bm.url).digest('hex');

    tasks.push({
      batch_id: batchId,
      user_id: userId,
      bookmark_id: bm.id,
      url_snapshot: bm.url,
      origin_key: originKey,
      url_hash: urlHash,
    });
  }

  if (tasks.length === 0) {
    return { batchId, total: 0, status: 'no_tasks' };
  }

  // 分批插入，避免单条 SQL 过长，返回实际插入数
  const BATCH_SIZE = 50;
  let insertedTotal = 0;
  for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
    const chunk = tasks.slice(i, i + BATCH_SIZE);
    const values = chunk.map(() => '(?,?,?,?,?,?)').join(',');
    const params = chunk.flatMap((t) => [
      t.batch_id, t.user_id, t.bookmark_id,
      t.url_snapshot, t.origin_key, t.url_hash,
    ]);

    const [result] = await insertIconJobChunk(
      `INSERT IGNORE INTO bookmark_icon_jobs
       (batch_id, user_id, bookmark_id, url_snapshot, origin_key, url_hash)
       VALUES ${values}`,
      params,
    );
    insertedTotal += Number(result?.affectedRows || 0);
  }

  return { batchId, total: insertedTotal, status: insertedTotal > 0 ? 'queued' : 'no_tasks' };
}

/**
 * 查询批次进度（支持增量 cursor）
 * cursor: { finishedAt?: string, jobId?: number }
 */
export async function getIconBatchStatus(batchId, userId, cursor = {}) {
  // 查询汇总状态
  const [rows] = await pool.query(
    `SELECT status, COUNT(*) as cnt
     FROM bookmark_icon_jobs
     WHERE batch_id = ? AND user_id = ?
     GROUP BY status`,
    [batchId, userId],
  );

  const totalResult = await pool.query(
    'SELECT COUNT(*) as total FROM bookmark_icon_jobs WHERE batch_id = ? AND user_id = ?',
    [batchId, userId],
  );
  const total = Number(totalResult[0]?.[0]?.total || 0);

  const statusMap = {};
  for (const r of rows) {
    statusMap[r.status] = Number(r.cnt);
  }

  const completed = (statusMap.success || 0) + (statusMap.not_found || 0) + (statusMap.failed || 0) + (statusMap.cancelled || 0);

  let overallStatus = 'processing';
  if (completed >= total && total > 0) {
    overallStatus = 'completed';
  } else if (total === 0) {
    overallStatus = 'no_tasks';
  }

  // 增量更新查询（cursor 后 finished_at 的已完成项目）
  const updates = [];
  let nextCursor = null;
  const parsedCursorDate = cursor?.finishedAt ? new Date(cursor.finishedAt) : new Date(0);
  const cursorFinishedAt = Number.isNaN(parsedCursorDate.getTime()) ? new Date(0) : parsedCursorDate;
  const parsedCursorJobId = Number(cursor?.jobId || 0);
  const cursorJobId = Number.isSafeInteger(parsedCursorJobId) && parsedCursorJobId >= 0
    ? parsedCursorJobId
    : 0;

  const [updateRows] = await pool.query(
    `SELECT j.id AS jobId, j.bookmark_id AS bookmarkId, j.status, j.finished_at AS finishedAt,
            b.icon_url AS iconUrl
     FROM bookmark_icon_jobs j
     LEFT JOIN bookmark b ON b.id = j.bookmark_id AND b.user_id = j.user_id AND b.del_flag = 0
     WHERE j.batch_id = ? AND j.user_id = ? AND j.finished_at IS NOT NULL
       AND (j.finished_at > ? OR (j.finished_at = ? AND j.id > ?))
     ORDER BY j.finished_at ASC, j.id ASC
     LIMIT 100`,
    [batchId, userId, cursorFinishedAt, cursorFinishedAt, cursorJobId],
  );

  for (const r of updateRows || []) {
    updates.push({
      jobId: r.jobId,
      bookmarkId: r.bookmarkId,
      status: r.status,
      iconUrl: r.iconUrl || '',
      finishedAt: r.finishedAt,
    });
  }

  if (updates.length > 0) {
    const last = updates[updates.length - 1];
    nextCursor = { finishedAt: last.finishedAt, jobId: last.jobId };
  }

  return {
    batchId,
    total,
    completed,
    success: statusMap.success || 0,
    notFound: statusMap.not_found || 0,
    failed: statusMap.failed || 0,
    cancelled: statusMap.cancelled || 0,
    queued: statusMap.queued || 0,
    processing: statusMap.processing || 0,
    retryWaiting: statusMap.retry_wait || 0,
    status: overallStatus,
    updates,
    nextCursor,
  };
}

/**
 * 重试批次中的失败项
 */
export async function retryIconBatchFailures(batchId, userId, includeNotFound = false) {
  const statuses = ['failed'];
  if (includeNotFound) statuses.push('not_found');
  const placeholders = statuses.map(() => '?').join(',');
  const connection = await pool.getConnection();
  let retried = 0;
  let cancelled = 0;

  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT j.id,
              j.bookmark_id AS bookmarkId,
              b.url AS currentUrl
       FROM bookmark_icon_jobs j
       LEFT JOIN bookmark b
         ON b.id = j.bookmark_id
        AND b.user_id = j.user_id
        AND b.del_flag = 0
       WHERE j.batch_id = ?
         AND j.user_id = ?
         AND j.status IN (${placeholders})
       ORDER BY j.id ASC
       FOR UPDATE`,
      [batchId, userId, ...statuses],
    );

    for (const row of rows || []) {
      const currentUrl = String(row.currentUrl || '').trim();
      const originKey = normalizeOrigin(currentUrl);
      if (!currentUrl || !originKey) {
        const [cancelResult] = await connection.query(
          `UPDATE bookmark_icon_jobs
           SET status = 'cancelled',
               error_code = 'BOOKMARK_URL_UNAVAILABLE',
               finished_at = NOW(3),
               locked_at = NULL,
               locked_by = NULL
           WHERE id = ? AND batch_id = ? AND user_id = ?`,
          [row.id, batchId, userId],
        );
        cancelled += Number(cancelResult?.affectedRows || 0);
        continue;
      }

      const urlHash = createHash('sha256').update(currentUrl).digest('hex');
      try {
        const [updateResult] = await connection.query(
          `UPDATE bookmark_icon_jobs
           SET url_snapshot = ?,
               origin_key = ?,
               url_hash = ?,
               status = 'queued',
               attempts = 0,
               error_code = NULL,
               available_at = NOW(),
               finished_at = NULL,
               locked_at = NULL,
               locked_by = NULL
           WHERE id = ? AND batch_id = ? AND user_id = ?`,
          [currentUrl, originKey, urlHash, row.id, batchId, userId],
        );
        retried += Number(updateResult?.affectedRows || 0);
      } catch (error) {
        if (error?.code !== 'ER_DUP_ENTRY') throw error;
        const [cancelResult] = await connection.query(
          `UPDATE bookmark_icon_jobs
           SET status = 'cancelled',
               error_code = 'DUPLICATE_CURRENT_URL_JOB',
               finished_at = NOW(3),
               locked_at = NULL,
               locked_by = NULL
           WHERE id = ? AND batch_id = ? AND user_id = ?`,
          [row.id, batchId, userId],
        );
        cancelled += Number(cancelResult?.affectedRows || 0);
      }
    }

    await connection.commit();
    return { retried, cancelled };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
