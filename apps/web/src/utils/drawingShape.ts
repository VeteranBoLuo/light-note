import type { DrawingShapeElement } from '@lightnote/shared/drawing-note';
import { paintDrawingWithErasures, type DrawingScratchCanvasFactory } from './drawingMask';

export interface DrawingShapeBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function drawingShapeBox(element: DrawingShapeElement): DrawingShapeBox {
  return {
    x: Math.min(element.x, element.x + element.width),
    y: Math.min(element.y, element.y + element.height),
    width: Math.abs(element.width),
    height: Math.abs(element.height),
  };
}

export function drawingShapeBounds(element: DrawingShapeElement): DrawingShapeBox {
  const box = drawingShapeBox(element);
  const arrowHeadLength = Math.max(12, element.strokeWidth * 3.2);
  const padding = Math.max(
    element.strokeWidth / 2 + 3,
    element.shape === 'arrow' ? arrowHeadLength / 2 + element.strokeWidth / 2 + 2 : 5,
  );
  return {
    x: box.x - padding,
    y: box.y - padding,
    width: box.width + padding * 2,
    height: box.height + padding * 2,
  };
}

function traceClosedShape(context: CanvasRenderingContext2D, element: DrawingShapeElement) {
  const box = drawingShapeBox(element);
  const left = box.x;
  const top = box.y;
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  const centerX = left + box.width / 2;
  const centerY = top + box.height / 2;

  if (element.shape === 'rectangle') {
    context.rect(left, top, box.width, box.height);
    return;
  }
  if (element.shape === 'rounded-rectangle') {
    const radius = Math.min(24, box.width / 5, box.height / 5);
    context.moveTo(left + radius, top);
    context.lineTo(right - radius, top);
    context.quadraticCurveTo(right, top, right, top + radius);
    context.lineTo(right, bottom - radius);
    context.quadraticCurveTo(right, bottom, right - radius, bottom);
    context.lineTo(left + radius, bottom);
    context.quadraticCurveTo(left, bottom, left, bottom - radius);
    context.lineTo(left, top + radius);
    context.quadraticCurveTo(left, top, left + radius, top);
    context.closePath();
    return;
  }
  if (element.shape === 'ellipse') {
    const control = 0.552284749831;
    const radiusX = box.width / 2;
    const radiusY = box.height / 2;
    context.moveTo(centerX + radiusX, centerY);
    context.bezierCurveTo(
      centerX + radiusX,
      centerY + radiusY * control,
      centerX + radiusX * control,
      centerY + radiusY,
      centerX,
      centerY + radiusY,
    );
    context.bezierCurveTo(
      centerX - radiusX * control,
      centerY + radiusY,
      centerX - radiusX,
      centerY + radiusY * control,
      centerX - radiusX,
      centerY,
    );
    context.bezierCurveTo(
      centerX - radiusX,
      centerY - radiusY * control,
      centerX - radiusX * control,
      centerY - radiusY,
      centerX,
      centerY - radiusY,
    );
    context.bezierCurveTo(
      centerX + radiusX * control,
      centerY - radiusY,
      centerX + radiusX,
      centerY - radiusY * control,
      centerX + radiusX,
      centerY,
    );
    context.closePath();
    return;
  }
  if (element.shape === 'triangle') {
    context.moveTo(centerX, top);
    context.lineTo(right, bottom);
    context.lineTo(left, bottom);
    context.closePath();
    return;
  }
  context.moveTo(centerX, top);
  context.lineTo(right, centerY);
  context.lineTo(centerX, bottom);
  context.lineTo(left, centerY);
  context.closePath();
}

function arrowHeadPoints(element: DrawingShapeElement) {
  const endX = element.x + element.width;
  const endY = element.y + element.height;
  const angle = Math.atan2(element.height, element.width);
  const headLength = Math.max(12, element.strokeWidth * 3.2);
  return [
    {
      x: endX - headLength * Math.cos(angle - Math.PI / 6),
      y: endY - headLength * Math.sin(angle - Math.PI / 6),
    },
    {
      x: endX - headLength * Math.cos(angle + Math.PI / 6),
      y: endY - headLength * Math.sin(angle + Math.PI / 6),
    },
  ];
}

function paintShapeDirect(context: CanvasRenderingContext2D, element: DrawingShapeElement, renderedWidth: number) {
  const startX = element.x;
  const startY = element.y;
  const endX = element.x + element.width;
  const endY = element.y + element.height;
  context.save();
  context.beginPath();
  context.strokeStyle = element.color;
  context.fillStyle = element.color;
  context.lineWidth = renderedWidth;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  if (element.shape === 'line' || element.shape === 'arrow') {
    context.moveTo(startX, startY);
    context.lineTo(endX, endY);
    if (element.shape === 'arrow') {
      const [first, second] = arrowHeadPoints(element);
      context.moveTo(endX, endY);
      context.lineTo(first.x, first.y);
      context.moveTo(endX, endY);
      context.lineTo(second.x, second.y);
    }
  } else {
    traceClosedShape(context, element);
  }
  context.stroke();
  context.restore();
}

export function paintDrawingShape(
  context: CanvasRenderingContext2D,
  element: DrawingShapeElement,
  scale = 1,
  options: { minimumDeviceWidth?: number; createScratchCanvas?: DrawingScratchCanvasFactory } = {},
) {
  const renderedWidth = Math.max((options.minimumDeviceWidth || 0) / scale, element.strokeWidth);
  paintDrawingWithErasures(
    context,
    drawingShapeBounds({ ...element, strokeWidth: renderedWidth }),
    scale,
    element.erasures,
    (target) => paintShapeDirect(target, element, renderedWidth),
    options.createScratchCanvas,
  );
}

function segmentDistance(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0.0001) return Math.hypot(point.x - start.x, point.y - start.y);
  const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (start.x + dx * ratio), point.y - (start.y + dy * ratio));
}

function ellipseOutlinePoints(element: DrawingShapeElement) {
  const box = drawingShapeBox(element);
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  return Array.from({ length: 49 }, (_, index) => {
    const angle = (index / 48) * Math.PI * 2;
    return {
      x: centerX + (Math.cos(angle) * box.width) / 2,
      y: centerY + (Math.sin(angle) * box.height) / 2,
    };
  });
}

function roundedRectangleOutlinePoints(element: DrawingShapeElement) {
  const box = drawingShapeBox(element);
  const radius = Math.min(24, box.width / 5, box.height / 5);
  const centers = [
    { x: box.x + box.width - radius, y: box.y + radius, start: -Math.PI / 2 },
    { x: box.x + box.width - radius, y: box.y + box.height - radius, start: 0 },
    { x: box.x + radius, y: box.y + box.height - radius, start: Math.PI / 2 },
    { x: box.x + radius, y: box.y + radius, start: Math.PI },
  ];
  const points: Array<{ x: number; y: number }> = [];
  centers.forEach((corner) => {
    for (let index = 0; index <= 6; index += 1) {
      const angle = corner.start + ((index / 6) * Math.PI) / 2;
      points.push({ x: corner.x + Math.cos(angle) * radius, y: corner.y + Math.sin(angle) * radius });
    }
  });
  points.push(points[0]);
  return points;
}

function closedShapeOutlinePoints(element: DrawingShapeElement) {
  if (element.shape === 'ellipse') return ellipseOutlinePoints(element);
  if (element.shape === 'rounded-rectangle') return roundedRectangleOutlinePoints(element);
  const box = drawingShapeBox(element);
  const left = box.x;
  const top = box.y;
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  const centerX = left + box.width / 2;
  const centerY = top + box.height / 2;
  if (element.shape === 'triangle') {
    return [
      { x: centerX, y: top },
      { x: right, y: bottom },
      { x: left, y: bottom },
      { x: centerX, y: top },
    ];
  }
  if (element.shape === 'diamond') {
    return [
      { x: centerX, y: top },
      { x: right, y: centerY },
      { x: centerX, y: bottom },
      { x: left, y: centerY },
      { x: centerX, y: top },
    ];
  }
  return [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
    { x: left, y: top },
  ];
}

/** 判断圆形橡皮是否真正接触形状轮廓，避免在封闭形状内部写入无效遮罩。 */
export function drawingShapeTouchesCircle(
  element: DrawingShapeElement,
  center: { x: number; y: number },
  radius: number,
) {
  const hitRadius = radius + element.strokeWidth / 2;
  const bounds = drawingShapeBounds(element);
  if (
    center.x + hitRadius < bounds.x ||
    center.x - hitRadius > bounds.x + bounds.width ||
    center.y + hitRadius < bounds.y ||
    center.y - hitRadius > bounds.y + bounds.height
  )
    return false;

  const start = { x: element.x, y: element.y };
  const end = { x: element.x + element.width, y: element.y + element.height };
  if (element.shape === 'line') return segmentDistance(center, start, end) <= hitRadius;
  if (element.shape === 'arrow') {
    const [first, second] = arrowHeadPoints(element);
    return (
      segmentDistance(center, start, end) <= hitRadius ||
      segmentDistance(center, end, first) <= hitRadius ||
      segmentDistance(center, end, second) <= hitRadius
    );
  }
  const points = closedShapeOutlinePoints(element);
  for (let index = 0; index + 1 < points.length; index += 1) {
    if (segmentDistance(center, points[index], points[index + 1]) <= hitRadius) return true;
  }
  return false;
}

export function constrainDrawingShapeEnd(
  element: DrawingShapeElement,
  end: { x: number; y: number },
  constrained: boolean,
) {
  if (!constrained) return end;
  const dx = end.x - element.x;
  const dy = end.y - element.y;
  if (element.shape === 'line' || element.shape === 'arrow') {
    const distance = Math.hypot(dx, dy);
    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    return { x: element.x + Math.cos(angle) * distance, y: element.y + Math.sin(angle) * distance };
  }
  const size = Math.max(Math.abs(dx), Math.abs(dy));
  return {
    x: element.x + (dx < 0 ? -size : size),
    y: element.y + (dy < 0 ? -size : size),
  };
}
