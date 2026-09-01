import { randomUUID } from 'node:crypto';
import pool from '../db/index.js';
import { checkUrlLiveness } from './fetchWebMeta.js';
import { ensureOrganizeSchema } from './organizeSchema.js';
import { createBookmarkExactUrlHash } from './services/bookmarkExactUrlService.js';

const BATCH = 25;
const CONCURRENCY = 4;
const MAX_ATTEMPTS = 3;
const SCAN_LEASE_MINUTES = 5;
const ACTIVE_SCAN_STATUSES = new Set(['pending', 'running']);

export async function ensureBookmarkHealthTable() {
  await ensureOrganizeSchema();
}

async function runPool(items, worker) {
  let index = 0;
  const results = new Array(items.length);
  const runners = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (index < items.length) {
      const current = index++;
      results[current] = await worker(items[current]);
    }
  });
  await Promise.all(runners);
  return results;
}

function normalizeObservation(result) {
  const code = String(result?.code ?? result?.status ?? 'ERR').slice(0, 32);
  if (result?.status === 'alive') return { status: 'alive', code };
  // 首版只把外部服务器明确返回的 404 / 410 作为疑似失效；DNS、格式、协议与网络失败均为未知。
  if (result?.status === 'suspect' && ['404', '410'].includes(code)) return { status: 'suspect', code };
  return { status: 'unknown', code };
}

export async function saveBookmarkHealthObservation(
  userId,
  bookmark,
  { db = pool, checkLiveness = checkUrlLiveness } = {},
) {
  let rawResult;
  try {
    rawResult = await checkLiveness(bookmark.url);
  } catch {
    rawResult = { status: 'unknown', code: 'ERR' };
  }
  const observation = normalizeObservation(rawResult);
  const urlHash = createBookmarkExactUrlHash(bookmark.url);
  if (!urlHash) return { saved: false, ...observation };
  const [result] = await db.query(
    `INSERT INTO bookmark_health
       (bookmark_id, user_id, status, note, checked_at, observed_status, observed_code, checked_url_hash)
     SELECT b.id, b.user_id, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?
       FROM bookmark b
      WHERE b.id = ? AND b.user_id = ? AND b.del_flag = 0 AND b.url_exact_hash = ?
     ON DUPLICATE KEY UPDATE
       user_override = IF(checked_url_hash <=> VALUES(checked_url_hash), user_override, NULL),
       override_at = IF(checked_url_hash <=> VALUES(checked_url_hash), override_at, NULL),
       observed_status = IF(
         VALUES(observed_status) = 'unknown' AND checked_url_hash <=> VALUES(checked_url_hash),
         observed_status,
         VALUES(observed_status)
       ),
       observed_code = IF(
         VALUES(observed_status) = 'unknown' AND checked_url_hash <=> VALUES(checked_url_hash),
         observed_code,
         VALUES(observed_code)
       ),
       status = IF(
         VALUES(observed_status) = 'unknown' AND checked_url_hash <=> VALUES(checked_url_hash),
         status,
         VALUES(status)
       ),
       note = IF(
         VALUES(observed_status) = 'unknown' AND checked_url_hash <=> VALUES(checked_url_hash),
         note,
         VALUES(note)
       ),
       checked_url_hash = VALUES(checked_url_hash),
       checked_at = CURRENT_TIMESTAMP,
       user_id = VALUES(user_id)`,
    [observation.status, observation.code, observation.status, observation.code, urlHash, bookmark.id, userId, urlHash],
  );
  return { saved: Number(result?.affectedRows || 0) > 0, ...observation };
}

export async function recheckBookmarkHealth(userId, bookmarkId) {
  const [rows] = await pool.query(
    `SELECT id, url FROM bookmark
      WHERE id = ? AND user_id = ? AND del_flag = 0 AND url IS NOT NULL AND url <> '' LIMIT 1`,
    [bookmarkId, userId],
  );
  if (!rows.length) return { ok: false, reason: 'not_found' };
  const observation = await saveBookmarkHealthObservation(userId, rows[0]);
  return { ok: observation.saved, observation, item: await getBookmarkHealthItem(userId, bookmarkId) };
}

function stableScanErrorCode(error) {
  return String(error?.code || error?.name || 'BOOKMARK_HEALTH_ITEM_FAILED')
    .replace(/[^A-Za-z0-9_.:-]/g, '_')
    .slice(0, 64);
}

function publicScanStatus(row) {
  if (!row) return 'idle';
  if (row.status === 'pending') return 'queued';
  if (row.status === 'running' && Number(row.lease_expired || 0) > 0) return 'queued';
  return String(row.status || 'idle');
}

function scanPayload(row) {
  if (!row) return null;
  const total = Number(row.total || 0);
  const processed = Math.min(total, Number(row.processed || 0));
  return {
    id: row.run_id,
    status: publicScanStatus(row),
    running: ACTIVE_SCAN_STATUSES.has(String(row.status || '')),
    total,
    processed,
    checked: Number(row.alive || 0) + Number(row.suspect || 0) + Number(row.unknown_count || 0),
    alive: Number(row.alive || 0),
    suspect: Number(row.suspect || 0),
    unknown: Number(row.unknown_count || 0),
    skipped: Number(row.skipped || 0),
    failed: Number(row.failed || 0),
    startedAt: row.started_at || null,
    completedAt: row.finished_at || null,
    errorCode: row.last_error_code || null,
  };
}

async function getScanRow(userId, { db = pool, lock = false } = {}) {
  const [rows] = await db.query(
    `SELECT user_id, run_id, status, total, processed, alive, suspect, unknown_count, skipped, failed,
            started_at, finished_at, last_error_code,
            (status = 'running' AND (lease_expires_at IS NULL OR lease_expires_at < NOW())) AS lease_expired
       FROM bookmark_health_scan_jobs
      WHERE user_id = ?
      LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [userId],
  );
  return rows[0] || null;
}

export async function isChecking(userId) {
  const row = await getScanRow(userId);
  return ACTIVE_SCAN_STATUSES.has(String(row?.status || ''));
}

/**
 * 兼容旧入口：用户动作始终创建或复用一次全量持久任务，不在 HTTP 请求内等待外链检测。
 */
export async function checkBookmarkHealth(userId) {
  return startFullCheck(userId);
}

/**
 * 为账号创建当前一次全量检测快照。每个账号只有一个任务行，pending/running 时重复请求直接复用。
 * 旧观测和用户“标记正常”都不会在启动时被清空；Worker 会用本轮结果逐项刷新观测。
 */
export async function startFullCheck(userId) {
  const connection = await pool.getConnection();
  let reused = false;
  try {
    await connection.beginTransaction();
    const existing = await getScanRow(userId, { db: connection, lock: true });
    if (ACTIVE_SCAN_STATUSES.has(String(existing?.status || ''))) {
      reused = true;
      await connection.commit();
    } else {
      const runId = randomUUID();
      if (existing?.run_id) {
        await connection.query('DELETE FROM bookmark_health_scan_items WHERE run_id = ?', [existing.run_id]);
        await connection.query(
          `UPDATE bookmark_health_scan_jobs
              SET run_id = ?, status = 'pending', total = 0, processed = 0,
                  alive = 0, suspect = 0, unknown_count = 0, skipped = 0, failed = 0,
                  lease_owner = NULL, lease_expires_at = NULL, started_at = NULL,
                  heartbeat_at = NULL, finished_at = NULL, last_error_code = NULL,
                  create_time = NOW()
            WHERE user_id = ?`,
          [runId, userId],
        );
      } else {
        await connection.query(
          `INSERT INTO bookmark_health_scan_jobs (user_id, run_id, status)
           VALUES (?, ?, 'pending')`,
          [userId, runId],
        );
      }

      const [itemsResult] = await connection.query(
        `INSERT INTO bookmark_health_scan_items (run_id, user_id, bookmark_id)
         SELECT ?, b.user_id, b.id
           FROM bookmark b
          WHERE b.user_id = ? AND b.del_flag = 0 AND b.url IS NOT NULL AND b.url <> ''`,
        [runId, userId],
      );
      const total = Number(itemsResult?.affectedRows || 0);
      await connection.query(
        `UPDATE bookmark_health_scan_jobs
            SET total = ?, status = IF(? = 0, 'succeeded', 'pending'),
                finished_at = IF(? = 0, NOW(), NULL)
          WHERE user_id = ? AND run_id = ?`,
        [total, total, total, userId, runId],
      );
      await connection.commit();
    }
  } catch (error) {
    await connection.rollback().catch(() => {});
    if (error?.code === 'ER_DUP_ENTRY') reused = true;
    else throw error;
  } finally {
    connection.release();
  }
  return { ...(await getHealthSummary(userId)), already: reused };
}

async function aggregateScanItems(db, runId) {
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS total,
            SUM(status <> 'pending') AS processed,
            SUM(status = 'completed' AND result_status = 'alive') AS alive,
            SUM(status = 'completed' AND result_status = 'suspect') AS suspect,
            SUM(status = 'completed' AND result_status = 'unknown') AS unknown_count,
            SUM(status = 'skipped') AS skipped,
            SUM(status = 'failed') AS failed,
            SUM(status = 'pending') AS pending
       FROM bookmark_health_scan_items
      WHERE run_id = ?`,
    [runId],
  );
  return {
    total: Number(row?.total || 0),
    processed: Number(row?.processed || 0),
    alive: Number(row?.alive || 0),
    suspect: Number(row?.suspect || 0),
    unknown: Number(row?.unknown_count || 0),
    skipped: Number(row?.skipped || 0),
    failed: Number(row?.failed || 0),
    pending: Number(row?.pending || 0),
  };
}

async function updateScanFromAggregate(db, job, aggregate, workerId) {
  const finished = aggregate.pending === 0;
  const status = finished ? (aggregate.failed > 0 ? 'completed_with_errors' : 'succeeded') : 'running';
  const [result] = await db.query(
    `UPDATE bookmark_health_scan_jobs
        SET status = ?, total = ?, processed = ?, alive = ?, suspect = ?, unknown_count = ?,
            skipped = ?, failed = ?, heartbeat_at = NOW(),
            lease_expires_at = IF(? = 1, NULL, DATE_ADD(NOW(), INTERVAL ? MINUTE)),
            lease_owner = IF(? = 1, NULL, lease_owner),
            finished_at = IF(? = 1, NOW(), NULL),
            last_error_code = IF(? > 0, 'BOOKMARK_HEALTH_ITEM_FAILURES', NULL)
      WHERE user_id = ? AND run_id = ? AND status = 'running' AND lease_owner = ?`,
    [
      status,
      aggregate.total,
      aggregate.processed,
      aggregate.alive,
      aggregate.suspect,
      aggregate.unknown,
      aggregate.skipped,
      aggregate.failed,
      finished ? 1 : 0,
      SCAN_LEASE_MINUTES,
      finished ? 1 : 0,
      finished ? 1 : 0,
      aggregate.failed,
      job.userId,
      job.runId,
      workerId,
    ],
  );
  if (Number(result?.affectedRows || 0) !== 1) {
    const error = new Error('BOOKMARK_HEALTH_SCAN_LEASE_LOST');
    error.code = 'BOOKMARK_HEALTH_SCAN_LEASE_LOST';
    throw error;
  }
  return finished;
}

async function claimScanBatch(workerId, { db = pool } = {}) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT user_id, run_id
         FROM bookmark_health_scan_jobs
        WHERE status = 'pending'
           OR (status = 'running' AND lease_owner = ?)
           OR (status = 'running' AND (lease_expires_at IS NULL OR lease_expires_at < NOW()))
        ORDER BY CASE WHEN status = 'running' AND lease_owner = ? THEN 0 ELSE 1 END,
                 create_time ASC
        LIMIT 1
        FOR UPDATE`,
      [workerId, workerId],
    );
    const row = rows[0];
    if (!row) {
      await connection.commit();
      return null;
    }
    const job = { userId: row.user_id, runId: row.run_id };
    await connection.query(
      `UPDATE bookmark_health_scan_items
          SET status = 'failed', result_code = 'BOOKMARK_HEALTH_RETRY_EXHAUSTED', finished_at = NOW()
        WHERE run_id = ? AND status = 'pending' AND attempts >= ?`,
      [job.runId, MAX_ATTEMPTS],
    );
    const [items] = await connection.query(
      `SELECT bookmark_id
         FROM bookmark_health_scan_items
        WHERE run_id = ? AND status = 'pending' AND attempts < ?
        ORDER BY bookmark_id ASC
        LIMIT ${BATCH}`,
      [job.runId, MAX_ATTEMPTS],
    );
    await connection.query(
      `UPDATE bookmark_health_scan_jobs
          SET status = 'running', lease_owner = ?,
              lease_expires_at = DATE_ADD(NOW(), INTERVAL ? MINUTE),
              started_at = COALESCE(started_at, NOW()), heartbeat_at = NOW(), last_error_code = NULL
        WHERE user_id = ? AND run_id = ?`,
      [workerId, SCAN_LEASE_MINUTES, job.userId, job.runId],
    );
    if (!items.length) {
      const aggregate = await aggregateScanItems(connection, job.runId);
      await updateScanFromAggregate(connection, job, aggregate, workerId);
      await connection.commit();
      return { job, items: [], finished: true };
    }
    const ids = items.map((item) => item.bookmark_id);
    const placeholders = ids.map(() => '?').join(', ');
    await connection.query(
      `UPDATE bookmark_health_scan_items
          SET attempts = attempts + 1, result_code = NULL
        WHERE run_id = ? AND status = 'pending' AND bookmark_id IN (${placeholders})`,
      [job.runId, ...ids],
    );
    await connection.commit();
    return { job, items: ids, finished: false };
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

async function processScanItem(job, bookmarkId, { db, checkLiveness }) {
  try {
    const [rows] = await db.query(
      `SELECT id, url
         FROM bookmark
        WHERE id = ? AND user_id = ? AND del_flag = 0 AND url IS NOT NULL AND url <> ''
        LIMIT 1`,
      [bookmarkId, job.userId],
    );
    const bookmark = rows[0];
    if (!bookmark) return { bookmarkId, status: 'skipped', code: 'BOOKMARK_UNAVAILABLE' };
    const observation = await saveBookmarkHealthObservation(job.userId, bookmark, { db, checkLiveness });
    if (!observation.saved) return { bookmarkId, status: 'skipped', code: 'BOOKMARK_CHANGED' };
    return {
      bookmarkId,
      status: 'completed',
      resultStatus: observation.status,
      code: observation.code,
    };
  } catch (error) {
    return { bookmarkId, status: 'retry', code: stableScanErrorCode(error) };
  }
}

async function persistScanBatch(job, results, workerId, { db = pool } = {}) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [jobs] = await connection.query(
      `SELECT status, lease_owner
         FROM bookmark_health_scan_jobs
        WHERE user_id = ? AND run_id = ?
        LIMIT 1
        FOR UPDATE`,
      [job.userId, job.runId],
    );
    if (jobs[0]?.status !== 'running' || jobs[0]?.lease_owner !== workerId) {
      const error = new Error('BOOKMARK_HEALTH_SCAN_LEASE_LOST');
      error.code = 'BOOKMARK_HEALTH_SCAN_LEASE_LOST';
      throw error;
    }
    for (const item of results) {
      if (item.status === 'retry') {
        await connection.query(
          `UPDATE bookmark_health_scan_items
              SET status = IF(attempts >= ?, 'failed', 'pending'), result_status = NULL,
                  result_code = ?, finished_at = IF(attempts >= ?, NOW(), NULL)
            WHERE run_id = ? AND bookmark_id = ? AND status = 'pending'`,
          [MAX_ATTEMPTS, item.code, MAX_ATTEMPTS, job.runId, item.bookmarkId],
        );
      } else {
        await connection.query(
          `UPDATE bookmark_health_scan_items
              SET status = ?, result_status = ?, result_code = ?, finished_at = NOW()
            WHERE run_id = ? AND bookmark_id = ? AND status = 'pending'`,
          [item.status, item.resultStatus || null, item.code || null, job.runId, item.bookmarkId],
        );
      }
    }
    const aggregate = await aggregateScanItems(connection, job.runId);
    await updateScanFromAggregate(connection, job, aggregate, workerId);
    await connection.commit();
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * 资源治理 Worker 每次只处理一个至多 25 项的持久批次；单批内部最多 4 条并发。
 * 返回 true 表示本轮领取或收尾了任务，false 表示当前没有可处理任务。
 */
export async function processBookmarkHealthScanBatch(workerId, { db = pool, checkLiveness = checkUrlLiveness } = {}) {
  const claimed = await claimScanBatch(workerId, { db });
  if (!claimed) return false;
  if (claimed.finished) return true;
  const results = await runPool(claimed.items, (bookmarkId) =>
    processScanItem(claimed.job, bookmarkId, { db, checkLiveness }),
  );
  await persistScanBatch(claimed.job, results, workerId, { db });
  return true;
}

function effectiveStatusSql(alias = 'h') {
  return `CASE
    WHEN ${alias}.checked_url_hash IS NULL THEN 'unchecked'
    WHEN ${alias}.user_override = 'normal' THEN 'user_normal'
    WHEN ${alias}.observed_status = 'suspect' THEN 'suspect'
    WHEN ${alias}.observed_status = 'alive' THEN 'alive'
    ELSE 'unknown'
  END`;
}

export async function getBookmarkHealthItem(userId, bookmarkId) {
  const [rows] = await pool.query(
    `SELECT b.id, b.name, b.url, h.observed_code AS observedCode, h.checked_at AS checkedAt,
            h.user_override AS userOverride, ${effectiveStatusSql()} AS effectiveStatus,
            (SELECT COUNT(*) FROM bookmark_snapshot snapshot
              WHERE snapshot.bookmark_id = b.id AND snapshot.user_id = b.user_id) AS hasSnapshot
       FROM bookmark b
       LEFT JOIN bookmark_health h
         ON h.bookmark_id = b.id AND h.user_id = b.user_id AND h.checked_url_hash = b.url_exact_hash
      WHERE b.id = ? AND b.user_id = ? AND b.del_flag = 0 LIMIT 1`,
    [bookmarkId, userId],
  );
  const row = rows[0];
  if (!row) return null;
  return { ...row, hasSnapshot: Number(row.hasSnapshot || 0) > 0 };
}

export async function listBookmarkHealthIssues(userId, { limit = 50, cursor = null } = {}) {
  const pageSize = Math.min(Math.max(Number(limit) || 20, 1), 50);
  let decoded = null;
  if (cursor) {
    try {
      decoded = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
      if (decoded?.v !== 1 || !decoded?.time || !decoded?.id) throw new Error();
      const time = new Date(decoded.time);
      if (Number.isNaN(time.getTime())) throw new Error();
      decoded.time = time;
    } catch {
      const error = new Error('分页位置已失效，请重新加载');
      error.code = 'ORGANIZE_CURSOR_INVALID';
      throw error;
    }
  }
  const cursorWhere = decoded ? 'AND (h.checked_at < ? OR (h.checked_at = ? AND b.id < ?))' : '';
  const params = [userId];
  if (decoded) params.push(decoded.time, decoded.time, decoded.id);
  params.push(pageSize + 1);
  const [rows] = await pool.query(
    `SELECT b.id, b.name, b.url, h.observed_code AS observedCode, h.checked_at AS checkedAt,
            h.user_override AS userOverride, ${effectiveStatusSql()} AS effectiveStatus,
            (SELECT COUNT(*) FROM bookmark_snapshot snapshot
              WHERE snapshot.bookmark_id = b.id AND snapshot.user_id = b.user_id) AS hasSnapshot
       FROM bookmark b
       INNER JOIN bookmark_health h
         ON h.bookmark_id = b.id AND h.user_id = b.user_id AND h.checked_url_hash = b.url_exact_hash
      WHERE b.user_id = ? AND b.del_flag = 0 AND h.observed_status = 'suspect' AND h.user_override IS NULL
            ${cursorWhere}
      ORDER BY h.checked_at DESC, b.id DESC
      LIMIT ?`,
    params,
  );
  const hasMore = rows.length > pageSize;
  const items = rows.slice(0, pageSize).map((row) => ({ ...row, hasSnapshot: Number(row.hasSnapshot || 0) > 0 }));
  const last = items[items.length - 1];
  return {
    items,
    hasMore,
    nextCursor:
      hasMore && last
        ? Buffer.from(
            JSON.stringify({
              v: 1,
              time: last.checkedAt instanceof Date ? last.checkedAt.toISOString() : String(last.checkedAt),
              id: String(last.id),
            }),
            'utf8',
          ).toString('base64url')
        : null,
  };
}

export async function getHealthSummary(userId, { includeSuspect = true } = {}) {
  const [[totalRow]] = await pool.query(
    `SELECT COUNT(*) AS total FROM bookmark
      WHERE user_id = ? AND del_flag = 0 AND url IS NOT NULL AND url <> ''`,
    [userId],
  );
  const [[counts]] = await pool.query(
    `SELECT COUNT(*) AS checked,
            SUM(h.user_override = 'normal') AS user_normal,
            SUM(h.user_override IS NULL AND h.observed_status = 'alive') AS alive,
            SUM(h.user_override IS NULL AND h.observed_status = 'suspect') AS suspect,
            SUM(h.user_override IS NULL AND h.observed_status = 'unknown') AS unknown,
            MAX(h.checked_at) AS last_checked_at
       FROM bookmark_health h
       INNER JOIN bookmark b
         ON b.id = h.bookmark_id AND b.user_id = h.user_id AND b.url_exact_hash = h.checked_url_hash
      WHERE h.user_id = ? AND b.del_flag = 0 AND b.url IS NOT NULL AND b.url <> ''`,
    [userId],
  );
  const suspectList = includeSuspect ? await listBookmarkHealthIssues(userId, { limit: 50 }) : { items: [] };
  const run = await getScanRow(userId);
  const scan = scanPayload(run);
  const running = Boolean(scan?.running);
  const total = Number(totalRow?.total || 0);
  const checked = Number(counts?.checked || 0);
  return {
    total,
    checked,
    alive: Number(counts?.alive || 0),
    suspectCount: Number(counts?.suspect || 0),
    unknown: Number(counts?.unknown || 0),
    userNormal: Number(counts?.user_normal || 0),
    unchecked: Math.max(total - checked, 0),
    running,
    runId: scan?.id || 'latest',
    runStatus: scan?.status || (checked >= total && total > 0 ? 'succeeded' : 'idle'),
    startedAt: scan?.startedAt || null,
    completedAt: scan?.completedAt || null,
    lastCheckedAt: counts?.last_checked_at || null,
    pollAfterMs: 2500,
    scan,
    suspect: suspectList.items.map((item) => ({
      id: item.id,
      name: item.name,
      url: item.url,
      note: item.observedCode,
      observedCode: item.observedCode,
      hasSnapshot: item.hasSnapshot,
      checkedAt: item.checkedAt,
      effectiveStatus: item.effectiveStatus,
    })),
  };
}

export async function resetHealth(userId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const run = await getScanRow(userId, { db: connection, lock: true });
    if (ACTIVE_SCAN_STATUSES.has(String(run?.status || ''))) {
      await connection.rollback();
      return { ok: false, reason: 'running', msg: '正在检测中，请稍后再重置' };
    }
    if (run?.run_id) {
      await connection.query('DELETE FROM bookmark_health_scan_items WHERE run_id = ?', [run.run_id]);
      await connection.query('DELETE FROM bookmark_health_scan_jobs WHERE user_id = ? AND run_id = ?', [
        userId,
        run.run_id,
      ]);
    }
    // “标记正常”是用户决定，系统重置只清除观测事实；覆盖决定只会在 URL 变化或用户撤销时失效。
    await connection.query(
      `DELETE FROM bookmark_health
        WHERE user_id = ? AND user_override IS NULL`,
      [userId],
    );
    await connection.commit();
    return { ok: true };
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

export async function markLinkNormal(userId, bookmarkId) {
  const [result] = await pool.query(
    `UPDATE bookmark_health h
     INNER JOIN bookmark b
       ON b.id = h.bookmark_id AND b.user_id = h.user_id AND b.url_exact_hash = h.checked_url_hash
        SET h.user_override = 'normal', h.override_at = CURRENT_TIMESTAMP
      WHERE h.bookmark_id = ? AND h.user_id = ? AND b.del_flag = 0 AND h.observed_status = 'suspect'`,
    [bookmarkId, userId],
  );
  return { ok: Number(result?.affectedRows || 0) > 0 };
}

export async function unmarkLinkNormal(userId, bookmarkId) {
  const [result] = await pool.query(
    `UPDATE bookmark_health h
     INNER JOIN bookmark b
       ON b.id = h.bookmark_id AND b.user_id = h.user_id AND b.url_exact_hash = h.checked_url_hash
        SET h.user_override = NULL, h.override_at = NULL
      WHERE h.bookmark_id = ? AND h.user_id = ? AND b.del_flag = 0 AND h.user_override = 'normal'`,
    [bookmarkId, userId],
  );
  return { ok: Number(result?.affectedRows || 0) > 0, item: await getBookmarkHealthItem(userId, bookmarkId) };
}
