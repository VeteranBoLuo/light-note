import { describe, expect, it } from 'vitest';
import type { SearchResultItem } from '@/api/search.ts';
import { buildVisibleGroups, mapDisplayItems } from './searchUtils.ts';

describe('resource center search grouping', () => {
  it('keeps resource type groups when keyword relevance sorting is active', () => {
    const items: SearchResultItem[] = [
      { id: 'bookmark-1', type: 'bookmark', title: '飞机书签', description: '', raw: {} },
      { id: 'note-1', type: 'note', title: '飞机笔记', description: '', raw: {} },
      { id: 'file-1', type: 'file', title: '飞机资料', description: '', raw: {} },
    ];

    const groups = buildVisibleGroups(mapDisplayItems(items, '飞机'), ['bookmark', 'note', 'file', 'tag']);

    expect(groups.map((group) => group.type)).toEqual(['bookmark', 'note', 'file']);
    expect(groups.map((group) => group.items.map((item) => item.id))).toEqual([
      ['bookmark-1'],
      ['note-1'],
      ['file-1'],
    ]);
  });
});
