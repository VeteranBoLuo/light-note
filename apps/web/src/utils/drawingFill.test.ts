import { describe, expect, it, vi } from 'vitest';
import { buildDrawingFillSpans, drawingFillBounds, drawingFillContainsPoint, paintDrawingFill } from './drawingFill';

function bitmap(width: number, height: number, pixel: (x: number, y: number) => [number, number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) data.set(pixel(x, y), (y * width + x) * 4);
  }
  return data;
}

describe('drawingFill', () => {
  it('只填充闭合区域并保留内部独立空洞', () => {
    const pixels = bitmap(9, 9, (x, y) => {
      const boundary = x === 1 || x === 7 || y === 1 || y === 7;
      const hole = x >= 4 && x <= 5 && y >= 4 && y <= 5;
      return boundary || hole ? [20, 20, 20, 255] : [255, 255, 255, 255];
    });
    const result = buildDrawingFillSpans(pixels, 9, 9, { x: 3, y: 3 }, '#dc2626', { maxSpans: 50 });
    expect(result.status).toBe('filled');
    if (result.status !== 'filled') return;
    expect(result.pixelCount).toBe(21);
    const fill = { id: 'fill', kind: 'fill' as const, color: '#dc2626', x: 0, y: 0, spans: result.spans };
    expect(drawingFillContainsPoint(fill, { x: 3, y: 3 })).toBe(true);
    expect(drawingFillContainsPoint(fill, { x: 4, y: 4 })).toBe(false);
  });

  it('区域连到画纸边缘时拒绝填充', () => {
    const pixels = bitmap(6, 6, () => [255, 255, 255, 255]);
    expect(buildDrawingFillSpans(pixels, 6, 6, { x: 3, y: 3 }, '#00a884').status).toBe('open');
  });

  it('目标颜色已经一致时不创建重复元素', () => {
    const pixels = bitmap(5, 5, (x, y) =>
      x === 0 || x === 4 || y === 0 || y === 4 ? [0, 0, 0, 255] : [0, 168, 132, 255],
    );
    expect(buildDrawingFillSpans(pixels, 5, 5, { x: 2, y: 2 }, '#00a884').status).toBe('same-color');
  });

  it('填充区域可以命中、取边界并整体平移', () => {
    const fill = { id: 'fill', kind: 'fill' as const, color: '#00a884', x: 10, y: -2, spans: [4, 2, 5] };
    expect(drawingFillBounds(fill)).toEqual({ x: 12, y: 2, width: 3, height: 1 });
    expect(drawingFillContainsPoint(fill, { x: 13, y: 2 })).toBe(true);
    expect(drawingFillContainsPoint(fill, { x: 15, y: 2 })).toBe(false);
  });

  it('相邻扫描线合并到一次路径填充，避免非整数缩放产生横纹', () => {
    const context = {
      beginPath: vi.fn(),
      rect: vi.fn(),
      fill: vi.fn(),
      fillRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    paintDrawingFill(
      context,
      { id: 'fill', kind: 'fill', color: '#ef4444', x: 10, y: 20, spans: [1, 2, 8, 2, 3, 9] },
      0.94,
    );

    expect(context.beginPath).toHaveBeenCalledTimes(1);
    expect(context.rect).toHaveBeenNthCalledWith(1, 12, 21, 6, 1);
    expect(context.rect).toHaveBeenNthCalledWith(2, 13, 22, 6, 1);
    expect(context.fill).toHaveBeenCalledTimes(1);
    expect(context.fillRect).not.toHaveBeenCalled();
  });
});
