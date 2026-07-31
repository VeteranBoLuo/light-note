import { describe, expect, it } from 'vitest';
import { resourceItemKey, takePerType } from './useResourcePickerSearch';

const item = (type: string, id: string) => ({ type, id, title: `${type}-${id}` });

describe('useResourcePickerSearch', () => {
  it('按书签→笔记→文件的固定顺序分组,不与其它类型混排', () => {
    // 搜索接口按类型分段返回,直接截断会只剩书签;这里要保证三类都露出
    const rows = [
      item('bookmark', 'b1'),
      item('bookmark', 'b2'),
      item('note', 'n1'),
      item('file', 'f1'),
    ];
    expect(takePerType(rows, { perType: 5 }).map((row) => row.id)).toEqual(['b1', 'b2', 'n1', 'f1']);
  });

  it('每类最多取 perType 条', () => {
    const rows = [
      item('bookmark', 'b1'),
      item('bookmark', 'b2'),
      item('bookmark', 'b3'),
      item('note', 'n1'),
      item('note', 'n2'),
    ];
    expect(takePerType(rows, { perType: 2 }).map((row) => row.id)).toEqual(['b1', 'b2', 'n1', 'n2']);
  });

  it('同类内部保持接口给的顺序(最新在前)', () => {
    const rows = [item('note', 'n1'), item('note', 'n2'), item('note', 'n3')];
    expect(takePerType(rows, { perType: 5 }).map((row) => row.id)).toEqual(['n1', 'n2', 'n3']);
  });

  it('order 之外的类型追加在末尾,不丢结果', () => {
    const rows = [item('tag', 't1'), item('bookmark', 'b1')];
    expect(takePerType(rows, { perType: 5 }).map((row) => row.id)).toEqual(['b1', 't1']);
  });

  it('按 order 限定类型顺序', () => {
    const rows = [item('bookmark', 'b1'), item('note', 'n1'), item('file', 'f1')];
    expect(takePerType(rows, { perType: 5, order: ['file', 'note', 'bookmark'] }).map((row) => row.id)).toEqual([
      'f1',
      'n1',
      'b1',
    ]);
  });

  it('空输入返回空数组', () => {
    expect(takePerType([], { perType: 5 })).toEqual([]);
  });

  it('资源 key 由类型与 ID 组成', () => {
    expect(resourceItemKey({ type: 'note', id: '1' })).toBe('note:1');
  });
});
