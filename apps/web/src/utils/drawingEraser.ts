import type { DrawingElement, DrawingStrokeElement } from '@lightnote/shared/drawing-note';
import { drawingShapeTouchesCircle } from './drawingShape';
import { drawingFillTouchesCircle } from './drawingFill';

export interface DrawingPoint {
  x: number;
  y: number;
}

export interface DrawingEraserLimits {
  maxErasureTrails: number;
  maxErasurePointPairs: number;
}

interface StrokeBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const strokeBoundsCache = new WeakMap<DrawingStrokeElement, StrokeBounds>();
const EPSILON = 0.01;

function strokeBounds(stroke: DrawingStrokeElement): StrokeBounds {
  const cached = strokeBoundsCache.get(stroke);
  if (cached) return cached;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let index = 0; index < stroke.points.length; index += 2) {
    minX = Math.min(minX, stroke.points[index]);
    minY = Math.min(minY, stroke.points[index + 1]);
    maxX = Math.max(maxX, stroke.points[index]);
    maxY = Math.max(maxY, stroke.points[index + 1]);
  }
  const bounds = { minX, minY, maxX, maxY };
  strokeBoundsCache.set(stroke, bounds);
  return bounds;
}

function segmentDistanceToPoint(points: number[], offset: number, point: DrawingPoint) {
  const x1 = points[offset];
  const y1 = points[offset + 1];
  const dx = points[offset + 2] - x1;
  const dy = points[offset + 3] - y1;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= EPSILON * EPSILON) return Math.hypot(point.x - x1, point.y - y1);
  const ratio = Math.max(0, Math.min(1, ((point.x - x1) * dx + (point.y - y1) * dy) / lengthSquared));
  return Math.hypot(point.x - (x1 + dx * ratio), point.y - (y1 + dy * ratio));
}

function strokeTouchesEraser(stroke: DrawingStrokeElement, center: DrawingPoint, radius: number) {
  const hitRadius = radius + stroke.width / 2;
  const bounds = strokeBounds(stroke);
  if (
    center.x + hitRadius < bounds.minX ||
    center.x - hitRadius > bounds.maxX ||
    center.y + hitRadius < bounds.minY ||
    center.y - hitRadius > bounds.maxY
  ) {
    return false;
  }
  if (stroke.points.length === 2) {
    return Math.hypot(center.x - stroke.points[0], center.y - stroke.points[1]) <= hitRadius;
  }
  for (let offset = 0; offset + 3 < stroke.points.length; offset += 2) {
    if (segmentDistanceToPoint(stroke.points, offset, center) <= hitRadius) return true;
  }
  return false;
}

function erasureCounts(elements: readonly DrawingElement[]) {
  let trails = 0;
  let pointPairs = 0;
  elements.forEach((element) => {
    if (element.kind === 'text') return;
    trails += element.erasures?.length || 0;
    pointPairs += element.erasures?.reduce((count, trail) => count + trail.points.length / 2, 0) || 0;
  });
  return { trails, pointPairs };
}

/**
 * 把橡皮轨迹作为仅属于目标笔画或形状的像素遮罩保存。遮罩不会切断中心线，
 * 因此小橡皮点击粗线条时只形成同尺寸圆孔，也不会擦穿其下方的其他元素。
 */
export function eraseDrawingElementsAt(
  elements: DrawingElement[],
  center: DrawingPoint,
  eraserWidth: number,
  erasureId: string,
  limits: DrawingEraserLimits = {
    maxErasureTrails: Number.POSITIVE_INFINITY,
    maxErasurePointPairs: Number.POSITIVE_INFINITY,
  },
) {
  let changed = false;
  let addedTrails = 0;
  let addedPointPairs = 0;
  const nextElements = elements.map((element) => {
    if (element.kind === 'text') return element;
    const touches =
      element.kind === 'stroke'
        ? strokeTouchesEraser(element, center, eraserWidth / 2)
        : element.kind === 'shape'
          ? drawingShapeTouchesCircle(element, center, eraserWidth / 2)
          : drawingFillTouchesCircle(element, center, eraserWidth / 2);
    if (!touches) return element;
    const erasures = element.erasures || [];
    const trailIndex = erasures.findIndex((trail) => trail.id === erasureId);
    if (trailIndex < 0) {
      changed = true;
      addedTrails += 1;
      addedPointPairs += 1;
      return {
        ...element,
        erasures: [...erasures, { id: erasureId, width: eraserWidth, points: [center.x, center.y] }],
      };
    }

    const trail = erasures[trailIndex];
    const lastX = trail.points.at(-2) ?? center.x;
    const lastY = trail.points.at(-1) ?? center.y;
    // 相邻采样点过密只会膨胀 scene，不会增加可见擦除面积。
    if (Math.hypot(center.x - lastX, center.y - lastY) < Math.max(0.8, eraserWidth * 0.08)) return element;
    changed = true;
    addedPointPairs += 1;
    const nextErasures = [...erasures];
    nextErasures[trailIndex] = { ...trail, points: [...trail.points, center.x, center.y] };
    return { ...element, erasures: nextErasures };
  });

  if (!changed) return { elements, changed: false, limitReached: false };
  const counts = erasureCounts(elements);
  if (
    counts.trails + addedTrails > limits.maxErasureTrails ||
    counts.pointPairs + addedPointPairs > limits.maxErasurePointPairs
  ) {
    return { elements, changed: false, limitReached: true };
  }
  return { elements: nextElements, changed: true, limitReached: false };
}
