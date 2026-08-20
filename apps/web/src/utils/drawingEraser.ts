import type { DrawingElement, DrawingStrokeElement } from '@lightnote/shared/drawing-note';

export interface DrawingPoint {
  x: number;
  y: number;
}

export interface DrawingEraserLimits {
  maxElements: number;
  maxStrokes: number;
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

function pointAt(points: number[], offset: number, ratio: number): DrawingPoint {
  return {
    x: points[offset] + (points[offset + 2] - points[offset]) * ratio,
    y: points[offset + 1] + (points[offset + 3] - points[offset + 1]) * ratio,
  };
}

function isInside(point: DrawingPoint, center: DrawingPoint, radius: number) {
  return Math.hypot(point.x - center.x, point.y - center.y) < radius;
}

/** 返回线段落在橡皮擦圆形区域外的参数区间。 */
function outsideIntervals(points: number[], offset: number, center: DrawingPoint, radius: number) {
  const x1 = points[offset];
  const y1 = points[offset + 1];
  const dx = points[offset + 2] - x1;
  const dy = points[offset + 3] - y1;
  const a = dx * dx + dy * dy;
  if (a <= EPSILON * EPSILON) {
    return isInside({ x: x1, y: y1 }, center, radius) ? [] : [[0, 1] as const];
  }
  const relativeX = x1 - center.x;
  const relativeY = y1 - center.y;
  const b = 2 * (relativeX * dx + relativeY * dy);
  const c = relativeX * relativeX + relativeY * relativeY - radius * radius;
  const discriminant = b * b - 4 * a * c;
  const boundaries = [0, 1];
  if (discriminant > EPSILON) {
    const root = Math.sqrt(discriminant);
    const first = (-b - root) / (2 * a);
    const second = (-b + root) / (2 * a);
    if (first > 0 && first < 1) boundaries.push(first);
    if (second > 0 && second < 1) boundaries.push(second);
  }
  boundaries.sort((left, right) => left - right);
  const result: Array<readonly [number, number]> = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    if (end - start <= EPSILON) continue;
    if (!isInside(pointAt(points, offset, (start + end) / 2), center, radius)) result.push([start, end]);
  }
  return result;
}

function appendPoint(target: number[], point: DrawingPoint) {
  const lastX = target.at(-2);
  const lastY = target.at(-1);
  if (lastX !== undefined && lastY !== undefined && Math.hypot(lastX - point.x, lastY - point.y) <= EPSILON) return;
  target.push(point.x, point.y);
}

function eraseStroke(stroke: DrawingStrokeElement, center: DrawingPoint, radius: number) {
  // 橡皮擦光标表示中心线裁切范围。若再叠加 stroke.width / 2，光标仅擦到粗笔画下沿时，
  // 整条矢量中心线也会被切断，造成远离光标的上半部分一起消失。
  const effectiveRadius = radius;
  const bounds = strokeBounds(stroke);
  if (
    center.x + effectiveRadius < bounds.minX ||
    center.x - effectiveRadius > bounds.maxX ||
    center.y + effectiveRadius < bounds.minY ||
    center.y - effectiveRadius > bounds.maxY
  ) {
    return null;
  }
  if (stroke.points.length === 2) {
    return isInside({ x: stroke.points[0], y: stroke.points[1] }, center, effectiveRadius) ? [] : null;
  }

  const chunks: number[][] = [];
  let currentChunk: number[] | null = null;
  let changed = false;
  for (let offset = 0; offset + 3 < stroke.points.length; offset += 2) {
    const intervals = outsideIntervals(stroke.points, offset, center, effectiveRadius);
    if (intervals.length !== 1 || intervals[0][0] !== 0 || intervals[0][1] !== 1) changed = true;
    for (const [start, end] of intervals) {
      const startPoint = pointAt(stroke.points, offset, start);
      const endPoint = pointAt(stroke.points, offset, end);
      const lastX = currentChunk?.at(-2);
      const lastY = currentChunk?.at(-1);
      if (
        !currentChunk ||
        lastX === undefined ||
        lastY === undefined ||
        Math.hypot(lastX - startPoint.x, lastY - startPoint.y) > EPSILON
      ) {
        if (currentChunk?.length) chunks.push(currentChunk);
        currentChunk = [];
        appendPoint(currentChunk, startPoint);
      }
      appendPoint(currentChunk, endPoint);
    }
    if (!intervals.length && currentChunk?.length) {
      chunks.push(currentChunk);
      currentChunk = null;
    }
  }
  if (currentChunk?.length) chunks.push(currentChunk);
  return changed ? chunks.filter((points) => points.length >= 2) : null;
}

/**
 * 在圆形橡皮擦区域内局部裁切笔画。文本属于可编辑对象，不由橡皮擦删除。
 * 未命中时复用原数组和元素，避免 pointermove 期间产生无意义响应式更新。
 */
export function eraseDrawingElementsAt(
  elements: DrawingElement[],
  center: DrawingPoint,
  radius: number,
  createId: () => string,
  limits: DrawingEraserLimits = { maxElements: Number.POSITIVE_INFINITY, maxStrokes: Number.POSITIVE_INFINITY },
) {
  let changed = false;
  let strokeCount = 0;
  const nextElements: DrawingElement[] = [];
  for (const element of elements) {
    if (element.kind !== 'stroke') {
      nextElements.push(element);
      continue;
    }
    const chunks = eraseStroke(element, center, radius);
    if (chunks === null) {
      nextElements.push(element);
      strokeCount += 1;
      continue;
    }
    changed = true;
    chunks.forEach((points, index) => {
      nextElements.push({ ...element, id: index === 0 ? element.id : createId(), points });
      strokeCount += 1;
    });
    if (nextElements.length > limits.maxElements || strokeCount > limits.maxStrokes) {
      return { elements, changed: false, limitReached: true };
    }
  }
  if (nextElements.length > limits.maxElements || strokeCount > limits.maxStrokes) {
    return { elements, changed: false, limitReached: true };
  }
  return { elements: changed ? nextElements : elements, changed, limitReached: false };
}
