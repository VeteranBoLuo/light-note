/**
 * 书签图标补全批次的创建、查询与重试管理。
 * 在导入事务提交后调用，独立于 Worker。
 */

import { createHash, randomUUID } from 'crypto';
import pool from '../db/index.js';
import { normalizeOrigin } from './bookmarkIconClient.js';

const WORKER_ID = process.env.BOOKMARK_ICON_WORKER_ID || `worker-${randomUUID().slice(0, 8)}`;

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

  // 分批插入，避免单条 SQL 过长
  const BATCH_SIZE = 50;
  for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
    const chunk = tasks.slice(i, i + BATCH_SIZE);
    const values = chunk.map(() => '(?,?,?,?,?,?)').join(',');
    const params = chunk.flatMap((t) => [
      t.batch_id, t.user_id, t.bookmark_id,
      t.url_snapshot, t.origin_key, t.url_hash,
    ]);

    await pool.query(
      `INSERT IGNORE INTO bookmark_icon_jobs
       (batch_id, user_id, bookmark_id, url_snapshot, origin_key, url_hash)
       VALUES ${values}`,
      params,
    );
  }

  return { batchId, total: tasks.length, status: 'queued' };
}

/**
 * 查询批次进度
 */
export async function getIconBatchStatus(batchId, userId) {
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
  const total = totalResult[0]?.[0]?.total || 0;

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
  };
}

/**
 * 重试批次中的失败项
 */
export async function retryIconBatchFailures(batchId, userId, includeNotFound = false) {
  const statuses = ["'failed'"];
  if (includeNotFound) statuses.push("'not_found'");

  const [result] = await pool.query(
    `UPDATE bookmark_icon_jobs
     SET status = 'queued',
         attempts = 0,
         error_code = NULL,
         available_at = NOW(),
         locked_at = NULL,
         locked_by = NULL
     WHERE batch_id = ? AND user_id = ? AND status IN (${statuses.join(',')})`,
    [batchId, userId],
  );

  return { retried: result?.affectedRows || 0 };
}
