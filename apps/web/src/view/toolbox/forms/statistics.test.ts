import { expect, it } from 'vitest';
import { buildTrend } from './statistics';
it('补齐选择范围的零提交日期且只统计范围内的数据', () => {
  const bins = buildTrend(
    [
      { day: '2026-09-24', count: 2 },
      { day: '2026-09-25', count: 9 },
    ],
    '2026-09-18',
    '2026-09-24',
  );
  expect(bins.map((p) => p.count)).toEqual([0, 0, 0, 0, 0, 0, 2]);
});
it('长日期范围限制柱数并保留总数和区间标签', () => {
  const bins = buildTrend(
    [
      { day: '2026-01-01', count: 2 },
      { day: '2026-12-31', count: 3 },
    ],
    '2026-01-01',
    '2026-12-31',
  );
  expect(bins.length).toBeLessThanOrEqual(31);
  expect(bins.reduce((n, p) => n + p.count, 0)).toBe(5);
  expect(bins[0].label).toContain(' – ');
});
it('非法或倒置日期不生成图表', () => {
  expect(buildTrend([], 'bad', '2026-01-01')).toEqual([]);
  expect(buildTrend([], '2026-01-02', '2026-01-01')).toEqual([]);
});
