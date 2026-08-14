import { describe, expect, it, vi } from 'vitest';
import {
  getPointsGovernanceSources,
  pointsGovernanceInternals,
  resolveGovernanceRange,
  simulatePointsPolicy,
} from './pointsGovernanceService.js';

describe('C5 积分治理时间窗与只读模拟器', () => {
  it('默认 28 天并拒绝超出 365 天的自定义范围', () => {
    expect(resolveGovernanceRange({}, new Date('2026-08-14T12:00:00Z'))).toEqual({
      startDate: '2026-07-18',
      endDate: '2026-08-14',
      endExclusive: '2026-08-15',
      days: 28,
    });
    expect(() => resolveGovernanceRange({ startDate: '2025-01-01', endDate: '2026-08-14' })).toThrowError(
      expect.objectContaining({ code: 'DATE_RANGE_TOO_LARGE' }),
    );
    expect(() => resolveGovernanceRange({ presetDays: 30 })).toThrowError(
      expect.objectContaining({ code: 'INVALID_RANGE_PRESET' }),
    );
  });

  it('默认 C5 稳定周产出保持 670，模拟器不接收数据库也没有写入入口', () => {
    const result = simulatePointsPolicy();
    expect(result).toMatchObject({
      readOnly: true,
      stableWeek: 670,
      disclaimer: 'simulation_only_no_production_write',
    });
    expect(result.tiers.map((row) => row.expectedWeek)).toEqual([670, 775, 880, 985]);
    expect(result.goalCycles.length).toBeGreaterThan(0);
  });

  it('模拟比例与整数边界失败关闭', () => {
    expect(() => simulatePointsPolicy({ activeRatio: 1.1 })).toThrowError(
      expect.objectContaining({ code: 'INVALID_SIMULATOR_INPUT' }),
    );
    expect(() => simulatePointsPolicy({ weeklyChallenges: -1 })).toThrowError(
      expect.objectContaining({ code: 'INVALID_SIMULATOR_INPUT' }),
    );
    const query = vi.fn();
    simulatePointsPolicy({ activeUsers: 10 });
    expect(query).not.toHaveBeenCalled();
  });

  it('用户流水分类只使用固定白名单 SQL，不接受任意 reason 片段', () => {
    expect(pointsGovernanceInternals.userLogFilter('stable')).toMatchObject({
      category: 'stable',
      sql: expect.stringContaining('reason IN'),
      params: ['checkin', 'quest', 'weekly'],
    });
    expect(pointsGovernanceInternals.userLogFilter('spent')).toEqual({
      category: 'spent',
      sql: ' AND delta < 0',
      params: [],
    });
    expect(() => pointsGovernanceInternals.userLogFilter("all' OR 1=1 --")).toThrowError(
      expect.objectContaining({ code: 'INVALID_LOG_CATEGORY' }),
    );
  });

  it('商品表现使用有界样本计算可证明指标，不伪造 AI 与空间使用归因', () => {
    const rows = pointsGovernanceInternals.buildProductPerformance(
      [
        {
          economyVersion: 'points-economy-c4',
          operationType: 'shop_buy',
          itemId: 'frame_neon',
          operations: 3,
          users: 2,
          spent: 4800,
          equippedUsers: 1,
        },
        {
          economyVersion: 'points-economy-c4',
          operationType: 'shop_buy',
          itemId: 'ai_pack',
          operations: 1,
          users: 1,
          spent: 420,
          equippedUsers: 0,
        },
      ],
      [
        {
          economyVersion: 'points-economy-c4',
          itemId: 'frame_neon',
          registrationDays: 20,
          preBalance: 2400,
          repurchasedWithin30d: 1,
        },
        {
          economyVersion: 'points-economy-c4',
          itemId: 'frame_neon',
          registrationDays: 40,
          preBalance: 3200,
          repurchasedWithin30d: 0,
        },
      ],
    );

    expect(rows[0]).toMatchObject({
      firstPurchaseRegistrationDaysP50: 20,
      prePurchaseBalanceP50: 2400,
      repurchase30dRatio: 50,
      frameWearRate: 50,
      aiUsage30dRate: null,
      storageGrowth30dMb: null,
    });
    expect(rows[1]).toMatchObject({
      aiUsage30dRate: null,
      usageAttributionStatus: 'awaiting_immutable_usage_attribution',
    });
  });

  it('商品样本只接纳历史首次兑换，并固定最多读取 5001 行', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]]);

    await getPointsGovernanceSources({ startDate: '2026-08-01', endDate: '2026-08-14' }, { db: { query } });

    expect(query).toHaveBeenCalledTimes(4);
    const [sampleSql, sampleParams] = query.mock.calls[3];
    expect(sampleSql).toContain('NOT EXISTS');
    expect(sampleSql).toContain('prior.create_time < candidate.create_time');
    expect(sampleSql).toContain('LIMIT 5001');
    expect(sampleParams).toEqual(['2026-08-01', '2026-08-15']);
  });
});
