import { describe, expect, it } from 'vitest';
import { interleaveByType, resourceItemKey } from './useResourcePickerSearch';

const item = (type: string, id: string) => ({ type, id, title: `${type}-${id}` });

describe('useResourcePickerSearch', () => {
  it('按类型轮转,避免结果被单一类型占满', () => {
    // 搜索接口按类型分段返回:书签在前,直接截断会只剩书签
    const rows = [
      item('bookmark', 'b1'),
      item('bookmark', 'b2'),
      item('bookmark', 'b3'),
      item('note', 'n1'),
      item('note', 'n2'),
      item('file', 'f1'),
    ];
    expect(interleaveByType(rows, 4).map((row) => row.id)).toEqual(['b1', 'n1', 'f1', 'b2']);
  });

  it('同类内部保持接口给的顺序', () => {
    const rows = [item('note', 'n1'), item('note', 'n2'), item('note', 'n3')];
    expect(interleaveByType(rows, 3).map((row) => row.id)).toEqual(['n1', 'n2', 'n3']);
  });

  it('某类耗尽后继续用剩下的类型填满', () => {
    const rows = [item('bookmark', 'b1'), item('bookmark', 'b2'), item('bookmark', 'b3'), item('note', 'n1')];
    expect(interleaveByType(rows, 4).map((row) => row.id)).toEqual(['b1', 'n1', 'b2', 'b3']);
  });

  it('结果不足 limit 时全部返回,不补空', () => {
    expect(interleaveByType([item('note', 'n1')], 5)).toHaveLength(1);
  });

  it('limit 为 0 或空输入返回空数组', () => {
    expect(interleaveByType([item('note', 'n1')], 0)).toEqual([]);
    expect(interleaveByType([], 5)).toEqual([]);
  });

  it('资源 key 由类型与 ID 组成', () => {
    expect(resourceItemKey({ type: 'note', id: '1' })).toBe('note:1');
  });
});
