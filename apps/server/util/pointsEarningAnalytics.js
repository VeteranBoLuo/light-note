import pool from '../db/index.js';
import { getGrowth } from './growth.js';
import { getGrowthCalendarContext, getGrowthPreferences } from './growthPreferences.js';
import { getActiveShopItems } from './points.js';
import { getEconomyRuntime } from './pointsEconomyCatalog.js';
import {
  getEarningPolicySnapshot,
  getPointsEarningRuntime,
  ONE_TIME_POINTS_REASONS,
  OPERATIONS_POINTS_REASONS,
  POINTS_EARNING_POLICY_VERSION,
  RANDOM_POINTS_REASONS,
  STABLE_POINTS_REASONS,
} from './pointsEarningPolicy.js';
import { resolveDailyEarningPolicyVersion } from './pointsEarningPolicyState.js';

const SOURCE_LABELS = Object.freeze({
  checkin: 'checkin',
  quest: 'daily',
  weekly: 'weekly',
  achievement: 'achievement',
  streak_milestone: 'milestone',
  lottery_free_win: 'daily_surprise',
  lottery_paid_win: 'paid_lottery',
  lottery_paid_compensation: 'paid_lottery',
  lottery_win: 'legacy_lottery',
  lottery_compensation: 'legacy_lottery',
  admin: 'operations',
  campaign: 'campaign',
  correction: 'correction',
});

const ALL_RANDOM_REASONS = [...new Set([...RANDOM_POINTS_REASONS, 'lottery_free_win'])];

function placeholders(values) {
  return values.map(() => '?').join(',');
}

export function pointsReasonCategory(reason, delta = 0) {
  if (Number(delta) < 0) return 'spent';
  if (STABLE_POINTS_REASONS.includes(reason)) return 'stable';
  if (ONE_TIME_POINTS_REASONS.includes(reason)) return 'oneTime';
  if (ALL_RANDOM_REASONS.includes(reason)) return 'random';
  if (OPERATIONS_POINTS_REASONS.includes(reason)) return 'operations';
  return Number(delta) > 0 ? 'other' : 'neutral';
}

function sourceRows(rows) {
  return rows.map((row) => ({
    key: SOURCE_LABELS[row.reason] || row.reason,
    reason: row.reason,
    category: pointsReasonCategory(row.reason, row.delta),
    amount: Number(row.delta || 0),
    count: Number(row.count || 0),
  }));
}

function estimateGoal({ balance, price, stable28, lowPressureMode }) {
  if (!price) return null;
  const shortfall = Math.max(0, Number(price) - Number(balance || 0));
  const progress = Math.max(0, Math.min(100, Math.round((Number(balance || 0) / price) * 100)));
  const result = { price, balance, shortfall, progress, estimate: null };
  if (lowPressureMode || shortfall === 0) return result;
  const dailyPace = Number(stable28 || 0) / 28;
  if (!(dailyPace > 0)) return result;
  const fastestPace = dailyPace * 1.15;
  const slowestPace = dailyPace * 0.85;
  result.estimate = {
    minDays: Math.max(1, Math.ceil(shortfall / fastestPace)),
    maxDays: Math.max(1, Math.ceil(shortfall / slowestPace)),
    basedOnDays: 28,
    stableDailyAverage: Number(dailyPace.toFixed(1)),
    disclaimer: 'stable_only_no_future_spending_or_random',
  };
  return result;
}

export async function getUserPointsSummary(userId, { db = pool, userRole = null } = {}) {
  if (!userId || userId === 'visitor' || userRole === 'visitor') {
    return { enabled: getPointsEarningRuntime().pointsCenterEnabled, visitor: true };
  }
  const calendar = await getGrowthCalendarContext(userId, { db });
  const [growth, preferences, policyVersion] = await Promise.all([
    getGrowth(userId, { userRole, db, calendar }),
    getGrowthPreferences(userId, { db }),
    resolveDailyEarningPolicyVersion(calendar.dayKey, { db }),
  ]);
  const stableList = [...STABLE_POINTS_REASONS];
  const oneTimeList = [...ONE_TIME_POINTS_REASONS];
  const randomList = [...ALL_RANDOM_REASONS];
  const operationsList = [...OPERATIONS_POINTS_REASONS];
  const aggregateParams = [
    calendar.shiftMinutes,
    calendar.dayKey,
    ...stableList,
    calendar.shiftMinutes,
    calendar.dayKey,
    ...randomList,
    calendar.shiftMinutes,
    calendar.dayKey,
    calendar.shiftMinutes,
    calendar.weekKey,
    ...stableList,
    calendar.shiftMinutes,
    calendar.weekKey,
    ...randomList,
    calendar.shiftMinutes,
    calendar.weekKey,
    ...stableList,
    ...oneTimeList,
    ...randomList,
    ...operationsList,
    String(userId),
  ];
  const [[[aggregate]], [distribution]] = await Promise.all([
    db.query(
      `SELECT
         COALESCE(SUM(CASE WHEN DATE_FORMAT(DATE_ADD(create_time, INTERVAL ? MINUTE), '%Y%m%d') = ?
            AND delta > 0 AND reason IN (${placeholders(stableList)}) THEN delta ELSE 0 END), 0) AS todayStable,
         COALESCE(SUM(CASE WHEN DATE_FORMAT(DATE_ADD(create_time, INTERVAL ? MINUTE), '%Y%m%d') = ?
            AND delta > 0 AND reason IN (${placeholders(randomList)}) THEN delta ELSE 0 END), 0) AS todayRandom,
         COALESCE(SUM(CASE WHEN DATE_FORMAT(DATE_ADD(create_time, INTERVAL ? MINUTE), '%Y%m%d') = ?
            AND delta < 0 THEN -delta ELSE 0 END), 0) AS todaySpent,
         COALESCE(SUM(CASE WHEN YEARWEEK(DATE_ADD(create_time, INTERVAL ? MINUTE), 1) = ?
            AND delta > 0 AND reason IN (${placeholders(stableList)}) THEN delta ELSE 0 END), 0) AS weekStable,
         COALESCE(SUM(CASE WHEN YEARWEEK(DATE_ADD(create_time, INTERVAL ? MINUTE), 1) = ?
            AND delta > 0 AND reason IN (${placeholders(randomList)}) THEN delta ELSE 0 END), 0) AS weekRandom,
         COALESCE(SUM(CASE WHEN YEARWEEK(DATE_ADD(create_time, INTERVAL ? MINUTE), 1) = ?
            AND delta < 0 THEN -delta ELSE 0 END), 0) AS weekSpent,
         COALESCE(SUM(CASE WHEN create_time >= DATE_SUB(NOW(), INTERVAL 28 DAY)
            AND delta > 0 AND reason IN (${placeholders(stableList)}) THEN delta ELSE 0 END), 0) AS stable28,
         COALESCE(SUM(CASE WHEN create_time >= DATE_SUB(NOW(), INTERVAL 28 DAY)
            AND delta > 0 AND reason IN (${placeholders(oneTimeList)}) THEN delta ELSE 0 END), 0) AS oneTime28,
         COALESCE(SUM(CASE WHEN create_time >= DATE_SUB(NOW(), INTERVAL 28 DAY)
            AND delta > 0 AND reason IN (${placeholders(randomList)}) THEN delta ELSE 0 END), 0) AS random28,
         COALESCE(SUM(CASE WHEN create_time >= DATE_SUB(NOW(), INTERVAL 28 DAY)
            AND delta > 0 AND reason IN (${placeholders(operationsList)}) THEN delta ELSE 0 END), 0) AS operations28,
         COALESCE(SUM(CASE WHEN create_time >= DATE_SUB(NOW(), INTERVAL 28 DAY)
            AND delta < 0 THEN -delta ELSE 0 END), 0) AS spent28
       FROM points_log
      WHERE user_id = ? AND create_time >= DATE_SUB(NOW(), INTERVAL 28 DAY)`,
      aggregateParams,
    ),
    db.query(
      `SELECT reason, SUM(delta) AS delta, COUNT(*) AS count
         FROM points_log
        WHERE user_id = ? AND create_time >= DATE_SUB(NOW(), INTERVAL 28 DAY)
        GROUP BY reason ORDER BY ABS(SUM(delta)) DESC`,
      [String(userId)],
    ),
  ]);
  const shopItems = getActiveShopItems();
  const goalItemId = preferences.pointsGoalEnabled ? preferences.pointsGoalItemId : null;
  const goalItem = goalItemId ? shopItems.find((item) => item.id === goalItemId) || null : null;
  const stable28 = Number(aggregate.stable28 || 0);
  const goal = goalItemId
    ? {
        itemId: goalItemId,
        enabled: true,
        unavailable: !goalItem,
        item: goalItem
          ? {
              id: goalItem.id,
              name: goalItem.name,
              cost: Number(goalItem.cost || 0),
              type: goalItem.type,
              effect: goalItem.effect,
            }
          : null,
        ...estimateGoal({
          balance: growth.points,
          price: Number(goalItem?.cost || 0),
          stable28,
          lowPressureMode: preferences.lowPressureMode,
        }),
      }
    : { enabled: false, itemId: preferences.pointsGoalItemId || null, unavailable: false };
  return {
    enabled: getPointsEarningRuntime().pointsCenterEnabled,
    visitor: false,
    policyVersion,
    economyVersion: getEconomyRuntime().economyVersion,
    balance: Number(growth.points || 0),
    lowPressureMode: preferences.lowPressureMode,
    today: {
      stableEarned: Number(aggregate.todayStable || 0),
      randomEarned: Number(aggregate.todayRandom || 0),
      spent: Number(aggregate.todaySpent || 0),
    },
    week: {
      stableEarned: Number(aggregate.weekStable || 0),
      randomEarned: Number(aggregate.weekRandom || 0),
      spent: Number(aggregate.weekSpent || 0),
    },
    last28Days: {
      stableEarned: stable28,
      oneTimeEarned: Number(aggregate.oneTime28 || 0),
      randomEarned: Number(aggregate.random28 || 0),
      operationsEarned: Number(aggregate.operations28 || 0),
      spent: Number(aggregate.spent28 || 0),
    },
    sources: sourceRows(distribution),
    goal,
    goalOptions: shopItems.map((item) => ({
      id: item.id,
      name: item.name,
      cost: Number(item.cost || 0),
      type: item.type,
      effect: item.effect || null,
      rarity: item.rarity || null,
    })),
    earningRules: getEarningPolicySnapshot(policyVersion),
  };
}

export const pointsEarningAnalyticsInternals = { estimateGoal, sourceRows };
