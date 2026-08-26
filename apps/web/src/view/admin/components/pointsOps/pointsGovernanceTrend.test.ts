import { describe, expect, it } from 'vitest';
import { buildPointsGovernanceTrend } from './pointsGovernanceTrend';

describe('积分治理正负趋势图', () => {
  it('产出与消耗共用同一线性刻度，净发行按正负落在零轴两侧', () => {
    const chart = buildPointsGovernanceTrend([
      { day: '2026-08-01', issued: 120, spent: 30, net: 90 },
      { day: '2026-08-02', issued: 20, spent: 70, net: -50 },
    ]);

    expect(chart.hasActivity).toBe(true);
    expect(chart.points[0].issuedHeight / chart.points[0].spentHeight).toBeCloseTo(4);
    expect(chart.points[0].netY).toBeLessThan(chart.baselineY);
    expect(chart.points[1].netY).toBeGreaterThan(chart.baselineY);
    expect(chart.linePoints.split(' ')).toHaveLength(2);
  });

  it('零流水保持真实零高度，不再伪装成绿色最小柱', () => {
    const chart = buildPointsGovernanceTrend([{ day: '2026-08-01', issued: 0, spent: 0, net: 0 }]);

    expect(chart.hasActivity).toBe(false);
    expect(chart.baselineY).toBe(50);
    expect(chart.points[0]).toMatchObject({ issuedHeight: 0, spentHeight: 0, netY: 50 });
  });

  it('兼容尚未返回 issued 的旧响应，并由净发行加消耗还原总产出', () => {
    const chart = buildPointsGovernanceTrend([{ day: '2026-08-01', spent: 45, net: 75 }]);

    expect(chart.points[0]).toMatchObject({ issued: 120, spent: 45, net: 75, label: '08-01' });
  });
});
