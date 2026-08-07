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

export function getTrendMotionPoint(points: Array<{ x: number; y: number }>, progress: number) {
  if (!points.length) return null;
  if (points.length === 1) return { ...points[0] };

  const normalizedProgress = Math.min(Math.max(progress, 0), 1);
  const position = normalizedProgress * (points.length - 1);
  const startIndex = Math.min(Math.floor(position), points.length - 2);
  const segmentProgress = position - startIndex;
  const start = points[startIndex];
  const end = points[startIndex + 1];
  return {
    x: start.x + (end.x - start.x) * segmentProgress,
    y: start.y + (end.y - start.y) * segmentProgress,
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
