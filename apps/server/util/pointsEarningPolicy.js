export const LEGACY_POINTS_EARNING_POLICY_VERSION = 'points-earning-legacy';
export const POINTS_EARNING_POLICY_VERSION = 'points-earning-c5';
export const POINTS_SYSTEM_VERSION = 'points-system-c5';
export const POINTS_EARNING_POLICY_SHORT_VERSION = 'c5';
export const POINTS_EARNING_C5_MIGRATION_MARKERS = Object.freeze([
  'points-earning-c5-achievement-snapshots-v1',
  'points-earning-c5-meaningful-activity-v1',
  'points-earning-c5-baseline-v1',
]);

export const STABLE_POINTS_REASONS = Object.freeze(['checkin', 'quest', 'weekly']);
export const ONE_TIME_POINTS_REASONS = Object.freeze(['achievement', 'streak_milestone']);
export const RANDOM_POINTS_REASONS = Object.freeze([
  'lottery_free_win',
  'lottery_paid_win',
  'lottery_paid_compensation',
  'lottery_win',
  'lottery_compensation',
]);
export const OPERATIONS_POINTS_REASONS = Object.freeze(['admin', 'campaign', 'correction']);

export const CHECKIN_POINTS_POLICY = Object.freeze({
  base: 15,
  rampDays: 6,
  maximum: 20,
});

export const DAILY_POINTS_POLICY = Object.freeze([
  Object.freeze({ key: 'basic', required: 2, exp: 5, points: 15, source: 'daily_quest_2' }),
  Object.freeze({ key: 'complete', required: 3, exp: 10, points: 25, source: 'daily_quest_3' }),
]);

export const DAILY_MEANINGFUL_ACTIVITY_TYPES = Object.freeze(['bookmark', 'note', 'file', 'todo', 'organize']);

export const WEEKLY_POINTS_POLICY = Object.freeze([
  Object.freeze({ key: 'wk_collect', metric: 'collect', target: 5, reward: 40 }),
  Object.freeze({ key: 'wk_note', metric: 'note', target: 3, reward: 60 }),
  Object.freeze({ key: 'wk_progress', metric: 'progress', target: 5, reward: 60 }),
  Object.freeze({ key: 'wk_active_days', metric: 'activeDays', target: 5, reward: 50 }),
  Object.freeze({ key: 'wk_variety', metric: 'variety', target: 3, reward: 40 }),
]);

const ACHIEVEMENT_OVERRIDES = Object.freeze({
  streak_1: Object.freeze({ reward: 10 }),
  streak_7: Object.freeze({ reward: 30 }),
  streak_30: Object.freeze({ reward: 80 }),
  streak_100: Object.freeze({ reward: 200 }),
  streak_365: Object.freeze({ reward: 500 }),
  bookmark_200: Object.freeze({ minLevel: 5 }),
  todo_500: Object.freeze({ minLevel: 5, minActiveDays: 30 }),
  todo_1000: Object.freeze({ minLevel: 8, minActiveDays: 90 }),
  organize_500: Object.freeze({ minLevel: 5, minActiveDays: 30 }),
  organize_1000: Object.freeze({ minLevel: 8, minActiveDays: 90 }),
  join_7: Object.freeze({ minActiveDays: 2 }),
  join_30: Object.freeze({ minActiveDays: 7 }),
  join_100: Object.freeze({ minActiveDays: 20 }),
  join_365: Object.freeze({ minActiveDays: 60 }),
});

export const MAKEUP_CARD_SUPPLY_POLICY = Object.freeze({
  streakMilestones: Object.freeze([7, 30]),
  levelMilestones: Object.freeze([5, 10, 15]),
  stackMax: 2,
  freeLotteryEnabled: false,
  paidLotteryOverflowPoints: 120,
});

function strictBoolean(value, fallback = false) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return false;
}

function normalizeDay(value) {
  const day = String(value || '').trim();
  return /^\d{8}$/.test(day) ? day : null;
}

function normalizeWeek(value) {
  const week = String(value || '').trim();
  return /^\d{6}$/.test(week) ? week : null;
}

export function getPointsEarningRuntime(env = process.env) {
  return Object.freeze({
    enabled: strictBoolean(env.POINTS_EARNING_C5_ENABLED, false),
    pointsCenterEnabled: strictBoolean(env.POINTS_POINTS_CENTER_ENABLED, false),
    adminGovernanceEnabled: strictBoolean(env.POINTS_ADMIN_GOVERNANCE_V2_ENABLED, false),
    campaignEnabled: strictBoolean(env.POINTS_CAMPAIGN_ENABLED, false),
    effectiveDay: normalizeDay(env.POINTS_EARNING_C5_EFFECTIVE_DAY),
    effectiveWeek: normalizeWeek(env.POINTS_EARNING_C5_EFFECTIVE_WEEK),
  });
}

/**
 * C5 获取写入只能在显式维护迁移、日边界和周边界全部就绪后启动。
 * 用户积分中心可独立灰度，不要求历史迁移；治理 V2 需要对账基线。
 */
export async function assertPointsEarningC5ActivationReady({
  db,
  runtime = getPointsEarningRuntime(),
  campaignRuntime = null,
} = {}) {
  const requiresMigration = runtime.enabled || runtime.adminGovernanceEnabled || runtime.campaignEnabled;
  if (!requiresMigration && !runtime.campaignEnabled) return true;
  if (runtime.enabled && (!runtime.effectiveDay || !runtime.effectiveWeek)) {
    const error = new Error('POINTS_EARNING_C5_EFFECTIVE_BOUNDARY_REQUIRED');
    error.code = 'POINTS_EARNING_C5_EFFECTIVE_BOUNDARY_REQUIRED';
    throw error;
  }
  if (requiresMigration) {
    if (!db?.query) throw new Error('POINTS_EARNING_C5_DB_REQUIRED');
    const [rows] = await db.query(
      `SELECT migration_key AS migrationKey
         FROM points_economy_migration_state
        WHERE migration_key IN (${POINTS_EARNING_C5_MIGRATION_MARKERS.map(() => '?').join(',')})`,
      POINTS_EARNING_C5_MIGRATION_MARKERS,
    );
    const completed = new Set(rows.map((row) => String(row.migrationKey)));
    const missing = POINTS_EARNING_C5_MIGRATION_MARKERS.filter((key) => !completed.has(key));
    if (missing.length) {
      const error = new Error('POINTS_EARNING_C5_MIGRATION_REQUIRED');
      error.code = 'POINTS_EARNING_C5_MIGRATION_REQUIRED';
      error.missingMarkers = missing;
      throw error;
    }
  }
  if (runtime.campaignEnabled) {
    if (!runtime.adminGovernanceEnabled) {
      const error = new Error('POINTS_CAMPAIGN_GOVERNANCE_REQUIRED');
      error.code = 'POINTS_CAMPAIGN_GOVERNANCE_REQUIRED';
      throw error;
    }
    if (!campaignRuntime?.ready) {
      const error = new Error('POINTS_CAMPAIGN_LIMITS_REQUIRED');
      error.code = 'POINTS_CAMPAIGN_LIMITS_REQUIRED';
      throw error;
    }
  }
  return true;
}

export function earningPolicyVersionForDay(dayKey, runtime = getPointsEarningRuntime()) {
  const day = normalizeDay(dayKey);
  // enabled 是发放总闸，不参与已经到达生效日后的版本回退。否则事故暂停时会在
  // 同一个账号自然日重新暴露旧规则，产生双领窗口。
  return runtime.effectiveDay && day && day >= runtime.effectiveDay
    ? POINTS_EARNING_POLICY_VERSION
    : LEGACY_POINTS_EARNING_POLICY_VERSION;
}

export function earningPolicyVersionForWeek(weekKey, runtime = getPointsEarningRuntime()) {
  const week = normalizeWeek(weekKey);
  return runtime.effectiveWeek && week && week >= runtime.effectiveWeek
    ? POINTS_EARNING_POLICY_VERSION
    : LEGACY_POINTS_EARNING_POLICY_VERSION;
}

export function earningWritesEnabled(version, runtime = getPointsEarningRuntime()) {
  return version !== POINTS_EARNING_POLICY_VERSION || runtime.enabled;
}

export function dailyClaimRef(dayKey, required, version = POINTS_EARNING_POLICY_VERSION) {
  const day = normalizeDay(dayKey);
  const stage = Math.max(0, Math.trunc(Number(required) || 0));
  if (!day || !stage) throw new Error('INVALID_DAILY_CLAIM_REF');
  return version === POINTS_EARNING_POLICY_VERSION
    ? `daily:${POINTS_EARNING_POLICY_SHORT_VERSION}:${day}:${stage}`
    : `${day}:${stage}`;
}

export function dailyClaimRefCandidates(dayKey, required, version = POINTS_EARNING_POLICY_VERSION) {
  const day = normalizeDay(dayKey);
  const stage = Math.max(0, Math.trunc(Number(required) || 0));
  if (!day || !stage) return [];
  return [day, `${day}:${stage}`, `${day}:${version}:${stage}`, dailyClaimRef(day, stage, version)];
}

export function weeklyClaimRef(weekKey, challengeKey, version = POINTS_EARNING_POLICY_VERSION) {
  const week = normalizeWeek(weekKey);
  const key = String(challengeKey || '').trim();
  if (!week || !key) throw new Error('INVALID_WEEKLY_CLAIM_REF');
  return version === POINTS_EARNING_POLICY_VERSION
    ? `week:${POINTS_EARNING_POLICY_SHORT_VERSION}:${week}:${key}`
    : `${week}:${key}`;
}

export function weeklyClaimRefCandidates(weekKey, challengeKey, version = POINTS_EARNING_POLICY_VERSION) {
  const week = normalizeWeek(weekKey);
  const key = String(challengeKey || '').trim();
  if (!week || !key) return [];
  return [`${week}:${key}`, `${week}:${version}:${key}`, weeklyClaimRef(week, key, version)];
}

export function checkinPointsForStreak(streak, version = POINTS_EARNING_POLICY_VERSION) {
  const safeStreak = Math.max(1, Math.trunc(Number(streak) || 1));
  if (version !== POINTS_EARNING_POLICY_VERSION) return 20 + Math.min(safeStreak, 10);
  return CHECKIN_POINTS_POLICY.base + Math.min(Math.max(safeStreak - 1, 0), 5);
}

export function resolveDailyQuestStages(version = POINTS_EARNING_POLICY_VERSION) {
  if (version !== POINTS_EARNING_POLICY_VERSION) {
    return [
      { key: 'basic', required: 2, exp: 5, points: 10, source: 'daily_quest_2' },
      { key: 'complete', required: 3, exp: 10, points: 20, source: 'daily_quest_3' },
    ];
  }
  return DAILY_POINTS_POLICY.map((stage) => ({ ...stage }));
}

export function resolveWeeklyChallenges(version = POINTS_EARNING_POLICY_VERSION) {
  if (version !== POINTS_EARNING_POLICY_VERSION) {
    return [
      { key: 'wk_bookmark', metric: 'bookmark', target: 5, reward: 40 },
      { key: 'wk_note', metric: 'note', target: 3, reward: 50 },
      { key: 'wk_checkin', metric: 'checkin', target: 5, reward: 60 },
      { key: 'wk_todo', metric: 'todo', target: 5, reward: 50 },
      { key: 'wk_organize', metric: 'organize', target: 5, reward: 50 },
    ];
  }
  return WEEKLY_POINTS_POLICY.map((challenge) => ({ ...challenge }));
}

export function applyAchievementEarningPolicy(achievement, version = POINTS_EARNING_POLICY_VERSION) {
  if (!achievement || version !== POINTS_EARNING_POLICY_VERSION) return { ...(achievement || {}) };
  return { ...achievement, ...(ACHIEVEMENT_OVERRIDES[achievement.key] || {}) };
}

export function getAchievementPolicy(key) {
  return ACHIEVEMENT_OVERRIDES[key] ? { ...ACHIEVEMENT_OVERRIDES[key] } : null;
}

export function getEarningPolicySnapshot(version = POINTS_EARNING_POLICY_VERSION) {
  const weekly = resolveWeeklyChallenges(version);
  const daily = resolveDailyQuestStages(version);
  return Object.freeze({
    version,
    checkin: version === POINTS_EARNING_POLICY_VERSION ? { ...CHECKIN_POINTS_POLICY } : { base: 20, maximum: 30 },
    daily,
    weekly,
    stableWeekMaximum:
      (version === POINTS_EARNING_POLICY_VERSION ? 20 : 30) * 7 +
      daily.reduce((sum, stage) => sum + stage.points, 0) * 7 +
      weekly.reduce((sum, item) => sum + item.reward, 0),
    randomIncomeIsGuaranteed: false,
    sourceCategories: {
      stable: [...STABLE_POINTS_REASONS],
      oneTime: [...ONE_TIME_POINTS_REASONS],
      random: [...RANDOM_POINTS_REASONS],
      operations: [...OPERATIONS_POINTS_REASONS],
    },
  });
}
