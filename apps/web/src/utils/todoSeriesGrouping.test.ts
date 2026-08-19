import { describe, expect, it } from 'vitest';
import type { TodoItem } from '@/api/todoApi';
import {
  buildTodoAgendaEntries,
  buildTodoListNodes,
  buildTodoMatrixEntries,
  collapseTodoSeriesForMatrix,
} from './todoSeriesGrouping';

const now = new Date('2026-08-19T12:00:00');

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

const scheduled = {
  id: 'series-1',
  repeatMode: 'scheduled',
  status: 'active',
  createdAt: '2026-08-01 08:00:00',
} as TodoItem['series'];

describe('todoSeriesGrouping', () => {
  it('先按时间桶再聚合，让昨天、今天和未来实例各自可见', () => {
    const nodes = buildTodoListNodes(
      [
        item('future-2', { seriesId: 'series-1', series: scheduled, occurrenceDate: '2026-08-21', occurrenceNo: 4 }),
        item('today', { seriesId: 'series-1', series: scheduled, occurrenceDate: '2026-08-19', occurrenceNo: 2 }),
        item('missed', { seriesId: 'series-1', series: scheduled, occurrenceDate: '2026-08-18', occurrenceNo: 1 }),
        item('future-1', { seriesId: 'series-1', series: scheduled, occurrenceDate: '2026-08-20', occurrenceNo: 3 }),
      ],
      { now, sort: 'smart' },
    );

    expect(nodes.map((node) => [node.bucket, node.kind === 'series' ? node.representative.id : node.item.id])).toEqual([
      ['overdue', 'missed'],
      ['today', 'today'],
      ['upcoming', 'future-1'],
    ]);
    expect(nodes.every((node) => node.kind === 'series')).toBe(true);
  });

  it('桶内代表项遵循当前排序，系列创建时间不会被滚动生成时间污染', () => {
    const otherSeries = {
      ...scheduled,
      id: 'series-2',
      createdAt: '2026-08-10 08:00:00',
    } as TodoItem['series'];
    const nodes = buildTodoListNodes(
      [
        item('old-series-high', {
          seriesId: 'series-1',
          series: scheduled,
          occurrenceDate: '2026-08-20',
          priority: 2,
          createdAt: '2026-08-19 12:00:00',
        }),
        item('new-series-normal', {
          seriesId: 'series-2',
          series: otherSeries,
          occurrenceDate: '2026-08-20',
          createdAt: '2026-08-10 08:00:00',
        }),
      ],
      { now, sort: 'newest' },
    );
    expect(nodes.map((node) => (node.kind === 'series' ? node.seriesId : node.item.seriesId))).toEqual([
      'series-2',
      'series-1',
    ]);
  });

  it('列表四种可选排序都只作用于时间桶内部', () => {
    const lowEarly = item('low-early', {
      title: '低优先但更早',
      priority: 0,
      occurrenceDate: null,
      dueAt: '2026-08-20T09:00:00',
      createdAt: '2026-08-01 08:00:00',
    });
    const highLate = item('high-late', {
      title: '高优先但更晚',
      priority: 2,
      occurrenceDate: null,
      dueAt: '2026-08-20T18:00:00',
      createdAt: '2026-08-18 08:00:00',
    });
    const ids = (sort: 'smart' | 'action' | 'priority' | 'newest') =>
      buildTodoListNodes([lowEarly, highLate], { now, sort }).map((node) =>
        node.kind === 'series' ? node.representative.id : node.item.id,
      );

    expect(ids('smart')).toEqual(['high-late', 'low-early']);
    expect(ids('action')).toEqual(['low-early', 'high-late']);
    expect(ids('priority')).toEqual(['high-late', 'low-early']);
    expect(ids('newest')).toEqual(['high-late', 'low-early']);
  });

  it('四象限优先展示今天，其次最近错过，再其次未来', () => {
    const entries = buildTodoMatrixEntries(
      [
        item('missed', { seriesId: 'series-1', series: scheduled, occurrenceDate: '2026-08-18' }),
        item('today', { seriesId: 'series-1', series: scheduled, occurrenceDate: '2026-08-19' }),
        item('future', { seriesId: 'series-1', series: scheduled, occurrenceDate: '2026-08-20' }),
      ],
      now,
    );
    expect(entries).toMatchObject([
      { item: { id: 'today' }, seriesId: 'series-1', missedCount: 1, todayCount: 1, futureCount: 1 },
    ]);
  });

  it('议程只折叠同系列历史未完成实例，今天与未来仍逐项展示', () => {
    const entries = buildTodoAgendaEntries(
      [
        item('missed-1', { seriesId: 'series-1', series: scheduled, occurrenceDate: '2026-08-17' }),
        item('missed-2', { seriesId: 'series-1', series: scheduled, occurrenceDate: '2026-08-18' }),
        item('today', { seriesId: 'series-1', series: scheduled, occurrenceDate: '2026-08-19' }),
        item('future', { seriesId: 'series-1', series: scheduled, occurrenceDate: '2026-08-20' }),
      ],
      now,
    );
    expect(entries.map((entry) => [entry.item.id, entry.missedCount])).toEqual([
      ['missed-2', 2],
      ['today', 0],
      ['future', 0],
    ]);
  });

  it('相同标题与完成后再次安排保持独立，已完成状态不混入未完成桶', () => {
    const afterCompletion = { id: 'series-2', repeatMode: 'after_completion', status: 'active' } as TodoItem['series'];
    const items = [
      item('scheduled-1', { seriesId: 'series-1', series: scheduled, occurrenceDate: '2026-08-20' }),
      item('scheduled-2', { seriesId: 'series-1', series: scheduled, occurrenceDate: '2026-08-21' }),
      item('same-title', { occurrenceDate: '2026-08-20' }),
      item('after-1', { seriesId: 'series-2', series: afterCompletion, occurrenceDate: '2026-08-20' }),
      item('after-2', { seriesId: 'series-2', series: afterCompletion, occurrenceDate: '2026-08-21' }),
      item('completed', {
        seriesId: 'series-1',
        series: scheduled,
        status: 'completed',
        occurrenceDate: '2026-08-18',
      }),
    ];

    expect(
      collapseTodoSeriesForMatrix(items, now)
        .map((entry) => entry.id)
        .sort(),
    ).toEqual(['same-title', 'after-1', 'scheduled-1', 'after-2'].sort());
    const completedNode = buildTodoListNodes(items, { now }).find((node) => node.bucket === 'completed');
    expect(completedNode).toMatchObject({ kind: 'series', representative: { id: 'completed' } });
  });
});
