import { describe, expect, it } from 'vitest';
import { getTodoMatrixQuadrant, groupTodosByMatrix, isTodoMatrixUrgent } from './todoMatrix';

const now = new Date(2026, 7, 11, 10, 30);

describe('todo matrix classification', () => {
  it('把高优先级且已逾期或今天截止的待办归入重要且紧急', () => {
    expect(getTodoMatrixQuadrant({ priority: 2, dueAt: '2026-08-10T18:00:00' }, now)).toBe('importantUrgent');
    expect(getTodoMatrixQuadrant({ priority: 2, dueAt: '2026-08-11T23:59:59' }, now)).toBe('importantUrgent');
  });

  it('从明天零点开始视为不紧急，无日期和非法日期也不会误判', () => {
    expect(isTodoMatrixUrgent({ priority: 2, dueAt: '2026-08-12T00:00:00' }, now)).toBe(false);
    expect(getTodoMatrixQuadrant({ priority: 2, dueAt: null }, now)).toBe('importantNotUrgent');
    expect(getTodoMatrixQuadrant({ priority: 1, dueAt: 'not-a-date' }, now)).toBe('otherNotUrgent');
  });

  it('没有截止时间的重复实例按计划日期判断紧急性', () => {
    expect(isTodoMatrixUrgent({ priority: 1, dueAt: null, occurrenceDate: '2026-08-10' }, now)).toBe(true);
    expect(isTodoMatrixUrgent({ priority: 1, dueAt: null, occurrenceDate: '2026-08-11' }, now)).toBe(true);
    expect(isTodoMatrixUrgent({ priority: 1, dueAt: null, occurrenceDate: '2026-08-12' }, now)).toBe(false);
  });

  it('把普通与低优先级合并，并保持服务端返回顺序', () => {
    const items = [
      { id: 'normal-today', priority: 1 as const, dueAt: '2026-08-11T18:00:00' },
      { id: 'low-overdue', priority: 0 as const, dueAt: '2026-08-09T18:00:00' },
      { id: 'normal-future', priority: 1 as const, dueAt: '2026-08-13T18:00:00' },
    ];

    const groups = groupTodosByMatrix(items, now);

    expect(groups.otherUrgent.map((item) => item.id)).toEqual(['normal-today', 'low-overdue']);
    expect(groups.otherNotUrgent.map((item) => item.id)).toEqual(['normal-future']);
  });
});
