import type { DrawingShapeElement } from '@lightnote/shared/drawing-note';

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
  const padding = Math.max(element.strokeWidth / 2 + 3, element.shape === 'arrow' ? element.strokeWidth * 1.6 : 5);
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

export function paintDrawingShape(context: CanvasRenderingContext2D, element: DrawingShapeElement) {
  const startX = element.x;
  const startY = element.y;
  const endX = element.x + element.width;
  const endY = element.y + element.height;
  context.save();
  context.beginPath();
  context.strokeStyle = element.color;
  context.fillStyle = element.color;
  context.lineWidth = element.strokeWidth;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  if (element.shape === 'line' || element.shape === 'arrow') {
    context.moveTo(startX, startY);
    context.lineTo(endX, endY);
    if (element.shape === 'arrow') {
      const angle = Math.atan2(endY - startY, endX - startX);
      const headLength = Math.max(12, element.strokeWidth * 3.2);
      context.moveTo(endX, endY);
      context.lineTo(
        endX - headLength * Math.cos(angle - Math.PI / 6),
        endY - headLength * Math.sin(angle - Math.PI / 6),
      );
      context.moveTo(endX, endY);
      context.lineTo(
        endX - headLength * Math.cos(angle + Math.PI / 6),
        endY - headLength * Math.sin(angle + Math.PI / 6),
      );
    }
  } else {
    traceClosedShape(context, element);
  }
  context.stroke();
  context.restore();
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
