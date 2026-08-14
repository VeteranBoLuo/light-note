import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { pointsEarningAnalyticsInternals } from './pointsEarningAnalytics.js';

describe('用户积分目标估算', () => {
  it('只使用近 28 天稳定收入估算并给出区间', () => {
    expect(
      pointsEarningAnalyticsInternals.estimateGoal({
        balance: 1000,
        price: 3000,
        stable28: 2680,
        lowPressureMode: false,
      }),
    ).toEqual({
      price: 3000,
      balance: 1000,
      shortfall: 2000,
      progress: 33,
      estimate: {
        minDays: 19,
        maxDays: 25,
        basedOnDays: 28,
        stableDailyAverage: 95.7,
        disclaimer: 'stable_only_no_future_spending_or_random',
      },
    });
  });

  it('低压力模式隐藏到达天数，下架或已达成目标安全降级', () => {
    expect(
      pointsEarningAnalyticsInternals.estimateGoal({
        balance: 100,
        price: 3000,
        stable28: 2680,
        lowPressureMode: true,
      }),
    ).toMatchObject({ estimate: null, progress: 3 });
    expect(
      pointsEarningAnalyticsInternals.estimateGoal({ balance: 3000, price: 3000, stable28: 0, lowPressureMode: false }),
    ).toMatchObject({ shortfall: 0, progress: 100, estimate: null });
    expect(
      pointsEarningAnalyticsInternals.estimateGoal({ balance: 1, price: 0, stable28: 10, lowPressureMode: false }),
    ).toBeNull();
  });

  it('用户摘要的所有聚合都在 SQL WHERE 层限制为近 28 天', async () => {
    const source = await readFile(fileURLToPath(new URL('./pointsEarningAnalytics.js', import.meta.url)), 'utf8');
    expect(source).toContain('WHERE user_id = ? AND create_time >= DATE_SUB(NOW(), INTERVAL 28 DAY)');
  });
});
