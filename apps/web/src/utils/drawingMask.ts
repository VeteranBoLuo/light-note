import type { DrawingErasureTrail } from '@lightnote/shared/drawing-note';

export interface DrawingPaintBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type DrawingScratchCanvasFactory = (width: number, height: number) => HTMLCanvasElement | null;

const MAX_FALLBACK_SCRATCH_EDGE = 4096;

function intersectBounds(first: DrawingPaintBounds, second: DrawingPaintBounds): DrawingPaintBounds | null {
  const left = Math.max(first.x, second.x);
  const top = Math.max(first.y, second.y);
  const right = Math.min(first.x + first.width, second.x + second.width);
  const bottom = Math.min(first.y + first.height, second.y + second.height);
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * 擦除临时层只需要覆盖主画布当前能显示的逻辑区域。旧 scene 兼容坐标可能远超画纸，
 * 若按完整元素包围盒分配 Canvas，会把一个离屏长笔画放大成数百 MB 的位图。
 */
function visiblePaintBounds(context: CanvasRenderingContext2D, bounds: DrawingPaintBounds, scale: number) {
  const canvas = context.canvas as HTMLCanvasElement | OffscreenCanvas | undefined;
  const transform = typeof context.getTransform === 'function' ? context.getTransform() : null;
  if (
    canvas &&
    transform &&
    Math.abs(transform.b) < 0.000001 &&
    Math.abs(transform.c) < 0.000001 &&
    Math.abs(transform.a) > 0.000001 &&
    Math.abs(transform.d) > 0.000001
  ) {
    const x1 = (0 - transform.e) / transform.a;
    const x2 = (Number(canvas.width || 0) - transform.e) / transform.a;
    const y1 = (0 - transform.f) / transform.d;
    const y2 = (Number(canvas.height || 0) - transform.f) / transform.d;
    return intersectBounds(bounds, {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1),
    });
  }
  if (bounds.width * scale > MAX_FALLBACK_SCRATCH_EDGE || bounds.height * scale > MAX_FALLBACK_SCRATCH_EDGE) {
    return null;
  }
  return bounds;
}

function createScratchCanvas(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  factory?: DrawingScratchCanvasFactory,
) {
  if (factory) {
    const canvas = factory(width, height);
    if (canvas) {
      canvas.width = width;
      canvas.height = height;
    }
    return canvas;
  }
  const ownerDocument = (context.canvas as HTMLCanvasElement | undefined)?.ownerDocument;
  const canvas =
    ownerDocument?.createElement('canvas') ||
    (typeof document !== 'undefined' ? document.createElement('canvas') : null);
  if (!canvas) return null;
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function applyErasure(context: CanvasRenderingContext2D, trail: DrawingErasureTrail) {
  context.beginPath();
  for (let index = 0; index < trail.points.length; index += 2) {
    context.moveTo(trail.points[index] + trail.width / 2, trail.points[index + 1]);
    context.arc(trail.points[index], trail.points[index + 1], trail.width / 2, 0, Math.PI * 2);
  }
  context.fillStyle = '#000000';
  context.fill();
}

/**
 * 在元素自己的透明临时层内应用擦除遮罩，再合成到主画布。
 * 这样 destination-out 只影响当前元素，不会擦穿已经绘制的下层内容。
 */
export function paintDrawingWithErasures(
  context: CanvasRenderingContext2D,
  bounds: DrawingPaintBounds,
  scale: number,
  erasures: readonly DrawingErasureTrail[] | undefined,
  paintDirect: (target: CanvasRenderingContext2D) => void,
  createCanvas?: DrawingScratchCanvasFactory,
) {
  if (!erasures?.length) {
    paintDirect(context);
    return;
  }

  const paintBounds = visiblePaintBounds(context, bounds, scale);
  if (!paintBounds) {
    // 无法可靠求出可见区时宁可保留原元素，也不能为异常包围盒分配超大位图或误擦主画布。
    paintDirect(context);
    return;
  }
  const pixelWidth = Math.max(1, Math.ceil(paintBounds.width * scale));
  const pixelHeight = Math.max(1, Math.ceil(paintBounds.height * scale));
  const scratch = createScratchCanvas(context, pixelWidth, pixelHeight, createCanvas);
  const scratchContext = scratch?.getContext('2d');
  if (!scratch || !scratchContext) {
    // 无 DOM/Canvas 的降级环境无法建立隔离层，只保留原始元素，避免误擦主画布。
    paintDirect(context);
    return;
  }

  scratchContext.setTransform(scale, 0, 0, scale, -paintBounds.x * scale, -paintBounds.y * scale);
  paintDirect(scratchContext);
  scratchContext.globalCompositeOperation = 'destination-out';
  erasures.forEach((trail) => applyErasure(scratchContext, trail));
  scratchContext.globalCompositeOperation = 'source-over';
  context.drawImage(scratch, paintBounds.x, paintBounds.y, pixelWidth / scale, pixelHeight / scale);
}
