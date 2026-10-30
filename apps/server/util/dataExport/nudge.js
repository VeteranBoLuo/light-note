import { createHash } from 'node:crypto';
import pool from '../../db/index.js';
import { stableAgentErrorCode } from '../agent/logSafety.js';
import { createNotification } from '../notification.js';
import { notificationSchedulerEnabled } from '../notificationSchedulerPolicy.js';
import { SEED_FILTER } from '../onboardingSeedFilter.js';

/** 自己的资料（不含新手示例和已删除）达到这个数量、且从未成功备份的账号，收到一次备份提醒。 */
export const DATA_BACKUP_NUDGE_MIN_RECORDS = 50;
const NUDGE_HOUR = 10;
const NUDGE_MINUTE = 30;
const BATCH_LIMIT = 200;

export function dataBackupNudgeId(userId) {
  return createHash('md5').update(`data-backup-nudge:v1:${userId}`).digest('hex');
}

export function dataBackupNudgeCopy(total, lang = 'zh-CN') {
  return lang === 'en-US'
    ? {
        title: `Back up your ${total} items`,
        content: 'Pack your notes, bookmarks and files in one click and take them anywhere.',
      }
    : { title: `给你的 ${total} 条资料做个备份`, content: '一键打包笔记、书签和文件，随时可以完整带走。' };
}

/**
 * 选出该提醒的账号。门槛按自己的资料计；标题里的数量用导出口径（含新手示例），与「数据与备份」页一致。
 * 已经提醒过的账号由固定通知 ID 排除。
 */
async function candidates(db) {
  const [rows] = await db.query(
    `SELECT u.id,
            COALESCE(JSON_UNQUOTE(JSON_EXTRACT(u.preferences, '$.lang')), 'zh-CN') AS lang,
            (SELECT COUNT(*) FROM bookmark b WHERE b.user_id = u.id AND b.del_flag = 0 AND ${SEED_FILTER.bookmark})
              + (SELECT COUNT(*) FROM note n WHERE n.create_by = u.id AND n.del_flag = 0 AND ${SEED_FILTER.note})
              + (SELECT COUNT(*) FROM files f WHERE f.create_by = u.id AND f.del_flag = 0 AND ${SEED_FILTER.file}) AS own,
            (SELECT COUNT(*) FROM bookmark b WHERE b.user_id = u.id AND b.del_flag = 0)
              + (SELECT COUNT(*) FROM note n WHERE n.create_by = u.id AND n.del_flag = 0)
              + (SELECT COUNT(*) FROM files f WHERE f.create_by = u.id AND f.del_flag = 0) AS total
       FROM user u
      WHERE u.del_flag = 0 AND u.role <> 'visitor'
        AND JSON_EXTRACT(u.preferences, '$.dataBackup') IS NULL
        AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(u.preferences, '$.notificationsInApp')), 'true') <> 'false'`,
  );
  return rows.filter((row) => Number(row.own) >= DATA_BACKUP_NUDGE_MIN_RECORDS);
}

export async function sendDataBackupNudges({ db = pool } = {}) {
  if (!notificationSchedulerEnabled()) return 0;
  let sent = 0;
  try {
    for (const user of await candidates(db)) {
      if (sent >= BATCH_LIMIT) break;
      try {
        const id = dataBackupNudgeId(user.id);
        const [[existing]] = await db.query('SELECT 1 FROM notification WHERE id = ? LIMIT 1', [id]);
        if (existing) continue;
        const copy = dataBackupNudgeCopy(Number(user.total), user.lang);
        await createNotification(user.id, {
          id,
          type: 'system',
          title: copy.title,
          content: copy.content,
          link: '/settings?section=export',
          meta: { dataBackupNudge: 1 },
        });
        sent++;
      } catch (error) {
        console.error('[数据备份提醒] 单用户失败(跳过) code=%s', stableAgentErrorCode(error));
      }
    }
    console.log(`[数据备份提醒] 本轮已发送 ${sent} 条`);
  } catch (error) {
    console.error('[数据备份提醒] 失败 code=%s', stableAgentErrorCode(error));
  }
  return sent;
}

/** 每天 10:30 检查一次，仅生产环境；之后才达到门槛的账号在下一次检查时收到。 */
export function scheduleDataBackupNudges() {
  if (!notificationSchedulerEnabled()) return;
  const now = new Date();
  const next = new Date(now);
  next.setHours(NUDGE_HOUR, NUDGE_MINUTE, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  setTimeout(() => {
    sendDataBackupNudges();
    setInterval(sendDataBackupNudges, 24 * 60 * 60 * 1000);
  }, next.getTime() - now.getTime());
  console.log(`[数据备份提醒] 定时已注册,首次检查: ${next.toLocaleString('zh-CN')}`);
}
