import { isAnnualReportOpen } from '@lightnote/shared/annual-report';
import pool from '../../db/index.js';
import { ACHIEVEMENTS } from '../growth.js';
import { INTERNAL_ROLES } from '../internalRoles.js';
import { POINTS_EARNING_POLICY_VERSION } from '../pointsEarningPolicy.js';

/** 普通账号按开放时刻；Root 与测试账号可提前查看真实报告，用于上线后的线上验收。 */
export function canOpenAnnualReport(definition, role, now = Date.now()) {
  if (!definition || !role || role === 'visitor') return false;
  return INTERNAL_ROLES.includes(role) || isAnnualReportOpen(definition, now);
}

export function annualEntryActive(definition, role, now = Date.now()) {
  return canOpenAnnualReport(definition, role, now) && now < Date.parse(definition.entryUntil);
}

/**
 * 看完报告时写入纪念成就：解锁即领取、0 积分，不调用积分账本。
 * INSERT IGNORE 保证重复调用不改变首次解锁时间。
 */
export async function unlockAnnualReviewAchievement(userId, definition, { db = pool } = {}) {
  const achievement = ACHIEVEMENTS.find((item) => item.key === definition?.achievementKey);
  if (!userId || !achievement?.autoClaim) throw new Error('ANNUAL_REVIEW_ACHIEVEMENT_UNAVAILABLE');
  const [result] = await db.query(
    `INSERT IGNORE INTO user_achievements
       (user_id, achievement_key, unlocked_at, claimed_at, reward_points_snapshot, reward_frame_id_snapshot, policy_version)
     VALUES (?, ?, NOW(), NOW(), 0, NULL, ?)`,
    [String(userId), achievement.key, POINTS_EARNING_POLICY_VERSION],
  );
  return { key: achievement.key, newlyUnlocked: Number(result?.affectedRows || 0) === 1 };
}
