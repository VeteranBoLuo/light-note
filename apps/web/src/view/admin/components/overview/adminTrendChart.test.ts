import { describe, expect, it } from 'vitest';
import {
  buildAreaPoints,
  buildAxisTicks,
  buildHitAreas,
  buildLinePoints,
  normalizeTrendDays,
  resolveAxisMax,
  resolveTooltipAnchor,
  summarizeSeries,
} from './adminTrendChart';

describe('adminTrendChart', () => {
  it('优先使用新字段,缺失时回落到旧的 d/content', () => {
    const rows = normalizeTrendDays([
      { date: '2026-07-30', label: '07-30', users: 3, bookmarks: 2, notes: 1, files: 0, contentTotal: 3 },
      { d: '07-31', users: 1, content: 9 } as any,
    ]);
    expect(rows[0]).toMatchObject({ label: '07-30', contentTotal: 3, bookmarks: 2 });
    expect(rows[1]).toMatchObject({ label: '07-31', users: 1, contentTotal: 9 });
  });

  it('全零数据不产生除零,轴上界兜底为 1', () => {
    expect(resolveAxisMax([0, 0, 0])).toBe(1);
    expect(resolveAxisMax([])).toBe(1);
    expect(buildLinePoints([0, 0], 1)).toBe('0,42 100,42');
  });

  it('轴上界为峰值留出余量', () => {
    expect(resolveAxisMax([9])).toBeGreaterThanOrEqual(9);
    expect(resolveAxisMax([31])).toBeGreaterThanOrEqual(31);
  });

  it('刻度自上而下递减且首项等于上界', () => {
    const ticks = buildAxisTicks(40);
    expect(ticks[0]).toBe(40);
    expect(ticks[ticks.length - 1]).toBe(0);
    expect(ticks).toHaveLength(5);
  });

  it('单点数据落在中轴,不会画出畸形折线', () => {
    expect(buildLinePoints([5], 10)).toBe('50,21');
    expect(buildHitAreas(1)).toEqual([{ x: 0, width: 100 }]);
  });

  it('面积路径两端落到基线并闭合', () => {
    const area = buildAreaPoints([1, 2], 2);
    expect(area.startsWith('0,42 ')).toBe(true);
    expect(area.endsWith(' 100,42')).toBe(true);
  });

  it('摘要给出合计、日均与峰值日期', () => {
    const summary = summarizeSeries([1, 5, 3], ['07-29', '07-30', '07-31']);
    expect(summary).toEqual({ sum: 9, dailyAverage: 3, peakValue: 5, peakLabel: '07-30' });
  });

  it('空序列的摘要不产生 NaN', () => {
    expect(summarizeSeries([], [])).toEqual({ sum: 0, dailyAverage: 0, peakValue: 0, peakLabel: '' });
  });

  it('首尾 tooltip 收进容器内', () => {
    expect(resolveTooltipAnchor(0, 7).align).toBe('start');
    expect(resolveTooltipAnchor(6, 7).align).toBe('end');
    expect(resolveTooltipAnchor(3, 7).align).toBe('center');
  });

  it('命中区首尾各占半列,总宽不越界', () => {
    const areas = buildHitAreas(7);
    expect(areas[0].x).toBe(0);
    const last = areas[areas.length - 1];
    expect(Number((last.x + last.width).toFixed(2))).toBe(100);
  });
});
