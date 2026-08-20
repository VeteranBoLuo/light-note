import { describe, expect, it } from 'vitest';
import type { DrawingElement } from '@lightnote/shared/drawing-note';
import { eraseDrawingElementsAt } from './drawingEraser';

const stroke: DrawingElement = {
  id: 'stroke',
  kind: 'stroke',
  color: '#1f2937',
  width: 4,
  points: [0, 50, 100, 50],
};

const limits = { maxErasureTrails: 20, maxErasurePointPairs: 100 };

describe('drawingEraser', () => {
  it('小橡皮点击粗笔画时保存同尺寸圆形遮罩，不再拆断中心线', () => {
    const thickStroke: DrawingElement = { ...stroke, width: 20 };
    const result = eraseDrawingElementsAt([thickStroke], { x: 50, y: 50 }, 4, 'erase-1', limits);

    expect(result.changed).toBe(true);
    expect(result.elements).toHaveLength(1);
    expect(result.elements[0]).toMatchObject({
      id: 'stroke',
      kind: 'stroke',
      width: 20,
      points: [0, 50, 100, 50],
      erasures: [{ id: 'erase-1', width: 4, points: [50, 50] }],
    });
  });

  it('同一次擦除移动时追加为一条连续轨迹，并过滤无意义密集点', () => {
    const first = eraseDrawingElementsAt([stroke], { x: 40, y: 50 }, 8, 'erase-1', limits);
    const dense = eraseDrawingElementsAt(first.elements, { x: 40.2, y: 50 }, 8, 'erase-1', limits);
    const moved = eraseDrawingElementsAt(dense.elements, { x: 50, y: 50 }, 8, 'erase-1', limits);

    expect(dense.changed).toBe(false);
    expect(dense.elements).toBe(first.elements);
    expect(moved.elements[0]).toMatchObject({
      erasures: [{ id: 'erase-1', width: 8, points: [40, 50, 50, 50] }],
    });
  });

  it('未与可见笔画像素相交时复用原数组，避免移动过程产生无效对象', () => {
    const elements = [stroke];
    const result = eraseDrawingElementsAt(elements, { x: 50, y: 100 }, 8, 'erase-1', limits);

    expect(result.changed).toBe(false);
    expect(result.elements).toBe(elements);
  });

  it('只给实际相交的笔画添加遮罩，不修改相邻笔画对象', () => {
    const nearbyThickStroke: DrawingElement = {
      id: 'nearby-thick',
      kind: 'stroke',
      color: '#1f2937',
      width: 20,
      points: [0, 50, 100, 50],
    };
    const targetDot: DrawingElement = {
      id: 'target-dot',
      kind: 'stroke',
      color: '#1f2937',
      width: 4,
      points: [50, 72],
    };

    const result = eraseDrawingElementsAt([nearbyThickStroke, targetDot], { x: 50, y: 72 }, 8, 'erase-1', limits);

    expect(result.changed).toBe(true);
    expect(result.elements[0]).toBe(nearbyThickStroke);
    expect(result.elements[1]).toMatchObject({
      id: 'target-dot',
      erasures: [{ id: 'erase-1', width: 8, points: [50, 72] }],
    });
  });

  it('橡皮擦不删除文本对象', () => {
    const text: DrawingElement = {
      id: 'text',
      kind: 'text',
      x: 40,
      y: 40,
      width: 100,
      fontSize: 20,
      color: '#1f2937',
      text: '保留文本',
    };
    const result = eraseDrawingElementsAt([text], { x: 50, y: 50 }, 30, 'erase-1', limits);

    expect(result.changed).toBe(false);
    expect(result.elements[0]).toBe(text);
  });

  it('形状轮廓支持同尺寸局部擦除，但形状内部空白不会写入无效遮罩', () => {
    const rectangle: DrawingElement = {
      id: 'rectangle',
      kind: 'shape',
      shape: 'rectangle',
      x: 20,
      y: 20,
      width: 100,
      height: 80,
      color: '#1f2937',
      strokeWidth: 20,
    };
    const hit = eraseDrawingElementsAt([rectangle], { x: 70, y: 20 }, 4, 'erase-shape', limits);
    const miss = eraseDrawingElementsAt(hit.elements, { x: 70, y: 60 }, 4, 'erase-shape', limits);

    expect(hit.changed).toBe(true);
    expect(hit.elements[0]).toMatchObject({
      id: 'rectangle',
      erasures: [{ id: 'erase-shape', width: 4, points: [70, 20] }],
    });
    expect(miss.changed).toBe(false);
    expect(miss.elements).toBe(hit.elements);
  });

  it('擦除轨迹超过协议上限时保留原内容', () => {
    const result = eraseDrawingElementsAt([stroke], { x: 50, y: 50 }, 8, 'erase-1', {
      maxErasureTrails: 0,
      maxErasurePointPairs: 0,
    });

    expect(result.limitReached).toBe(true);
    expect(result.changed).toBe(false);
    expect(result.elements[0]).toBe(stroke);
  });
});
