import pool from '../db/index.js';
import { getGrowthDashboard, lockGrowthAccount } from './growth.js';
import {
  getPointsEarningRuntime,
  POINTS_EARNING_C8_POLICY_VERSION,
  POINTS_EARNING_C8_SNAPSHOT_MARKER,
} from './pointsEarningPolicy.js';

/** 维护窗口显式执行；默认只读，复用原有解锁口径，不发积分、不改余额。 */
export async function preparePointsEarningC8({ db = pool, apply = false } = {}) {
  const [existing] = await db.query(
    'SELECT migration_key FROM points_economy_migration_state WHERE migration_key = ? LIMIT 1',
    [POINTS_EARNING_C8_SNAPSHOT_MARKER],
  );
  if (existing.length) return { already: true, users: 0, achievements: 0 };
  if (getPointsEarningRuntime().c8Enabled) throw new Error('POINTS_EARNING_C8_PREPARATION_REQUIRES_PAUSE');

  const summary = { already: false, users: 0, achievements: 0 };
  let cursor = '';
  for (;;) {
    const [users] = await db.query(
      `SELECT id, role FROM user WHERE id > ? AND del_flag = 0
         AND COALESCE(role, 'user') IN ('user', 'test', 'root') ORDER BY id LIMIT 50`,
      [cursor],
    );
    if (!users.length) break;
    for (const user of users) {
      const conn = apply ? await db.getConnection() : db;
      try {
        if (apply) {
          await conn.beginTransaction();
          await lockGrowthAccount(conn, String(user.id));
        }
        const dashboard = await getGrowthDashboard(user.id, { userRole: user.role, db: conn });
        if (dashboard.achievementPolicyVersion === POINTS_EARNING_C8_POLICY_VERSION)
          throw new Error('POINTS_EARNING_C8_PREPARATION_MUST_PRECEDE_CONFIGURATION');
        const unlocked = dashboard.achievements.filter((achievement) => achievement.unlocked);
        if (apply && unlocked.length) {
          await conn.query(
            `INSERT INTO user_achievements
               (user_id, achievement_key, unlocked_at, reward_points_snapshot, reward_frame_id_snapshot, policy_version)
             VALUES ${unlocked.map(() => '(?, ?, COALESCE(?, NOW()), ?, ?, ?)').join(', ')}
             ON DUPLICATE KEY UPDATE
               reward_points_snapshot = COALESCE(user_achievements.reward_points_snapshot, VALUES(reward_points_snapshot)),
               reward_frame_id_snapshot = COALESCE(user_achievements.reward_frame_id_snapshot, VALUES(reward_frame_id_snapshot)),
               policy_version = COALESCE(user_achievements.policy_version, VALUES(policy_version))`,
            unlocked.flatMap((achievement) => [
              String(user.id),
              achievement.key,
              achievement.unlockedAt,
              achievement.rewardSnapshot?.points ?? achievement.reward,
              achievement.rewardSnapshot?.frameId || achievement.frameId || null,
              achievement.rewardSnapshot?.policyVersion || achievement.policyVersion,
            ]),
          );
        }
        if (apply) await conn.commit();
        summary.users += 1;
        summary.achievements += unlocked.length;
      } catch (error) {
        if (apply) await conn.rollback();
        throw error;
      } finally {
        if (apply) conn.release();
      }
    }
    cursor = String(users.at(-1).id);
  }
  if (apply) {
    await db.query('INSERT IGNORE INTO points_economy_migration_state (migration_key, meta) VALUES (?, ?)', [
      POINTS_EARNING_C8_SNAPSHOT_MARKER,
      JSON.stringify({ ...summary, completedBy: 'preparePointsEarningC8' }),
    ]);
  }
  return summary;
}
