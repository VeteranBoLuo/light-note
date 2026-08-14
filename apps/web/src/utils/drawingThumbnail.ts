import {
  parseDrawingScene,
  type DrawingElement,
  type DrawingScene,
  type DrawingTextElement,
} from '@lightnote/shared/drawing-note';

interface DrawingBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function includeBounds(target: DrawingBounds, minX: number, minY: number, maxX: number, maxY: number) {
  target.minX = Math.min(target.minX, minX);
  target.minY = Math.min(target.minY, minY);
  target.maxX = Math.max(target.maxX, maxX);
  target.maxY = Math.max(target.maxY, maxY);
}

function sceneContentBounds(scene: DrawingScene): DrawingBounds | null {
  const bounds: DrawingBounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  scene.elements.forEach((element) => {
    if (element.kind === 'text') {
      const lineCount = Math.max(1, element.text.split('\n').length);
      includeBounds(
        bounds,
        element.x,
        element.y,
        element.x + element.width,
        element.y + lineCount * element.fontSize * 1.35,
      );
      return;
    }
    if (!element.points.length) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let index = 0; index < element.points.length; index += 2) {
      minX = Math.min(minX, element.points[index]);
      minY = Math.min(minY, element.points[index + 1]);
      maxX = Math.max(maxX, element.points[index]);
      maxY = Math.max(maxY, element.points[index + 1]);
    }
    const strokePadding = element.width / 2;
    includeBounds(bounds, minX - strokePadding, minY - strokePadding, maxX + strokePadding, maxY + strokePadding);
  });
  return Number.isFinite(bounds.minX) ? bounds : null;
}

function drawText(context: CanvasRenderingContext2D, element: DrawingTextElement) {
  context.fillStyle = element.color;
  context.font = `${element.fontSize}px sans-serif`;
  context.textBaseline = 'top';
  element.text.split('\n').forEach((line, index) => {
    context.fillText(line, element.x, element.y + index * element.fontSize * 1.35, element.width);
  });
}

function drawElement(context: CanvasRenderingContext2D, element: DrawingElement, scale: number) {
  if (element.kind === 'text') {
    drawText(context, element);
    return;
  }
  context.beginPath();
  context.strokeStyle = element.color;
  context.fillStyle = element.color;
  context.lineWidth = Math.max(1 / scale, element.width);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  if (element.points.length === 2) {
    context.arc(element.points[0], element.points[1], element.width / 2, 0, Math.PI * 2);
    context.fill();
    return;
  }
  context.moveTo(element.points[0], element.points[1]);
  for (let index = 2; index < element.points.length; index += 2) {
    context.lineTo(element.points[index], element.points[index + 1]);
  }
  context.stroke();
}

export function renderDrawingThumbnail(
  context: CanvasRenderingContext2D,
  content: string,
  width: number,
  height: number,
) {
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  try {
    const scene = parseDrawingScene(content);
    const bounds = sceneContentBounds(scene);
    if (!bounds) return false;
    const contentWidth = Math.max(1, bounds.maxX - bounds.minX);
    const contentHeight = Math.max(1, bounds.maxY - bounds.minY);
    const padding = 14;
    const scale = Math.min((width - padding * 2) / contentWidth, (height - padding * 2) / contentHeight);
    const offsetX = (width - contentWidth * scale) / 2 - bounds.minX * scale;
    const offsetY = (height - contentHeight * scale) / 2 - bounds.minY * scale;
    context.setTransform(scale, 0, 0, scale, offsetX, offsetY);
    scene.elements.forEach((element) => drawElement(context, element, scale));
    context.setTransform(1, 0, 0, 1, 0, 0);
    return true;
  } catch {
    return false;
  }
}
