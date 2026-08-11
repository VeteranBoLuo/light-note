import { describe, expect, it } from 'vitest';
import { filterTrendDataByRange } from './workbenchTrendRange';

const trendItems = Array.from({ length: 30 }, (_, index) => ({
  date: `08-${String(index + 1).padStart(2, '0')}`,
  value: index + 1,
}));

describe('工作台内容趋势范围', () => {
  it('默认近 7 天固定保留包含今天在内的 7 个节点', () => {
    const result = filterTrendDataByRange(trendItems, 'sevenDays');

    expect(result).toHaveLength(7);
    expect(result.map((item) => item.date)).toEqual([
      '08-24',
      '08-25',
      '08-26',
      '08-27',
      '08-28',
      '08-29',
      '08-30',
    ]);
  });

  it('近 30 天保留完整 30 个节点', () => {
    expect(filterTrendDataByRange(trendItems, 'month')).toEqual(trendItems);
  });
});
