import pool from '../db/index.js';
import { checkUrlLiveness } from './fetchWebMeta.js';

// 死链检测·快照兜底:定期/按需检测收藏链接是否失效,标记失效并可回退到网页快照阅读。
// 判定用 checkUrlLiveness:**只有明确 404/410 才算失效**;反爬(403/429/412)、限流、5xx、超时、
// 网络错都不判死(站点仍在,只是拿不到),避免大面积误报。增量按需:每次只检一批(BATCH)。

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
  // 顺序:①从未检测的优先 ②其次复验旧的"已失效"(修正历史误报)③再按最久未测
  const [bms] = await pool.query(
    `SELECT b.id, b.url FROM bookmark b
       LEFT JOIN bookmark_health h ON h.bookmark_id = b.id
      WHERE b.user_id = ? AND b.del_flag = 0 AND b.url IS NOT NULL AND b.url <> ''
      ORDER BY (h.checked_at IS NULL) DESC, (h.status = 'dead') DESC, h.checked_at ASC
      LIMIT ${BATCH}`,
    [userId],
  );
  await runPool(bms, async (b) => {
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
