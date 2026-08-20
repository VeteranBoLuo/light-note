import type { DrawingElement, DrawingShapeElement } from '@lightnote/shared/drawing-note';

export interface DrawingRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DrawingSelectionPoint {
  x: number;
  y: number;
}

export function normalizeDrawingRect(start: DrawingSelectionPoint, end: DrawingSelectionPoint): DrawingRect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

export function drawingRectsIntersect(first: DrawingRect, second: DrawingRect) {
  return (
    first.x <= second.x + second.width &&
    first.x + first.width >= second.x &&
    first.y <= second.y + second.height &&
    first.y + first.height >= second.y
  );
}

export function cloneDrawingElement(element: DrawingElement, id = element.id): DrawingElement {
  if (element.kind === 'stroke') {
    return {
      ...element,
      id,
      points: [...element.points],
      erasures: element.erasures?.map((trail) => ({ ...trail, points: [...trail.points] })),
    };
  }
  if (element.kind === 'shape') {
    return {
      ...element,
      id,
      erasures: element.erasures?.map((trail) => ({ ...trail, points: [...trail.points] })),
    };
  }
  return { ...element, id };
}

export function translateDrawingElement(
  element: DrawingElement,
  dx: number,
  dy: number,
  id = element.id,
): DrawingElement {
  if (element.kind === 'stroke') {
    return {
      ...element,
      id,
      points: element.points.map((value, index) => value + (index % 2 === 0 ? dx : dy)),
      erasures: element.erasures?.map((trail) => ({
        ...trail,
        points: trail.points.map((value, index) => value + (index % 2 === 0 ? dx : dy)),
      })),
    };
  }
  if (element.kind === 'shape') {
    return {
      ...element,
      id,
      x: element.x + dx,
      y: element.y + dy,
      erasures: element.erasures?.map((trail) => ({
        ...trail,
        points: trail.points.map((value, index) => value + (index % 2 === 0 ? dx : dy)),
      })),
    };
  }
  return { ...element, id, x: element.x + dx, y: element.y + dy };
}

function transformLinearErasurePoint(
  original: DrawingShapeElement,
  resized: DrawingShapeElement,
  x: number,
  y: number,
) {
  const oldLength = Math.max(0.0001, Math.hypot(original.width, original.height));
  const newLength = Math.max(0.0001, Math.hypot(resized.width, resized.height));
  const oldUnitX = original.width / oldLength;
  const oldUnitY = original.height / oldLength;
  const newUnitX = resized.width / newLength;
  const newUnitY = resized.height / newLength;
  const relativeX = x - original.x;
  const relativeY = y - original.y;
  const parallelRatio = (relativeX * oldUnitX + relativeY * oldUnitY) / oldLength;
  const perpendicular = relativeX * -oldUnitY + relativeY * oldUnitX;
  return {
    x: resized.x + newUnitX * parallelRatio * newLength - newUnitY * perpendicular,
    y: resized.y + newUnitY * parallelRatio * newLength + newUnitX * perpendicular,
  };
}

/** 形状缩放时让已有擦除位置跟随几何变化；擦除直径保持画布像素大小，与未缩放的线宽语义一致。 */
export function transformDrawingShapeErasures(
  original: DrawingShapeElement,
  resized: DrawingShapeElement,
): DrawingShapeElement {
  if (!original.erasures?.length) return resized;
  const linear = original.shape === 'line' || original.shape === 'arrow';
  return {
    ...resized,
    erasures: original.erasures.map((trail) => ({
      ...trail,
      points: trail.points.flatMap((value, index, points) => {
        if (index % 2 !== 0) return [];
        const x = value;
        const y = points[index + 1];
        if (linear) {
          const transformed = transformLinearErasurePoint(original, resized, x, y);
          return [transformed.x, transformed.y];
        }
        const xRatio = original.width ? (x - original.x) / original.width : 0;
        const yRatio = original.height ? (y - original.y) / original.height : 0;
        return [resized.x + xRatio * resized.width, resized.y + yRatio * resized.height];
      }),
    })),
  };
}

let drawingClipboard: DrawingElement[] = [];
let drawingPasteSequence = 0;

export function writeDrawingClipboard(elements: readonly DrawingElement[]) {
  drawingClipboard = elements.map((element) => cloneDrawingElement(element));
  drawingPasteSequence = 0;
}

export function readDrawingClipboard(createId: () => string) {
  if (!drawingClipboard.length) return { elements: [] as DrawingElement[], sequence: 0 };
  drawingPasteSequence += 1;
  return {
    elements: drawingClipboard.map((element) => cloneDrawingElement(element, createId())),
    sequence: drawingPasteSequence,
  };
}

export function resetDrawingClipboard() {
  drawingClipboard = [];
  drawingPasteSequence = 0;
}
