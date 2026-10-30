import { createNotification } from './notification.js';
import { notificationSchedulerEnabled } from './notificationSchedulerPolicy.js';
import { formatWeeklyReportExperience } from '@lightnote/shared/notification-presentation';
/**
 * 成长周报(每周一生成上周报告,推送一条「系统」分类通知,meta 带完整数据供前端点击看大图)。
 *
 * 设计:
 * - 不建新表,周报数据存进 notification.meta(JSON),复用通知系统;前端识别 meta.weeklyReport 弹详情。
 * - 周期是账号时区的自然周,与每周挑战同一周一重置口径:current=本周一至今天,last=上周一至周日。
 * - 只给「上周有成长活动 且 未在设置里关闭周报」的用户生成,所有角色遵循同一开关。
 * - 无实质活动(新增/经验/签到全为 0)的用户跳过,不发空周报。
 * - 定时任务异常绝不影响主流程(整体 try/catch 吞错)。
 */
import pool from '../db/index.js';
import { formatDateTime } from './common.js';
import { getGrowth } from './growth.js';
import { DEFAULT_GROWTH_PREFERENCES, dayKeyAtOffset, getGrowthCalendarContext } from './growthPreferences.js';
import { stableAgentErrorCode } from './agent/logSafety.js';
import crypto from 'crypto';
import { SEED_FILTER } from './onboardingSeedFilter.js';

export const WEEKLY_REPORT_PERIODS = Object.freeze(['current', 'last']);
/** 「本周留下的内容」只回最近若干条；完整数量以分类型计数为准。 */
export const WEEKLY_REPORT_ITEM_LIMIT = 20;

const DAY_MS = 86_400_000;

export function dayKeyToUtcDate(key) {
  return new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(4, 6)) - 1, Number(key.slice(6, 8))));
}

export function addUtcDays(date, amount) {
  return new Date(date.getTime() + amount * DAY_MS);
}

export function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

export function compactDay(date) {
  return isoDay(date).replaceAll('-', '');
}

/** 账号时区某日 0 点在服务器本地时间下的写法；业务表 create_time 按服务器本地时间写入。 */
export function serverLocalSql(utcMidnight, shiftMinutes) {
  const shifted = new Date(utcMidnight.getTime() - Number(shiftMinutes || 0) * 60_000).toISOString();
  return `${shifted.slice(0, 10)} ${shifted.slice(11, 19)}`;
}

/** 计算 ISO 周序号（周一为一周开始）；入参取 UTC 日期部分，跨年时同时返回周所属年份。 */
export function getIsoWeekInfo(value) {
  const date = new Date(value);
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - weekday);
  const weekYear = utc.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
  return { week, weekYear };
}

/**
 * 账号时区的自然周。进行中的本周只统计到今天，对比上周同一时段；上周统计完整七天，对比再前一周。
 * 边界换算成服务器本地时间后用于 SQL，避免同一天不同时刻打开时口径漂移。
 */
export function getWeeklyReportPeriod({ now = new Date(), calendar = null, period = 'current' } = {}) {
  const kind = period === 'last' ? 'last' : 'current';
  const utcOffsetMinutes = calendar?.utcOffsetMinutes ?? DEFAULT_GROWTH_PREFERENCES.utcOffsetMinutes;
  const shiftMinutes = Number(calendar?.shiftMinutes || 0);
  const today = dayKeyToUtcDate(dayKeyAtOffset(now, utcOffsetMinutes));
  const weekday = today.getUTCDay() || 7;
  const thisMonday = addUtcDays(today, 1 - weekday);
  const start = kind === 'current' ? thisMonday : addUtcDays(thisMonday, -7);
  const elapsedDays = kind === 'current' ? weekday : 7;
  const next = addUtcDays(start, elapsedDays);
  const compareStart = addUtcDays(start, -7);
  const compareNext = addUtcDays(next, -7);
  const { week, weekYear } = getIsoWeekInfo(start);
  return {
    kind,
    start: isoDay(start),
    end: isoDay(addUtcDays(start, 6)),
    dataEnd: isoDay(addUtcDays(next, -1)),
    elapsedDays,
    inProgress: kind === 'current',
    week,
    weekYear,
    compareStart: isoDay(compareStart),
    compareEnd: isoDay(addUtcDays(compareNext, -1)),
    today: isoDay(today),
    shiftMinutes,
    startKey: compactDay(start),
    endKey: compactDay(addUtcDays(next, -1)),
    startSql: serverLocalSql(start, shiftMinutes),
    nextSql: serverLocalSql(next, shiftMinutes),
    compareStartSql: serverLocalSql(compareStart, shiftMinutes),
    compareNextSql: serverLocalSql(compareNext, shiftMinutes),
  };
}

/** 把数据库稀疏日聚合补成周一至周日；本周尚未到来的日子标记为 future。 */
export function fillWeeklyReportDays(period, rows = []) {
  const rowMap = new Map((rows || []).map((row) => [String(row.day).replaceAll('-', ''), row]));
  const start = new Date(`${period.start}T00:00:00Z`);
  return Array.from({ length: 7 }, (_, index) => {
    const date = addUtcDays(start, index);
    const future = index >= Number(period.elapsedDays ?? 7);
    const row = (!future && rowMap.get(compactDay(date))) || {};
    const bookmarks = Number(row.bookmarks || 0);
    const notes = Number(row.notes || 0);
    const files = Number(row.files || 0);
    const todos = Number(row.todos || 0);
    const organized = Number(row.organized || 0);
    return {
      day: isoDay(date),
      bookmarks,
      notes,
      files,
      todos,
      organized,
      exp: Number(row.exp || 0),
      checkins: Number(row.checkins || 0) > 0 ? 1 : 0,
      total: bookmarks + notes + files + todos + organized,
      future,
    };
  });
}

/** 活跃天数只计有记录的天，与每周挑战「有效活跃」同口径；签到单独计数。 */
export function summarizeWeeklyReportDays(days = []) {
  return days.reduce(
    (sum, day) => ({
      bookmarks: sum.bookmarks + Number(day.bookmarks || 0),
      notes: sum.notes + Number(day.notes || 0),
      files: sum.files + Number(day.files || 0),
      todos: sum.todos + Number(day.todos || 0),
      organized: sum.organized + Number(day.organized || 0),
      exp: sum.exp + Number(day.exp || 0),
      checkinDays: sum.checkinDays + (Number(day.checkins || 0) > 0 ? 1 : 0),
      activeDays: sum.activeDays + (Number(day.total || 0) > 0 ? 1 : 0),
    }),
    { bookmarks: 0, notes: 0, files: 0, todos: 0, organized: 0, exp: 0, checkinDays: 0, activeDays: 0 },
  );
}

/** 合并三类资源的最近条目；按创建时间倒序，只保留展示需要的低敏字段。 */
export function mergeWeeklyReportItems(groups, limit = WEEKLY_REPORT_ITEM_LIMIT) {
  const rows = [];
  for (const [type, list] of Object.entries(groups || {})) {
    for (const row of list || []) {
      const time = new Date(row.createTime).getTime();
      const day = String(row.reportDay || '');
      rows.push({
        type,
        id: String(row.id),
        title: String(row.title || '').trim(),
        day: /^\d{8}$/.test(day) ? `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}` : null,
        time: Number.isFinite(time) ? time : 0,
      });
    }
  }
  return rows
    .sort((left, right) => right.time - left.time)
    .slice(0, limit)
    .map(({ time: _time, ...item }) => item);
}

export { SEED_FILTER };

async function queryWeeklyReportItems(userId, period) {
  const bounds = [period.shiftMinutes, userId, period.startSql, period.nextSql, WEEKLY_REPORT_ITEM_LIMIT];
  // 三张表的文本列排序规则不同，分别取数后在内存合并，避免 UNION 混合排序规则。
  const [[bookmarks], [notes], [files]] = await Promise.all([
    pool.query(
      `SELECT b.id AS id, b.name AS title, b.create_time AS createTime,
              DATE_FORMAT(DATE_ADD(b.create_time, INTERVAL ? MINUTE), '%Y%m%d') AS reportDay
         FROM bookmark b
        WHERE b.user_id = ? AND b.del_flag = 0 AND b.create_time >= ? AND b.create_time < ?
          AND ${SEED_FILTER.bookmark}
        ORDER BY b.create_time DESC
        LIMIT ?`,
      bounds,
    ),
    pool.query(
      `SELECT n.id AS id, n.title AS title, n.create_time AS createTime,
              DATE_FORMAT(DATE_ADD(n.create_time, INTERVAL ? MINUTE), '%Y%m%d') AS reportDay
         FROM note n
        WHERE n.create_by = ? AND n.del_flag = 0 AND n.create_time >= ? AND n.create_time < ?
          AND ${SEED_FILTER.note}
        ORDER BY n.create_time DESC
        LIMIT ?`,
      bounds,
    ),
    pool.query(
      `SELECT CAST(f.id AS CHAR) AS id, f.file_name AS title, f.create_time AS createTime,
              DATE_FORMAT(DATE_ADD(f.create_time, INTERVAL ? MINUTE), '%Y%m%d') AS reportDay
         FROM files f
        WHERE f.create_by = ? AND f.del_flag = 0 AND f.create_time >= ? AND f.create_time < ?
          AND ${SEED_FILTER.file}
        ORDER BY f.create_time DESC
        LIMIT ?`,
      bounds,
    ),
  ]);
  return mergeWeeklyReportItems({ bookmark: bookmarks, note: notes, file: files });
}

/**
 * 汇总单个用户一个自然周的成长数据(供定时任务发通知 + 前端实时周报复用)。
 * includeItems 只用于用户本人实时查看；通知快照与管理员上下文不携带资源标题。
 */
export async function buildWeeklyReport(userId, userRole = null, options = {}) {
  const now = options.now || new Date();
  const calendar = options.calendar || (await getGrowthCalendarContext(userId, { now }));
  const period = getWeeklyReportPeriod({ now, calendar, period: options.period });
  const shift = period.shiftMinutes;
  const currentBounds = [shift, userId, period.startSql, period.nextSql];
  const dailySql = `
    SELECT report_day AS day,
      SUM(bookmarks) AS bookmarks,
      SUM(notes) AS notes,
      SUM(files) AS files,
      SUM(todos) AS todos,
      SUM(organized) AS organized,
      SUM(exp) AS exp,
      SUM(checkins) AS checkins
    FROM (
      SELECT DATE_FORMAT(DATE_ADD(b.create_time, INTERVAL ? MINUTE), '%Y%m%d') AS report_day, COUNT(*) AS bookmarks,
        0 AS notes, 0 AS files, 0 AS todos, 0 AS organized, 0 AS exp, 0 AS checkins
      FROM bookmark b
      WHERE b.user_id = ? AND b.del_flag = 0 AND b.create_time >= ? AND b.create_time < ?
        AND ${SEED_FILTER.bookmark}
      GROUP BY report_day
      UNION ALL
      SELECT DATE_FORMAT(DATE_ADD(n.create_time, INTERVAL ? MINUTE), '%Y%m%d') AS report_day, 0 AS bookmarks,
        COUNT(*) AS notes, 0 AS files, 0 AS todos, 0 AS organized, 0 AS exp, 0 AS checkins
      FROM note n
      WHERE n.create_by = ? AND n.del_flag = 0 AND n.create_time >= ? AND n.create_time < ?
        AND ${SEED_FILTER.note}
      GROUP BY report_day
      UNION ALL
      SELECT DATE_FORMAT(DATE_ADD(f.create_time, INTERVAL ? MINUTE), '%Y%m%d') AS report_day, 0 AS bookmarks,
        0 AS notes, COUNT(*) AS files, 0 AS todos, 0 AS organized, 0 AS exp, 0 AS checkins
      FROM files f
      WHERE f.create_by = ? AND f.del_flag = 0 AND f.create_time >= ? AND f.create_time < ?
        AND ${SEED_FILTER.file}
      GROUP BY report_day
      UNION ALL
      SELECT DATE_FORMAT(DATE_ADD(td.completed_at, INTERVAL ? MINUTE), '%Y%m%d') AS report_day, 0 AS bookmarks,
        0 AS notes, 0 AS files, COUNT(*) AS todos, 0 AS organized, 0 AS exp, 0 AS checkins
      FROM todo_items td
      WHERE td.user_id = ? AND td.completed_at >= ? AND td.completed_at < ?
      GROUP BY report_day
      UNION ALL
      SELECT DATE_FORMAT(DATE_ADD(ri.complete_time, INTERVAL ? MINUTE), '%Y%m%d') AS report_day, 0 AS bookmarks,
        0 AS notes, 0 AS files, 0 AS todos, COUNT(*) AS organized, 0 AS exp, 0 AS checkins
      FROM resource_inbox ri
      WHERE ri.user_id = ? AND ri.complete_time >= ? AND ri.complete_time < ?
        AND ${SEED_FILTER.organize}
      GROUP BY report_day
      UNION ALL
      SELECT DATE_FORMAT(DATE_ADD(ge.create_time, INTERVAL ? MINUTE), '%Y%m%d') AS report_day, 0 AS bookmarks,
        0 AS notes, 0 AS files, 0 AS todos, 0 AS organized,
        SUM(CASE WHEN ge.status = 'granted' THEN ge.amount ELSE 0 END) AS exp, 0 AS checkins
      FROM growth_events ge
      WHERE ge.user_id = ? AND ge.create_time >= ? AND ge.create_time < ?
      GROUP BY report_day
      UNION ALL
      -- 签到按目标日 day 计（与热力图、连签一致），补签不会落到补签当天。
      SELECT ge.day AS report_day, 0 AS bookmarks, 0 AS notes, 0 AS files, 0 AS todos, 0 AS organized,
        0 AS exp, 1 AS checkins
      FROM growth_events ge
      WHERE ge.user_id = ? AND ge.source = 'checkin' AND ge.status = 'granted'
        AND ge.day >= ? AND ge.day <= ?
      GROUP BY ge.day
    ) weekly_days
    GROUP BY report_day
    ORDER BY report_day`;
  const previousBounds = [period.compareStartSql, period.compareNextSql];
  const previousSql = `SELECT
      (SELECT COUNT(*) FROM bookmark b
        WHERE b.user_id = ? AND b.del_flag = 0 AND b.create_time >= ? AND b.create_time < ?
          AND ${SEED_FILTER.bookmark}) AS prevBookmarks,
      (SELECT COUNT(*) FROM note n
        WHERE n.create_by = ? AND n.del_flag = 0 AND n.create_time >= ? AND n.create_time < ?
          AND ${SEED_FILTER.note}) AS prevNotes,
      (SELECT COUNT(*) FROM files f
        WHERE f.create_by = ? AND f.del_flag = 0 AND f.create_time >= ? AND f.create_time < ?
          AND ${SEED_FILTER.file}) AS prevFiles,
      (SELECT COUNT(*) FROM todo_items td
        WHERE td.user_id = ? AND td.completed_at >= ? AND td.completed_at < ?) AS prevTodos,
      (SELECT COUNT(*) FROM resource_inbox ri
        WHERE ri.user_id = ? AND ri.complete_time >= ? AND ri.complete_time < ?
          AND ${SEED_FILTER.organize}) AS prevOrganized,
      (SELECT COALESCE(SUM(amount), 0) FROM growth_events
        WHERE user_id = ? AND status = 'granted' AND create_time >= ? AND create_time < ?) AS prevExp`;
  const dailyParams = [
    ...Array.from({ length: 6 }, () => currentBounds).flat(),
    userId,
    period.startKey,
    period.endKey,
  ];
  const previousParams = Array.from({ length: 6 }, () => [userId, ...previousBounds]).flat();
  const [dailyResult, previousResult, g, items] = await Promise.all([
    pool.query(dailySql, dailyParams),
    pool.query(previousSql, previousParams),
    getGrowth(userId, { userRole }),
    options.includeItems ? queryWeeklyReportItems(userId, period) : Promise.resolve(null),
  ]);
  const [dailyRows] = dailyResult;
  const [[row]] = previousResult;
  const days = fillWeeklyReportDays(period, dailyRows);
  const summary = summarizeWeeklyReportDays(days);
  return {
    bookmarks: summary.bookmarks,
    notes: summary.notes,
    files: summary.files,
    todos: summary.todos,
    organized: summary.organized,
    exp: summary.exp,
    checkinDays: summary.checkinDays,
    activeDays: summary.activeDays,
    days,
    period: {
      kind: period.kind,
      start: period.start,
      end: period.end,
      dataEnd: period.dataEnd,
      elapsedDays: period.elapsedDays,
      inProgress: period.inProgress,
      week: period.week,
      weekYear: period.weekYear,
      compareStart: period.compareStart,
      compareEnd: period.compareEnd,
    },
    level: g.level,
    levelName: g.name,
    generatedAt: period.today,
    prev: {
      bookmarks: Number(row.prevBookmarks || 0),
      notes: Number(row.prevNotes || 0),
      files: Number(row.prevFiles || 0),
      todos: Number(row.prevTodos || 0),
      organized: Number(row.prevOrganized || 0),
      exp: Number(row.prevExp || 0),
    },
    ...(items ? { items } : {}),
  };
}

// 生成所有符合条件用户的上周周报并推送通知(定时任务调用)
export async function generateWeeklyReports() {
  if (!notificationSchedulerEnabled()) return;
  try {
    // 本周周一(本地时区)作为幂等键:同一用户同一周只发一份周报,避免定时任务重复执行、
    // 或多个生产实例并发时给同一用户重复推送两份。
    const monday = new Date();
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const weekKey = formatDateTime(monday).slice(0, 10);
    // 上周有成长活动、未在设置里关闭周报(preferences.weeklyReport !== false)的用户
    const [users] = await pool.query(
      `SELECT activity.user_id,
              COALESCE(JSON_UNQUOTE(JSON_EXTRACT(u.preferences, '$.lang')), 'zh-CN') AS lang
       FROM (
         SELECT user_id FROM growth_events WHERE create_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)
         UNION
         SELECT user_id FROM todo_items WHERE completed_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
         UNION
         SELECT user_id FROM resource_inbox WHERE complete_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       ) activity
       JOIN \`user\` u ON u.id = activity.user_id
       WHERE u.del_flag = 0
         AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(u.preferences, '$.weeklyReport')), 'true') != 'false'
       GROUP BY activity.user_id, lang`,
    );
    let count = 0;
    for (const { user_id: userId, lang } of users) {
      try {
        // 幂等 ID = 本周周一 + 用户:本周已发过则跳过;INSERT 再以 ON DUPLICATE 兜住并发竞态,
        // 确保同一用户本周最多一条周报通知(修复"重复发两份")。
        const notificationId = crypto.createHash('md5').update(`weekly:${weekKey}:${userId}`).digest('hex');
        const [[existing]] = await pool.query('SELECT 1 FROM notification WHERE id = ? LIMIT 1', [notificationId]);
        if (existing) continue;
        const report = await buildWeeklyReport(userId, null, { period: 'last' });
        // 无实质活动不发空周报
        if (
          [
            report.bookmarks,
            report.notes,
            report.files,
            report.todos,
            report.organized,
            report.exp,
            report.checkinDays,
          ].every((value) => value === 0)
        )
          continue;
        const isEn = lang === 'en-US';
        const exp = formatWeeklyReportExperience(report.exp);
        const content = isEn
          ? `Last week ${exp} EXP · ${report.bookmarks} bookmarks / ${report.notes} notes / ${report.files} files · ${report.todos} todos completed / ${report.organized} items organized · ${report.checkinDays} check-in days`
          : `上周 ${exp} 经验 · 新增书签 ${report.bookmarks} / 笔记 ${report.notes} / 文件 ${report.files} · 完成待办 ${report.todos} / 整理资源 ${report.organized} · 签到 ${report.checkinDays} 天`;
        const title = isEn ? '📊 Your weekly growth report' : '📊 你的成长周报';
        await createNotification(userId, {
          id: notificationId,
          type: 'system',
          title,
          content,
          link: '/growth',
          meta: { weeklyReport: report },
        });
        count++;
      } catch (e) {
        console.error('[周报] 单用户生成失败(跳过) code=%s', stableAgentErrorCode(e));
      }
    }
    console.log(`[周报] 本轮已生成 ${count} 份`);
  } catch (e) {
    console.error('[周报] 生成失败 code=%s', stableAgentErrorCode(e));
  }
}
