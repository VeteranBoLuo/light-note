import {
  upgradeDrawingScene,
  type DrawingCurrentScene,
  type DrawingElement,
  type DrawingTextElement,
} from '@lightnote/shared/drawing-note';
import { drawingShapeBounds, paintDrawingShape } from './drawingShape';
import { paintDrawingStroke } from './drawingStroke';

interface DrawingBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const DRAWING_THUMBNAIL_MAX_PAGE_ZOOM = 3;

function includeBounds(target: DrawingBounds, minX: number, minY: number, maxX: number, maxY: number) {
  target.minX = Math.min(target.minX, minX);
  target.minY = Math.min(target.minY, minY);
  target.maxX = Math.max(target.maxX, maxX);
  target.maxY = Math.max(target.maxY, maxY);
}

function sceneContentBounds(scene: DrawingCurrentScene): DrawingBounds | null {
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
    if (element.kind === 'shape') {
      const shapeBounds = drawingShapeBounds(element);
      includeBounds(
        bounds,
        shapeBounds.x,
        shapeBounds.y,
        shapeBounds.x + shapeBounds.width,
        shapeBounds.y + shapeBounds.height,
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

function centeredPageOffset(
  outputSize: number,
  padding: number,
  pageSize: number,
  scale: number,
  contentCenter: number,
) {
  const availableSize = Math.max(1, outputSize - padding * 2);
  const renderedPageSize = pageSize * scale;
  if (renderedPageSize <= availableSize) return (outputSize - renderedPageSize) / 2;
  const desiredOffset = outputSize / 2 - contentCenter * scale;
  return Math.max(outputSize - padding - renderedPageSize, Math.min(padding, desiredOffset));
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
  if (element.kind === 'shape') {
    paintDrawingShape(context, element, scale, { minimumDeviceWidth: 1 });
    return;
  }
  // 单击形成的点同样按整张画纸缩放，只保留 1 个输出像素的可辨识下限，禁止自动放大填满卡片。
  paintDrawingStroke(context, element, scale, { minimumDeviceWidth: 1 });
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
    const scene = upgradeDrawingScene(content);
    const bounds = sceneContentBounds(scene);
    if (!bounds) return false;
    const padding = 14;
    const availableWidth = Math.max(1, width - padding * 2);
    const availableHeight = Math.max(1, height - padding * 2);
    const pageFitScale = Math.min(availableWidth / scene.page.width, availableHeight / scene.page.height);
    const contentWidth = Math.max(1, bounds.maxX - bounds.minX);
    const contentHeight = Math.max(1, bounds.maxY - bounds.minY);
    const focusPadding = Math.max(24, Math.min(80, Math.max(contentWidth, contentHeight) * 0.08));
    const contentFitScale = Math.min(
      availableWidth / (contentWidth + focusPadding * 2),
      availableHeight / (contentHeight + focusPadding * 2),
    );
    // 卡片需要优先帮助用户辨认内容，但内容取景最多放大到完整画纸缩略图的 3 倍，
    // 避免单个点或极短笔画再次被无限放大成铺满预览区的图形。
    const scale = Math.max(pageFitScale, Math.min(contentFitScale, pageFitScale * DRAWING_THUMBNAIL_MAX_PAGE_ZOOM));
    const offsetX = centeredPageOffset(width, padding, scene.page.width, scale, (bounds.minX + bounds.maxX) / 2);
    const offsetY = centeredPageOffset(height, padding, scene.page.height, scale, (bounds.minY + bounds.maxY) / 2);
    context.setTransform(scale, 0, 0, scale, offsetX, offsetY);
    scene.elements.forEach((element) => drawElement(context, element, scale));
    context.setTransform(1, 0, 0, 1, 0, 0);
    return true;
  } catch {
    return false;
  }
}
