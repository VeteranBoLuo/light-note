import { describe, expect, it } from 'vitest';
import { NOTE_TREE_DRAG_SCROLL_EDGE, resolveNoteTreeDragScrollStep } from './noteTreeDragScroll';

const rect = { top: 100, right: 300, bottom: 500, left: 100, height: 400 };

describe('目录树拖拽边缘自动滚动', () => {
  it('上下 40px 热区内分别返回向上和向下的滚动量', () => {
    expect(
      resolveNoteTreeDragScrollStep({ clientX: 200, clientY: 100 + NOTE_TREE_DRAG_SCROLL_EDGE - 1, rect }),
    ).toBeLessThan(0);
    expect(
      resolveNoteTreeDragScrollStep({ clientX: 200, clientY: 500 - NOTE_TREE_DRAG_SCROLL_EDGE + 1, rect }),
    ).toBeGreaterThan(0);
    expect(resolveNoteTreeDragScrollStep({ clientX: 200, clientY: 300, rect })).toBe(0);
  });

  it('越靠近边缘滚动越快，离开目录树横向范围不触发', () => {
    const nearEdge = resolveNoteTreeDragScrollStep({ clientX: 200, clientY: 102, rect });
    const innerEdge = resolveNoteTreeDragScrollStep({ clientX: 200, clientY: 150, rect });
    expect(Math.abs(nearEdge)).toBeGreaterThan(Math.abs(innerEdge));
    expect(resolveNoteTreeDragScrollStep({ clientX: 90, clientY: 102, rect })).toBe(0);
  });

  it('界面缩放时按视觉尺寸同步换算热区', () => {
    expect(resolveNoteTreeDragScrollStep({ clientX: 200, clientY: 135, rect, rootZoom: 1 })).toBeLessThan(0);
    expect(resolveNoteTreeDragScrollStep({ clientX: 200, clientY: 135, rect, rootZoom: 0.8 })).toBe(0);
  });
});
