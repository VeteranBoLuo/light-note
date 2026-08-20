import { describe, expect, it, vi } from 'vitest';
import type { DrawingShapeElement } from '@lightnote/shared/drawing-note';
import { constrainDrawingShapeEnd, drawingShapeBounds, paintDrawingShape } from './drawingShape';

const shape = (overrides: Partial<DrawingShapeElement> = {}): DrawingShapeElement => ({
  id: 'shape',
  kind: 'shape',
  shape: 'rectangle',
  x: 120,
  y: 80,
  width: -60,
  height: 40,
  color: '#1f2937',
  strokeWidth: 4,
  ...overrides,
});

describe('drawingShape', () => {
  it('有符号尺寸仍生成稳定包围框', () => {
    expect(drawingShapeBounds(shape())).toEqual({ x: 55, y: 75, width: 70, height: 50 });
  });

  it('Shift 将封闭形状约束为正方形、线条约束到 45 度', () => {
    expect(constrainDrawingShapeEnd(shape({ x: 0, y: 0 }), { x: 80, y: 30 }, true)).toEqual({ x: 80, y: 80 });
    const lineEnd = constrainDrawingShapeEnd(shape({ shape: 'line', x: 0, y: 0 }), { x: 100, y: 20 }, true);
    expect(lineEnd.y).toBeCloseTo(0, 5);
    expect(lineEnd.x).toBeCloseTo(Math.hypot(100, 20), 5);
  });

  it('箭头渲染包含主线和两个箭头边', () => {
    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      strokeStyle: '',
      fillStyle: '',
      lineWidth: 1,
      lineCap: 'butt',
      lineJoin: 'miter',
    } as unknown as CanvasRenderingContext2D;
    paintDrawingShape(context, shape({ shape: 'arrow', x: 10, y: 20, width: 100, height: 0 }));
    expect(context.lineTo).toHaveBeenCalledTimes(3);
    expect(context.stroke).toHaveBeenCalledOnce();
  });
});
