import pool from '../db/index.js';
import { grantExp } from './growth.js';
import { GROWTH_TASK_DEFINITIONS } from './growthTaskCatalog.js';
import { ensureGrowthTaskSchema } from './growthTaskSchema.js';

const TASK_BY_KEY = new Map(GROWTH_TASK_DEFINITIONS.map((task) => [task.taskKey, task]));

function isReadOnlyGrowthActor(userId, userRole) {
  return !userId || userId === 'visitor' || userRole === 'visitor' || userRole === 'root';
}

/**
 * 幂等完成一次性成长任务并发放经验。
 *
 * - user_growth_tasks 主键负责并发去重；
 * - growth_task/ref_id 再由成长账本负责经验幂等；
 * - 传入 connection 时复用外部事务，否则自建事务。
 * 历史迁移写入的 completed 状态不会再次发奖，避免与旧的一次性奖励重复。
 */
export async function completeGrowthTask(
  userId,
  taskKey,
  { userRole = null, connection = null, completedAt = null } = {},
) {
  if (isReadOnlyGrowthActor(userId, userRole)) return { completed: false, skipped: 'read_only_actor' };
  const task = TASK_BY_KEY.get(taskKey);
  if (!task || !task.enabled) return { completed: false, skipped: 'unknown_task' };

  // 应用启动会预热表结构；这里保留等待，避免首个写操作恰好早于异步初始化。
  await ensureGrowthTaskSchema();

  const ownConnection = !connection;
  const conn = connection || (await pool.getConnection());
  try {
    if (ownConnection) await conn.beginTransaction();

    const [insertResult] = await conn.query(
      `INSERT IGNORE INTO user_growth_tasks
        (user_id, task_key, status, completed_at)
       VALUES (?, ?, 'completed', COALESCE(?, NOW()))`,
      [String(userId), taskKey, completedAt],
    );
    if (Number(insertResult?.affectedRows || 0) === 0) {
      if (ownConnection) await conn.commit();
      return { completed: false, duplicated: true, taskKey, rewardExp: 0 };
    }

    const reward = await grantExp(
      String(userId),
      'growth_task',
      {
        refId: taskKey,
        amount: task.rewardExp,
        meta: { taskKey },
        userRole,
      },
      conn,
    );

    if (ownConnection) await conn.commit();
    return { completed: true, duplicated: false, taskKey, rewardExp: task.rewardExp, ...reward };
  } catch (error) {
    if (ownConnection) {
      try {
        await conn.rollback();
      } catch {
        // 保留原始错误。
      }
    }
    throw error;
  } finally {
    if (ownConnection) conn.release();
  }
}

export { TASK_BY_KEY };
