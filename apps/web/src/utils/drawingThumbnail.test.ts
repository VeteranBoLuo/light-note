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
    expect(context.lineTo).toHaveBeenCalledWith(512, 360);
    expect(context.fillText).toHaveBeenCalledWith('测试', 572, 180, 240);
    expect(context.setTransform).toHaveBeenCalledTimes(3);
  });

  it('按完整方形画纸缩放，小点不会按内容包围盒放大铺满卡片', () => {
    const context = mockContext();
    const content = JSON.stringify({
      v: 2,
      page: { width: 1448, height: 1448 },
      elements: [{ id: 'dot', kind: 'stroke', color: '#1f2937', width: 4, points: [724, 724] }],
    });

    expect(renderDrawingThumbnail(context, content, 480, 270)).toBe(true);
    const [scale, , , , offsetX, offsetY] = context.setTransform.mock.calls[1];
    expect(scale).toBeCloseTo(242 / 1448);
    expect(offsetX).toBeCloseTo(119);
    expect(offsetY).toBeCloseTo(14);
    expect(context.arc).toHaveBeenCalledWith(724, 724, 0.5 / scale, 0, Math.PI * 2);
  });

  it('旧竖版场景先升级并居中到方形画纸再生成缩略图', () => {
    const context = mockContext();
    const content = JSON.stringify({
      v: 1,
      page: { width: 1024, height: 1448 },
      elements: [{ id: 'dot', kind: 'stroke', color: '#1f2937', width: 4, points: [0, 100] }],
    });

    expect(renderDrawingThumbnail(context, content, 480, 270)).toBe(true);
    expect(context.arc).toHaveBeenCalledWith(212, 100, expect.any(Number), 0, Math.PI * 2);
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
