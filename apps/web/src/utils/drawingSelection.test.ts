import { describe, expect, it } from 'vitest';
import type { DrawingShapeElement, DrawingStrokeElement, DrawingTextElement } from '@lightnote/shared/drawing-note';
import {
  cloneDrawingElement,
  drawingRectsIntersect,
  normalizeDrawingRect,
  readDrawingClipboard,
  resetDrawingClipboard,
  translateDrawingElement,
  writeDrawingClipboard,
} from './drawingSelection';

const stroke: DrawingStrokeElement = {
  id: 'stroke-1',
  kind: 'stroke',
  color: '#1f2329',
  width: 2,
  points: [10, 20, 30, 40],
};

const text: DrawingTextElement = {
  id: 'text-1',
  kind: 'text',
  x: 50,
  y: 60,
  width: 180,
  fontSize: 18,
  color: '#1f2329',
  text: '示例',
};

const shape: DrawingShapeElement = {
  id: 'shape-1',
  kind: 'shape',
  shape: 'ellipse',
  x: 100,
  y: 120,
  width: 200,
  height: 140,
  color: '#615ced',
  strokeWidth: 4,
};

describe('drawingSelection', () => {
  it('按任意拖动方向归一化框选矩形', () => {
    expect(normalizeDrawingRect({ x: 80, y: 50 }, { x: 20, y: 10 })).toEqual({
      x: 20,
      y: 10,
      width: 60,
      height: 40,
    });
  });

  it('边界接触也视为框选命中', () => {
    expect(drawingRectsIntersect({ x: 0, y: 0, width: 20, height: 20 }, { x: 20, y: 10, width: 8, height: 8 })).toBe(
      true,
    );
    expect(drawingRectsIntersect({ x: 0, y: 0, width: 20, height: 20 }, { x: 21, y: 10, width: 8, height: 8 })).toBe(
      false,
    );
  });

  it('深拷贝笔迹坐标，避免复制内容与原元素共享数组', () => {
    const cloned = cloneDrawingElement(stroke, 'stroke-copy');
    expect(cloned).toEqual({ ...stroke, id: 'stroke-copy' });
    expect(cloned).not.toBe(stroke);
    if (cloned.kind !== 'stroke') throw new Error('expected stroke');
    expect(cloned.points).not.toBe(stroke.points);
  });

  it('平移笔迹、文本和形状时不修改原元素', () => {
    expect(translateDrawingElement(stroke, 5, -10, 'stroke-copy')).toEqual({
      ...stroke,
      id: 'stroke-copy',
      points: [15, 10, 35, 30],
    });
    expect(translateDrawingElement(text, -10, 20, 'text-copy')).toEqual({
      ...text,
      id: 'text-copy',
      x: 40,
      y: 80,
    });
    expect(translateDrawingElement(shape, 12, -8, 'shape-copy')).toEqual({
      ...shape,
      id: 'shape-copy',
      x: 112,
      y: 112,
    });
    expect(stroke.points).toEqual([10, 20, 30, 40]);
    expect(text).toMatchObject({ x: 50, y: 60 });
    expect(shape).toMatchObject({ x: 100, y: 120 });
  });

  it('剪贴板跨编辑器保存深拷贝，并为每次粘贴生成新 id 和递增序号', () => {
    resetDrawingClipboard();
    const sourceStroke = { ...stroke, points: [...stroke.points] };
    writeDrawingClipboard([sourceStroke, text]);
    sourceStroke.points[0] = 999;

    let index = 0;
    const first = readDrawingClipboard(() => `copy-${++index}`);
    const second = readDrawingClipboard(() => `copy-${++index}`);

    expect(first.sequence).toBe(1);
    expect(first.elements.map((element) => element.id)).toEqual(['copy-1', 'copy-2']);
    expect(first.elements[0]).toMatchObject({ points: [10, 20, 30, 40] });
    expect(second.sequence).toBe(2);
    expect(second.elements.map((element) => element.id)).toEqual(['copy-3', 'copy-4']);
    resetDrawingClipboard();
  });
});
