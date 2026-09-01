import { randomUUID } from 'node:crypto';
import pool from '../db/index.js';
import { checkUrlLiveness } from './fetchWebMeta.js';
import { ensureOrganizeSchema } from './organizeSchema.js';
import { createBookmarkExactUrlHash } from './services/bookmarkExactUrlService.js';

const BATCH = 25;
const CONCURRENCY = 4;

export async function ensureBookmarkHealthTable() {
  await ensureOrganizeSchema();
}

const fullChecking = new Set();
const fullCheckRuns = new Map();

export function isChecking(userId) {
  return fullChecking.has(userId);
}

async function runPool(items, worker) {
  let index = 0;
  const runners = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (index < items.length) {
      const current = index++;
      await worker(items[current]);
    }
  });
  await Promise.all(runners);
}

function normalizeObservation(result) {
  const code = String(result?.code ?? result?.status ?? 'ERR').slice(0, 32);
  if (result?.status === 'alive') return { status: 'alive', code };
  // 首版只把外部服务器明确返回的 404 / 410 作为疑似失效；DNS、格式、协议与网络失败均为未知。
  if (result?.status === 'suspect' && ['404', '410'].includes(code)) return { status: 'suspect', code };
  return { status: 'unknown', code };
}

async function saveObservation(userId, bookmark) {
  let rawResult;
  try {
    rawResult = await checkUrlLiveness(bookmark.url);
  } catch {
    rawResult = { status: 'unknown', code: 'ERR' };
  }
  const observation = normalizeObservation(rawResult);
  const urlHash = createBookmarkExactUrlHash(bookmark.url);
  if (!urlHash) return { saved: false, ...observation };
  const [result] = await pool.query(
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
    [
      observation.status,
      observation.code,
      observation.status,
      observation.code,
      urlHash,
      bookmark.id,
      userId,
      urlHash,
    ],
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
  const observation = await saveObservation(userId, rows[0]);
  return { ok: observation.saved, observation, item: await getBookmarkHealthItem(userId, bookmarkId) };
}

export async function checkBookmarkHealth(userId) {
  const [bookmarks] = await pool.query(
    `SELECT b.id, b.url
       FROM bookmark b
       LEFT JOIN bookmark_health h
         ON h.bookmark_id = b.id AND h.user_id = b.user_id AND h.checked_url_hash = b.url_exact_hash
      WHERE b.user_id = ? AND b.del_flag = 0 AND b.url IS NOT NULL AND b.url <> ''
      ORDER BY (h.observed_status = 'suspect' AND h.checked_at < DATE_SUB(NOW(), INTERVAL 1 HOUR)) DESC,
               (h.checked_url_hash IS NULL) DESC,
               h.checked_at ASC
      LIMIT ${BATCH}`,
    [userId],
  );
  await runPool(bookmarks, (bookmark) => saveObservation(userId, bookmark));
  return { checkedThisRun: bookmarks.length, ...(await getHealthSummary(userId)) };
}

/**
 * 兼容既有书签管理页的全量入口：不再清空旧结果，也不触碰用户“标记正常”。
 * 新整理中心只使用 25 条显式批次；可恢复的全量任务留给独立 Worker 阶段。
 */
export async function startFullCheck(userId) {
  if (fullChecking.has(userId)) return { ...(await getHealthSummary(userId)), already: true };
  const run = {
    runId: randomUUID(),
    status: 'running',
    startedAt: new Date().toISOString(),
    completedAt: null,
    errorCode: null,
  };
  fullCheckRuns.set(userId, run);
  fullChecking.add(userId);
  void (async () => {
    try {
      const [bookmarks] = await pool.query(
        `SELECT id, url FROM bookmark
          WHERE user_id = ? AND del_flag = 0 AND url IS NOT NULL AND url <> ''`,
        [userId],
      );
      await runPool(bookmarks, (bookmark) => saveObservation(userId, bookmark));
      run.status = 'succeeded';
    } catch (error) {
      run.status = 'failed';
      run.errorCode = String(error?.code || error?.name || 'BOOKMARK_HEALTH_FAILED').slice(0, 64);
      console.warn('[bookmark-health] full compatibility check failed code=%s', run.errorCode);
    } finally {
      run.completedAt = new Date().toISOString();
      fullChecking.delete(userId);
    }
  })();
  return getHealthSummary(userId);
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
  const run = fullCheckRuns.get(userId) || null;
  const running = fullChecking.has(userId);
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
    runId: run?.runId || 'latest',
    runStatus: running ? 'running' : run?.status || (checked >= total ? 'succeeded' : 'idle'),
    startedAt: run?.startedAt || null,
    completedAt: run?.completedAt || null,
    lastCheckedAt: counts?.last_checked_at || null,
    pollAfterMs: 2500,
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
  if (fullChecking.has(userId)) return { ok: false, reason: 'running', msg: '正在检测中，请稍后再重置' };
  // “标记正常”是用户决定，系统重置只清除观测事实；覆盖决定只会在 URL 变化或用户撤销时失效。
  await pool.query(
    `DELETE FROM bookmark_health
      WHERE user_id = ? AND user_override IS NULL`,
    [userId],
  );
  return { ok: true };
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
