import {
  upgradeDrawingScene,
  type DrawingElement,
  type DrawingTextElement,
} from '@lightnote/shared/drawing-note';

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
    // 单击形成的点同样按整张画纸缩放，只保留 1 个输出像素的可辨识下限，禁止自动放大填满卡片。
    const radius = Math.max(element.width / 2, 0.5 / scale);
    context.arc(element.points[0], element.points[1], radius, 0, Math.PI * 2);
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
    const scene = upgradeDrawingScene(content);
    if (!scene.elements.length) return false;
    const padding = 14;
    const availableWidth = Math.max(1, width - padding * 2);
    const availableHeight = Math.max(1, height - padding * 2);
    // 卡片是整张画纸的缩略图，不是内容的自动取景器。固定按页面 contain 才能保持元素的真实相对尺寸。
    const scale = Math.min(availableWidth / scene.page.width, availableHeight / scene.page.height);
    const offsetX = (width - scene.page.width * scale) / 2;
    const offsetY = (height - scene.page.height * scale) / 2;
    context.setTransform(scale, 0, 0, scale, offsetX, offsetY);
    scene.elements.forEach((element) => drawElement(context, element, scale));
    context.setTransform(1, 0, 0, 1, 0, 0);
    return true;
  } catch {
    return false;
  }
}
