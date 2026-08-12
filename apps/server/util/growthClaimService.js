import pool from '../db/index.js';
import {
  DAILY_QUEST_STAGES,
  getGrowth,
  getGrowthDashboard,
  grantExp,
} from './growth.js';
import { earnPoints, getAchievementFrameByKey } from './points.js';
import { getGrowthTasks } from './growthTaskService.js';
import { getWeeklyChallenges } from './weeklyChallenge.js';
import { getGrowthCalendarContext } from './growthPreferences.js';

export const GROWTH_CLAIM_SCOPES = Object.freeze(['daily', 'growthTasks', 'achievements', 'weekly']);

const ACTION_BY_TASK = Object.freeze({
  profile_avatar: 'profile',
  first_note: 'create_note',
  first_bookmark: 'create_bookmark',
  first_todo: 'create_todo',
  first_file: 'upload_file',
  first_organize: 'open_inbox',
});

const ACTION_BY_QUEST = Object.freeze({
  create: 'create_note',
  daily_note: 'create_note',
  daily_bookmark: 'create_bookmark',
  daily_file: 'upload_file',
  daily_todo: 'open_todos',
  daily_organize: 'open_inbox',
});

const ACTION_BY_WEEKLY = Object.freeze({
  bookmark: 'create_bookmark',
  note: 'create_note',
  checkin: 'checkin',
  todo: 'open_todos',
  organize: 'open_inbox',
});

function selectedScopes(input = {}) {
  const explicit = Array.isArray(input.scopes) || input.scope !== undefined;
  const raw = Array.isArray(input.scopes) ? input.scopes : input.scope !== undefined ? [input.scope] : GROWTH_CLAIM_SCOPES;
  if (explicit && (raw.length === 0 || raw.some((scope) => !GROWTH_CLAIM_SCOPES.includes(scope)))) return null;
  const set = new Set(raw);
  return set;
}

function selectedKeys(input, scope) {
  const values = input?.keys?.[scope];
  return Array.isArray(values) && values.length ? new Set(values.map(String)) : null;
}

function shouldClaim(keys, key) {
  return !keys || keys.has(String(key));
}

function emptySummary() {
  return { claimed: 0, points: 0, exp: 0, frames: [] };
}

function addReceipt(receipts, summary, receipt) {
  receipts.push(receipt);
  if (receipt.status !== 'claimed') return;
  summary.claimed += 1;
  summary.points += Number(receipt.reward?.points || 0);
  summary.exp += Number(receipt.reward?.exp || 0);
  if (receipt.reward?.frameId) summary.frames.push(receipt.reward.frameId);
}

function isActionableForDashboard(action, dashboard) {
  const stats = dashboard?.stats || {};
  if (action === 'open_inbox') return Number(stats.pendingResourceCount || 0) > 0;
  return true;
}

function nextActionFrom({ dashboard, weekly, tasks }) {
  // 展开区最多只放 3 项，但“下一步”必须扫描完整路线，不能被前三项已完成/待领取挡住。
  // 同时只推荐当下确实可执行的任务：没有待整理资源时不把用户导向空收件箱。
  const starter = tasks.allTasks.find((task) => {
    const action = ACTION_BY_TASK[task.taskKey] || 'open_growth_tasks';
    return !task.completed && isActionableForDashboard(action, dashboard);
  });
  if (starter) {
    return {
      type: 'growth_task',
      key: starter.taskKey,
      action: ACTION_BY_TASK[starter.taskKey] || 'open_growth_tasks',
      progress: null,
      reward: { exp: Number(starter.rewardExp || 0), points: 0 },
    };
  }

  const daily = dashboard.quests.find((quest) => {
    const action = ACTION_BY_QUEST[quest.key];
    return !quest.done && action && isActionableForDashboard(action, dashboard);
  });
  if (daily) {
    return {
      type: 'daily_quest',
      key: daily.key,
      action: ACTION_BY_QUEST[daily.key],
      progress: { current: daily.cur, target: daily.target },
    };
  }

  const nearestWeekly = weekly.challenges
    .filter((challenge) => {
      const action = ACTION_BY_WEEKLY[challenge.metric] || 'open_growth_tasks';
      return !challenge.done && isActionableForDashboard(action, dashboard);
    })
    .sort((left, right) => left.target - left.cur - (right.target - right.cur))[0];
  if (nearestWeekly) {
    return {
      type: 'weekly_challenge',
      key: nearestWeekly.key,
      action: ACTION_BY_WEEKLY[nearestWeekly.metric] || 'open_growth_tasks',
      progress: { current: nearestWeekly.cur, target: nearestWeekly.target },
      reward: { exp: 0, points: Number(nearestWeekly.reward || 0) },
    };
  }

  return { type: 'growth_review', key: 'weekly_report', action: 'open_weekly_report', progress: null };
}

/**
 * 只读计算所有可领取项与下一步建议。这里不执行 Schema 初始化，也不固化成就解锁。
 */
export async function getGrowthClaimableSnapshot(userId, { userRole = null, db = pool } = {}) {
  if (!userId || userId === 'visitor' || userRole === 'visitor') {
    return {
      count: 0,
      daily: { count: 0, items: [] },
      growthTasks: { count: 0, items: [] },
      achievements: { count: 0, items: [] },
      weekly: { count: 0, items: [] },
      nextAction: null,
    };
  }
  const calendar = await getGrowthCalendarContext(userId, { db });
  const [dashboard, weekly, tasks] = await Promise.all([
    getGrowthDashboard(userId, { userRole, db, calendar }),
    getWeeklyChallenges(userId, { db, calendar }),
    getGrowthTasks(userId, { db, ensureSchema: false }),
  ]);
  const dailyItems = dashboard.questBonus.stages.filter((item) => item.claimable);
  const taskItems = tasks.allTasks.filter((item) => item.claimable);
  const achievementItems = dashboard.achievements.filter((item) => item.claimable);
  const weeklyItems = weekly.challenges.filter((item) => item.claimable);
  return {
    count: dailyItems.length + taskItems.length + achievementItems.length + weeklyItems.length,
    daily: { count: dailyItems.length, items: dailyItems },
    growthTasks: { count: taskItems.length, items: taskItems },
    achievements: { count: achievementItems.length, items: achievementItems },
    weekly: { count: weeklyItems.length, items: weeklyItems },
    nextAction: nextActionFrom({ dashboard, weekly, tasks }),
    today: {
      completed: dashboard.questBonus.completedCount,
      total: dashboard.questBonus.total,
      claimableCount: dailyItems.length + taskItems.length + achievementItems.length + weeklyItems.length,
    },
  };
}

/**
 * 在同一个用户行锁与数据库事务内重新核算并领取。任何异常都会回滚全部奖励；
 * points_log / growth_events / 状态表的幂等键使重复请求只返回 already，不会重复到账。
 */
export async function claimGrowthRewards(userId, input = {}, { userRole = null } = {}) {
  if (!userId || userId === 'visitor' || userRole === 'visitor') return { ok: false, reason: 'visitor' };
  const scopes = selectedScopes(input);
  if (!scopes) {
    return { ok: false, reason: 'invalid_scope', receipts: [], ...emptySummary(), growth: null };
  }
  const receipts = [];
  const summary = emptySummary();
  const conn = await pool.getConnection();
  let growth = null;
  try {
    await conn.beginTransaction();
    await conn.query('INSERT IGNORE INTO user_growth (user_id) VALUES (?)', [String(userId)]);
    await conn.query('SELECT user_id FROM user_growth WHERE user_id = ? FOR UPDATE', [String(userId)]);

    const calendar = await getGrowthCalendarContext(userId, { db: conn });
    const [dashboard, weekly, tasks] = await Promise.all([
      getGrowthDashboard(userId, { userRole, db: conn, calendar }),
      getWeeklyChallenges(userId, { db: conn, calendar }),
      getGrowthTasks(userId, { db: conn, ensureSchema: false }),
    ]);

    if (scopes.has('daily')) {
      const keys = selectedKeys(input, 'daily');
      for (const stage of dashboard.questBonus.stages.filter((item) => shouldClaim(keys, item.key))) {
        if (stage.claimed) {
          addReceipt(receipts, summary, { type: 'daily', key: stage.key, status: 'already', reward: {} });
          continue;
        }
        if (!stage.claimable) {
          addReceipt(receipts, summary, { type: 'daily', key: stage.key, status: 'incomplete', reward: {} });
          continue;
        }
        const ref = `${calendar.dayKey}:${stage.required}`;
        const grant =
          userRole === 'root'
            ? { granted: 0, duplicated: false, leveledUp: false }
            : await grantExp(
                userId,
                DAILY_QUEST_STAGES.find((item) => item.key === stage.key)?.source || `daily_quest_${stage.required}`,
                { day: calendar.dayKey, amount: stage.exp, userRole, calendar },
                conn,
              );
        const gotPoints = await earnPoints(userId, stage.points, 'quest', ref, conn);
        const duplicated = !gotPoints && (userRole === 'root' || grant.duplicated);
        addReceipt(receipts, summary, {
          type: 'daily',
          key: stage.key,
          status: duplicated ? 'already' : 'claimed',
          reward: duplicated ? {} : { exp: Number(grant.granted || 0), points: gotPoints ? stage.points : 0 },
          leveledUp: Boolean(grant.leveledUp),
        });
      }
    }

    if (scopes.has('growthTasks')) {
      const keys = selectedKeys(input, 'growthTasks');
      for (const task of tasks.allTasks.filter((item) => shouldClaim(keys, item.taskKey))) {
        if (task.claimed) {
          addReceipt(receipts, summary, { type: 'growthTask', key: task.taskKey, status: 'already', reward: {} });
          continue;
        }
        if (!task.claimable) {
          addReceipt(receipts, summary, { type: 'growthTask', key: task.taskKey, status: 'incomplete', reward: {} });
          continue;
        }
        const grant = await grantExp(
          userId,
          'growth_task',
          { refId: task.taskKey, amount: task.rewardExp, meta: { taskKey: task.taskKey }, userRole, calendar },
          conn,
        );
        await conn.query(
          `UPDATE user_growth_tasks SET claimed_at = COALESCE(claimed_at, NOW())
           WHERE user_id = ? AND task_key = ? AND status = 'completed'`,
          [String(userId), task.taskKey],
        );
        addReceipt(receipts, summary, {
          type: 'growthTask',
          key: task.taskKey,
          status: grant.duplicated ? 'already' : 'claimed',
          reward: grant.duplicated ? {} : { exp: Number(grant.granted || 0), points: 0 },
          leveledUp: Boolean(grant.leveledUp),
        });
      }
    }

    if (scopes.has('achievements')) {
      const keys = selectedKeys(input, 'achievements');
      for (const achievement of dashboard.achievements.filter((item) => shouldClaim(keys, item.key))) {
        if (achievement.claimed) {
          addReceipt(receipts, summary, { type: 'achievement', key: achievement.key, status: 'already', reward: {} });
          continue;
        }
        if (!achievement.unlocked) {
          addReceipt(receipts, summary, { type: 'achievement', key: achievement.key, status: 'locked', reward: {} });
          continue;
        }
        await conn.query(
          `INSERT INTO user_achievements (user_id, achievement_key, unlocked_at)
           VALUES (?, ?, NOW())
           ON DUPLICATE KEY UPDATE unlocked_at = user_achievements.unlocked_at`,
          [String(userId), achievement.key],
        );
        const gotPoints = await earnPoints(userId, achievement.reward, 'achievement', achievement.key, conn);
        const frame = getAchievementFrameByKey(achievement.key);
        if (gotPoints && frame) {
          await conn.query('INSERT IGNORE INTO user_cosmetics (user_id, cosmetic_id) VALUES (?, ?)', [userId, frame.id]);
        }
        await conn.query(
          `UPDATE user_achievements SET claimed_at = COALESCE(claimed_at, NOW())
           WHERE user_id = ? AND achievement_key = ?`,
          [String(userId), achievement.key],
        );
        addReceipt(receipts, summary, {
          type: 'achievement',
          key: achievement.key,
          status: gotPoints ? 'claimed' : 'already',
          reward: gotPoints ? { points: achievement.reward, exp: 0, frameId: frame?.id || null } : {},
        });
      }
    }

    if (scopes.has('weekly')) {
      const keys = selectedKeys(input, 'weekly');
      for (const challenge of weekly.challenges.filter((item) => shouldClaim(keys, item.key))) {
        if (challenge.claimed) {
          addReceipt(receipts, summary, { type: 'weekly', key: challenge.key, status: 'already', reward: {} });
          continue;
        }
        if (!challenge.claimable) {
          addReceipt(receipts, summary, { type: 'weekly', key: challenge.key, status: 'incomplete', reward: {} });
          continue;
        }
        const gotPoints = await earnPoints(userId, challenge.reward, 'weekly', `${weekly.weekKey}:${challenge.key}`, conn);
        addReceipt(receipts, summary, {
          type: 'weekly',
          key: challenge.key,
          status: gotPoints ? 'claimed' : 'already',
          reward: gotPoints ? { points: challenge.reward, exp: 0 } : {},
        });
      }
    }

    // 快照读取也属于本次原子操作：若读取失败则整笔回滚，不能出现“到账成功但接口报错”。
    growth = await getGrowth(userId, { userRole, db: conn, calendar });
    await conn.commit();
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

  return {
    ok: true,
    receipts,
    ...summary,
    growth,
  };
}
