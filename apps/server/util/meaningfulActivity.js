import pool from '../db/index.js';
import { selectC6DailyQuests } from './dailyQuestPolicy.js';
import { DAILY_MEANINGFUL_ACTIVITY_TYPES } from './pointsEarningPolicy.js';
import { getGrowthCalendarContext } from './growthPreferences.js';

const SOURCE_BY_KIND = Object.freeze({
  bookmark: 'activity_bookmark',
  note: 'activity_note',
  file: 'activity_file',
  todo_create: 'todo_create',
  todo: 'todo_complete',
  organize: 'organize_complete',
});

function safeDay(value) {
  const day = String(value || '').trim();
  return /^\d{8}$/.test(day) ? day : null;
}

function safeWeek(value) {
  const week = String(value || '').trim();
  return /^\d{6}$/.test(week) ? week : null;
}

export function meaningfulActivitySource(kind) {
  return SOURCE_BY_KIND[kind] || null;
}

/**
 * 资源创建在业务提交完成后统一固化为不可变事实。该事实只保存资源主键哈希与低敏感类型，
 * 不保存标题、URL、正文或路径；已发 EXP 的事件会被同一唯一键复用，不重复插行。
 */
export async function ensureMeaningfulCreateEvent(
  userId,
  kind,
  refId,
  { db = pool, createTime = null, meta = null } = {},
) {
  const source = meaningfulActivitySource(kind);
  if (!userId || !source || !refId || !['bookmark', 'note', 'file'].includes(kind)) {
    return { recorded: false, reason: 'invalid_event' };
  }
  const eventMeta = JSON.stringify({ ...(meta || {}), kind, meaningful: true });
  if (createTime) {
    const [result] = await db.query(
      `INSERT IGNORE INTO growth_events
         (user_id, source, ref_id, day, amount, status, meta, create_time)
       VALUES (?, ?, ?, NULL, 0, 'granted', ?, ?)`,
      [String(userId), source, String(refId), eventMeta, createTime],
    );
    return { recorded: Boolean(result.affectedRows), source };
  }
  const [result] = await db.query(
    `INSERT IGNORE INTO growth_events
       (user_id, source, ref_id, day, amount, status, meta)
     VALUES (?, ?, ?, NULL, 0, 'granted', ?)`,
    [String(userId), source, String(refId), eventMeta],
  );
  return { recorded: Boolean(result.affectedRows), source };
}

function buildEventRangeClause({ dayKey = null, weekKey = null }) {
  if (dayKey) return "DATE_FORMAT(DATE_ADD(create_time, INTERVAL ? MINUTE), '%Y%m%d') = ?";
  if (weekKey) return 'YEARWEEK(DATE_ADD(create_time, INTERVAL ? MINUTE), 1) = ?';
  throw new Error('MEANINGFUL_ACTIVITY_RANGE_REQUIRED');
}

/**
 * 每日、每周、有效活跃日和成就共同使用的唯一事实聚合。查询只命中
 * growth_events(user_id, source, status, create_time)，避免五张业务表相关子查询和软删口径漂移。
 */
export async function getMeaningfulActivityFacts(
  userId,
  { db = pool, calendar = null, dayKey = null, weekKey = null, activityKinds = null } = {},
) {
  if (!userId || userId === 'visitor') {
    return { total: 0, byType: {}, activeDays: 0, variety: 0, events: [] };
  }
  const effectiveCalendar = calendar || (await getGrowthCalendarContext(userId, { db }));
  const day = safeDay(dayKey);
  const week = safeWeek(weekKey);
  const rangeClause = buildEventRangeClause({ dayKey: day, weekKey: week });
  const rangeKey = day || week;
  const kinds = Array.isArray(activityKinds)
    ? [...new Set(activityKinds.filter((kind) => SOURCE_BY_KIND[kind]))]
    : [...DAILY_MEANINGFUL_ACTIVITY_TYPES];
  if (!kinds.length) return { total: 0, byType: {}, activeDays: 0, variety: 0, events: [] };
  const sources = kinds.map((kind) => SOURCE_BY_KIND[kind]);
  const sourcePlaceholders = sources.map(() => '?').join(',');
  const [rows] = await db.query(
    `SELECT id, source, ref_id AS refId, create_time AS createTime,
            DATE_FORMAT(DATE_ADD(create_time, INTERVAL ? MINUTE), '%Y%m%d') AS day
       FROM growth_events
      WHERE user_id = ? AND status = 'granted'
        AND source IN (${sourcePlaceholders})
        AND ${rangeClause}
      ORDER BY create_time ASC, id ASC`,
    [effectiveCalendar.shiftMinutes, String(userId), ...sources, effectiveCalendar.shiftMinutes, rangeKey],
  );
  const kindBySource = Object.fromEntries(Object.entries(SOURCE_BY_KIND).map(([kind, source]) => [source, kind]));
  const byType = Object.fromEntries(kinds.map((kind) => [kind, 0]));
  const events = rows.map((row) => {
    const kind = kindBySource[row.source] || row.source;
    if (Object.hasOwn(byType, kind)) byType[kind] += 1;
    return { eventId: Number(row.id), kind, day: row.day, time: row.createTime || null };
  });
  const activeDays = new Set(events.map((event) => event.day).filter(Boolean)).size;
  const variety = kinds.filter((kind) => Number(byType[kind] || 0) > 0).length;
  return { total: events.length, byType, activeDays, variety, events };
}

export async function getMeaningfulActiveDays(userId, { db = pool, calendar = null } = {}) {
  if (!userId || userId === 'visitor') return 0;
  const effectiveCalendar = calendar || (await getGrowthCalendarContext(userId, { db }));
  // C6 的 todo_create 只服务每日随机任务；有效活跃日与成就继续沿用 C5 的五类事实。
  const sources = DAILY_MEANINGFUL_ACTIVITY_TYPES.map((kind) => SOURCE_BY_KIND[kind]);
  const placeholders = sources.map(() => '?').join(',');
  const [[row]] = await db.query(
    `SELECT COUNT(DISTINCT DATE_FORMAT(DATE_ADD(create_time, INTERVAL ? MINUTE), '%Y%m%d')) AS activeDays
       FROM growth_events
      WHERE user_id = ? AND status = 'granted' AND source IN (${placeholders})`,
    [effectiveCalendar.shiftMinutes, String(userId), ...sources],
  );
  return Number(row?.activeDays || 0);
}

export function c5DailyQuestsFromFacts({ checkedInToday = false, facts = null } = {}) {
  const events = facts?.events || [];
  return [
    { key: 'checkin', done: Boolean(checkedInToday), cur: checkedInToday ? 1 : 0, target: 1 },
    {
      key: 'knowledge_action_1',
      done: events.length >= 1,
      cur: Math.min(events.length, 1),
      target: 1,
      countedEvent: events[0] ? { type: events[0].kind, time: events[0].time } : null,
    },
    {
      key: 'knowledge_action_2',
      done: events.length >= 2,
      cur: Math.min(events.length, 2),
      target: 2,
      countedEvent: events[1] ? { type: events[1].kind, time: events[1].time } : null,
    },
  ];
}

export function c6DailyQuestsFromFacts({ userId, dayKey, checkedInToday = false, facts = null } = {}) {
  const events = facts?.events || [];
  const byType = facts?.byType || {};
  const randomQuests = selectC6DailyQuests(userId, dayKey).map(({ key, kind }) => {
    const count = Number(byType[kind] ?? events.filter((event) => event.kind === kind).length);
    return {
      key,
      done: count >= 1,
      cur: Math.min(count, 1),
      target: 1,
      random: true,
    };
  });
  return [{ key: 'checkin', done: Boolean(checkedInToday), cur: checkedInToday ? 1 : 0, target: 1 }, ...randomQuests];
}
