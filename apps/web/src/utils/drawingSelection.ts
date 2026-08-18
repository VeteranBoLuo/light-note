import type { DrawingElement } from '@lightnote/shared/drawing-note';

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
  return element.kind === 'stroke' ? { ...element, id, points: [...element.points] } : { ...element, id };
}

export function translateDrawingElement(
  element: DrawingElement,
  dx: number,
  dy: number,
  id = element.id,
): DrawingElement {
  return element.kind === 'stroke'
    ? {
        ...element,
        id,
        points: element.points.map((value, index) => value + (index % 2 === 0 ? dx : dy)),
      }
    : { ...element, id, x: element.x + dx, y: element.y + dy };
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
