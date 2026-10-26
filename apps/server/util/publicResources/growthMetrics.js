import pool from '../../db/index.js';
import { visibleSql } from './read.js';
import { PUBLIC_RESOURCE_ACHIEVEMENTS, PUBLIC_RESOURCE_FRAMES } from './achievements.js';
import { achievementPolicyVersionForRuntime, POINTS_EARNING_POLICY_VERSION } from '../pointsEarningPolicy.js';

// Uses the same publication/source visibility as search. URL comparison is binary:
// distinct paths may be case-sensitive; revisions and duplicate URLs do not add progress.
export async function publicResourceGrowthMetrics(userId, { db = pool, env = process.env } = {}) {
  if (!userId || userId === 'visitor' || env.PUBLIC_RESOURCES_ENABLED !== 'true') return { publicResourceCount: 0 };
  const [[row]] = await db.query(
    `SELECT COUNT(DISTINCT p.kind, CASE WHEN p.kind='bookmark' THEN BINARY r.url ELSE BINARY p.source_id END) AS count
     FROM public_resource_publications p
     JOIN public_resource_revisions r ON r.id=p.published_revision_id
     WHERE p.owner_id=? AND ${visibleSql('p')}
       AND NOT EXISTS (SELECT 1 FROM public_resource_saved_sources s
         WHERE s.recipient_id=p.owner_id AND s.kind=p.kind AND s.resource_id=p.source_id)
       AND NOT EXISTS (SELECT 1 FROM onboarding_seed_resources s
         WHERE s.user_id=p.owner_id AND s.resource_type=p.kind AND s.resource_id=p.source_id)`,
    [String(userId), String(userId), String(userId)],
  );
  return { publicResourceCount: Number(row?.count || 0) };
}

// Caller owns a transaction. Serialize with reward claims and level changes; only
// freeze entitlement here. Points and cosmetics still arrive together through claimGrowthRewards.
export async function persistPublicResourceAchievements(userId, { db, env = process.env } = {}) {
  if (!userId || userId === 'visitor' || env.PUBLIC_RESOURCES_ENABLED !== 'true') return [];
  const { lockGrowthAccount } = await import('../growth.js');
  await lockGrowthAccount(db, String(userId));
  const [[growth]] = await db.query('SELECT level FROM user_growth WHERE user_id=?', [String(userId)]);
  const { publicResourceCount } = await publicResourceGrowthMetrics(userId, { db, env });
  const unlocked = PUBLIC_RESOURCE_ACHIEVEMENTS.filter(
    (item) => publicResourceCount >= item.target && Number(growth?.level || 1) >= (item.minLevel || 1),
  );
  if (!unlocked.length) return [];
  const policyVersion = achievementPolicyVersionForRuntime(POINTS_EARNING_POLICY_VERSION);
  await db.query(
    `INSERT IGNORE INTO user_achievements
       (user_id, achievement_key, unlocked_at, reward_points_snapshot, reward_frame_id_snapshot, policy_version)
     VALUES ${unlocked.map(() => '(?, ?, NOW(), ?, ?, ?)').join(',')}`,
    unlocked.flatMap((item) => [String(userId), item.key, item.reward,
      PUBLIC_RESOURCE_FRAMES.find((frame) => frame.achievementKey === item.key)?.id || null, policyVersion]),
  );
  return unlocked.map((item) => item.key);
}
