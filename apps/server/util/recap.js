import pool from '../db/index.js';
import { getGrowthCalendarContext } from './growthPreferences.js';

// 那年今日·智能回顾:把吃灰的旧收藏/笔记重新推到面前,防「收藏=遗忘」。
// - onThisDay:同月同日、往年创建的内容(去年今日/前年今日)
// - buried:90 天前创建、按用户与日期稳定取样；同一天刷新不会换内容。

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

async function loadRecapBlocklist(userId, db = pool) {
  const result = await db.query(
    `SELECT resource_type AS resourceType, resource_id AS resourceId,
            snoozed_until AS snoozedUntil, dismissed_at AS dismissedAt
       FROM growth_recap_state WHERE user_id = ?`,
    [String(userId)],
  );
  const states = Array.isArray(result?.[0]) ? result[0] : [];
  return new Set(
    states
      .filter(
        (state) => state.dismissedAt || (state.snoozedUntil && new Date(state.snoozedUntil).getTime() > Date.now()),
      )
      .map((state) => `${state.resourceType}:${state.resourceId}`),
  );
}

function filterAvailableRecaps(rows, blocked) {
  return rows.filter((row) => !blocked.has(`${row.type}:${row.id}`));
}

export async function getRecap(userId, { calendar = null, db = pool } = {}) {
  if (!userId || userId === 'visitor') return { weekly: [], onThisDay: [], buried: [] };

  const accountCalendar = calendar || (await getGrowthCalendarContext(userId, { db }));
  const dayKey = /^\d{8}$/.test(String(accountCalendar.dayKey)) ? String(accountCalendar.dayKey) : null;
  if (!dayKey) throw new Error('GROWTH_CALENDAR_INVALID');
  const stableDate = `${dayKey.slice(0, 4)}-${dayKey.slice(4, 6)}-${dayKey.slice(6, 8)}`;
  const accountDate = `DATE '${stableDate}'`;
  const shiftMinutes = Math.trunc(Number(accountCalendar.shiftMinutes || 0));
  const shiftedCreateTime = `DATE_ADD(create_time, INTERVAL ${shiftMinutes} MINUTE)`;

  const [[weekly], [onDay], [buried]] = await Promise.all([
    db.query(
      buildRecapUnion(
        `${shiftedCreateTime} >= DATE_SUB(${accountDate}, INTERVAL 6 DAY)
          AND ${shiftedCreateTime} < DATE_ADD(${accountDate}, INTERVAL 1 DAY)`,
        `${shiftedCreateTime} >= DATE_SUB(${accountDate}, INTERVAL 6 DAY)
          AND ${shiftedCreateTime} < DATE_ADD(${accountDate}, INTERVAL 1 DAY)`,
        'create_time DESC',
        20,
      ),
      [userId, userId],
    ),
    db.query(
      buildRecapUnion(
        `MONTH(${shiftedCreateTime}) = MONTH(${accountDate}) AND DAY(${shiftedCreateTime}) = DAY(${accountDate})
          AND YEAR(${shiftedCreateTime}) < YEAR(${accountDate})`,
        `MONTH(${shiftedCreateTime}) = MONTH(${accountDate}) AND DAY(${shiftedCreateTime}) = DAY(${accountDate})
          AND YEAR(${shiftedCreateTime}) < YEAR(${accountDate})`,
        'create_time DESC',
        12,
      ),
      [userId, userId],
    ),
    db.query(
      buildRecapUnion(
        `${shiftedCreateTime} < DATE_SUB(${accountDate}, INTERVAL 90 DAY)`,
        `${shiftedCreateTime} < DATE_SUB(${accountDate}, INTERVAL 90 DAY)`,
        `CRC32(CONCAT('${stableDate}', ':', type, ':', id)) ASC`,
        60,
      ),
      [userId, userId],
    ),
  ]);

  const blocked = await loadRecapBlocklist(userId, db);
  const availableWeekly = filterAvailableRecaps(weekly, blocked);
  const availableOnDay = filterAvailableRecaps(onDay, blocked);
  const availableBuried = filterAvailableRecaps(buried, blocked);
  return {
    weekly: fmt(availableWeekly),
    onThisDay: fmt(availableOnDay),
    buried: fmt(availableBuried.slice(0, 6)),
    stableDate,
    timezone: accountCalendar.timezone,
  };
}

export async function updateRecapState(userId, { type, id, action } = {}) {
  const resourceType = String(type || '');
  const resourceId = String(id || '')
    .trim()
    .slice(0, 255);
  if (!userId || userId === 'visitor') return { ok: false, reason: 'visitor' };
  if (!['bookmark', 'note'].includes(resourceType) || !resourceId) return { ok: false, reason: 'invalid_resource' };
  if (!['snooze_7d', 'dismiss'].includes(action)) return { ok: false, reason: 'invalid_action' };
  const table = resourceType === 'bookmark' ? 'bookmark' : 'note';
  const ownerColumn = resourceType === 'bookmark' ? 'user_id' : 'create_by';
  const [[owned]] = await pool.query(
    `SELECT COUNT(*) AS count FROM ${table} WHERE id = ? AND ${ownerColumn} = ? AND del_flag = 0`,
    [resourceId, String(userId)],
  );
  if (!Number(owned?.count || 0)) return { ok: false, reason: 'not_found' };
  if (action === 'snooze_7d') {
    await pool.query(
      `INSERT INTO growth_recap_state
         (user_id, resource_type, resource_id, snoozed_until, dismissed_at)
       VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY), NULL)
       ON DUPLICATE KEY UPDATE
         snoozed_until = IF(
           growth_recap_state.dismissed_at IS NULL,
           GREATEST(COALESCE(growth_recap_state.snoozed_until, NOW()), VALUES(snoozed_until)),
           growth_recap_state.snoozed_until
         )`,
      [String(userId), resourceType, resourceId],
    );
  } else {
    await pool.query(
      `INSERT INTO growth_recap_state
         (user_id, resource_type, resource_id, snoozed_until, dismissed_at)
       VALUES (?, ?, ?, NULL, NOW())
       ON DUPLICATE KEY UPDATE
         snoozed_until = NULL,
         dismissed_at = COALESCE(growth_recap_state.dismissed_at, VALUES(dismissed_at))`,
      [String(userId), resourceType, resourceId],
    );
  }
  return { ok: true, action };
}

export { buildRecapUnion };
