import pool from '../db/index.js';
import { checkUrlLiveness } from './fetchWebMeta.js';
import { randomUUID } from 'node:crypto';

// 链接体检·快照兜底:定期/按需检测收藏链接,把"疑似失效"的挑出来供用户确认,失效的可回退到网页快照阅读。
// 判定用 checkUrlLiveness:404/410 → 'suspect'(疑似,非断言:SPA 深层路由、被删子页都可能"浏览器能开、服务器 404");
// 反爬(403/429/412)/限流/5xx/超时/网络错都不算(站点仍在);用户可对疑似项「标记正常」永久消除误报。

const BATCH = 25; // 单次检测上限(每次检最久未测/待复验的这么多条)
const CONCURRENCY = 4; // 单核服务器降并发,减少并发挤占导致的超时(超时不再误判死链,但仍拖慢批次)

export async function ensureBookmarkHealthTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bookmark_health (
      bookmark_id VARCHAR(64) NOT NULL,
      user_id VARCHAR(64) NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'unknown',
      note VARCHAR(32) DEFAULT NULL,
      checked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (bookmark_id),
      KEY idx_user_status (user_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='书签链接健康(死链检测结果)'
  `);
}

// 正在全量检测的用户(内存态,进程级):防重入 + 供前端轮询判断是否还在跑
const fullChecking = new Set();
const fullCheckRuns = new Map();
export function isChecking(userId) {
  return fullChecking.has(userId);
}

// 简单并发池:对 items 逐个跑 worker,最多 CONCURRENCY 个同时进行
async function runPool(items, worker) {
  let i = 0;
  const runners = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx]);
    }
  });
  await Promise.all(runners);
}

// 检测一批(最久未测优先:先没有 health 记录的,再按 checked_at 最早)。返回本批结果 + 累计概览。
export async function checkBookmarkHealth(userId) {
  // 顺序:①优先复验"1 小时前判过疑似失效"的(纠正历史误报,又不在同一轮反复复检刚确认的)
  //       ②其次从未检测过的 ③再按最久未测。点几次就能把误报纠正过来,同时新书签也能推进。
  const [bms] = await pool.query(
    `SELECT b.id, b.url FROM bookmark b
       LEFT JOIN bookmark_health h ON h.bookmark_id = b.id
      WHERE b.user_id = ? AND b.del_flag = 0 AND b.url IS NOT NULL AND b.url <> ''
      ORDER BY (h.status = 'suspect' AND h.checked_at < DATE_SUB(NOW(), INTERVAL 1 HOUR)) DESC,
               (h.checked_at IS NULL) DESC,
               h.checked_at ASC
      LIMIT ${BATCH}`,
    [userId],
  );
  await runPool(bms, (b) => checkOneAndSave(userId, b));
  return { checkedThisRun: bms.length, ...(await getHealthSummary(userId)) };
}

// 单条检测并落库(全量/增量共用)
async function checkOneAndSave(userId, b) {
  let r;
  try {
    r = await checkUrlLiveness(b.url);
  } catch {
    r = { status: 'unknown', code: 'ERR' };
  }
  const note = String(r.code || r.status).slice(0, 32);
  await pool.query(
    `INSERT INTO bookmark_health (bookmark_id, user_id, status, note) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE status = ?, note = ?, checked_at = CURRENT_TIMESTAMP`,
    [b.id, userId, r.status, note, r.status, note],
  );
}

// 全量后台检测:一次把该用户所有书签查完(并发受限),后台跑不阻塞请求;前端轮询 getHealthSummary 看进度。
// 用 fullChecking 防重入(同一用户同时只跑一个)。逐条落库,故轮询能看到 checked/suspect 实时增长。
export async function startFullCheck(userId) {
  if (fullChecking.has(userId)) return { ...(await getHealthSummary(userId)), already: true };
  await pool.query('DELETE FROM bookmark_health WHERE user_id = ?', [userId]); // 先清空 → 进度从 0 起,一次全新扫描
  const run = {
    runId: randomUUID(),
    status: 'running',
    startedAt: new Date().toISOString(),
    completedAt: null,
    errorCode: null,
  };
  fullCheckRuns.set(userId, run);
  fullChecking.add(userId);
  (async () => {
    try {
      const [bms] = await pool.query(
        "SELECT id, url FROM bookmark WHERE user_id = ? AND del_flag = 0 AND url IS NOT NULL AND url <> ''",
        [userId],
      );
      await runPool(bms, (b) => checkOneAndSave(userId, b));
    } catch (e) {
      run.status = 'failed';
      run.errorCode = String(e?.code || e?.name || 'BOOKMARK_HEALTH_FAILED').slice(0, 64);
      console.warn('[死链体检] 全量检测失败 code=%s', run.errorCode);
    } finally {
      if (run.status === 'running') run.status = 'succeeded';
      run.completedAt = new Date().toISOString();
      fullChecking.delete(userId);
    }
  })();
  return await getHealthSummary(userId);
}

// 概览:总书签数、已测数 + 疑似失效列表(含书签名、是否有快照可兜底);running=是否正在全量检测
export async function getHealthSummary(userId) {
  const [[tot]] = await pool.query(
    "SELECT COUNT(*) AS c FROM bookmark WHERE user_id = ? AND del_flag = 0 AND url IS NOT NULL AND url <> ''",
    [userId],
  );
  const [[counts]] = await pool.query(
    `SELECT COUNT(*) AS checked,
            SUM(h.status = 'alive') AS alive,
            SUM(h.status = 'suspect') AS suspect,
            SUM(h.status NOT IN ('alive', 'suspect')) AS unknown,
            MAX(h.checked_at) AS last_checked_at
       FROM bookmark_health h
       JOIN bookmark b ON b.id = h.bookmark_id AND b.user_id = h.user_id
      WHERE h.user_id = ? AND b.del_flag = 0 AND b.url IS NOT NULL AND b.url <> ''`,
    [userId],
  );
  const [rows] = await pool.query(
    `SELECT h.bookmark_id, b.name, b.url, h.note, h.checked_at,
            (SELECT COUNT(*) FROM bookmark_snapshot s WHERE s.bookmark_id = h.bookmark_id) AS has_snapshot
       FROM bookmark_health h
       JOIN bookmark b ON b.id = h.bookmark_id AND b.del_flag = 0
      WHERE h.user_id = ? AND h.status = 'suspect'
      ORDER BY h.checked_at DESC LIMIT 100`,
    [userId],
  );
  const run = fullCheckRuns.get(userId) || null;
  const running = fullChecking.has(userId);
  const checked = Number(counts.checked || 0);
  const total = Number(tot.c || 0);
  return {
    total,
    checked,
    alive: Number(counts.alive || 0),
    suspectCount: Number(counts.suspect || 0),
    unknown: Number(counts.unknown || 0),
    running,
    runId: run?.runId || 'latest',
    runStatus: running ? 'running' : run?.status || (checked >= total ? 'succeeded' : 'idle'),
    startedAt: run?.startedAt || null,
    completedAt: run?.completedAt || null,
    lastCheckedAt: counts.last_checked_at || null,
    pollAfterMs: 2500,
    suspect: rows.map((r) => ({
      id: r.bookmark_id,
      name: r.name,
      url: r.url,
      note: r.note,
      hasSnapshot: Number(r.has_snapshot) > 0,
      checkedAt: r.checked_at,
    })),
  };
}

// 重置:清空该用户所有体检记录(回到"未检测"),供从头重新体检。正在全量检测时不允许重置。
export async function resetHealth(userId) {
  if (fullChecking.has(userId)) return { ok: false, reason: 'running', msg: '正在检测中,请稍后再重置' };
  await pool.query('DELETE FROM bookmark_health WHERE user_id = ?', [userId]);
  return { ok: true };
}

// 用户「标记正常」:把某书签的体检状态置为 alive,消除误报(SPA/需登录等浏览器能开的)。
export async function markLinkNormal(userId, bookmarkId) {
  const [result] = await pool.query(
    `INSERT INTO bookmark_health (bookmark_id, user_id, status, note)
     SELECT id, user_id, 'alive', 'user'
       FROM bookmark
      WHERE id = ? AND user_id = ? AND del_flag = 0
     ON DUPLICATE KEY UPDATE status = 'alive', note = 'user', checked_at = CURRENT_TIMESTAMP`,
    [bookmarkId, userId],
  );
  return { ok: Number(result.affectedRows || 0) > 0 };
}
