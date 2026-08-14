import pool from '../db/index.js';
import { meetsAchievementRequirement, resolveAchievements } from './growth.js';
import { getMeaningfulActiveDays } from './meaningfulActivity.js';
import { getGrowthCalendarContext } from './growthPreferences.js';
import { resolveDailyEarningPolicyVersion } from './pointsEarningPolicyState.js';
import { getAchievementFrameByKey } from './points.js';

export async function persistAchievementUnlocksForMetrics(userId, metrics, { db = pool, currentLevel = null } = {}) {
  if (!userId || userId === 'visitor') return [];
  const calendar = await getGrowthCalendarContext(userId, { db });
  const policyVersion = await resolveDailyEarningPolicyVersion(calendar.dayKey, { db, lock: true });
  const achievements = resolveAchievements(policyVersion);
  let level = Number(currentLevel ?? metrics?.level ?? 0);
  if (!level) {
    const [[row]] = await db.query('SELECT level FROM user_growth WHERE user_id = ? LIMIT 1', [String(userId)]);
    level = Number(row?.level || 1);
  }
  const needsActiveDays = achievements.some(
    (achievement) => Object.hasOwn(metrics || {}, achievement.metric) && Number(achievement.minActiveDays || 0) > 0,
  );
  const activeDays = needsActiveDays
    ? Number(metrics?.activeDays ?? (await getMeaningfulActiveDays(userId, { db })))
    : Number(metrics?.activeDays || 0);
  const mergedMetrics = { ...(metrics || {}), level, activeDays };
  const unlocked = achievements.filter(
    (achievement) =>
      Object.hasOwn(mergedMetrics, achievement.metric) && meetsAchievementRequirement(achievement, mergedMetrics),
  );
  if (!unlocked.length) return [];
  const values = unlocked.map(() => '(?, ?, NOW(), ?, ?, ?)').join(', ');
  await db.query(
    `INSERT IGNORE INTO user_achievements
       (user_id, achievement_key, unlocked_at, reward_points_snapshot, reward_frame_id_snapshot, policy_version)
     VALUES ${values}`,
    unlocked.flatMap((achievement) => [
      String(userId),
      achievement.key,
      achievement.reward,
      getAchievementFrameByKey(achievement.key)?.id || null,
      policyVersion,
    ]),
  );
  return unlocked.map((achievement) => achievement.key);
}

export async function persistAchievementMetricFromDatabase(userId, metric, { db = pool } = {}) {
  const queries = {
    bookmarkCount: `SELECT COUNT(*) AS value FROM bookmark b
      WHERE b.user_id = ? AND b.del_flag = 0
        AND NOT EXISTS (SELECT 1 FROM onboarding_seed_resources osr
          WHERE osr.user_id=b.user_id AND osr.resource_type='bookmark' AND osr.resource_id=b.id)`,
    noteCount: `SELECT COUNT(*) AS value FROM note n
      WHERE n.create_by = ? AND n.del_flag = 0
        AND NOT EXISTS (SELECT 1 FROM onboarding_seed_resources osr
          WHERE osr.user_id=n.create_by AND osr.resource_type='note' AND osr.resource_id=n.id)`,
    fileCount: `SELECT COUNT(*) AS value FROM files f
      WHERE f.create_by = ? AND f.del_flag = 0
        AND NOT EXISTS (SELECT 1 FROM onboarding_seed_resources osr
          WHERE osr.user_id=f.create_by AND osr.resource_type='file' AND osr.resource_id=CAST(f.id AS CHAR))`,
    completedTodoCount: `SELECT COUNT(*) AS value FROM todo_items td
      WHERE td.user_id = ? AND td.del_flag = 0 AND td.status = 'completed'`,
    organizedResourceCount: `SELECT COUNT(*) AS value FROM resource_inbox ri
      WHERE ri.user_id = ? AND ri.status = 'completed'
        AND NOT EXISTS (SELECT 1 FROM onboarding_seed_resources osr
          WHERE osr.user_id=ri.user_id AND osr.resource_type=ri.resource_type AND osr.resource_id=ri.resource_id)`,
  };
  const sql = queries[metric];
  if (!sql) return [];
  const [[row]] = await db.query(sql, [String(userId)]);
  return persistAchievementUnlocksForMetrics(userId, { [metric]: Number(row?.value || 0) }, { db });
}
