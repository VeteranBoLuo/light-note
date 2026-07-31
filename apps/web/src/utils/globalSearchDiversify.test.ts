import { describe, expect, it } from 'vitest';
import type { SearchResultItem } from '@/api/search';
import { dedupeSearchItems, diversifySearchItems } from './globalSearchDiversify';

function item(type: SearchResultItem['type'], id: string): SearchResultItem {
  return { id, type, title: `${type}-${id}`, description: '' };
}

describe('快捷搜索类型均衡', () => {
  it('单一类型最多占 3 条，其他类型有匹配时优先补位', () => {
    const ranked = [
      ...Array.from({ length: 8 }, (_, index) => item('bookmark', `b${index}`)),
      item('note', 'n1'),
      item('note', 'n2'),
      item('todo', 't1'),
      item('tag', 'g1'),
      item('file', 'f1'),
    ];
    const picked = diversifySearchItems(ranked);
    expect(picked).toHaveLength(8);
    expect(picked.filter((entry) => entry.type === 'bookmark')).toHaveLength(3);
    expect(picked.map((entry) => entry.type)).toEqual([
      'bookmark',
      'bookmark',
      'bookmark',
      'note',
      'note',
      'todo',
      'tag',
      'file',
    ]);
  });

  it('其他类型没有匹配时用超出上限的高相关结果补足总数', () => {
    const ranked = Array.from({ length: 10 }, (_, index) => item('bookmark', `b${index}`));
    const picked = diversifySearchItems(ranked);
    expect(picked).toHaveLength(8);
    // 补足时仍按原相关度顺序，不跳着取
    expect(picked.map((entry) => entry.id)).toEqual(['b0', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7']);
  });

  it('同类型内部保持原相关度顺序', () => {
    const ranked = [item('note', 'high'), item('bookmark', 'b1'), item('note', 'mid'), item('note', 'low')];
    const picked = diversifySearchItems(ranked);
    expect(picked.filter((entry) => entry.type === 'note').map((entry) => entry.id)).toEqual([
      'high',
      'mid',
      'low',
    ]);
  });

  it('结果不足总量时原样返回', () => {
    const ranked = [item('note', 'n1'), item('todo', 't1')];
    expect(diversifySearchItems(ranked)).toHaveLength(2);
  });

  it('按类型 + ID 去重，保留首次出现的顺序', () => {
    const items = [item('note', 'n1'), item('todo', 'n1'), item('note', 'n1'), item('note', 'n2')];
    expect(dedupeSearchItems(items).map((entry) => `${entry.type}:${entry.id}`)).toEqual([
      'note:n1',
      'todo:n1',
      'note:n2',
    ]);
  });
});
