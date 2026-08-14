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

describe('drawingEraser', () => {
  it('只裁切圆形擦除区域并保留同一笔画两侧', () => {
    let id = 0;
    const result = eraseDrawingElementsAt([stroke], { x: 50, y: 50 }, 10, () => `split_${++id}`);

    expect(result.changed).toBe(true);
    expect(result.elements).toHaveLength(2);
    expect(result.elements[0]).toMatchObject({ id: 'stroke', kind: 'stroke' });
    expect(result.elements[1]).toMatchObject({ id: 'split_1', kind: 'stroke' });
    expect(result.elements[0].kind === 'stroke' && result.elements[0].points.at(-2)).toBeLessThan(50);
    expect(result.elements[1].kind === 'stroke' && result.elements[1].points[0]).toBeGreaterThan(50);
  });

  it('未命中时复用原数组，避免移动过程产生无效对象', () => {
    const elements = [stroke];
    const result = eraseDrawingElementsAt(elements, { x: 50, y: 100 }, 5, () => 'unused');

    expect(result.changed).toBe(false);
    expect(result.elements).toBe(elements);
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
    const result = eraseDrawingElementsAt([text], { x: 50, y: 50 }, 30, () => 'unused');

    expect(result.changed).toBe(false);
    expect(result.elements[0]).toBe(text);
  });

  it('拆分结果超过协议元素上限时保留原内容', () => {
    const elements: DrawingElement[] = [stroke, { ...stroke, id: 'stroke_2', points: [0, 100, 100, 100] }];
    const result = eraseDrawingElementsAt(elements, { x: 50, y: 50 }, 10, () => 'split', {
      maxElements: 2,
      maxStrokes: 2,
    });

    expect(result.limitReached).toBe(true);
    expect(result.changed).toBe(false);
    expect(result.elements).toBe(elements);
  });
});
