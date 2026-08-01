import pool from '../db/index.js';
import { ensureGrowthTaskSchema } from './growthTaskSchema.js';

const normalizeTask = (row) => {
  const status = row.status || 'pending';
  const completed = status === 'completed';
  const claimed = Boolean(row.claimedAt);
  return {
    taskKey: row.taskKey,
    titleKey: row.titleKey,
    descriptionKey: row.descriptionKey,
    rewardExp: Number(row.rewardExp || 0),
    status,
    completed,
    claimed,
    claimable: completed && !claimed,
    completedAt: row.completedAt || null,
    claimedAt: row.claimedAt || null,
  };
};

/**
 * 查询启用中的成长任务及指定账号状态。
 * userId 为空时仍返回任务定义，供游客预览；不会读取或写入共享游客账号的数据。
 */
export async function getGrowthTasks(userId = null) {
  await ensureGrowthTaskSchema();
  const subjectUserId = userId && userId !== 'visitor' ? userId : null;
  const [rows] = await pool.query(
    `SELECT
       gt.task_key AS taskKey,
       gt.title AS titleKey,
       gt.description AS descriptionKey,
       gt.reward_exp AS rewardExp,
       COALESCE(ugt.status, 'pending') AS status,
       ugt.completed_at AS completedAt,
       ugt.claimed_at AS claimedAt
     FROM growth_tasks gt
     LEFT JOIN user_growth_tasks ugt
       ON ugt.task_key = gt.task_key
      AND ugt.user_id = ?
     WHERE gt.enabled = 1
     ORDER BY gt.sort_order ASC, gt.task_key ASC`,
    [subjectUserId],
  );

  const tasks = rows.map(normalizeTask);
  const completedCount = tasks.filter((task) => task.completed).length;
  const claimedCount = tasks.filter((task) => task.claimed).length;
  const claimableCount = tasks.filter((task) => task.claimable).length;
  return {
    tasks,
    totalCount: tasks.length,
    completedCount,
    claimedCount,
    claimableCount,
    remainingCount: tasks.length - completedCount,
    activeCount: tasks.length - claimedCount,
  };
}
