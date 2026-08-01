import pool from '../db/index.js';
import { grantExp } from './growth.js';
import { GROWTH_TASK_DEFINITIONS } from './growthTaskCatalog.js';
import { ensureGrowthTaskSchema } from './growthTaskSchema.js';

const TASK_BY_KEY = new Map(GROWTH_TASK_DEFINITIONS.map((task) => [task.taskKey, task]));

function isReadOnlyGrowthActor(userId, userRole) {
  return !userId || userId === 'visitor' || userRole === 'visitor' || userRole === 'root';
}

/**
 * 幂等标记一次性成长任务已达成，不在这里发放经验。
 *
 * - user_growth_tasks 主键负责并发去重；
 * - 达成与领取必须分离，经验只允许由 claimGrowthTask() 在用户主动领取时发放；
 * - 传入 connection 时复用外部事务，否则自建事务。
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

    if (ownConnection) await conn.commit();
    return { completed: true, duplicated: false, taskKey, rewardExp: task.rewardExp };
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

/**
 * 用户主动领取一次性成长任务经验。
 *
 * user_growth_tasks 行锁串行化同一任务的领取；growth_events 唯一键继续作为第二层幂等保护。
 * claimed_at 只在经验账本成功提交后写入，任何一步失败都会整体回滚。
 */
export async function claimGrowthTask(userId, taskKey, { userRole = null } = {}) {
  if (isReadOnlyGrowthActor(userId, userRole)) return { ok: false, reason: 'read_only_actor' };
  const task = TASK_BY_KEY.get(taskKey);
  if (!task || !task.enabled) return { ok: false, reason: 'not_found' };

  await ensureGrowthTaskSchema();

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[row]] = await conn.query(
      `SELECT status, claimed_at AS claimedAt
       FROM user_growth_tasks
       WHERE user_id = ? AND task_key = ?
       FOR UPDATE`,
      [String(userId), taskKey],
    );

    if (!row || row.status !== 'completed') {
      await conn.commit();
      return { ok: false, reason: 'incomplete', taskKey };
    }
    if (row.claimedAt) {
      await conn.commit();
      return { ok: true, already: true, taskKey, expGained: 0 };
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
    await conn.query(
      `UPDATE user_growth_tasks
       SET claimed_at = COALESCE(claimed_at, NOW())
       WHERE user_id = ? AND task_key = ?`,
      [String(userId), taskKey],
    );

    await conn.commit();
    return {
      ok: true,
      already: Boolean(reward.duplicated),
      taskKey,
      expGained: Number(reward.granted || 0),
      leveledUp: Boolean(reward.leveledUp),
    };
  } catch (error) {
    try {
      await conn.rollback();
    } catch {
      // 保留原始错误。
    }
    throw error;
  } finally {
    conn.release();
  }
}

export { TASK_BY_KEY };
