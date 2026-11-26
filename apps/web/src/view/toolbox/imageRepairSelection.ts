export type ImagePoint = { x: number; y: number };
export type ImageRect = ImagePoint & { width: number; height: number };
export type RepairRectangle = { kind: 'rectangle' } & ImageRect;
export type RepairSelection = RepairRectangle | { kind: 'brush'; points: ImagePoint[]; radius: number };
export type RepairHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export function applyRepairSelection(selections: readonly RepairSelection[], next: RepairSelection) {
  return next.kind === 'rectangle'
    ? [...selections.filter((selection) => selection.kind !== 'rectangle'), next]
    : [...selections, next];
}

export function clampRepairValue(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

export function repairRectangleHandles(rect: RepairRectangle): (ImagePoint & { handle: RepairHandle })[] {
  const { x, y, width, height } = rect;
  return [
    { handle: 'nw', x, y },
    { handle: 'n', x: x + width / 2, y },
    { handle: 'ne', x: x + width, y },
    { handle: 'e', x: x + width, y: y + height / 2 },
    { handle: 'se', x: x + width, y: y + height },
    { handle: 's', x: x + width / 2, y: y + height },
    { handle: 'sw', x, y: y + height },
    { handle: 'w', x, y: y + height / 2 },
  ];
}

export function hitRepairRectangle(
  selections: readonly RepairSelection[],
  active: number,
  point: ImagePoint,
  radius: number,
): { index: number; handle?: RepairHandle } | undefined {
  const rect = selections[active];
  if (rect?.kind === 'rectangle') {
    // Leave a usable interior on a narrow selection, even when the touch hit area is large.
    let closest = Math.min(radius, Math.min(rect.width, rect.height) * 0.38);
    let match: RepairHandle | undefined;
    for (const { x, y, handle } of repairRectangleHandles(rect)) {
      const distance = Math.hypot(point.x - x, point.y - y);
      if (distance > closest) continue;
      closest = distance;
      match = handle;
    }
    if (match) return { index: active, handle: match };
    const right = rect.x + rect.width;
    const bottom = rect.y + rect.height;
    if (
      point.x >= rect.x - closest &&
      point.x <= right + closest &&
      point.y >= rect.y - closest &&
      point.y <= bottom + closest
    ) {
      const edges: [RepairHandle, number][] = [
        ['n', Math.abs(point.y - rect.y)],
        ['s', Math.abs(point.y - bottom)],
        ['w', Math.abs(point.x - rect.x)],
        ['e', Math.abs(point.x - right)],
      ];
      for (const [handle, distance] of edges) {
        if (distance > closest) continue;
        closest = distance;
        match = handle;
      }
      if (match) return { index: active, handle: match };
    }
  }
  for (let index = selections.length - 1; index >= 0; index -= 1) {
    const rect = selections[index];
    if (
      rect.kind === 'rectangle' &&
      point.x >= rect.x &&
      point.x <= rect.x + rect.width &&
      point.y >= rect.y &&
      point.y <= rect.y + rect.height
    )
      return { index };
  }
}

export function moveRepairRectangle(rect: RepairRectangle, delta: ImagePoint, width: number, height: number) {
  return {
    ...rect,
    x: clampRepairValue(rect.x + Math.round(delta.x), 0, width - rect.width),
    y: clampRepairValue(rect.y + Math.round(delta.y), 0, height - rect.height),
  };
}

export function resizeRepairRectangle(
  rect: RepairRectangle,
  handle: RepairHandle,
  delta: ImagePoint,
  width: number,
  height: number,
): RepairRectangle {
  let { x, y } = rect;
  let right = x + rect.width;
  let bottom = y + rect.height;
  const dx = Math.round(delta.x);
  const dy = Math.round(delta.y);
  if (handle.includes('w')) x = clampRepairValue(x + dx, 0, right - 2);
  if (handle.includes('e')) right = clampRepairValue(right + dx, x + 2, width);
  if (handle.includes('n')) y = clampRepairValue(y + dy, 0, bottom - 2);
  if (handle.includes('s')) bottom = clampRepairValue(bottom + dy, y + 2, height);
  return { kind: 'rectangle', x, y, width: right - x, height: bottom - y };
}

const REPAIR_PADDING = 16;
export const ENHANCED_REPAIR_EDGE = 512;

export function rectangleBetween(start: ImagePoint, end: ImagePoint): RepairRectangle {
  return {
    kind: 'rectangle',
    x: Math.floor(Math.min(start.x, end.x)),
    y: Math.floor(Math.min(start.y, end.y)),
    width: Math.ceil(Math.max(start.x, end.x)) - Math.floor(Math.min(start.x, end.x)),
    height: Math.ceil(Math.max(start.y, end.y)) - Math.floor(Math.min(start.y, end.y)),
  };
}

export function pointOnImage(client: ImagePoint, rect: ImageRect, width: number, height: number): ImagePoint {
  return {
    x: Math.min(width, Math.max(0, ((client.x - rect.x) / rect.width) * width)),
    y: Math.min(height, Math.max(0, ((client.y - rect.y) / rect.height) * height)),
  };
}

export function repairPatchBounds(selections: readonly RepairSelection[], width: number, height: number): ImageRect {
  let left = width;
  let top = height;
  let right = 0;
  let bottom = 0;
  function include(x: number, y: number, endX: number, endY: number) {
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, endX);
    bottom = Math.max(bottom, endY);
  }

  for (const selection of selections) {
    if (selection.kind === 'rectangle') {
      include(selection.x, selection.y, selection.x + selection.width, selection.y + selection.height);
    } else {
      for (const { x, y } of selection.points) {
        include(x - selection.radius, y - selection.radius, x + selection.radius, y + selection.radius);
      }
    }
  }

  const x = Math.max(0, Math.floor(left) - REPAIR_PADDING);
  const y = Math.max(0, Math.floor(top) - REPAIR_PADDING);
  return {
    x,
    y,
    width: Math.max(0, Math.min(width, Math.ceil(right) + REPAIR_PADDING) - x),
    height: Math.max(0, Math.min(height, Math.ceil(bottom) + REPAIR_PADDING) - y),
  };
}

export function paintRepairSelection(context: CanvasRenderingContext2D, selection: RepairSelection) {
  if (selection.kind === 'rectangle') {
    context.fillRect(selection.x, selection.y, selection.width, selection.height);
    return;
  }
  const { points } = selection;
  const start = points[0];
  if (!start) return;
  context.beginPath();
  if (points.length === 1) {
    context.arc(start.x, start.y, selection.radius, 0, 2 * Math.PI);
    context.fill();
    return;
  }
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = 2 * selection.radius;
  context.moveTo(start.x, start.y);
  for (let index = 1; index < points.length; index += 1) context.lineTo(points[index].x, points[index].y);
  context.stroke();
}

export function enhancedRepairBounds(selection: ImageRect, imageWidth: number, imageHeight: number): ImageRect {
  // Give the model room to see structures on both sides of the selected object.
  const side = Math.max(ENHANCED_REPAIR_EDGE, 2 * Math.max(selection.width, selection.height));
  const width = Math.min(side, imageWidth);
  const height = Math.min(side, imageHeight);
  return {
    x: clampRepairValue(Math.floor(selection.x + (selection.width - width) / 2), 0, imageWidth - width),
    y: clampRepairValue(Math.floor(selection.y + (selection.height - height) / 2), 0, imageHeight - height),
    width,
    height,
  };
}
