import { describe, expect, it } from 'vitest';
import {
  DRAWING_PAGE,
  DRAWING_SCENE_LIMITS,
  DrawingSceneValidationError,
  createEmptyDrawingScene,
  parseDrawingScene,
  serializeDrawingScene,
} from './drawingNote.js';

describe('drawingNote scene protocol', () => {
  it('创建并稳定序列化空白场景', () => {
    const empty = createEmptyDrawingScene();
    expect(empty).toEqual({ v: 1, page: DRAWING_PAGE, elements: [] });
    expect(parseDrawingScene(serializeDrawingScene(empty))).toEqual(empty);
  });

  it('只保留受支持字段并规范坐标精度', () => {
    expect(
      parseDrawingScene({
        v: 1,
        page: { width: 1024, height: 1448 },
        ignored: true,
        elements: [
          {
            id: 's_1',
            kind: 'stroke',
            color: '#00a884',
            width: 4,
            points: [1.234, 2.345],
            extra: 1,
          },
          {
            id: 't_1',
            kind: 'text',
            x: 10,
            y: 20,
            width: 180,
            fontSize: 28,
            color: '#1f2937',
            text: '文本',
          },
        ],
      }),
    ).toEqual({
      v: 1,
      page: { width: 1024, height: 1448 },
      elements: [
        {
          id: 's_1',
          kind: 'stroke',
          color: '#00a884',
          width: 4,
          points: [1.23, 2.35],
        },
        {
          id: 't_1',
          kind: 'text',
          x: 10,
          y: 20,
          width: 180,
          fontSize: 28,
          color: '#1f2937',
          text: '文本',
        },
      ],
    });
  });

  it('接受安全的自定义十六进制颜色并规范为小写', () => {
    expect(
      parseDrawingScene({
        v: 1,
        page: { width: 1024, height: 1448 },
        elements: [
          {
            id: 's',
            kind: 'stroke',
            color: '#A1B2C3',
            width: 2,
            points: [0, 0],
          },
        ],
      }).elements[0].color,
    ).toBe('#a1b2c3');
  });

  it('接受范围内的连续整数画笔宽度和文字字号', () => {
    const parsed = parseDrawingScene({
      v: 1,
      page: { width: 1024, height: 1448 },
      elements: [
        {
          id: 's',
          kind: 'stroke',
          color: '#1f2937',
          width: 11,
          points: [0, 0, 10, 10],
        },
        {
          id: 't',
          kind: 'text',
          x: 10,
          y: 20,
          width: 180,
          fontSize: 42,
          color: '#1f2937',
          text: '文本',
        },
      ],
    });

    expect(parsed.elements[0].width).toBe(11);
    expect(parsed.elements[1].fontSize).toBe(42);
  });

  it.each([
    [
      '脚本色值',
      {
        id: 's',
        kind: 'stroke',
        color: 'url(javascript:1)',
        width: 2,
        points: [0, 0],
      },
    ],
    [
      '奇数坐标',
      {
        id: 's',
        kind: 'stroke',
        color: '#1f2937',
        width: 2,
        points: [0, 0, 1],
      },
    ],
    ['过细画笔', { id: 's', kind: 'stroke', color: '#1f2937', width: 0, points: [0, 0] }],
    ['过粗画笔', { id: 's', kind: 'stroke', color: '#1f2937', width: 25, points: [0, 0] }],
    ['非整数画笔', { id: 's', kind: 'stroke', color: '#1f2937', width: 3.5, points: [0, 0] }],
    ['外链元素', { id: 'i', kind: 'image', url: 'https://example.com/a.png' }],
  ])('拒绝%s', (_label, element) => {
    expect(() =>
      parseDrawingScene({
        v: 1,
        page: { width: 1024, height: 1448 },
        elements: [element],
      }),
    ).toThrow(DrawingSceneValidationError);
  });

  it('拒绝超出点数上限的场景', () => {
    const points = Array.from({ length: (DRAWING_SCENE_LIMITS.maxPointPairs + 1) * 2 }, () => 1);
    expect(() =>
      parseDrawingScene({
        v: 1,
        page: { width: 1024, height: 1448 },
        elements: [{ id: 's', kind: 'stroke', color: '#1f2937', width: 2, points }],
      }),
    ).toThrow('画笔轨迹点数量超出限制');
  });
});
