import { describe, expect, it, vi } from 'vitest';
import {
  POINTS_EARNING_POLICY_VERSION,
  applyAchievementEarningPolicy,
  assertPointsEarningC5ActivationReady,
  checkinPointsForStreak,
  earningPolicyVersionForDay,
  earningPolicyVersionForWeek,
  getEarningPolicySnapshot,
  getPointsEarningRuntime,
  resolveDailyQuestStages,
  resolveWeeklyChallenges,
} from './pointsEarningPolicy.js';
import { resolvePointsEarningPeriodVersion } from './pointsEarningPolicyState.js';

describe('pointsEarningPolicy', () => {
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
      assertPointsEarningC5ActivationReady({
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
      assertPointsEarningC5ActivationReady({
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
      assertPointsEarningC5ActivationReady({
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
      assertPointsEarningC5ActivationReady({
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
      assertPointsEarningC5ActivationReady({
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

  it('成就覆盖总量为 7850 且连签合计 820', () => {
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
    expect(8310 - (1280 - 820)).toBe(7850);
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
  });
});
