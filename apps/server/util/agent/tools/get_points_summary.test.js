import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getUserPointsSummary } = vi.hoisted(() => ({ getUserPointsSummary: vi.fn() }));

vi.mock('../../pointsEarningAnalytics.js', () => ({ getUserPointsSummary }));

const { default: tool } = await import('./get_points_summary.js');

describe('get_points_summary Agent 工具', () => {
  beforeEach(() => getUserPointsSummary.mockReset());

  it('只读取服务端积分摘要，不自行修改目标或发放积分', async () => {
    const summary = {
      balance: 1200,
      today: { stableEarned: 40, randomEarned: 10, spent: 0 },
      week: { stableEarned: 300, randomEarned: 20, spent: 170 },
      last28Days: { stableEarned: 1800, oneTimeEarned: 100, randomEarned: 60, spent: 400 },
      goal: {
        enabled: true,
        item: { name: '星河' },
        price: 9000,
        shortfall: 7800,
        progress: 13,
        estimate: { minDays: 106, maxDays: 143 },
      },
      policyVersion: 'points-earning-c5',
      economyVersion: 'points-economy-c4',
    };
    getUserPointsSummary.mockResolvedValue(summary);
    await expect(tool.execute({}, { userId: 'u-1', userRole: 'user' })).resolves.toBe(summary);
    expect(getUserPointsSummary).toHaveBeenCalledWith('u-1', { userRole: 'user' });
    expect(tool.transform(summary)).toContain('按近 28 天稳定收入估算约 106～143 天');
    expect(tool.isWrite).not.toBe(true);
  });
});
