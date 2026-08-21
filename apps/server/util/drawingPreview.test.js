import { describe, expect, it } from 'vitest';
import {
  buildDrawingScenePreview,
  DRAWING_PREVIEW_MAX_ELEMENTS,
  DRAWING_PREVIEW_MAX_FILL_SPANS,
  DRAWING_PREVIEW_MAX_POINT_PAIRS,
  DRAWING_PREVIEW_MAX_TEXT_CHARACTERS,
} from './drawingPreview.js';

const stroke = (id, pointPairs = 2) => ({
  id,
  kind: 'stroke',
  color: '#1f2937',
  width: 4,
  points: Array.from({ length: pointPairs * 2 }, (_, index) => (index % 2 === 0 ? index / 2 : index / 2 + 10)),
});

describe('drawingPreview', () => {
  it('压缩轨迹点但保留每条轨迹的首尾位置', () => {
    const original = stroke('s1', 4_000);
    const preview = buildDrawingScenePreview({
      v: 1,
      page: { width: 1024, height: 1448 },
      elements: [original],
    });
    const points = preview.elements[0].points;
    expect(points.length / 2).toBeLessThanOrEqual(DRAWING_PREVIEW_MAX_POINT_PAIRS);
    expect(points.slice(0, 2)).toEqual(original.points.slice(0, 2));
    expect(points.slice(-2)).toEqual(original.points.slice(-2));
  });

  it('限制元素与文本总量，避免预览响应退化为完整场景', () => {
    const elements = Array.from({ length: 160 }, (_, index) =>
      index % 2
        ? stroke(`s${index}`, 20)
        : {
            id: `t${index}`,
            kind: 'text',
            x: 20,
            y: 20,
            width: 300,
            fontSize: 20,
            color: '#1f2937',
            text: '预览文字'.repeat(100),
          },
    );
    const preview = buildDrawingScenePreview({ v: 1, page: { width: 1024, height: 1448 }, elements });
    expect(preview.elements.length).toBeLessThanOrEqual(DRAWING_PREVIEW_MAX_ELEMENTS);
    const textLength = preview.elements
      .filter((element) => element.kind === 'text')
      .reduce((sum, element) => sum + element.text.length, 0);
    expect(textLength).toBeLessThanOrEqual(DRAWING_PREVIEW_MAX_TEXT_CHARACTERS);
  });

  it('保留 V2 形状元素供卡片完整渲染', () => {
    const preview = buildDrawingScenePreview({
      v: 2,
      page: { width: 1448, height: 1448 },
      elements: [
        {
          id: 'shape-1',
          kind: 'shape',
          shape: 'ellipse',
          x: 100,
          y: 120,
          width: 260,
          height: 180,
          color: '#615ced',
          strokeWidth: 4,
        },
      ],
    });

    expect(preview.elements).toEqual([
      expect.objectContaining({ id: 'shape-1', kind: 'shape', shape: 'ellipse', width: 260, height: 180 }),
    ]);
  });

  it('保留 V3 笔画擦除轨迹供卡片按像素语义渲染', () => {
    const preview = buildDrawingScenePreview({
      v: 3,
      page: { width: 1448, height: 1448 },
      elements: [
        {
          id: 'stroke',
          kind: 'stroke',
          color: '#1f2937',
          width: 20,
          points: [0, 50, 100, 50],
          erasures: [{ id: 'erase', width: 4, points: [50, 50] }],
        },
      ],
    });

    expect(preview.elements[0]).toMatchObject({
      id: 'stroke',
      erasures: [{ id: 'erase', width: 4, points: [50, 50] }],
    });
  });

  it('保留 V3 形状擦除轨迹供卡片按像素语义渲染', () => {
    const preview = buildDrawingScenePreview({
      v: 3,
      page: { width: 1448, height: 1448 },
      elements: [
        {
          id: 'shape',
          kind: 'shape',
          shape: 'ellipse',
          x: 100,
          y: 120,
          width: 200,
          height: 140,
          color: '#1f2937',
          strokeWidth: 20,
          erasures: [{ id: 'erase', width: 4, points: [200, 120] }],
        },
      ],
    });

    expect(preview.elements[0]).toMatchObject({
      id: 'shape',
      erasures: [{ id: 'erase', width: 4, points: [200, 120] }],
    });
  });

  it('有界保留 V4 填色扫描线，避免降级预览携带完整填色数据', () => {
    const rows = Array.from({ length: DRAWING_PREVIEW_MAX_FILL_SPANS + 500 }, (_, index) => {
      const segment = index % 2;
      return [Math.floor(index / 2), 100 + segment * 400, 300 + segment * 400];
    });
    const spans = rows.flat();
    const preview = buildDrawingScenePreview({
      v: 4,
      page: { width: 1448, height: 1448 },
      elements: [
        {
          id: 'fill',
          kind: 'fill',
          color: '#ef4444',
          x: 100,
          y: 0,
          spans,
        },
      ],
    });

    expect(preview.elements[0]).toMatchObject({ id: 'fill', kind: 'fill', color: '#ef4444' });
    expect(preview.elements[0].spans).toHaveLength(DRAWING_PREVIEW_MAX_FILL_SPANS * 3);
    expect(preview.elements[0].spans.slice(0, 3)).toEqual(rows[0]);
    expect(preview.elements[0].spans.slice(-3)).toEqual(rows.at(-1));
  });
});
