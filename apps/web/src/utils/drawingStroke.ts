import type { DrawingStrokeElement } from '@lightnote/shared/drawing-note';
import { paintDrawingWithErasures, type DrawingScratchCanvasFactory } from './drawingMask';

function drawRoundTrail(context: CanvasRenderingContext2D, points: readonly number[], width: number, color: string) {
  context.beginPath();
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = width;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  if (points.length === 2) {
    context.arc(points[0], points[1], width / 2, 0, Math.PI * 2);
    context.fill();
    return;
  }
  context.moveTo(points[0], points[1]);
  for (let index = 2; index < points.length; index += 2) context.lineTo(points[index], points[index + 1]);
  context.stroke();
}

function strokeBounds(stroke: DrawingStrokeElement, renderedWidth: number, scale: number) {
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
  const padding = renderedWidth / 2 + 2 / scale;
  return {
    x: minX - padding,
    y: minY - padding,
    width: Math.max(1 / scale, maxX - minX + padding * 2),
    height: Math.max(1 / scale, maxY - minY + padding * 2),
  };
}

/**
 * 绘制单条笔画。存在擦除轨迹时先在透明临时层完成 destination-out，
 * 再合成回主画布，避免擦除该笔画下方或先前绘制的其他元素。
 */
export function paintDrawingStroke(
  context: CanvasRenderingContext2D,
  stroke: DrawingStrokeElement,
  scale: number,
  options: { minimumDeviceWidth?: number; createScratchCanvas?: DrawingScratchCanvasFactory } = {},
) {
  const renderedWidth = Math.max((options.minimumDeviceWidth || 0) / scale, stroke.width);
  const bounds = strokeBounds(stroke, renderedWidth, scale);
  paintDrawingWithErasures(
    context,
    bounds,
    scale,
    stroke.erasures,
    (target) => drawRoundTrail(target, stroke.points, renderedWidth, stroke.color),
    options.createScratchCanvas,
  );
}
