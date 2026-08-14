import pool from '../db/index.js';
import {
  earningPolicyVersionForDay,
  earningPolicyVersionForWeek,
  getPointsEarningRuntime,
  LEGACY_POINTS_EARNING_POLICY_VERSION,
  POINTS_EARNING_POLICY_VERSION,
} from './pointsEarningPolicy.js';

const PERIOD_TYPES = new Set(['day', 'week']);

function normalizePeriod(periodType, periodKey) {
  const type = String(periodType || '').trim();
  const key = String(periodKey || '').trim();
  if (!PERIOD_TYPES.has(type)) throw new Error('INVALID_POINTS_EARNING_PERIOD_TYPE');
  if (type === 'day' && !/^\d{8}$/.test(key)) throw new Error('INVALID_POINTS_EARNING_DAY');
  if (type === 'week' && !/^\d{6}$/.test(key)) throw new Error('INVALID_POINTS_EARNING_WEEK');
  return { type, key };
}

function safeVersion(value, fallback) {
  return [LEGACY_POINTS_EARNING_POLICY_VERSION, POINTS_EARNING_POLICY_VERSION].includes(value) ? value : fallback;
}

/**
 * 日/周策略选择锁。只读页面优先读取已锁定值；领取事务传 lock=true 后会原子固化，
 * 因而环境开关暂停、进程重启或配置误改都不能让同一周期切回另一套奖励。
 */
export async function resolvePointsEarningPeriodVersion(
  periodType,
  periodKey,
  { db = pool, lock = false, runtime = null } = {},
) {
  const { type, key } = normalizePeriod(periodType, periodKey);
  const effectiveRuntime = runtime || getPointsEarningRuntime();
  const fallback =
    type === 'day'
      ? earningPolicyVersionForDay(key, effectiveRuntime)
      : earningPolicyVersionForWeek(key, effectiveRuntime);
  // C5 尚未配置全局切换边界时，系统只有 legacy 一种可选策略，不必让每次看板读取
  // 都访问周期锁表。配置了边界后（包括边界到来前）才持久化选择，保证临近切换期
  // 修改环境变量也不会让已经打开的日/周口径漂移。
  if (!(type === 'day' ? effectiveRuntime.effectiveDay : effectiveRuntime.effectiveWeek)) return fallback;
  const [[existing]] = await db.query(
    `SELECT policy_version AS policyVersion
       FROM points_earning_period_policy
      WHERE period_type = ? AND period_key = ? LIMIT 1`,
    [type, key],
  );
  if (existing?.policyVersion) return safeVersion(existing.policyVersion, fallback);
  if (!lock) return fallback;
  await db.query(
    `INSERT IGNORE INTO points_earning_period_policy
       (period_type, period_key, policy_version)
     VALUES (?, ?, ?)`,
    [type, key, fallback],
  );
  const [[locked]] = await db.query(
    `SELECT policy_version AS policyVersion
       FROM points_earning_period_policy
      WHERE period_type = ? AND period_key = ? LIMIT 1`,
    [type, key],
  );
  return safeVersion(locked?.policyVersion, fallback);
}

export const resolveDailyEarningPolicyVersion = (dayKey, options) =>
  resolvePointsEarningPeriodVersion('day', dayKey, options);

export const resolveWeeklyEarningPolicyVersion = (weekKey, options) =>
  resolvePointsEarningPeriodVersion('week', weekKey, options);
