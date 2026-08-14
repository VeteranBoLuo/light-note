import { describe, expect, it, vi } from 'vitest';
import { renderDrawingThumbnail } from './drawingThumbnail';

function mockContext() {
  return {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    font: '',
    textBaseline: 'alphabetic',
  } as unknown as CanvasRenderingContext2D;
}

describe('drawingThumbnail', () => {
  it('把笔画和文本缩放绘制到固定低分辨率画布', () => {
    const context = mockContext();
    const content = JSON.stringify({
      v: 1,
      page: { width: 1024, height: 1448 },
      elements: [
        { id: 'stroke-1', kind: 'stroke', color: '#1f2937', width: 4, points: [100, 120, 300, 360] },
        { id: 'text-1', kind: 'text', color: '#615ced', fontSize: 20, x: 360, y: 180, width: 240, text: '测试' },
      ],
    });

    expect(renderDrawingThumbnail(context, content, 480, 270)).toBe(true);
    expect(context.lineTo).toHaveBeenCalledWith(300, 360);
    expect(context.fillText).toHaveBeenCalledWith('测试', 360, 180, 240);
    expect(context.setTransform).toHaveBeenCalledTimes(3);
  });

  it('无元素或无效场景安全退化为占位态', () => {
    const context = mockContext();
    expect(
      renderDrawingThumbnail(
        context,
        JSON.stringify({ v: 1, page: { width: 1024, height: 1448 }, elements: [] }),
        480,
        270,
      ),
    ).toBe(false);
    expect(renderDrawingThumbnail(context, '{"v":1', 480, 270)).toBe(false);
  });
});
