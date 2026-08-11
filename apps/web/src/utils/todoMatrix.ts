import type { TodoItem } from '@/api/todoApi';
import { parseTodoDate } from '@/utils/todoPlanning';

export type TodoMatrixQuadrantKey = 'importantUrgent' | 'importantNotUrgent' | 'otherUrgent' | 'otherNotUrgent';

export const TODO_MATRIX_QUADRANT_ORDER: TodoMatrixQuadrantKey[] = [
  'importantUrgent',
  'importantNotUrgent',
  'otherUrgent',
  'otherNotUrgent',
];

type TodoMatrixSource = Pick<TodoItem, 'priority' | 'dueAt'>;

/**
 * 四象限中的“紧急”使用本地日历日判断：已逾期或今天截止都算紧急。
 * 明天 00:00 起、无截止时间以及非法时间都归为不紧急。
 */
export function isTodoMatrixUrgent(item: TodoMatrixSource, now = new Date()) {
  if (!item.dueAt) return false;
  const dueAt = parseTodoDate(item.dueAt).getTime();
  if (!Number.isFinite(dueAt)) return false;
  const nextLocalDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  return dueAt < nextLocalDay;
}

/** 高优先级对应“重要”，普通与低优先级合并为“普通/低优先”。 */
export function getTodoMatrixQuadrant(item: TodoMatrixSource, now = new Date()): TodoMatrixQuadrantKey {
  const important = item.priority === 2;
  const urgent = isTodoMatrixUrgent(item, now);
  if (important) return urgent ? 'importantUrgent' : 'importantNotUrgent';
  return urgent ? 'otherUrgent' : 'otherNotUrgent';
}

/** 分组只派生展示，不改变服务端返回的待办顺序或待办字段。 */
export function groupTodosByMatrix<T extends TodoMatrixSource>(items: readonly T[], now = new Date()) {
  const groups = Object.fromEntries(TODO_MATRIX_QUADRANT_ORDER.map((key) => [key, []])) as Record<
    TodoMatrixQuadrantKey,
    T[]
  >;
  items.forEach((item) => groups[getTodoMatrixQuadrant(item, now)].push(item));
  return groups;
}
