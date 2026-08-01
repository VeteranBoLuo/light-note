import pool from '../db/index.js';

// 那年今日·智能回顾:把吃灰的旧收藏/笔记重新推到面前,防「收藏=遗忘」。
// - onThisDay:同月同日、往年创建的内容(去年今日/前年今日)
// - buried:90 天前创建、随机取几条(尘封回顾)
// 纯派生查询,不新增表。ORDER BY RAND() 在个人级数据量下开销可忽略。

const recapText = (expression) => `CONVERT(${expression} USING utf8mb4) COLLATE utf8mb4_unicode_ci`;

// bookmark / note 是历史表，字符串字段可能使用不同 collation。UNION 前统一转换，
// 否则部分旧库会直接报 Illegal mix of collations，导致整个回顾卡片不可用。
function buildRecapUnion(bookmarkCondition, noteCondition, orderBy, limit) {
  return `(SELECT
      ${recapText("'bookmark'")} AS type,
      ${recapText('id')} AS id,
      ${recapText('name')} AS title,
      ${recapText('url')} AS url,
      create_time
    FROM bookmark
    WHERE user_id = ? AND del_flag = 0 AND ${bookmarkCondition})
    UNION ALL
    (SELECT
      ${recapText("'note'")} AS type,
      ${recapText('id')} AS id,
      ${recapText('title')} AS title,
      ${recapText('NULL')} AS url,
      create_time
    FROM note
    WHERE create_by = ? AND del_flag = 0 AND ${noteCondition})
    ORDER BY ${orderBy} LIMIT ${limit}`;
}

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
      buildRecapUnion(
        'create_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)',
        'create_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)',
        'create_time DESC',
        20,
      ),
      [userId, userId],
    ),
    pool.query(
      buildRecapUnion(
        `MONTH(create_time) = MONTH(CURDATE()) AND DAY(create_time) = DAY(CURDATE())
          AND YEAR(create_time) < YEAR(CURDATE())`,
        `MONTH(create_time) = MONTH(CURDATE()) AND DAY(create_time) = DAY(CURDATE())
          AND YEAR(create_time) < YEAR(CURDATE())`,
        'create_time DESC',
        12,
      ),
      [userId, userId],
    ),
    pool.query(
      buildRecapUnion(
        'create_time < DATE_SUB(CURDATE(), INTERVAL 90 DAY)',
        'create_time < DATE_SUB(CURDATE(), INTERVAL 90 DAY)',
        'RAND()',
        6,
      ),
      [userId, userId],
    ),
  ]);

  return { weekly: fmt(weekly), onThisDay: fmt(onDay), buried: fmt(buried) };
}

export { buildRecapUnion };
