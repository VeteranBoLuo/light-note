import { describe, expect, it, vi } from 'vitest';
import type { DrawingStrokeElement } from '@lightnote/shared/drawing-note';
import { paintDrawingStroke } from './drawingStroke';

function mockContext() {
  const compositeModes: string[] = [];
  const context = {
    canvas: {},
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    set globalCompositeOperation(value: string) {
      compositeModes.push(value);
    },
    get globalCompositeOperation() {
      return compositeModes.at(-1) || 'source-over';
    },
  } as unknown as CanvasRenderingContext2D;
  return { context, compositeModes };
}

describe('drawingStroke', () => {
  it('在笔画独立透明层中用 destination-out 挖出小圆孔后再合成', () => {
    const main = mockContext();
    const scratch = mockContext();
    const scratchCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => scratch.context),
    } as unknown as HTMLCanvasElement;
    const stroke: DrawingStrokeElement = {
      id: 'stroke',
      kind: 'stroke',
      color: '#1f2937',
      width: 20,
      points: [0, 50, 100, 50],
      erasures: [{ id: 'erase', width: 4, points: [50, 50] }],
    };

    paintDrawingStroke(main.context, stroke, 1, { createScratchCanvas: () => scratchCanvas });

    expect(scratch.compositeModes).toEqual(['destination-out', 'source-over']);
    expect(scratch.context.arc).toHaveBeenCalledWith(50, 50, 2, 0, Math.PI * 2);
    expect(main.context.drawImage).toHaveBeenCalledOnce();
    expect(main.context.stroke).not.toHaveBeenCalled();
  });

  it('没有擦除轨迹时直接绘制，不创建临时层', () => {
    const main = mockContext();
    const createScratchCanvas = vi.fn();
    const stroke: DrawingStrokeElement = {
      id: 'stroke',
      kind: 'stroke',
      color: '#1f2937',
      width: 4,
      points: [0, 50, 100, 50],
    };

    paintDrawingStroke(main.context, stroke, 1, { createScratchCanvas });

    expect(createScratchCanvas).not.toHaveBeenCalled();
    expect(main.context.stroke).toHaveBeenCalledOnce();
  });

  it('离散擦除采样分别生成圆孔，不把离开笔画后的两次命中错误连线', () => {
    const main = mockContext();
    const scratch = mockContext();
    const scratchCanvas = { getContext: () => scratch.context } as unknown as HTMLCanvasElement;
    const stroke: DrawingStrokeElement = {
      id: 'stroke',
      kind: 'stroke',
      color: '#1f2937',
      width: 20,
      points: [0, 50, 100, 50],
      erasures: [{ id: 'erase', width: 4, points: [30, 50, 70, 50] }],
    };

    paintDrawingStroke(main.context, stroke, 1, { createScratchCanvas: () => scratchCanvas });

    expect(scratch.context.arc).toHaveBeenNthCalledWith(1, 30, 50, 2, 0, Math.PI * 2);
    expect(scratch.context.arc).toHaveBeenNthCalledWith(2, 70, 50, 2, 0, Math.PI * 2);
    expect(scratch.context.lineTo).not.toHaveBeenCalledWith(70, 50);
  });

  it('异常长兼容笔画只按主画布可见区域分配擦除临时层', () => {
    const main = mockContext();
    Object.assign(main.context.canvas, { width: 480, height: 270 });
    main.context.getTransform = vi.fn(
      () => ({ a: 0.2, b: 0, c: 0, d: 0.2, e: 0, f: 0 }) as DOMMatrix,
    );
    const scratch = mockContext();
    const createdSizes: Array<{ width: number; height: number }> = [];
    const stroke: DrawingStrokeElement = {
      id: 'long-stroke',
      kind: 'stroke',
      color: '#1f2937',
      width: 20,
      points: [-4096, 50, 8404, 50],
      erasures: [{ id: 'erase', width: 4, points: [50, 50] }],
    };

    paintDrawingStroke(main.context, stroke, 0.2, {
      createScratchCanvas: (width, height) => {
        createdSizes.push({ width, height });
        return { width, height, getContext: () => scratch.context } as unknown as HTMLCanvasElement;
      },
    });

    expect(createdSizes).toHaveLength(1);
    expect(createdSizes[0].width).toBeLessThanOrEqual(481);
    expect(createdSizes[0].height).toBeLessThanOrEqual(270);
    expect(main.context.drawImage).toHaveBeenCalledOnce();
  });
});
