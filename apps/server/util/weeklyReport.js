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
import crypto from 'crypto';

// 汇总单个用户近 7 天的成长数据(供定时任务发通知 + 前端实时「本周周报」预览复用)
export async function buildWeeklyReport(userId, userRole = null) {
  const [[row]] = await pool.query(
    `SELECT
      (SELECT COUNT(*) FROM bookmark WHERE user_id = ? AND del_flag = 0 AND create_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)) AS bookmarks,
      (SELECT COUNT(*) FROM note WHERE create_by = ? AND del_flag = 0 AND create_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)) AS notes,
      (SELECT COUNT(*) FROM files WHERE create_by = ? AND del_flag = 0 AND create_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)) AS files,
      (SELECT COALESCE(SUM(amount), 0) FROM growth_events WHERE user_id = ? AND status = 'granted' AND create_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)) AS exp,
      (SELECT COUNT(*) FROM growth_events WHERE user_id = ? AND source = 'checkin' AND create_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)) AS checkinDays,
      (SELECT COUNT(*) FROM bookmark WHERE user_id = ? AND del_flag = 0 AND create_time >= DATE_SUB(NOW(), INTERVAL 14 DAY) AND create_time < DATE_SUB(NOW(), INTERVAL 7 DAY)) AS prevBookmarks,
      (SELECT COUNT(*) FROM note WHERE create_by = ? AND del_flag = 0 AND create_time >= DATE_SUB(NOW(), INTERVAL 14 DAY) AND create_time < DATE_SUB(NOW(), INTERVAL 7 DAY)) AS prevNotes,
      (SELECT COUNT(*) FROM files WHERE create_by = ? AND del_flag = 0 AND create_time >= DATE_SUB(NOW(), INTERVAL 14 DAY) AND create_time < DATE_SUB(NOW(), INTERVAL 7 DAY)) AS prevFiles,
      (SELECT COALESCE(SUM(amount), 0) FROM growth_events WHERE user_id = ? AND status = 'granted' AND create_time >= DATE_SUB(NOW(), INTERVAL 14 DAY) AND create_time < DATE_SUB(NOW(), INTERVAL 7 DAY)) AS prevExp`,
    [userId, userId, userId, userId, userId, userId, userId, userId, userId],
  );
  const g = await getGrowth(userId, { userRole });
  // 免账本用户(如 root)不写每日签到流水,从账本数出来的 checkinDays 会是 0;
  // 用当前连签数兜底(至多 7 天,近似本周),避免「连签中却显示签到 0」。
  let checkinDays = Number(row.checkinDays || 0);
  if (checkinDays === 0 && Number(g.streak) > 0) checkinDays = Math.min(Number(g.streak), 7);
  return {
    bookmarks: Number(row.bookmarks || 0),
    notes: Number(row.notes || 0),
    files: Number(row.files || 0),
    exp: Number(row.exp || 0),
    checkinDays,
    level: g.level,
    levelName: g.name,
    generatedAt: formatDateTime(new Date()).slice(0, 10), // 本地时区,避免凌晨 toISOString 取 UTC 差一天
    prev: {
      bookmarks: Number(row.prevBookmarks || 0),
      notes: Number(row.prevNotes || 0),
      files: Number(row.prevFiles || 0),
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
      `SELECT ge.user_id,
              COALESCE(JSON_UNQUOTE(JSON_EXTRACT(u.preferences, '$.lang')), 'zh-CN') AS lang
       FROM growth_events ge
       JOIN \`user\` u ON u.id = ge.user_id
       WHERE ge.create_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)
         AND u.role != 'root' AND u.del_flag = 0
         AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(u.preferences, '$.weeklyReport')), 'true') != 'false'
       GROUP BY ge.user_id, lang`,
    );
    let count = 0;
    for (const { user_id: userId, lang } of users) {
      try {
        // 幂等 ID = 本周周一 + 用户:本周已发过则跳过;INSERT 再以 ON DUPLICATE 兜住并发竞态,
        // 确保同一用户本周最多一条周报通知(修复"重复发两份")。
        const notificationId = crypto.createHash('md5').update(`weekly:${weekKey}:${userId}`).digest('hex');
        const [[existing]] = await pool.query('SELECT 1 FROM notification WHERE id = ? LIMIT 1', [notificationId]);
        if (existing) continue;
        const report = await buildWeeklyReport(userId);
        // 无实质活动不发空周报
        if (report.bookmarks + report.notes + report.files + report.exp + report.checkinDays === 0) continue;
        const isEn = lang === 'en-US';
        const content = isEn
          ? `This week +${report.exp} EXP · ${report.bookmarks} bookmarks / ${report.notes} notes / ${report.files} files added · ${report.checkinDays} check-in days`
          : `本周 +${report.exp} 经验 · 新增书签 ${report.bookmarks} / 笔记 ${report.notes} / 文件 ${report.files} · 签到 ${report.checkinDays} 天`;
        const title = isEn ? '📊 Your weekly growth report' : '📊 你的本周成长周报';
        await pool.query(
          `INSERT INTO notification (id, user_id, type, title, content, link, meta, is_read)
           VALUES (?, ?, 'system', ?, ?, '/growth', ?, 0)
           ON DUPLICATE KEY UPDATE id = id`,
          [notificationId, userId, title, content, JSON.stringify({ weeklyReport: report })],
        );
        count++;
      } catch (e) {
        console.error(`[周报] 用户 ${userId} 生成失败(跳过):`, e.message);
      }
    }
    console.log(`[周报] 本轮已生成 ${count} 份`);
  } catch (e) {
    console.error('[周报] 生成失败:', e.message);
  }
}
