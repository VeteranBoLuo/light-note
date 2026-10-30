import pool from '../../db/index.js';

// 首页书签卡片点击记为 `点击书签卡片【名称】`，2026-07 之前为 `点击书签卡片名称`。
// 只剥外层一对【】：书签名本身也可能以【开头。日志只有名称，已删除或改名的书签无法再打开，不进入高频列表。
export const FREQUENT_BOOKMARKS_SQL = `
  SELECT b.id, b.url, b.name, clicks.count
    FROM (
      SELECT CASE
               WHEN operation LIKE '点击书签卡片【%】' THEN SUBSTRING(operation, 8, CHAR_LENGTH(operation) - 8)
               ELSE SUBSTRING(operation, 7)
             END AS bookmark_name,
             COUNT(*) AS count
        FROM operation_logs
       WHERE create_by = ? AND operation LIKE '点击书签卡片%'
       GROUP BY bookmark_name
    ) clicks
    JOIN bookmark b
      ON b.user_id = ?
     AND b.del_flag = 0
     AND b.name = CONVERT(clicks.bookmark_name USING utf8mb4) COLLATE utf8mb4_general_ci
   ORDER BY clicks.count DESC, b.id
   LIMIT 10
`;

export async function queryFrequentBookmarks(userId) {
  const [rows] = await pool.query(FREQUENT_BOOKMARKS_SQL, [userId, userId]);
  return rows;
}
