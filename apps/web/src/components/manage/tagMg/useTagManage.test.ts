import { describe, expect, it } from 'vitest';
import { buildFilterCounts, filterAndSortTags, getTotalResourceCount, type TagRecord } from './tagManageModel';

const tags: TagRecord[] = [
  {
    id: '1',
    name: 'Vue',
    bookmarkList: [
      { id: 'b1', name: 'Vue' },
      { id: 'b2', name: 'Vue Router' },
    ],
    noteList: [{ id: 'n1', name: 'Vue 笔记' }],
  },
  { id: '2', name: '空标签' },
  { id: '3', name: 'CSS', fileList: [{ id: 'f1', name: '样式表' }] },
];

describe('useTagManage model', () => {
  it('统计单个标签关联的全部资源', () => {
    expect(getTotalResourceCount(tags[0])).toBe(3);
    expect(getTotalResourceCount(tags[1])).toBe(0);
  });

  it('按关键词和资源类型筛选', () => {
    expect(filterAndSortTags(tags, 'vue', 'all', 'default').map((item) => item.id)).toEqual(['1']);
    expect(filterAndSortTags(tags, '', 'file', 'default').map((item) => item.id)).toEqual(['3']);
    expect(filterAndSortTags(tags, '', 'empty', 'default').map((item) => item.id)).toEqual(['2']);
  });

  it('支持按资源数量和空标签优先排序', () => {
    expect(filterAndSortTags(tags, '', 'all', 'resourceDesc').map((item) => item.id)).toEqual(['1', '3', '2']);
    expect(filterAndSortTags(tags, '', 'all', 'emptyFirst')[0].id).toBe('2');
  });

  it('筛选计数会跟随关键词范围变化', () => {
    expect(buildFilterCounts(tags)).toEqual({ all: 3, active: 2, bookmark: 1, note: 1, file: 1, empty: 1 });
    expect(buildFilterCounts(tags, 'CSS')).toEqual({ all: 1, active: 1, bookmark: 0, note: 0, file: 1, empty: 0 });
  });
});
