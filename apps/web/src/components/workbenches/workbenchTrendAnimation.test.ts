import { describe, expect, it } from 'vitest';
import {
  getTrendCurveSegments,
  getTrendMotionDirection,
  getTrendMotionPhase,
  getTrendMotionPoint,
  getTrendMotionProgress,
  getTrendSummaryTiming,
  TREND_CANVAS_KEYFRAMES,
  TREND_CANVAS_TIMING,
  TREND_SUMMARY_KEYFRAMES,
} from './workbenchTrendAnimation';

describe('workbenchTrendAnimation', () => {
  it('趋势画布从隐藏状态明确揭示到完整状态', () => {
    expect(TREND_CANVAS_KEYFRAMES[0]).toMatchObject({ opacity: 0.12, clipPath: 'inset(0 100% 0 0)' });
    expect(TREND_CANVAS_KEYFRAMES.at(-1)).toMatchObject({ opacity: 1, clipPath: 'inset(0 0 0 0)' });
    expect(TREND_CANVAS_TIMING.duration).toBe(1050);
  });

  it('概览卡片使用短距离上浮，并依次延迟入场', () => {
    expect(TREND_SUMMARY_KEYFRAMES).toEqual([
      { opacity: 0, transform: 'translateY(8px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ]);
    expect(getTrendSummaryTiming(0).delay).toBe(0);
    expect(getTrendSummaryTiming(2).delay).toBe(130);
  });

  it('移动节点沿同一条平滑曲线连续运动，不会逐点跳动', () => {
    const points = [
      { x: 0, y: 20 },
      { x: 100, y: 0 },
      { x: 200, y: 40 },
    ];

    expect(getTrendMotionPoint(points, 0.25)).toEqual({ x: 50, y: 7.5 });
    expect(getTrendMotionPoint(points, 0.75)).toEqual({ x: 150, y: 15 });
  });

  it('曲线在峰谷变号处不超出相邻真实数值', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 60 },
      { x: 200, y: 0 },
      { x: 300, y: 10 },
    ];
    const segments = getTrendCurveSegments(points);

    expect(segments).toHaveLength(3);
    segments.forEach((segment) => {
      const minimum = Math.min(segment.start.y, segment.end.y);
      const maximum = Math.max(segment.start.y, segment.end.y);
      for (let step = 0; step <= 20; step += 1) {
        const progress = step / 20;
        const inverse = 1 - progress;
        const y =
          inverse ** 3 * segment.start.y +
          3 * inverse ** 2 * progress * segment.control1.y +
          3 * inverse * progress ** 2 * segment.control2.y +
          progress ** 3 * segment.end.y;
        expect(y).toBeGreaterThanOrEqual(minimum - 0.000001);
        expect(y).toBeLessThanOrEqual(maximum + 0.000001);
      }
    });
  });

  it('移动节点使用余弦曲线缓慢往返，并在两端自然减速', () => {
    expect(getTrendMotionProgress(0)).toBe(0);
    expect(getTrendMotionProgress(Math.PI / 2)).toBeCloseTo(0.5);
    expect(getTrendMotionProgress(Math.PI)).toBe(1);
    expect(getTrendMotionProgress(Math.PI * 1.5)).toBeCloseTo(0.5);
    expect(getTrendMotionProgress(Math.PI * 2)).toBe(0);
  });

  it('悬浮结束后可按原方向从聚焦位置继续往返', () => {
    expect(getTrendMotionProgress(getTrendMotionPhase(0.25, 1))).toBeCloseTo(0.25);
    expect(getTrendMotionProgress(getTrendMotionPhase(0.25, -1))).toBeCloseTo(0.25);
    expect(Math.sin(getTrendMotionPhase(0.25, 1))).toBeGreaterThan(0);
    expect(Math.sin(getTrendMotionPhase(0.25, -1))).toBeLessThan(0);
  });

  it('按用户最后一次悬浮移动方向继续巡游', () => {
    expect(getTrendMotionDirection(0.7, 0.3, 1)).toBe(-1);
    expect(getTrendMotionDirection(0.3, 0.7, -1)).toBe(1);
    expect(getTrendMotionDirection(0.5, 0.5, -1)).toBe(-1);
  });
});
