import pool from '../db/index.js';

// 那年今日·智能回顾:把吃灰的旧收藏/笔记重新推到面前,防「收藏=遗忘」。
// - onThisDay:同月同日、往年创建的内容(去年今日/前年今日)
// - buried:90 天前创建、随机取几条(尘封回顾)
// 纯派生查询,不新增表。ORDER BY RAND() 在个人级数据量下开销可忽略。

function fmt(rows) {
  return rows.map((r) => ({
    type: r.type,
    id: r.id,
    title: r.title || '(无标题)',
    url: r.url || null,
    time: r.create_time,
  }));
}

export async function getRecap(userId) {
  if (!userId || userId === 'visitor') return { weekly: [], onThisDay: [], buried: [] };

  const [[weekly], [onDay], [buried]] = await Promise.all([
    pool.query(
      `(SELECT 'bookmark' AS type, id, name AS title, url, create_time FROM bookmark
          WHERE user_id = ? AND del_flag = 0
            AND create_time >= DATE_SUB(NOW(), INTERVAL 7 DAY))
       UNION ALL
       (SELECT 'note' AS type, id, title, NULL AS url, create_time FROM note
          WHERE create_by = ? AND del_flag = 0
            AND create_time >= DATE_SUB(NOW(), INTERVAL 7 DAY))
       ORDER BY create_time DESC LIMIT 20`,
      [userId, userId],
    ),
    pool.query(
      `(SELECT 'bookmark' AS type, id, name AS title, url, create_time FROM bookmark
        WHERE user_id = ? AND del_flag = 0
          AND MONTH(create_time) = MONTH(CURDATE()) AND DAY(create_time) = DAY(CURDATE())
          AND YEAR(create_time) < YEAR(CURDATE()))
     UNION ALL
     (SELECT 'note' AS type, id, title, NULL AS url, create_time FROM note
        WHERE create_by = ? AND del_flag = 0
          AND MONTH(create_time) = MONTH(CURDATE()) AND DAY(create_time) = DAY(CURDATE())
          AND YEAR(create_time) < YEAR(CURDATE()))
     ORDER BY create_time DESC LIMIT 12`,
      [userId, userId],
    ),
    pool.query(
      `(SELECT 'bookmark' AS type, id, name AS title, url, create_time FROM bookmark
        WHERE user_id = ? AND del_flag = 0 AND create_time < DATE_SUB(CURDATE(), INTERVAL 90 DAY))
     UNION ALL
     (SELECT 'note' AS type, id, title, NULL AS url, create_time FROM note
        WHERE create_by = ? AND del_flag = 0 AND create_time < DATE_SUB(CURDATE(), INTERVAL 90 DAY))
     ORDER BY RAND() LIMIT 6`,
      [userId, userId],
    ),
  ]);

  return { weekly: fmt(weekly), onThisDay: fmt(onDay), buried: fmt(buried) };
}
