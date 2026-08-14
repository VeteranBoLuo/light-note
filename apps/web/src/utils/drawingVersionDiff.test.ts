import { describe, expect, it } from 'vitest';
import { compareDrawingVersions } from './drawingVersionDiff';

const page = { width: 1024, height: 1448 };
const scene = (elements: unknown[]) => JSON.stringify({ v: 1, page, elements });
const stroke = (id: string, points: number[]) => ({
  id,
  kind: 'stroke',
  color: '#1f2937',
  width: 4,
  points,
});
const text = (id: string, value: string) => ({
  id,
  kind: 'text',
  x: 40,
  y: 60,
  width: 240,
  fontSize: 20,
  color: '#1f2937',
  text: value,
});

describe('手绘历史版本差异', () => {
  it('按稳定元素 ID 区分新增、删除与修改移动', () => {
    const historical = scene([
      stroke('kept', [10, 10, 20, 20]),
      stroke('removed', [30, 30, 40, 40]),
      text('text', '旧'),
    ]);
    const current = scene([stroke('kept', [10, 10, 20, 20]), stroke('added', [50, 50, 60, 60]), text('text', '新')]);

    expect(compareDrawingVersions(current, historical)).toEqual({ added: 1, removed: 1, changed: 1 });
  });

  it('无效场景安全降级为空差异', () => {
    expect(compareDrawingVersions('{invalid', '')).toEqual({ added: 0, removed: 0, changed: 0 });
  });
});
