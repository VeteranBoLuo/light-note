import pool from '../../db/index.js';
import { createNotification } from '../notification.js';
import { json, transaction } from './organizeSuggestionStorage.js';

export const ORGANIZE_NOTIFICATION_MIN_MS = 30_000;

export function completionMessage(run, counts, preferences = {}) {
  const duration = new Date(run.updated_at).getTime() - new Date(run.started_at).getTime();
  if (!Number.isFinite(duration) || duration < ORGANIZE_NOTIFICATION_MIN_MS) return null;
  if (preferences.notificationsOrganize === false || preferences.notificationsInApp === false) return null;
  const failed = Number(counts.failed || 0);
  const english = String(preferences.lang || '').startsWith('en');
  return {
    type: 'system',
    title: english ? 'Organization complete' : '本次整理已完成',
    content: english
      ? `${failed ? `${failed} resources could not be analyzed. Available results have been kept.` : 'Your organization results are ready for review.'} You can disable these notifications in Settings → Notifications → Organization completion notifications.`
      : `${failed ? `其中 ${failed} 项资源分析未成功，已有结果已保留。` : '整理结果已就绪，可以查看并审核建议。'}可在「设置 → 通知 → 整理完成通知」中关闭此项通知。`,
    link: '/organize?issue=ai_suggestions',
    sourceType: 'organize_complete',
    sourceId: run.id,
  };
}

/** 新任务在启动时登记待通知状态；投递和标记同事务，唯一来源键防止重复投递。 */
export async function runOrganizeCompletionNotifications(_workerId, db = pool, notify = createNotification) {
  const [candidates] = await db.query(`SELECT id, user_id FROM organize_suggestion_runs
    WHERE status='completed' AND run_version=2
      AND JSON_UNQUOTE(JSON_EXTRACT(summary_json,'$.completionNotification'))='pending'
    ORDER BY updated_at, id LIMIT 20`);
  for (const candidate of candidates) {
    await transaction(db, async (c) => {
      // 与启动、账号注销保持用户 -> 任务的锁顺序；开关采用投递时的最新值。
      const [users] = await c.query('SELECT preferences FROM user WHERE id=? AND del_flag=0 FOR UPDATE', [
        candidate.user_id,
      ]);
      const [runs] = await c.query('SELECT * FROM organize_suggestion_runs WHERE id=? FOR UPDATE', [candidate.id]);
      const run = runs[0];
      if (!run || run.status !== 'completed' || json(run.summary_json).completionNotification !== 'pending') return;
      const [counts] = await c.query(
        `SELECT SUM(ai_status IN ('failed','conflict') OR EXISTS (
          SELECT 1 FROM organize_suggestions s WHERE s.item_id=i.id AND s.kind='tag_icon' AND s.status='failed'
        )) AS failed
        FROM organize_suggestion_items i WHERE run_id=?`,
        [run.id],
      );
      const payload = users.length ? completionMessage(run, counts[0] || {}, json(users[0].preferences) || {}) : null;
      if (payload) await notify(run.user_id, payload, c);
      await c.query(
        `UPDATE organize_suggestion_runs
        SET summary_json=JSON_SET(summary_json,'$.completionNotification',?),updated_at=updated_at WHERE id=?`,
        [payload ? 'sent' : 'skipped', run.id],
      );
    });
  }
  return candidates.length > 0;
}
