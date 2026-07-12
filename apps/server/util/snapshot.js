import pool from '../db/index.js';
import { fetchWebMeta } from './fetchWebMeta.js';

// 网页快照·防死链:收藏时(异步)抓取网页正文存档,原链失效(404/删文)也能读到当时内容。
// 复用 fetchWebMeta(带 SSRF 防护/编码探测),快照用大上限抓更完整正文;一书签一份快照(重复归档覆盖)。

const SNAPSHOT_LIMIT = 200_000; // 存档正文上限 ~200K 字符,够完整留存又不至于爆库

export async function ensureBookmarkSnapshotTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bookmark_snapshot (
      bookmark_id VARCHAR(64) NOT NULL,
      user_id VARCHAR(64) NOT NULL,
      url VARCHAR(2048) DEFAULT NULL,
      title VARCHAR(512) DEFAULT NULL,
      content LONGTEXT,
      char_count INT NOT NULL DEFAULT 0,
      create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (bookmark_id),
      KEY idx_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='书签网页正文存档(防死链)'
  `);
}

// 归档指定书签的网页正文(抓取 + 落库,幂等覆盖)。校验书签归属当前用户。
export async function archiveBookmark(userId, bookmarkId) {
  const [rows] = await pool.query('SELECT id, url, name FROM bookmark WHERE id = ? AND user_id = ? AND del_flag = 0', [bookmarkId, userId]);
  if (!rows.length) return { ok: false, reason: 'not_found', msg: '书签不存在' };
  const url = rows[0].url;
  if (!url) return { ok: false, reason: 'no_url', msg: '该书签没有网址' };
  const meta = await fetchWebMeta(url, { bodyLimit: SNAPSHOT_LIMIT });
  if (!meta.ok) return { ok: false, reason: meta.reason || 'fetch_failed', msg: '抓取失败' };
  const content = meta.bodyText || '';
  const title = (meta.title || rows[0].name || '').slice(0, 512);
  const u = String(url).slice(0, 2048);
  await pool.query(
    `INSERT INTO bookmark_snapshot (bookmark_id, user_id, url, title, content, char_count) VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE url = ?, title = ?, content = ?, char_count = ?, update_time = CURRENT_TIMESTAMP`,
    [bookmarkId, userId, u, title, content, content.length, u, title, content, content.length],
  );
  return { ok: true, charCount: content.length, title };
}

export async function getBookmarkSnapshot(userId, bookmarkId) {
  const [rows] = await pool.query(
    'SELECT bookmark_id, url, title, content, char_count, update_time FROM bookmark_snapshot WHERE bookmark_id = ? AND user_id = ? LIMIT 1',
    [bookmarkId, userId],
  );
  return rows[0] || null;
}
