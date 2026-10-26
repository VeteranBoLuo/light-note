import { PUBLIC_RESOURCE_ACHIEVEMENTS } from './publicResources/achievements.js';
import { describe, expect, it, vi } from 'vitest';
import {
  POINTS_EARNING_C7_POLICY_VERSION,
  POINTS_EARNING_C6_POLICY_VERSION,
  POINTS_EARNING_C8_POLICY_VERSION,
  POINTS_EARNING_C8_SNAPSHOT_MARKER,
  POINTS_EARNING_C5_MIGRATION_MARKERS,
  POINTS_EARNING_POLICY_VERSION,
  applyAchievementEarningPolicy,
  achievementPolicyVersionForRuntime,
  assertPointsEarningActivationReady,
  checkinPointsForStreak,
  dailyClaimRef,
  earningWritesEnabled,
  earningPolicyVersionForDay,
  earningPolicyVersionForWeek,
  getEarningPolicySnapshot,
  getPointsEarningRuntime,
  resolveDailyQuestStages,
  resolveWeeklyChallenges,
  weeklyClaimRef,
  usesC6DailyQuestCatalog,
} from './pointsEarningPolicy.js';
import { resolvePointsEarningPeriodVersion } from './pointsEarningPolicyState.js';

describe('pointsEarningPolicy', () => {
  it('keeps the approved public contribution budget across earning policies', () => {
    for (const version of ['legacy', POINTS_EARNING_POLICY_VERSION, POINTS_EARNING_C7_POLICY_VERSION, POINTS_EARNING_C8_POLICY_VERSION]) {
      const items = PUBLIC_RESOURCE_ACHIEVEMENTS.map((item) => applyAchievementEarningPolicy(item, version));
      expect(items.map((item) => item.reward)).toEqual([10, 30, 80, 150, 300]);
      expect(items.reduce((sum, item) => sum + item.reward, 0)).toBe(570);
      expect(items.at(-1)).toMatchObject({ target: 500, minLevel: 8 });
    }
  });
  const c8Runtime = () =>
    getPointsEarningRuntime({
      POINTS_EARNING_C5_ENABLED: 'true',
      POINTS_EARNING_C5_EFFECTIVE_DAY: '20260818',
      POINTS_EARNING_C5_EFFECTIVE_WEEK: '202634',
      POINTS_EARNING_C6_EFFECTIVE_DAY: '20260820',
      POINTS_EARNING_C7_EFFECTIVE_WEEK: '202639',
      POINTS_EARNING_C8_ENABLED: 'true',
      POINTS_EARNING_C8_EFFECTIVE_DAY: '20261026',
      POINTS_EARNING_C8_EFFECTIVE_WEEK: '202644',
    });

  it('C8 每日积分与经验一致，六项周任务共 120，稳定周上限 365', () => {
    const snapshot = getEarningPolicySnapshot(POINTS_EARNING_C8_POLICY_VERSION);
    expect(snapshot.daily.map(({ exp, points }) => [exp, points])).toEqual([
      [5, 5],
      [10, 10],
    ]);
    expect(snapshot.weekly.map(({ reward }) => reward)).toEqual([20, 25, 25, 20, 20, 10]);
    expect(snapshot.stableWeekMaximum).toBe(365);
    expect(checkinPointsForStreak(6, POINTS_EARNING_C8_POLICY_VERSION)).toBe(20);
    expect(usesC6DailyQuestCatalog(POINTS_EARNING_C8_POLICY_VERSION)).toBe(true);
    expect(dailyClaimRef('20261026', 3, POINTS_EARNING_C8_POLICY_VERSION)).toBe('daily:c8:20261026:3');
    expect(weeklyClaimRef('202644', 'wk_note', POINTS_EARNING_C8_POLICY_VERSION)).toBe('week:c8:202644:wk_note');
    expect(getEarningPolicySnapshot(POINTS_EARNING_C6_POLICY_VERSION).stableWeekMaximum).toBe(670);
    expect(getEarningPolicySnapshot(POINTS_EARNING_C7_POLICY_VERSION).stableWeekMaximum).toBe(690);
  });

  it('C8 只减半成就积分，资格不变，跨日周切换按各自锁定版本展示', () => {
    expect(
      applyAchievementEarningPolicy(
        { key: 'bookmark_500', reward: 400, minLevel: 8 },
        POINTS_EARNING_C8_POLICY_VERSION,
      ),
    ).toEqual({ key: 'bookmark_500', reward: 200, minLevel: 8 });
    expect(
      applyAchievementEarningPolicy({ key: 'streak_365', reward: 800 }, POINTS_EARNING_C8_POLICY_VERSION).reward,
    ).toBe(250);
    expect(
      getEarningPolicySnapshot(POINTS_EARNING_C8_POLICY_VERSION, {
        weeklyVersion: POINTS_EARNING_C7_POLICY_VERSION,
      }).stableWeekMaximum,
    ).toBe(515);
  });

  it('C8 暂停不回退，既有日周策略锁优先，避免同周期双领', async () => {
    const runtime = c8Runtime();
    expect(achievementPolicyVersionForRuntime(POINTS_EARNING_C6_POLICY_VERSION, runtime)).toBe(
      POINTS_EARNING_C8_POLICY_VERSION,
    );
    expect(achievementPolicyVersionForRuntime(POINTS_EARNING_C6_POLICY_VERSION, { ...runtime, c8Enabled: false })).toBe(
      POINTS_EARNING_C8_POLICY_VERSION,
    );
    expect(earningPolicyVersionForDay('20261025', runtime)).toBe(POINTS_EARNING_C6_POLICY_VERSION);
    expect(earningPolicyVersionForDay('20261026', runtime)).toBe(POINTS_EARNING_C8_POLICY_VERSION);
    expect(earningPolicyVersionForWeek('202643', runtime)).toBe(POINTS_EARNING_C7_POLICY_VERSION);
    const paused = { ...runtime, c8Enabled: false };
    expect(earningPolicyVersionForDay('20261026', paused)).toBe(POINTS_EARNING_C8_POLICY_VERSION);
    expect(earningPolicyVersionForWeek('202644', paused)).toBe(POINTS_EARNING_C8_POLICY_VERSION);
    expect(earningWritesEnabled(POINTS_EARNING_C8_POLICY_VERSION, runtime)).toBe(true);
    expect(earningWritesEnabled(POINTS_EARNING_C8_POLICY_VERSION, paused)).toBe(false);
    for (const [type, key, version] of [
      ['day', '20261026', POINTS_EARNING_C6_POLICY_VERSION],
      ['week', '202644', POINTS_EARNING_C7_POLICY_VERSION],
    ]) {
      const db = { query: vi.fn().mockResolvedValue([[{ policyVersion: version }]]) };
      expect(await resolvePointsEarningPeriodVersion(type, key, { db, lock: true, runtime })).toBe(version);
      expect(db.query).toHaveBeenCalledTimes(1);
    }
  });

  it('C8 必须有完整新日周边界和旧成就快照准备标记', async () => {
    const runtime = c8Runtime();
    await expect(
      assertPointsEarningActivationReady({ db: { query: vi.fn() }, runtime: { ...runtime, c8EffectiveWeek: null } }),
    ).rejects.toMatchObject({ code: 'POINTS_EARNING_C8_BOUNDARY_REQUIRED' });
    const baseMarkers = POINTS_EARNING_C5_MIGRATION_MARKERS.map((migrationKey) => ({ migrationKey }));
    const db = { query: vi.fn().mockResolvedValueOnce([baseMarkers]).mockResolvedValueOnce([[]]) };
    await expect(assertPointsEarningActivationReady({ db, runtime })).rejects.toMatchObject({
      code: 'POINTS_EARNING_C8_SNAPSHOT_REQUIRED',
    });
    db.query
      .mockResolvedValueOnce([baseMarkers])
      .mockResolvedValueOnce([[{ migration_key: POINTS_EARNING_C8_SNAPSHOT_MARKER }]]);
    await expect(assertPointsEarningActivationReady({ db, runtime })).resolves.toBe(true);
  });

  it('固定 C5 版本与完整数值快照', () => {
    expect(POINTS_EARNING_POLICY_VERSION).toBe('points-earning-c5');
    expect(Array.from({ length: 10 }, (_, index) => checkinPointsForStreak(index + 1))).toEqual([
      15, 16, 17, 18, 19, 20, 20, 20, 20, 20,
    ]);
    expect(resolveDailyQuestStages().map(({ points }) => points)).toEqual([15, 25]);
    expect(resolveWeeklyChallenges().reduce((sum, item) => sum + item.reward, 0)).toBe(250);
    expect(getEarningPolicySnapshot().stableWeekMaximum).toBe(670);
  });

  it('激活写入要求完整日周边界，用户积分中心可单独灰度', async () => {
    await expect(
      assertPointsEarningActivationReady({
        db: { query: vi.fn() },
        runtime: {
          enabled: true,
          adminGovernanceEnabled: false,
          campaignEnabled: false,
          effectiveDay: null,
          effectiveWeek: '202633',
        },
      }),
    ).rejects.toMatchObject({ code: 'POINTS_EARNING_C5_EFFECTIVE_BOUNDARY_REQUIRED' });

    const db = { query: vi.fn() };
    await expect(
      assertPointsEarningActivationReady({
        db,
        runtime: {
          enabled: false,
          adminGovernanceEnabled: false,
          campaignEnabled: false,
          pointsCenterEnabled: true,
          effectiveDay: null,
          effectiveWeek: null,
        },
      }),
    ).resolves.toBe(true);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('开启治理时缺任一迁移标记都失败关闭', async () => {
    const db = { query: vi.fn().mockResolvedValue([[{ migrationKey: 'points-earning-c5-baseline-v1' }]]) };
    await expect(
      assertPointsEarningActivationReady({
        db,
        runtime: {
          enabled: false,
          adminGovernanceEnabled: true,
          campaignEnabled: false,
          effectiveDay: null,
          effectiveWeek: null,
        },
      }),
    ).rejects.toMatchObject({ code: 'POINTS_EARNING_C5_MIGRATION_REQUIRED' });
  });

  it('Campaign 依赖治理台、迁移标记和显式安全上限', async () => {
    const completeMarkers = [
      { migrationKey: 'points-earning-c5-achievement-snapshots-v1' },
      { migrationKey: 'points-earning-c5-meaningful-activity-v1' },
      { migrationKey: 'points-earning-c5-baseline-v1' },
    ];
    const db = { query: vi.fn().mockResolvedValue([completeMarkers]) };
    await expect(
      assertPointsEarningActivationReady({
        db,
        runtime: {
          enabled: false,
          adminGovernanceEnabled: false,
          campaignEnabled: true,
          effectiveDay: null,
          effectiveWeek: null,
        },
        campaignRuntime: { ready: true },
      }),
    ).rejects.toMatchObject({ code: 'POINTS_CAMPAIGN_GOVERNANCE_REQUIRED' });

    await expect(
      assertPointsEarningActivationReady({
        db,
        runtime: {
          enabled: false,
          adminGovernanceEnabled: true,
          campaignEnabled: true,
          effectiveDay: null,
          effectiveWeek: null,
        },
        campaignRuntime: { ready: false },
      }),
    ).rejects.toMatchObject({ code: 'POINTS_CAMPAIGN_LIMITS_REQUIRED' });
  });

  it('C5 连签成就覆盖合计 820，历史目录保持原奖励', () => {
    const legacy = [
      ['streak_1', 10],
      ['streak_7', 50],
      ['streak_30', 120],
      ['streak_100', 300],
      ['streak_365', 800],
    ];
    const values = legacy.map(([key, reward]) => applyAchievementEarningPolicy({ key, reward }).reward);
    expect(values).toEqual([10, 30, 80, 200, 500]);
    expect(values.reduce((sum, reward) => sum + reward, 0)).toBe(820);
  });

  it('严格按全局日/周边界选择策略，非法开关失败关闭', () => {
    const runtime = getPointsEarningRuntime({
      POINTS_EARNING_C5_ENABLED: 'true',
      POINTS_EARNING_C5_EFFECTIVE_DAY: '20260818',
      POINTS_EARNING_C5_EFFECTIVE_WEEK: '202634',
    });
    expect(earningPolicyVersionForDay('20260817', runtime)).toBe('points-earning-legacy');
    expect(earningPolicyVersionForDay('20260818', runtime)).toBe('points-earning-c5');
    expect(earningPolicyVersionForWeek('202633', runtime)).toBe('points-earning-legacy');
    expect(earningPolicyVersionForWeek('202634', runtime)).toBe('points-earning-c5');
    expect(getPointsEarningRuntime({ POINTS_EARNING_C5_ENABLED: 'surprise' }).enabled).toBe(false);
  });

  it('C6 只在新的完整自然日切换任务，复用 C5 奖励并使用独立领取 ref', () => {
    const runtime = getPointsEarningRuntime({
      POINTS_EARNING_C5_ENABLED: 'true',
      POINTS_EARNING_C5_EFFECTIVE_DAY: '20260818',
      POINTS_EARNING_C5_EFFECTIVE_WEEK: '202634',
      POINTS_EARNING_C6_ENABLED: 'true',
      POINTS_EARNING_C6_EFFECTIVE_DAY: '20260820',
    });

    expect(earningPolicyVersionForDay('20260819', runtime)).toBe('points-earning-c5');
    expect(earningPolicyVersionForDay('20260820', runtime)).toBe(POINTS_EARNING_C6_POLICY_VERSION);
    expect(resolveDailyQuestStages(POINTS_EARNING_C6_POLICY_VERSION).map(({ points }) => points)).toEqual([15, 25]);
    expect(checkinPointsForStreak(6, POINTS_EARNING_C6_POLICY_VERSION)).toBe(20);
    expect(dailyClaimRef('20260820', 3, POINTS_EARNING_C6_POLICY_VERSION)).toBe('daily:c6:20260820:3');
    expect(earningWritesEnabled(POINTS_EARNING_C6_POLICY_VERSION, runtime)).toBe(true);
    expect(earningWritesEnabled(undefined, runtime)).toBe(true);
    expect(earningWritesEnabled('points-earning-future', runtime)).toBe(false);
    expect(
      earningWritesEnabled(
        POINTS_EARNING_C6_POLICY_VERSION,
        getPointsEarningRuntime({
          POINTS_EARNING_C5_ENABLED: 'true',
          POINTS_EARNING_C6_ENABLED: 'false',
          POINTS_EARNING_C6_EFFECTIVE_DAY: '20260820',
        }),
      ),
    ).toBe(false);
  });

  it('C6 写闸要求 C5 基础开关和合法的新日边界', async () => {
    await expect(
      assertPointsEarningActivationReady({
        db: { query: vi.fn() },
        runtime: getPointsEarningRuntime({
          POINTS_EARNING_C6_ENABLED: 'true',
          POINTS_EARNING_C6_EFFECTIVE_DAY: '20260820',
        }),
      }),
    ).rejects.toMatchObject({ code: 'POINTS_EARNING_C6_EFFECTIVE_BOUNDARY_REQUIRED' });

    await expect(
      assertPointsEarningActivationReady({
        db: { query: vi.fn() },
        runtime: getPointsEarningRuntime({
          POINTS_EARNING_C5_ENABLED: 'true',
          POINTS_EARNING_C5_EFFECTIVE_DAY: '20260820',
          POINTS_EARNING_C5_EFFECTIVE_WEEK: '202634',
          POINTS_EARNING_C6_EFFECTIVE_DAY: '20260819',
        }),
      }),
    ).rejects.toMatchObject({ code: 'POINTS_EARNING_C6_BOUNDARY_INVALID' });
  });

  it('未配置边界不查锁表；配置边界后读取既有版本且不因暂停回退', async () => {
    const dbWithoutBoundary = { query: vi.fn() };
    await expect(
      resolvePointsEarningPeriodVersion('day', '20260818', {
        db: dbWithoutBoundary,
        lock: true,
        runtime: getPointsEarningRuntime({}),
      }),
    ).resolves.toBe('points-earning-legacy');
    expect(dbWithoutBoundary.query).not.toHaveBeenCalled();

    const pausedRuntime = getPointsEarningRuntime({
      POINTS_EARNING_C5_ENABLED: 'false',
      POINTS_EARNING_C5_EFFECTIVE_DAY: '20260818',
    });
    const db = { query: vi.fn().mockResolvedValueOnce([[{ policyVersion: 'points-earning-c5' }]]) };
    await expect(resolvePointsEarningPeriodVersion('day', '20260818', { db, runtime: pausedRuntime })).resolves.toBe(
      'points-earning-c5',
    );

    const c6Runtime = getPointsEarningRuntime({
      POINTS_EARNING_C5_ENABLED: 'true',
      POINTS_EARNING_C5_EFFECTIVE_DAY: '20260818',
      POINTS_EARNING_C5_EFFECTIVE_WEEK: '202634',
      POINTS_EARNING_C6_ENABLED: 'false',
      POINTS_EARNING_C6_EFFECTIVE_DAY: '20260820',
    });
    const c6Db = { query: vi.fn().mockResolvedValueOnce([[{ policyVersion: 'points-earning-c6' }]]) };
    await expect(resolvePointsEarningPeriodVersion('day', '20260820', { db: c6Db, runtime: c6Runtime })).resolves.toBe(
      'points-earning-c6',
    );
  });
  it('adds posting only in the new weekly version and never rolls back on pause', async () => {
    const runtime = getPointsEarningRuntime({
      POINTS_EARNING_C5_ENABLED: 'true',
      POINTS_EARNING_C5_EFFECTIVE_DAY: '20260901',
      POINTS_EARNING_C5_EFFECTIVE_WEEK: '202636',
      POINTS_EARNING_C7_EFFECTIVE_WEEK: '202639',
      POINTS_EARNING_C7_ENABLED: 'true',
    });
    expect(earningPolicyVersionForWeek('202638', runtime)).toBe(POINTS_EARNING_POLICY_VERSION);
    expect(earningPolicyVersionForWeek('202639', runtime)).toBe(POINTS_EARNING_C7_POLICY_VERSION);
    expect(resolveWeeklyChallenges(POINTS_EARNING_POLICY_VERSION).some((x) => x.key === 'wk_community')).toBe(false);
    expect(
      resolveWeeklyChallenges(POINTS_EARNING_C7_POLICY_VERSION).find((x) => x.key === 'wk_community'),
    ).toMatchObject({ target: 1, reward: 20 });
    expect(getEarningPolicySnapshot(POINTS_EARNING_C7_POLICY_VERSION).stableWeekMaximum).toBe(690);
    expect(earningPolicyVersionForWeek('202639', { ...runtime, c7Enabled: false })).toBe(
      POINTS_EARNING_C7_POLICY_VERSION,
    );
    expect(earningWritesEnabled(POINTS_EARNING_C7_POLICY_VERSION, { ...runtime, c7Enabled: false })).toBe(false);
    const db = { query: vi.fn().mockResolvedValue([[{ policyVersion: POINTS_EARNING_POLICY_VERSION }]]) };
    expect(await resolvePointsEarningPeriodVersion('week', '202639', { db, runtime })).toBe(
      POINTS_EARNING_POLICY_VERSION,
    );
  });
});
