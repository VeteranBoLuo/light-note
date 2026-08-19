export const LEGACY_POINTS_EARNING_POLICY_VERSION = 'points-earning-legacy';
export const POINTS_EARNING_C5_POLICY_VERSION = 'points-earning-c5';
export const POINTS_EARNING_C6_POLICY_VERSION = 'points-earning-c6';
// 兼容既有治理、活动和周策略调用；C6 只升级每日任务条件，其他 C5 数值保持不变。
export const POINTS_EARNING_POLICY_VERSION = POINTS_EARNING_C5_POLICY_VERSION;
export const POINTS_SYSTEM_VERSION = 'points-system-c5';
export const POINTS_EARNING_POLICY_SHORT_VERSION = 'c5';
export const SUPPORTED_POINTS_EARNING_POLICY_VERSIONS = Object.freeze([
  LEGACY_POINTS_EARNING_POLICY_VERSION,
  POINTS_EARNING_C5_POLICY_VERSION,
  POINTS_EARNING_C6_POLICY_VERSION,
]);
export const C5_EARNING_RULE_POLICY_VERSIONS = Object.freeze([
  POINTS_EARNING_C5_POLICY_VERSION,
  POINTS_EARNING_C6_POLICY_VERSION,
]);
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

export function usesC5EarningRules(version) {
  return C5_EARNING_RULE_POLICY_VERSIONS.includes(version);
}

function earningPolicyShortVersion(version) {
  if (version === POINTS_EARNING_C6_POLICY_VERSION) return 'c6';
  if (version === POINTS_EARNING_C5_POLICY_VERSION) return POINTS_EARNING_POLICY_SHORT_VERSION;
  return null;
}

export function getPointsEarningRuntime(env = process.env) {
  return Object.freeze({
    enabled: strictBoolean(env.POINTS_EARNING_C5_ENABLED, false),
    c6Enabled: strictBoolean(env.POINTS_EARNING_C6_ENABLED, false),
    pointsCenterEnabled: strictBoolean(env.POINTS_POINTS_CENTER_ENABLED, false),
    adminGovernanceEnabled: strictBoolean(env.POINTS_ADMIN_GOVERNANCE_V2_ENABLED, false),
    campaignEnabled: strictBoolean(env.POINTS_CAMPAIGN_ENABLED, false),
    effectiveDay: normalizeDay(env.POINTS_EARNING_C5_EFFECTIVE_DAY),
    effectiveWeek: normalizeWeek(env.POINTS_EARNING_C5_EFFECTIVE_WEEK),
    c6EffectiveDay: normalizeDay(env.POINTS_EARNING_C6_EFFECTIVE_DAY),
  });
}

/**
 * 获取写入只能在显式维护迁移与完整周期边界就绪后启动。C6 复用 C5
 * 账本和奖励数值，仅在新的账号自然日边界切换每日任务目录。
 */
export async function assertPointsEarningActivationReady({
  db,
  runtime = getPointsEarningRuntime(),
  campaignRuntime = null,
} = {}) {
  const requiresMigration =
    runtime.enabled || runtime.c6Enabled || runtime.adminGovernanceEnabled || runtime.campaignEnabled;
  if (runtime.enabled && (!runtime.effectiveDay || !runtime.effectiveWeek)) {
    const error = new Error('POINTS_EARNING_C5_EFFECTIVE_BOUNDARY_REQUIRED');
    error.code = 'POINTS_EARNING_C5_EFFECTIVE_BOUNDARY_REQUIRED';
    throw error;
  }
  if (runtime.c6Enabled && (!runtime.enabled || !runtime.c6EffectiveDay)) {
    const error = new Error('POINTS_EARNING_C6_EFFECTIVE_BOUNDARY_REQUIRED');
    error.code = 'POINTS_EARNING_C6_EFFECTIVE_BOUNDARY_REQUIRED';
    throw error;
  }
  if (
    runtime.c6EffectiveDay &&
    (!runtime.effectiveDay || String(runtime.c6EffectiveDay) < String(runtime.effectiveDay))
  ) {
    const error = new Error('POINTS_EARNING_C6_BOUNDARY_INVALID');
    error.code = 'POINTS_EARNING_C6_BOUNDARY_INVALID';
    throw error;
  }
  if (!requiresMigration) return true;
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

// 保留旧导出，避免部署窗口内尚未更新的启动脚本或测试夹具中断。
export const assertPointsEarningC5ActivationReady = assertPointsEarningActivationReady;

export function earningPolicyVersionForDay(dayKey, runtime = getPointsEarningRuntime()) {
  const day = normalizeDay(dayKey);
  // enabled 是发放总闸，不参与已经到达生效日后的版本回退。否则事故暂停时会在
  // 同一个账号自然日重新暴露旧规则，产生双领窗口。
  if (runtime.c6EffectiveDay && day && day >= runtime.c6EffectiveDay) return POINTS_EARNING_C6_POLICY_VERSION;
  if (runtime.effectiveDay && day && day >= runtime.effectiveDay) return POINTS_EARNING_C5_POLICY_VERSION;
  return LEGACY_POINTS_EARNING_POLICY_VERSION;
}

export function earningPolicyVersionForWeek(weekKey, runtime = getPointsEarningRuntime()) {
  const week = normalizeWeek(weekKey);
  return runtime.effectiveWeek && week && week >= runtime.effectiveWeek
    ? POINTS_EARNING_POLICY_VERSION
    : LEGACY_POINTS_EARNING_POLICY_VERSION;
}

export function earningWritesEnabled(version, runtime = getPointsEarningRuntime()) {
  // 旧领取记录和兼容调用可能没有写入策略版本；沿用历史规则，但显式未知版本
  // 仍失败关闭，避免未来新增策略在未接入写闸时意外发奖。
  if (version == null || version === LEGACY_POINTS_EARNING_POLICY_VERSION) return true;
  if (version === POINTS_EARNING_C5_POLICY_VERSION) return runtime.enabled;
  if (version === POINTS_EARNING_C6_POLICY_VERSION) return runtime.enabled && runtime.c6Enabled;
  return false;
}

export function dailyClaimRef(dayKey, required, version = POINTS_EARNING_POLICY_VERSION) {
  const day = normalizeDay(dayKey);
  const stage = Math.max(0, Math.trunc(Number(required) || 0));
  if (!day || !stage) throw new Error('INVALID_DAILY_CLAIM_REF');
  const shortVersion = earningPolicyShortVersion(version);
  return shortVersion ? `daily:${shortVersion}:${day}:${stage}` : `${day}:${stage}`;
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
  const shortVersion = earningPolicyShortVersion(version);
  return shortVersion ? `week:${shortVersion}:${week}:${key}` : `${week}:${key}`;
}

export function weeklyClaimRefCandidates(weekKey, challengeKey, version = POINTS_EARNING_POLICY_VERSION) {
  const week = normalizeWeek(weekKey);
  const key = String(challengeKey || '').trim();
  if (!week || !key) return [];
  return [`${week}:${key}`, `${week}:${version}:${key}`, weeklyClaimRef(week, key, version)];
}

export function checkinPointsForStreak(streak, version = POINTS_EARNING_POLICY_VERSION) {
  const safeStreak = Math.max(1, Math.trunc(Number(streak) || 1));
  if (!usesC5EarningRules(version)) return 20 + Math.min(safeStreak, 10);
  return CHECKIN_POINTS_POLICY.base + Math.min(Math.max(safeStreak - 1, 0), 5);
}

export function resolveDailyQuestStages(version = POINTS_EARNING_POLICY_VERSION) {
  if (!usesC5EarningRules(version)) {
    return [
      { key: 'basic', required: 2, exp: 5, points: 10, source: 'daily_quest_2' },
      { key: 'complete', required: 3, exp: 10, points: 20, source: 'daily_quest_3' },
    ];
  }
  return DAILY_POINTS_POLICY.map((stage) => ({ ...stage }));
}

export function resolveWeeklyChallenges(version = POINTS_EARNING_POLICY_VERSION) {
  if (!usesC5EarningRules(version)) {
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
  if (!achievement || !usesC5EarningRules(version)) return { ...(achievement || {}) };
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
    checkin: usesC5EarningRules(version) ? { ...CHECKIN_POINTS_POLICY } : { base: 20, maximum: 30 },
    daily,
    weekly,
    stableWeekMaximum:
      (usesC5EarningRules(version) ? 20 : 30) * 7 +
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
