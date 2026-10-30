/**
 * 年度报告开放通知：开放后第一周每天 10:00（服务器时间）检查一次，同一账号最多一条。
 * 通知 meta 只写年份，不写任何数字或标题；投递沿用站内通知与浏览器/华为推送的既有链路。
 */
import crypto from 'crypto';
import { getAnnualReportDefinition, isAnnualReportNoticeWindow } from '@lightnote/shared/annual-report';
import pool from '../../db/index.js';
import { stableAgentErrorCode } from '../agent/logSafety.js';
import { createNotification } from '../notification.js';
import { notificationSchedulerEnabled } from '../notificationSchedulerPolicy.js';
import { buildAnnualReport } from './build.js';

const NOTICE_HOUR = 10;

export function annualReportNoticeId(year, userId) {
  return crypto.createHash('md5').update(`annual-report:${year}:${userId}`).digest('hex');
}

export function annualReportNoticeCopy(year, lang) {
  return lang === 'en-US'
    ? { title: `🎉 Your ${year} in Light Note`, content: 'Your annual report is ready — take a minute to look back.' }
    : { title: `🎉 你的 ${year} 年度报告来了`, content: '花 1 分钟，看看这一年留下的记录。' };
}

/** 今年有非示例记录的账号；各表分别查询后在内存合并，避免跨表 UNION 的排序规则冲突。 */
async function candidateUserIds(year, db) {
  const since = `${year}-01-01 00:00:00`;
  const queries = [
    `SELECT DISTINCT user_id AS userId FROM bookmark WHERE del_flag = 0 AND create_time >= ?`,
    `SELECT DISTINCT create_by AS userId FROM note WHERE del_flag = 0 AND create_time >= ?`,
    `SELECT DISTINCT create_by AS userId FROM files WHERE del_flag = 0 AND create_time >= ?`,
    `SELECT DISTINCT user_id AS userId FROM todo_items WHERE del_flag = 0 AND completed_at >= ?`,
    `SELECT DISTINCT user_id AS userId FROM resource_inbox WHERE complete_time >= ?`,
  ];
  const ids = new Set();
  for (const sql of queries) {
    const [rows] = await db.query(sql, [since]);
    for (const row of rows) if (row.userId) ids.add(String(row.userId));
  }
  return [...ids];
}

export async function sendAnnualReportNotices({ year = 2026, now = new Date(), db = pool } = {}) {
  if (!notificationSchedulerEnabled()) return 0;
  const definition = getAnnualReportDefinition(year);
  if (!isAnnualReportNoticeWindow(definition, now)) return 0;
  let sent = 0;
  try {
    const ids = await candidateUserIds(definition.year, db);
    for (let offset = 0; offset < ids.length; offset += 200) {
      const [users] = await db.query(
        `SELECT id, role,
                COALESCE(JSON_UNQUOTE(JSON_EXTRACT(preferences, '$.lang')), 'zh-CN') AS lang,
                COALESCE(JSON_UNQUOTE(JSON_EXTRACT(preferences, '$.notificationsInApp')), 'true') AS inApp
           FROM \`user\` WHERE del_flag = 0 AND id IN (?)`,
        [ids.slice(offset, offset + 200)],
      );
      for (const user of users) {
        if (user.role === 'visitor' || user.inApp === 'false') continue;
        try {
          const id = annualReportNoticeId(definition.year, user.id);
          const [[existing]] = await db.query('SELECT 1 FROM notification WHERE id = ? LIMIT 1', [id]);
          if (existing) continue;
          // 只有批量导入、没有日常记录的账号不生成报告，也不通知。
          const report = await buildAnnualReport(user.id, {
            year: definition.year,
            userRole: user.role,
            now,
            db,
            tierOnly: true,
          });
          if (report.tier === 'empty') continue;
          const copy = annualReportNoticeCopy(definition.year, user.lang);
          await createNotification(user.id, {
            id,
            type: 'system',
            title: copy.title,
            content: copy.content,
            link: `/growth/annual/${definition.year}`,
            meta: { annualReport: definition.year },
          });
          sent++;
        } catch (error) {
          console.error('[年度报告] 单用户通知失败(跳过) code=%s', stableAgentErrorCode(error));
        }
      }
    }
    console.log(`[年度报告] 本轮已发送 ${sent} 条通知`);
  } catch (error) {
    console.error('[年度报告] 通知失败 code=%s', stableAgentErrorCode(error));
  }
  return sent;
}

/** 每天 10:00 检查；窗口外直接返回，服务重启错过当天时次日补发。 */
export function scheduleAnnualReportNotices() {
  if (!notificationSchedulerEnabled()) return;
  const now = new Date();
  const next = new Date(now);
  next.setHours(NOTICE_HOUR, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  setTimeout(() => {
    sendAnnualReportNotices();
    setInterval(sendAnnualReportNotices, 24 * 60 * 60 * 1000);
  }, next.getTime() - now.getTime());
  console.log(`[年度报告] 通知定时已注册,首次检查: ${next.toLocaleString('zh-CN')}`);
}
