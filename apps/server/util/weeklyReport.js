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
import { getGrowth } from './growth.js';
import crypto from 'crypto';

// 汇总单个用户近 7 天的成长数据
async function buildWeeklyReport(userId) {
  const [[row]] = await pool.query(
    `SELECT
      (SELECT COUNT(*) FROM bookmark WHERE user_id = ? AND del_flag = 0 AND create_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)) AS bookmarks,
      (SELECT COUNT(*) FROM note WHERE create_by = ? AND del_flag = 0 AND create_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)) AS notes,
      (SELECT COUNT(*) FROM files WHERE create_by = ? AND del_flag = 0 AND create_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)) AS files,
      (SELECT COALESCE(SUM(amount), 0) FROM growth_events WHERE user_id = ? AND status = 'granted' AND create_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)) AS exp,
      (SELECT COUNT(*) FROM growth_events WHERE user_id = ? AND source = 'checkin' AND create_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)) AS checkinDays`,
    [userId, userId, userId, userId, userId],
  );
  const g = await getGrowth(userId);
  return {
    bookmarks: Number(row.bookmarks || 0),
    notes: Number(row.notes || 0),
    files: Number(row.files || 0),
    exp: Number(row.exp || 0),
    checkinDays: Number(row.checkinDays || 0),
    level: g.level,
    levelName: g.name,
    generatedAt: new Date().toISOString().slice(0, 10),
  };
}

// 生成所有符合条件用户的上周周报并推送通知(定时任务调用)
export async function generateWeeklyReports() {
  try {
    // 上周有成长活动、非 root、未在设置里关闭周报(preferences.weeklyReport !== false)的用户
    const [users] = await pool.query(
      `SELECT DISTINCT ge.user_id
       FROM growth_events ge
       JOIN \`user\` u ON u.id = ge.user_id
       WHERE ge.create_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)
         AND u.role != 'root' AND u.del_flag = 0
         AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(u.preferences, '$.weeklyReport')), 'true') != 'false'`,
    );
    let count = 0;
    for (const { user_id: userId } of users) {
      try {
        const report = await buildWeeklyReport(userId);
        // 无实质活动不发空周报
        if (report.bookmarks + report.notes + report.files + report.exp + report.checkinDays === 0) continue;
        const content = `本周 +${report.exp} 经验 · 新增书签 ${report.bookmarks} / 笔记 ${report.notes} / 文件 ${report.files} · 签到 ${report.checkinDays} 天`;
        await pool.query(
          `INSERT INTO notification (id, user_id, type, title, content, link, meta, is_read)
           VALUES (?, ?, 'system', ?, ?, '/growth', ?, 0)`,
          [crypto.randomUUID(), userId, '📊 你的本周成长周报', content, JSON.stringify({ weeklyReport: report })],
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
