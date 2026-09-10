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
    expect(groups.map((group) => group.items.map((item) => item.id))).toEqual([['bookmark-1'], ['note-1'], ['file-1']]);
  });
});

describe('待办展示字段', () => {
  it('读取待办更新时间与标签，不把状态摘要当作时间', () => {
    const [todo] = mapDisplayItems(
      [
        {
          id: 't',
          type: 'todo',
          title: '任务',
          description: '',
          extra: '未完成 · 无截止时间',
          tags: [{ id: 'tag', name: '工作' }],
          raw: { update_time: '2026-09-10 12:00:00' },
        },
      ],
      '',
    );
    expect(todo.updatedAtText).toBe('2026-09-10 12:00:00');
    expect(todo.tagNames).toEqual(['工作']);
    expect(todo.updatedAtMs).toBeGreaterThan(0);
    const [missing] = mapDisplayItems([{ id: 't', type: 'todo', title: '', description: '', extra: '2026-09-10' }], '');
    expect(missing.updatedAtMs).toBe(0);
  });
});
