export const TREND_CANVAS_KEYFRAMES: Keyframe[] = [
  {
    offset: 0,
    opacity: 0.12,
    clipPath: 'inset(0 100% 0 0)',
    transform: 'translateY(7px)',
  },
  {
    offset: 0.78,
    opacity: 1,
    clipPath: 'inset(0 0 0 0)',
    transform: 'translateY(0)',
  },
  {
    offset: 1,
    opacity: 1,
    clipPath: 'inset(0 0 0 0)',
    transform: 'translateY(0)',
  },
];

export const TREND_CANVAS_TIMING: KeyframeAnimationOptions = {
  duration: 1050,
  easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
};

export const TREND_MOTION_ONE_WAY_DURATION = 14000;
export const TREND_MOTION_START_DELAY = 650;

export interface TrendCurveSegment {
  start: { x: number; y: number };
  control1: { x: number; y: number };
  control2: { x: number; y: number };
  end: { x: number; y: number };
}

/**
 * 用单调三次 Hermite 曲线连接趋势点。
 *
 * 工作台数据常见 0 → 峰值 → 0；普通 Catmull-Rom / 贝塞尔曲线会在峰谷处
 * 越过真实数值。这里在相邻斜率变号时把切线压到 0，同向时使用加权调和均值，
 * 因而既保留曲线的柔和感，也不会凭空画出负数或高于局部峰值的走势。
 */
export function getTrendCurveSegments(points: Array<{ x: number; y: number }>): TrendCurveSegment[] {
  if (points.length < 2) return [];

  const widths = points.slice(0, -1).map((point, index) => points[index + 1].x - point.x);
  const secants = widths.map((width, index) =>
    width > 0 && Number.isFinite(width) ? (points[index + 1].y - points[index].y) / width : 0,
  );
  const slopes = points.map((_point, index) => {
    if (index === 0) return secants[0] || 0;
    if (index === points.length - 1) return secants.at(-1) || 0;

    const previous = secants[index - 1];
    const next = secants[index];
    if (!previous || !next || previous * next <= 0) return 0;

    const previousWidth = widths[index - 1];
    const nextWidth = widths[index];
    const weight1 = 2 * nextWidth + previousWidth;
    const weight2 = nextWidth + 2 * previousWidth;
    return (weight1 + weight2) / (weight1 / previous + weight2 / next);
  });

  return points.slice(0, -1).map((start, index) => {
    const end = points[index + 1];
    const width = widths[index];
    if (!(width > 0) || !Number.isFinite(width)) {
      return { start, control1: start, control2: end, end };
    }
    return {
      start,
      control1: { x: start.x + width / 3, y: start.y + (slopes[index] * width) / 3 },
      control2: { x: end.x - width / 3, y: end.y - (slopes[index + 1] * width) / 3 },
      end,
    };
  });
}

export function getTrendMotionPoint(points: Array<{ x: number; y: number }>, progress: number) {
  if (!points.length) return null;
  if (points.length === 1) return { ...points[0] };

  const normalizedProgress = Math.min(Math.max(progress, 0), 1);
  const position = normalizedProgress * (points.length - 1);
  const startIndex = Math.min(Math.floor(position), points.length - 2);
  const segmentProgress = position - startIndex;
  const segment = getTrendCurveSegments(points)[startIndex];
  if (!segment) return { ...points[startIndex] };
  const inverse = 1 - segmentProgress;
  return {
    x:
      inverse ** 3 * segment.start.x +
      3 * inverse ** 2 * segmentProgress * segment.control1.x +
      3 * inverse * segmentProgress ** 2 * segment.control2.x +
      segmentProgress ** 3 * segment.end.x,
    y:
      inverse ** 3 * segment.start.y +
      3 * inverse ** 2 * segmentProgress * segment.control1.y +
      3 * inverse * segmentProgress ** 2 * segment.control2.y +
      segmentProgress ** 3 * segment.end.y,
  };
}

export function getTrendMotionProgress(phase: number) {
  return (1 - Math.cos(phase)) / 2;
}

export function getTrendMotionPhase(progress: number, direction: 1 | -1) {
  const normalizedProgress = Math.min(Math.max(progress, 0), 1);
  const forwardPhase = Math.acos(1 - normalizedProgress * 2);
  return direction === 1 ? forwardPhase : Math.PI * 2 - forwardPhase;
}

export function getTrendMotionDirection(fromProgress: number, toProgress: number, fallback: 1 | -1): 1 | -1 {
  const difference = toProgress - fromProgress;
  if (difference > 0.0001) return 1;
  if (difference < -0.0001) return -1;
  return fallback;
}

export const TREND_SUMMARY_KEYFRAMES: Keyframe[] = [
  { opacity: 0, transform: 'translateY(8px)' },
  { opacity: 1, transform: 'translateY(0)' },
];

export function getTrendSummaryTiming(index: number): KeyframeAnimationOptions {
  return {
    duration: 430,
    delay: Math.max(0, index) * 65,
    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    fill: 'backwards',
  };
}
