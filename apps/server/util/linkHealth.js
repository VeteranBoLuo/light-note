import pool from '../db/index.js';
import { fetchWebMeta } from './fetchWebMeta.js';

// 死链检测·快照兜底:定期/按需检测收藏链接是否失效(404/超时/无法访问),标记失效并可回退到网页快照阅读。
// 复用 fetchWebMeta(带 SSRF 防护):ok/NOT_HTML/EMPTY_CONTENT=alive;FETCH_FAILED/无效 URL=dead;内网=skip。
// 增量按需:每次只检"最久未测"的一批(BATCH),避免一次检数百 URL 导致请求超时;累计写入 bookmark_health。

const BATCH = 25; // 单次检测上限(每次检最久未测的这么多条)
const CONCURRENCY = 8;

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

function classify(meta) {
  if (meta.ok) return { status: 'alive', note: 'ok' };
  const r = meta.reason || 'FETCH_FAILED';
  if (r === 'NOT_HTML' || r === 'EMPTY_CONTENT') return { status: 'alive', note: r };
  if (r === 'BLOCKED_HOST' || r === 'UNSUPPORTED_PROTOCOL') return { status: 'skip', note: r };
  return { status: 'dead', note: r }; // FETCH_FAILED / INVALID_URL 等
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
  const [bms] = await pool.query(
    `SELECT b.id, b.url FROM bookmark b
       LEFT JOIN bookmark_health h ON h.bookmark_id = b.id
      WHERE b.user_id = ? AND b.del_flag = 0 AND b.url IS NOT NULL AND b.url <> ''
      ORDER BY h.checked_at IS NOT NULL, h.checked_at ASC
      LIMIT ${BATCH}`,
    [userId],
  );
  await runPool(bms, async (b) => {
    let cls;
    try {
      const meta = await fetchWebMeta(b.url, { bodyLimit: 1 });
      cls = classify(meta);
    } catch {
      cls = { status: 'dead', note: 'ERROR' };
    }
    await pool.query(
      `INSERT INTO bookmark_health (bookmark_id, user_id, status, note) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = ?, note = ?, checked_at = CURRENT_TIMESTAMP`,
      [b.id, userId, cls.status, cls.note, cls.status, cls.note],
    );
  });
  return { checkedThisRun: bms.length, ...(await getHealthSummary(userId)) };
}

// 概览:总书签数、已测数、失效数 + 失效列表(含书签名、是否有快照可兜底)
export async function getHealthSummary(userId) {
  const [[tot]] = await pool.query("SELECT COUNT(*) AS c FROM bookmark WHERE user_id = ? AND del_flag = 0 AND url IS NOT NULL AND url <> ''", [userId]);
  const [[chk]] = await pool.query('SELECT COUNT(*) AS c FROM bookmark_health WHERE user_id = ?', [userId]);
  const [deadRows] = await pool.query(
    `SELECT h.bookmark_id, b.name, b.url, h.note, h.checked_at,
            (SELECT COUNT(*) FROM bookmark_snapshot s WHERE s.bookmark_id = h.bookmark_id) AS has_snapshot
       FROM bookmark_health h
       JOIN bookmark b ON b.id = h.bookmark_id AND b.del_flag = 0
      WHERE h.user_id = ? AND h.status = 'dead'
      ORDER BY h.checked_at DESC LIMIT 100`,
    [userId],
  );
  return {
    total: Number(tot.c || 0),
    checked: Number(chk.c || 0),
    dead: deadRows.map((r) => ({
      id: r.bookmark_id,
      name: r.name,
      url: r.url,
      note: r.note,
      hasSnapshot: Number(r.has_snapshot) > 0,
      checkedAt: r.checked_at,
    })),
  };
}
