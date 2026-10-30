import { createHash } from 'node:crypto';
import pool from '../../db/index.js';
import { createNotification } from '../notification.js';

const SETTINGS_LINK = '/settings?section=export';

/** 同一任务同一结果只发一条：租约恢复后重复收尾也不会多发。 */
export function exportOutcomeNoticeId(taskId, status) {
  return createHash('md5').update(`data-export:${taskId}:${status}`).digest('hex');
}

export function exportOutcomeCopy(status, { total = 0, failed = 0 } = {}, lang = 'zh-CN') {
  const en = lang === 'en-US';
  if (status === 'failed') {
    return en
      ? { title: 'Backup did not finish', content: 'You can try again in Data & backup.' }
      : { title: '备份未完成', content: '可以在「数据与备份」里重试。' };
  }
  if (status === 'partial') {
    const done = Math.max(0, total - failed);
    return en
      ? {
          title: 'Backup partly complete',
          content: `${done} of ${total} items packed, ${failed} need attention. Download within 24 hours.`,
        }
      : { title: '备份部分完成', content: `${done} / ${total} 项已打包，${failed} 项需留意，24 小时内可下载。` };
  }
  return en
    ? { title: 'Backup ready', content: `${total} items packed. Download within 24 hours.` }
    : { title: '备份已完成', content: `${total} 项已打包，24 小时内可下载。` };
}

function exportTypes(task) {
  try {
    const types = JSON.parse(task.options_json)?.types;
    return Array.isArray(types) ? types : [];
  } catch {
    return [];
  }
}

/**
 * 导出任务结束后的附带动作：成功时记录「上次备份」，并按结果发站内通知。
 * 在任务状态提交之后调用；这里的失败只记日志，不能改变任务结果。取消不调用。
 */
export async function recordExportOutcome(task, status, { failed = 0, now = new Date(), db = pool } = {}) {
  const total = Number(task.total) || 0;
  if (status === 'completed' || status === 'partial') {
    try {
      // 偏好由前端整体保存，`dataBackup` 由 preserveDataBackupPreference 保护，不会被旧副本覆盖。
      await db.query(
        `UPDATE user
            SET preferences = JSON_SET(
              COALESCE(preferences, JSON_OBJECT()), '$.dataBackup',
              JSON_OBJECT('at', ?, 'total', ?, 'types', CAST(? AS JSON), 'status', ?,
                          'count', COALESCE(JSON_EXTRACT(preferences, '$.dataBackup.count'), 0) + 1))
          WHERE id = ?`,
        [now.toISOString(), total, JSON.stringify(exportTypes(task)), status, task.owner_id],
      );
    } catch (error) {
      console.warn('[data-export] 记录上次备份失败 code=%s', error?.code || 'UNKNOWN');
    }
  }
  try {
    const [[user]] = await db.query(
      `SELECT role,
              COALESCE(JSON_UNQUOTE(JSON_EXTRACT(preferences, '$.lang')), 'zh-CN') AS lang,
              COALESCE(JSON_UNQUOTE(JSON_EXTRACT(preferences, '$.notificationsInApp')), 'true') AS inApp
         FROM user WHERE id = ? AND del_flag = 0`,
      [task.owner_id],
    );
    if (!user || user.role === 'visitor' || user.inApp === 'false') return;
    const copy = exportOutcomeCopy(status, { total, failed }, user.lang);
    await createNotification(task.owner_id, {
      id: exportOutcomeNoticeId(task.id, status),
      type: 'system',
      title: copy.title,
      content: copy.content,
      link: SETTINGS_LINK,
      meta: { dataExport: task.id, status },
    });
  } catch (error) {
    console.warn('[data-export] 结果通知失败 code=%s', error?.code || 'UNKNOWN');
  }
}
