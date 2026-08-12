/**
 * 成长周报(每周一生成上周报告,推送一条「系统」分类通知,meta 带完整数据供前端点击看大图)。
 *
 * 设计:
 * - 不建新表,周报数据存进 notification.meta(JSON),复用通知系统;前端识别 meta.weeklyReport 弹详情。
 * - 只给「上周有成长活动 且 未在设置里关闭周报」的非 root 用户生成,避免给沉默用户刷屏。
 * - 无实质活动(新增/经验/签到全为 0)的用户跳过,不发空周报。
 * - 定时任务异常绝不影响主流程(整体 try/catch 吞错)。
 */
import pool from '../db/index.js';
import { formatDateTime } from './common.js';
import { getGrowth } from './growth.js';
import { stableAgentErrorCode } from './agent/logSafety.js';
import crypto from 'crypto';

function startOfLocalDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(value, amount) {
  const date = new Date(value);
  date.setDate(date.getDate() + amount);
  return date;
}

function dateKey(value) {
  return formatDateTime(new Date(value)).slice(0, 10);
}

/** 计算自然周序号。周一为一周开始，跨年时同时返回 ISO 周所属年份。 */
export function getIsoWeekInfo(value) {
  const date = startOfLocalDay(value);
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const weekday = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - weekday);
  const weekYear = utc.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { week, weekYear };
}

/**
 * 实时周报包含今天在内的最近 7 个自然日；定时周报通过 endOffsetDays=1 固定为上周一至周日。
 * 使用明确边界而非 NOW()-168h，避免周报一天里不同时刻打开时统计口径漂移。
 */
export function getWeeklyReportPeriod(now = new Date(), endOffsetDays = 0) {
  const end = addDays(startOfLocalDay(now), -endOffsetDays);
  const start = addDays(end, -6);
  const next = addDays(end, 1);
  const prevStart = addDays(start, -7);
  const { week, weekYear } = getIsoWeekInfo(end);
  return {
    start: dateKey(start),
    end: dateKey(end),
    week,
    weekYear,
    startSql: formatDateTime(start),
    nextSql: formatDateTime(next),
    prevStartSql: formatDateTime(prevStart),
  };
}

/** 把数据库稀疏日聚合补成固定 7 天，前端可直接绘制真实趋势。 */
export function fillWeeklyReportDays(period, rows = []) {
  const rowMap = new Map((rows || []).map((row) => [String(row.day), row]));
  const start = startOfLocalDay(`${period.start}T00:00:00`);
  return Array.from({ length: 7 }, (_, index) => {
    const day = dateKey(addDays(start, index));
    const row = rowMap.get(day) || {};
    const bookmarks = Number(row.bookmarks || 0);
    const notes = Number(row.notes || 0);
    const files = Number(row.files || 0);
    const todos = Number(row.todos || 0);
    const organized = Number(row.organized || 0);
    const exp = Number(row.exp || 0);
    const checkins = Number(row.checkins || 0);
    return {
      day,
      bookmarks,
      notes,
      files,
      todos,
      organized,
      exp,
      checkins,
      total: bookmarks + notes + files + todos + organized,
    };
  });
}

export function summarizeWeeklyReportDays(days = []) {
  const total = days.reduce(
    (sum, day) => ({
      bookmarks: sum.bookmarks + Number(day.bookmarks || 0),
      notes: sum.notes + Number(day.notes || 0),
      files: sum.files + Number(day.files || 0),
      todos: sum.todos + Number(day.todos || 0),
      organized: sum.organized + Number(day.organized || 0),
      exp: sum.exp + Number(day.exp || 0),
      checkinDays: sum.checkinDays + (Number(day.checkins || 0) > 0 ? 1 : 0),
    }),
    { bookmarks: 0, notes: 0, files: 0, todos: 0, organized: 0, exp: 0, checkinDays: 0 },
  );
  const activeDays = days.filter(
    (day) => Number(day.total || 0) > 0 || Number(day.exp || 0) > 0 || Number(day.checkins || 0) > 0,
  ).length;
  const bestDay = days.reduce((best, day) => {
    if (!best) return day;
    const score = Number(day.total || 0) * 1000 + Number(day.exp || 0) + Number(day.checkins || 0);
    const bestScore = Number(best.total || 0) * 1000 + Number(best.exp || 0) + Number(best.checkins || 0);
    return score >= bestScore ? day : best;
  }, null);
  const bestScore = Number(bestDay?.total || 0) + Number(bestDay?.exp || 0) + Number(bestDay?.checkins || 0);
  return { ...total, activeDays, bestDay: bestScore > 0 ? bestDay : null };
}

// 汇总单个用户近 7 个自然日的成长数据(供定时任务发通知 + 前端实时「本周周报」预览复用)
export async function buildWeeklyReport(userId, userRole = null, options = {}) {
  const period = getWeeklyReportPeriod(options.now || new Date(), Number(options.endOffsetDays || 0));
  const currentBounds = [period.startSql, period.nextSql];
  const previousEndSql = period.startSql;
  const dailySql = `
    SELECT day,
      SUM(bookmarks) AS bookmarks,
      SUM(notes) AS notes,
      SUM(files) AS files,
      SUM(todos) AS todos,
      SUM(organized) AS organized,
      SUM(exp) AS exp,
      SUM(checkins) AS checkins
    FROM (
      SELECT DATE_FORMAT(b.create_time, '%Y-%m-%d') AS day, COUNT(*) AS bookmarks,
        0 AS notes, 0 AS files, 0 AS todos, 0 AS organized, 0 AS exp, 0 AS checkins
      FROM bookmark b
      WHERE b.user_id = ? AND b.del_flag = 0 AND b.create_time >= ? AND b.create_time < ?
        AND NOT EXISTS (
          SELECT 1 FROM onboarding_seed_resources osr
          WHERE osr.user_id = b.user_id AND osr.resource_type = 'bookmark' AND osr.resource_id = b.id
        )
      GROUP BY DATE_FORMAT(b.create_time, '%Y-%m-%d')
      UNION ALL
      SELECT DATE_FORMAT(n.create_time, '%Y-%m-%d') AS day, 0 AS bookmarks,
        COUNT(*) AS notes, 0 AS files, 0 AS todos, 0 AS organized, 0 AS exp, 0 AS checkins
      FROM note n
      WHERE n.create_by = ? AND n.del_flag = 0 AND n.create_time >= ? AND n.create_time < ?
        AND NOT EXISTS (
          SELECT 1 FROM onboarding_seed_resources osr
          WHERE osr.user_id = n.create_by AND osr.resource_type = 'note' AND osr.resource_id = n.id
        )
      GROUP BY DATE_FORMAT(n.create_time, '%Y-%m-%d')
      UNION ALL
      SELECT DATE_FORMAT(f.create_time, '%Y-%m-%d') AS day, 0 AS bookmarks,
        0 AS notes, COUNT(*) AS files, 0 AS todos, 0 AS organized, 0 AS exp, 0 AS checkins
      FROM files f
      WHERE f.create_by = ? AND f.del_flag = 0 AND f.create_time >= ? AND f.create_time < ?
        AND NOT EXISTS (
          SELECT 1 FROM onboarding_seed_resources osr
          WHERE osr.user_id = f.create_by AND osr.resource_type = 'file'
            AND osr.resource_id = CAST(f.id AS CHAR)
        )
      GROUP BY DATE_FORMAT(f.create_time, '%Y-%m-%d')
      UNION ALL
      SELECT DATE_FORMAT(td.completed_at, '%Y-%m-%d') AS day, 0 AS bookmarks,
        0 AS notes, 0 AS files, COUNT(*) AS todos, 0 AS organized, 0 AS exp, 0 AS checkins
      FROM todo_items td
      WHERE td.user_id = ? AND td.completed_at >= ? AND td.completed_at < ?
      GROUP BY DATE_FORMAT(td.completed_at, '%Y-%m-%d')
      UNION ALL
      SELECT DATE_FORMAT(ri.complete_time, '%Y-%m-%d') AS day, 0 AS bookmarks,
        0 AS notes, 0 AS files, 0 AS todos, COUNT(*) AS organized, 0 AS exp, 0 AS checkins
      FROM resource_inbox ri
      WHERE ri.user_id = ? AND ri.complete_time >= ? AND ri.complete_time < ?
        AND NOT EXISTS (
          SELECT 1 FROM onboarding_seed_resources osr
          WHERE osr.user_id = ri.user_id AND osr.resource_type = ri.resource_type
            AND osr.resource_id = ri.resource_id
        )
      GROUP BY DATE_FORMAT(ri.complete_time, '%Y-%m-%d')
      UNION ALL
      SELECT DATE_FORMAT(ge.create_time, '%Y-%m-%d') AS day, 0 AS bookmarks,
        0 AS notes, 0 AS files, 0 AS todos, 0 AS organized,
        SUM(CASE WHEN ge.status = 'granted' THEN ge.amount ELSE 0 END) AS exp,
        MAX(CASE WHEN ge.source = 'checkin' AND ge.status = 'granted' THEN 1 ELSE 0 END) AS checkins
      FROM growth_events ge
      WHERE ge.user_id = ? AND ge.create_time >= ? AND ge.create_time < ?
      GROUP BY DATE_FORMAT(ge.create_time, '%Y-%m-%d')
    ) weekly_days
    GROUP BY day
    ORDER BY day`;
  const previousSql = `SELECT
      (SELECT COUNT(*) FROM bookmark b
        WHERE b.user_id = ? AND b.del_flag = 0 AND b.create_time >= ? AND b.create_time < ?
          AND NOT EXISTS (
            SELECT 1 FROM onboarding_seed_resources osr
            WHERE osr.user_id = b.user_id AND osr.resource_type = 'bookmark' AND osr.resource_id = b.id
          )) AS prevBookmarks,
      (SELECT COUNT(*) FROM note n
        WHERE n.create_by = ? AND n.del_flag = 0 AND n.create_time >= ? AND n.create_time < ?
          AND NOT EXISTS (
            SELECT 1 FROM onboarding_seed_resources osr
            WHERE osr.user_id = n.create_by AND osr.resource_type = 'note' AND osr.resource_id = n.id
          )) AS prevNotes,
      (SELECT COUNT(*) FROM files f
        WHERE f.create_by = ? AND f.del_flag = 0 AND f.create_time >= ? AND f.create_time < ?
          AND NOT EXISTS (
            SELECT 1 FROM onboarding_seed_resources osr
            WHERE osr.user_id = f.create_by AND osr.resource_type = 'file'
              AND osr.resource_id = CAST(f.id AS CHAR)
          )) AS prevFiles,
      (SELECT COUNT(*) FROM todo_items td
        WHERE td.user_id = ? AND td.completed_at >= ? AND td.completed_at < ?) AS prevTodos,
      (SELECT COUNT(*) FROM resource_inbox ri
        WHERE ri.user_id = ? AND ri.complete_time >= ? AND ri.complete_time < ?
          AND NOT EXISTS (
            SELECT 1 FROM onboarding_seed_resources osr
            WHERE osr.user_id = ri.user_id AND osr.resource_type = ri.resource_type
              AND osr.resource_id = ri.resource_id
          )) AS prevOrganized,
      (SELECT COALESCE(SUM(amount), 0) FROM growth_events
        WHERE user_id = ? AND status = 'granted' AND create_time >= ? AND create_time < ?) AS prevExp`;
  const dailyParams = Array.from({ length: 6 }, () => [userId, ...currentBounds]).flat();
  const previousParams = Array.from({ length: 6 }, () => [userId, period.prevStartSql, previousEndSql]).flat();
  const [dailyResult, previousResult, g] = await Promise.all([
    pool.query(dailySql, dailyParams),
    pool.query(previousSql, previousParams),
    getGrowth(userId, { userRole }),
  ]);
  const [dailyRows] = dailyResult;
  const [[row]] = previousResult;
  const days = fillWeeklyReportDays(period, dailyRows);
  const summary = summarizeWeeklyReportDays(days);
  // 免账本用户(如 root)不写每日签到流水,从账本数出来的 checkinDays 会是 0;
  // 用当前连签数兜底(至多 7 天,近似本周),避免「连签中却显示签到 0」。
  let checkinDays = Number(summary.checkinDays || 0);
  if (checkinDays === 0 && Number(g.streak) > 0) checkinDays = Math.min(Number(g.streak), 7);
  const total = summary.bookmarks + summary.notes + summary.files + summary.todos + summary.organized;
  const expStatus =
    userRole === 'root' ? 'role_excluded' : summary.exp > 0 ? 'earned' : total > 0 ? 'no_grant' : 'none';
  return {
    bookmarks: summary.bookmarks,
    notes: summary.notes,
    files: summary.files,
    todos: summary.todos,
    organized: summary.organized,
    exp: summary.exp,
    checkinDays,
    activeDays: Math.max(summary.activeDays, checkinDays),
    days,
    bestDay: summary.bestDay,
    period: {
      start: period.start,
      end: period.end,
      week: period.week,
      weekYear: period.weekYear,
    },
    expStatus,
    level: g.level,
    levelName: g.name,
    levelProgress: g.progress,
    expToNext: g.expToNext,
    isMax: g.isMax,
    streak: g.streak,
    generatedAt: dateKey(options.now || new Date()), // 本地时区,避免凌晨 toISOString 取 UTC 差一天
    prev: {
      bookmarks: Number(row.prevBookmarks || 0),
      notes: Number(row.prevNotes || 0),
      files: Number(row.prevFiles || 0),
      todos: Number(row.prevTodos || 0),
      organized: Number(row.prevOrganized || 0),
      exp: Number(row.prevExp || 0),
    },
  };
}

// 生成所有符合条件用户的上周周报并推送通知(定时任务调用)
export async function generateWeeklyReports() {
  try {
    // 本周周一(本地时区)作为幂等键:同一用户同一周只发一份周报,避免定时任务重复执行、
    // 或多实例(如本地 dev 与线上同时连同一库)并发时给同一用户重复推送两份。
    const monday = new Date();
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const weekKey = formatDateTime(monday).slice(0, 10);
    // 上周有成长活动、非 root、未在设置里关闭周报(preferences.weeklyReport !== false)的用户
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
       WHERE 1 = 1
         AND u.role != 'root' AND u.del_flag = 0
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
        const report = await buildWeeklyReport(userId, null, { endOffsetDays: 1 });
        // 无实质活动不发空周报
        if (
          report.bookmarks + report.notes + report.files + report.todos + report.organized + report.exp + report.checkinDays ===
          0
        )
          continue;
        const isEn = lang === 'en-US';
        const content = isEn
          ? `This week +${report.exp} EXP · ${report.bookmarks} bookmarks / ${report.notes} notes / ${report.files} files · ${report.todos} todos completed / ${report.organized} items organized · ${report.checkinDays} check-in days`
          : `本周 +${report.exp} 经验 · 新增书签 ${report.bookmarks} / 笔记 ${report.notes} / 文件 ${report.files} · 完成待办 ${report.todos} / 整理资源 ${report.organized} · 签到 ${report.checkinDays} 天`;
        const title = isEn ? '📊 Your weekly growth report' : '📊 你的本周成长周报';
        await pool.query(
          `INSERT INTO notification (id, user_id, type, title, content, link, meta, is_read)
           VALUES (?, ?, 'system', ?, ?, '/growth', ?, 0)
           ON DUPLICATE KEY UPDATE id = id`,
          [notificationId, userId, title, content, JSON.stringify({ weeklyReport: report })],
        );
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
