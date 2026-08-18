import { describe, expect, it } from 'vitest';
import type { TodoItem } from '@/api/todoApi';
import { buildTodoListNodes, buildTodoMatrixEntries, collapseTodoSeriesForMatrix } from './todoSeriesGrouping';

function item(id: string, overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    id,
    title: '推广',
    checklist: [],
    priority: 1,
    status: 'pending',
    occurrenceDate: '2026-08-18',
    createdAt: '2026-08-18 00:00:00',
    updatedAt: '2026-08-18 00:00:00',
    ...overrides,
  };
}

describe('todoSeriesGrouping', () => {
  it('仅按固定日程 seriesId 聚合，不按相同标题误合并', () => {
    const series = { id: 'series-1', repeatMode: 'scheduled', status: 'active' } as TodoItem['series'];
    const nodes = buildTodoListNodes([
      item('day-2', { seriesId: 'series-1', series, occurrenceDate: '2026-08-19', occurrenceNo: 2 }),
      item('same-title'),
      item('day-1', { seriesId: 'series-1', series, occurrenceDate: '2026-08-18', occurrenceNo: 1 }),
    ]);

    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toMatchObject({ kind: 'item', item: { id: 'same-title' } });
    expect(nodes[1]).toMatchObject({ kind: 'series', seriesId: 'series-1', representative: { id: 'day-1' } });
  });

  it('完成后再次安排的实例保持独立，四象限只保留固定日程下一项', () => {
    const scheduled = { id: 'series-1', repeatMode: 'scheduled', status: 'active' } as TodoItem['series'];
    const afterCompletion = {
      id: 'series-2',
      repeatMode: 'after_completion',
      status: 'active',
    } as TodoItem['series'];
    const items = [
      item('scheduled-1', { seriesId: 'series-1', series: scheduled, occurrenceNo: 1 }),
      item('scheduled-2', { seriesId: 'series-1', series: scheduled, occurrenceNo: 2 }),
      item('after-1', { seriesId: 'series-2', series: afterCompletion }),
      item('after-2', { seriesId: 'series-2', series: afterCompletion }),
    ];

    expect(collapseTodoSeriesForMatrix(items).map((entry) => entry.id)).toEqual(['scheduled-1', 'after-1', 'after-2']);
    expect(buildTodoMatrixEntries(items)).toMatchObject([
      { item: { id: 'scheduled-1' }, seriesId: 'series-1', seriesCount: 2 },
      { item: { id: 'after-1' }, seriesId: null, seriesCount: 1 },
      { item: { id: 'after-2' }, seriesId: null, seriesCount: 1 },
    ]);
  });

  it('全部视图不把已完成实例折叠进未完成组', () => {
    const series = { id: 'series-1', repeatMode: 'scheduled', status: 'active' } as TodoItem['series'];
    const nodes = buildTodoListNodes([
      item('pending-1', { seriesId: 'series-1', series, status: 'pending', occurrenceNo: 3 }),
      item('completed-1', { seriesId: 'series-1', series, status: 'completed', occurrenceNo: 1 }),
      item('completed-2', { seriesId: 'series-1', series, status: 'completed', occurrenceNo: 2 }),
    ]);

    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toMatchObject({ kind: 'item', item: { id: 'pending-1', status: 'pending' } });
    expect(nodes[1]).toMatchObject({ kind: 'series', representative: { status: 'completed' } });
  });
});
