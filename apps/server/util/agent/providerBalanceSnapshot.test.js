import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { query, getDeepSeekBalanceSpy } = vi.hoisted(() => ({
  query: vi.fn(),
  getDeepSeekBalanceSpy: vi.fn(),
}));

vi.mock('../../db/index.js', () => ({ default: { query } }));
vi.mock('./providerBalance.js', () => ({ getDeepSeekBalance: getDeepSeekBalanceSpy }));

const {
  aiBalanceDayKey,
  captureDailyDeepSeekBalanceSnapshot,
  ensureDailyDeepSeekBalanceSnapshot,
  getDeepSeekDailyBalanceChange,
  nextAiBalanceMidnightAt,
  stopAiBalanceSnapshotSchedulerForTest,
} = await import('./providerBalanceSnapshot.js');

const availableBalance = (totalBalance = '10.000000') => ({
  provider: 'deepseek',
  isAvailable: true,
  currency: 'CNY',
  totalBalance,
  grantedBalance: '2.000000',
  toppedUpBalance: '8.000000',
  balanceInfos: [
    {
      currency: 'CNY',
      totalBalance,
      grantedBalance: '2.000000',
      toppedUpBalance: '8.000000',
    },
  ],
});

const midnightSnapshot = (totalBalance = '10.000000') => ({
  provider: 'deepseek',
  currency: 'CNY',
  snapshot_day: '20260724',
  snapshot_kind: 'midnight',
  snapshot_at: '2026-07-24 00:00:05',
  total_balance: totalBalance,
  granted_balance: '2.000000',
  topped_up_balance: '8.000000',
});

describe('AI 供应商余额日快照', () => {
  beforeEach(() => {
    query.mockReset();
    getDeepSeekBalanceSpy.mockReset();
  });

  afterEach(() => {
    stopAiBalanceSnapshotSchedulerForTest();
  });

  it('按 Asia/Shanghai 业务日切换，并把下一次快照排在 00:00:05', () => {
    expect(aiBalanceDayKey(new Date('2026-07-24T15:59:59.000Z'))).toBe('20260724');
    expect(aiBalanceDayKey(new Date('2026-07-24T16:00:00.000Z'))).toBe('20260725');
    expect(nextAiBalanceMidnightAt(new Date('2026-07-24T12:00:00.000Z')).toISOString()).toBe(
      '2026-07-24T16:00:05.000Z',
    );
  });

  it('返回相对 0 点余额的带符号变化，不把余额下降显示成正向增长', async () => {
    query.mockResolvedValueOnce([[midnightSnapshot('10.000000')]]);

    const result = await getDeepSeekDailyBalanceChange(availableBalance('8.250000'), {
      now: new Date('2026-07-24T04:00:00.000Z'),
    });

    expect(result).toMatchObject({
      isAvailable: true,
      openingBalance: '10.000000',
      currentBalance: '8.250000',
      change: '-1.750000',
      direction: 'decrease',
      partialDay: false,
    });
  });

  it('当天没有 0 点快照时只创建一次 bootstrap 基线，并明确标记部分日', async () => {
    query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ ...midnightSnapshot('7.500000'), snapshot_kind: 'bootstrap' }]]);

    const result = await getDeepSeekDailyBalanceChange(availableBalance('7.500000'), {
      now: new Date('2026-07-24T04:00:00.000Z'),
    });

    expect(query.mock.calls[1][0]).toContain('INSERT IGNORE INTO ai_provider_balance_snapshots');
    expect(result).toMatchObject({
      isAvailable: true,
      change: '0.000000',
      partialDay: true,
      snapshotKind: 'bootstrap',
    });
  });

  it('上游只剩缓存且当天还没有基线时不写入错误的基线', async () => {
    query.mockResolvedValueOnce([[]]);

    const result = await getDeepSeekDailyBalanceChange({ ...availableBalance('7.500000'), stale: true }, {
      now: new Date('2026-07-24T04:00:00.000Z'),
    });

    expect(result).toEqual({ isAvailable: false, reason: 'baseline_pending' });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('账户明确不可用时不把零余额写成当天快照', async () => {
    const result = await ensureDailyDeepSeekBalanceSnapshot({ ...availableBalance('0'), isAvailable: false }, {
      now: new Date('2026-07-24T04:00:00.000Z'),
    });

    expect(result.entries).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('定时采集强制刷新供应商余额后写入快照', async () => {
    getDeepSeekBalanceSpy.mockResolvedValue(availableBalance('6.250000'));
    query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const result = await captureDailyDeepSeekBalanceSnapshot({
      now: new Date('2026-07-24T04:00:00.000Z'),
    });

    expect(getDeepSeekBalanceSpy).toHaveBeenCalledWith({ forceRefresh: true });
    expect(query.mock.calls[0][1][3]).toBe('bootstrap');
    expect(result).toMatchObject({ saved: true, snapshotDay: '20260724' });
  });
});
