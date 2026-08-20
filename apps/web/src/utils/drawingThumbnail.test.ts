import { describe, expect, it, vi } from 'vitest';
import { DRAWING_THUMBNAIL_MAX_PAGE_ZOOM, renderDrawingThumbnail } from './drawingThumbnail';

function mockContext() {
  return {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    rect: vi.fn(),
    quadraticCurveTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    closePath: vi.fn(),
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

  it('智能取景最多放大到整页缩略图的三倍，小点仍保持像素级尺寸', () => {
    const context = mockContext();
    const content = JSON.stringify({
      v: 2,
      page: { width: 1448, height: 1448 },
      elements: [{ id: 'dot', kind: 'stroke', color: '#1f2937', width: 4, points: [724, 724] }],
    });

    expect(renderDrawingThumbnail(context, content, 480, 270)).toBe(true);
    const [scale, , , , offsetX, offsetY] = context.setTransform.mock.calls[1];
    expect(scale).toBeCloseTo((242 / 1448) * DRAWING_THUMBNAIL_MAX_PAGE_ZOOM);
    expect(offsetX + 724 * scale).toBeCloseTo(240);
    expect(offsetY + 724 * scale).toBeCloseTo(135);
    const dotRadius = Math.max(2, 0.5 / scale);
    expect(context.arc).toHaveBeenCalledWith(724, 724, dotRadius, 0, Math.PI * 2);
    expect(2 * dotRadius * scale).toBeLessThanOrEqual(2.1);
  });

  it('正常绘画使用受限内容取景，比完整画纸缩略图更易辨认', () => {
    const context = mockContext();
    const content = JSON.stringify({
      v: 2,
      page: { width: 1448, height: 1448 },
      elements: [
        {
          id: 'drawing',
          kind: 'stroke',
          color: '#1f2937',
          width: 4,
          points: [500, 560, 620, 440, 760, 500, 900, 720],
        },
      ],
    });

    expect(renderDrawingThumbnail(context, content, 480, 270)).toBe(true);
    const [scale] = context.setTransform.mock.calls[1];
    const pageFitScale = 242 / 1448;
    expect(scale).toBeGreaterThan(pageFitScale);
    expect(scale).toBeLessThanOrEqual(pageFitScale * DRAWING_THUMBNAIL_MAX_PAGE_ZOOM);
  });

  it('V2 形状参与智能取景并使用同一矢量渲染', () => {
    const context = mockContext();
    const content = JSON.stringify({
      v: 2,
      page: { width: 1448, height: 1448 },
      elements: [
        {
          id: 'shape',
          kind: 'shape',
          shape: 'rectangle',
          x: 500,
          y: 540,
          width: 360,
          height: 240,
          color: '#615ced',
          strokeWidth: 4,
        },
      ],
    });

    expect(renderDrawingThumbnail(context, content, 480, 270)).toBe(true);
    expect(context.rect).toHaveBeenCalledWith(500, 540, 360, 240);
    expect(context.stroke).toHaveBeenCalled();
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
