import { describe, expect, it, vi } from 'vitest';
import {
  getPointsGovernanceAnomalies,
  getPointsGovernanceDailyDetails,
  getPointsGovernanceOverview,
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
    expect(() => resolveGovernanceRange({ startDate: '2026-02-30', endDate: '2026-03-01' })).toThrowError(
      expect.objectContaining({ code: 'INVALID_DATE_RANGE' }),
    );
  });

  it('治理自然日固定按北京时间解析，并补齐没有流水的日期', () => {
    const range = resolveGovernanceRange({ presetDays: 7 }, new Date('2026-08-26T16:30:00.000Z'));
    expect(range).toMatchObject({ startDate: '2026-08-21', endDate: '2026-08-27', endExclusive: '2026-08-28' });

    const trends = pointsGovernanceInternals.buildDailyTrends(
      resolveGovernanceRange({ startDate: '2026-08-01', endDate: '2026-08-03' }),
      [
        {
          day: '2026-08-02',
          issued: '120',
          stable: '60',
          oneTime: '10',
          random: '20',
          operations: '30',
          spent: '45',
          net: '75',
        },
      ],
    );
    expect(trends).toEqual([
      { day: '2026-08-01', issued: 0, stable: 0, oneTime: 0, random: 0, operations: 0, spent: 0, net: 0 },
      {
        day: '2026-08-02',
        issued: 120,
        stable: 60,
        oneTime: 10,
        random: 20,
        operations: 30,
        spent: 45,
        net: 75,
      },
      { day: '2026-08-03', issued: 0, stable: 0, oneTime: 0, random: 0, operations: 0, spent: 0, net: 0 },
    ]);
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
    expect(sampleParams).toEqual(['2026-08-01', '2026-08-15', 'root', 'test']);
  });

  it('健康总览返回普通有效账号的当前积分 Top 20，不按用户追加查询', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        [
          {
            issued: 100,
            spent: 20,
            stableIssued: 60,
            oneTimeIssued: 10,
            randomIssued: 20,
            operationsIssued: 10,
            freeRandomIssued: 5,
            earners: 3,
            spenders: 1,
            stableEarners: 2,
          },
        ],
      ])
      .mockResolvedValueOnce([[{ outstanding: 80, accounts: 3, zeroBalance: 0, maximum: 50 }]])
      .mockResolvedValueOnce([[{ p50: 20, p75: 30, p90: 50, p99: 50 }]])
      .mockResolvedValueOnce([[{ activeUsers: 3, over6000: 0, over16000: 0, over24000: 0 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([
        [
          {
            userId: 'u2',
            alias: '菠萝',
            email: 'user@example.com',
            points: 50,
            level: 6,
            lastActiveTime: '2026-08-14 12:00:00',
          },
        ],
      ]);

    const result = await getPointsGovernanceOverview({ presetDays: 28 }, { db: { query } });

    expect(query).toHaveBeenCalledTimes(6);
    const leaderboardSql = String(query.mock.calls[5][0]);
    expect(leaderboardSql).toContain('u.role NOT IN (?,?)');
    expect(leaderboardSql).toContain('u.del_flag = 0');
    expect(leaderboardSql).toContain('ORDER BY ug.points DESC');
    expect(leaderboardSql).toContain('LIMIT 20');
    const trendSql = String(query.mock.calls[4][0]);
    expect(trendSql).toContain("DATE_FORMAT(create_time, '%Y-%m-%d') AS day");
    expect(trendSql).toContain("GROUP BY DATE_FORMAT(create_time, '%Y-%m-%d')");
    expect(trendSql).toContain('CASE WHEN delta > 0 THEN delta ELSE 0 END');
    expect(result.balanceLeaderboard).toEqual([
      expect.objectContaining({ rank: 1, userId: 'u2', alias: '菠萝', points: 50, level: 6 }),
    ]);
    expect(result.filters.hideInternal).toBe(true);
    expect(query.mock.calls.every(([, params]) => Array.isArray(params))).toBe(true);
  });

  it('显式关闭过滤时保留内部账号，且不注入内部角色子查询', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]]);

    const result = await getPointsGovernanceSources(
      { startDate: '2026-08-01', endDate: '2026-08-14', hideInternal: false },
      { db: { query } },
    );

    expect(result.filters.hideInternal).toBe(false);
    expect(query.mock.calls.every(([sql]) => !String(sql).includes('internal_user'))).toBe(true);
    expect(query.mock.calls[3][1]).toEqual(['2026-08-01', '2026-08-15']);
  });

  it('异常规则也在聚合前排除内部账号与内部活动领取记录', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]]);

    const result = await getPointsGovernanceAnomalies(
      { startDate: '2026-08-01', endDate: '2026-08-14' },
      { db: { query } },
    );

    expect(result.filters.hideInternal).toBe(true);
    expect(query.mock.calls.every(([sql]) => String(sql).includes('internal_user.role IN (?,?)'))).toBe(true);
    expect(query.mock.calls.every(([, params]) => params.includes('root') && params.includes('test'))).toBe(true);
  });

  it('每日积分明细默认按北京时间倒序读取 50 条，并复用流水脱敏与内部账号口径', async () => {
    const rawRows = Array.from({ length: 51 }, (_, index) => ({
      id: 100 - index,
      userId: `user-${index}`,
      alias: index === 0 ? '示例用户' : null,
      email: `user-${index}@example.com`,
      delta: index === 0 ? 120 : -10,
      reason: index === 0 ? 'admin' : 'buy',
      ref: index === 0 ? 'private-ticket-and-note' : 'ai_pack',
      policyVersion: 'points-earning-c6',
      meta: index === 0 ? JSON.stringify({ note: 'private', ticketRef: 'T-001' }) : null,
      createTime: `2026-08-26 12:00:${String(59 - index).padStart(2, '0')}`,
    }));
    const query = vi.fn().mockResolvedValue([rawRows]);

    const result = await getPointsGovernanceDailyDetails({ day: '2026-08-26' }, { db: { query } });

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("DATE_FORMAT(pl.create_time, '%Y-%m-%d %H:%i:%s') AS createTime");
    expect(sql).toContain("pl.reason <> 'ach_unlock'");
    expect(sql).toContain('internal_user.role IN (?,?)');
    expect(sql).toContain('ORDER BY pl.create_time DESC, pl.id DESC');
    expect(sql).toContain('LIMIT 51');
    expect(params).toEqual(['2026-08-26', '2026-08-27', 'root', 'test']);
    expect(result).toMatchObject({
      day: '2026-08-26',
      pageSize: 50,
      hasMore: true,
      filters: { hideInternal: true },
    });
    expect(result.rows).toHaveLength(50);
    expect(result.rows[0]).toEqual(
      expect.objectContaining({
        id: 100,
        user: { userId: 'user-0', alias: '示例用户', email: 'user-0@example.com' },
        delta: 120,
        sourceType: 'admin',
        sourceKey: null,
        sourceRef: null,
      }),
    );
    expect(result.rows[0]).not.toHaveProperty('meta');
    expect(result.rows[0]).not.toHaveProperty('ref');
    expect(pointsGovernanceInternals.decodeDailyDetailCursor(result.nextCursor, '2026-08-26')).toEqual({
      id: 51,
      createTime: '2026-08-26 12:00:10',
    });
  });

  it('每日明细游标绑定日期并稳定续查，错误游标失败关闭', async () => {
    const cursor = pointsGovernanceInternals.encodeDailyDetailCursor({
      day: '2026-08-26',
      createTime: '2026-08-26 09:08:07',
      id: 88,
    });
    const query = vi.fn().mockResolvedValue([[]]);

    const result = await getPointsGovernanceDailyDetails(
      { day: '2026-08-26', cursor, hideInternal: false, limit: 999 },
      { db: { query } },
    );

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('(pl.create_time < ? OR (pl.create_time = ? AND pl.id < ?))');
    expect(sql).toContain('LIMIT 101');
    expect(sql).not.toContain('internal_user');
    expect(params).toEqual(['2026-08-26', '2026-08-27', '2026-08-26 09:08:07', '2026-08-26 09:08:07', 88]);
    expect(result).toMatchObject({ rows: [], pageSize: 100, hasMore: false, nextCursor: null });
    expect(() => pointsGovernanceInternals.decodeDailyDetailCursor(cursor, '2026-08-27')).toThrowError(
      expect.objectContaining({ code: 'INVALID_DAILY_DETAIL_CURSOR' }),
    );
    const outOfDayCursor = pointsGovernanceInternals.encodeDailyDetailCursor({
      day: '2026-08-26',
      createTime: '2026-08-27 00:00:00',
      id: 87,
    });
    expect(() => pointsGovernanceInternals.decodeDailyDetailCursor(outOfDayCursor, '2026-08-26')).toThrowError(
      expect.objectContaining({ code: 'INVALID_DAILY_DETAIL_CURSOR' }),
    );
    await expect(getPointsGovernanceDailyDetails({ day: '2026-02-30' }, { db: { query } })).rejects.toMatchObject({
      code: 'INVALID_DAILY_DETAIL_DAY',
    });
  });
});
