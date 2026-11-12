import type { TodoItem } from '@/api/todoApi';
import {
  compareTodoOccurrences,
  isTodoOverdue,
  normalizeTodoDateOnly,
  parseTodoDate,
  todoScheduleAt,
  type TodoGroupKey,
} from '@/utils/todoPlanning';

export interface TodoMatrixEntry {
  item: TodoItem;
  seriesId: string | null;
  seriesCount: number;
  missedCount: number;
  todayCount: number;
  futureCount: number;
}

export interface TodoAgendaEntry {
  item: TodoItem;
  seriesId: string | null;
  missedCount: number;
}

export type TodoAgendaGroupKey = 'overdue' | 'today' | 'upcoming' | 'completed';
export interface TodoAgendaGroup {
  key: TodoAgendaGroupKey;
  entries: TodoAgendaEntry[];
  instanceCount: number;
}

/** 议程按左侧展示的计划／完成时间排序，提醒不改变时间线位置。 */
export function todoAgendaAt(item: TodoItem) {
  return item.status === 'completed'
    ? item.completedAt || item.updatedAt || todoScheduleAt(item)
    : todoScheduleAt(item);
}

function compareAgendaItems(left: TodoItem, right: TodoItem) {
  return (
    todoTime(todoAgendaAt(left), Number.POSITIVE_INFINITY) - todoTime(todoAgendaAt(right), Number.POSITIVE_INFINITY) ||
    stableTodoOrder(left, right)
  );
}

function completedTime(item: TodoItem) {
  const value = item.completedAt || item.updatedAt;
  const time = value ? new Date(String(value).replace(' ', 'T')).getTime() : Number.NaN;
  return Number.isFinite(time) ? time : 0;
}

function isScheduledSeries(item: TodoItem) {
  return Boolean(item.seriesId && item.series?.repeatMode === 'scheduled');
}

function stableTodoOrder(left: TodoItem, right: TodoItem) {
  const leftNo = Number(left.occurrenceNo ?? Number.MAX_SAFE_INTEGER);
  const rightNo = Number(right.occurrenceNo ?? Number.MAX_SAFE_INTEGER);
  if (leftNo !== rightNo) return leftNo - rightNo;
  return String(left.id).localeCompare(String(right.id));
}

function todoTime(value: string | null | undefined, fallback: number) {
  if (!value) return fallback;
  const time = parseTodoDate(value).getTime();
  return Number.isFinite(time) ? time : fallback;
}

function occurrenceDay(item: TodoItem) {
  return normalizeTodoDateOnly(item.occurrenceDate || item.startAt || item.dueAt);
}

function matrixSeriesEntry(items: TodoItem[], now: Date): TodoMatrixEntry {
  const today = normalizeTodoDateOnly(now);
  const pending = items.filter((item) => item.status === 'pending');
  const todayItems = pending.filter((item) => occurrenceDay(item) === today).sort(compareTodoOccurrences);
  const missed = pending
    .filter((item) => occurrenceDay(item) && occurrenceDay(item) < today)
    .sort((left, right) => compareTodoOccurrences(right, left));
  const future = pending
    .filter((item) => occurrenceDay(item) && occurrenceDay(item) > today)
    .sort(compareTodoOccurrences);
  const undated = pending.filter((item) => !occurrenceDay(item)).sort(compareTodoOccurrences);
  const completed = items
    .filter((item) => item.status === 'completed')
    .sort((left, right) => completedTime(right) - completedTime(left));
  const item = todayItems[0] || missed[0] || future[0] || undated[0] || completed[0] || items[0];
  return {
    item,
    seriesId: item.seriesId || null,
    seriesCount: items.length,
    missedCount: missed.length,
    todayCount: todayItems.length,
    futureCount: future.length,
  };
}

/** 四象限每个固定日程系列只显示一个“当前焦点”：今天 > 最近错过 > 下一项。 */
export function buildTodoMatrixEntries(items: readonly TodoItem[], now = new Date()): TodoMatrixEntry[] {
  const result: TodoMatrixEntry[] = [];
  const scheduled = new Map<string, TodoItem[]>();
  for (const item of items) {
    if (!isScheduledSeries(item)) {
      result.push({ item, seriesId: null, seriesCount: 1, missedCount: 0, todayCount: 0, futureCount: 0 });
      continue;
    }
    const seriesId = String(item.seriesId);
    const current = scheduled.get(seriesId) || [];
    current.push(item);
    scheduled.set(seriesId, current);
  }
  for (const seriesItems of scheduled.values()) result.push(matrixSeriesEntry(seriesItems, now));
  return result.sort((left, right) => compareTodoOccurrences(left.item, right.item));
}

/**
 * 议程只把同系列的历史未完成实例收成一条“错过 N 项”；今天和未来实例仍逐日展示。
 */
export function buildTodoAgendaEntries(items: readonly TodoItem[], now = new Date()): TodoAgendaEntry[] {
  const today = normalizeTodoDateOnly(now);
  const missedSeries = new Map<string, TodoItem[]>();
  const result: TodoAgendaEntry[] = [];
  for (const item of items) {
    const day = occurrenceDay(item);
    if (isScheduledSeries(item) && isTodoOverdue(item, now) && day && day < today) {
      const seriesId = String(item.seriesId);
      const current = missedSeries.get(seriesId) || [];
      current.push(item);
      missedSeries.set(seriesId, current);
      continue;
    }
    result.push({ item, seriesId: isScheduledSeries(item) ? String(item.seriesId) : null, missedCount: 0 });
  }
  for (const [seriesId, missed] of missedSeries) {
    const ordered = [...missed].sort((left, right) => compareAgendaItems(right, left));
    result.push({ item: ordered[0], seriesId, missedCount: ordered.length });
  }
  return result.sort((left, right) => compareAgendaItems(left.item, right.item));
}

export function buildTodoAgendaGroups(items: readonly TodoItem[], now = new Date()): TodoAgendaGroup[] {
  const today = normalizeTodoDateOnly(now);
  const groups: TodoAgendaGroup[] = ['overdue', 'today', 'upcoming', 'completed'].map((key) => ({
    key: key as TodoAgendaGroupKey,
    entries: [],
    instanceCount: 0,
  }));
  for (const entry of buildTodoAgendaEntries(items, now)) {
    const item = entry.item;
    const at = todoAgendaAt(item);
    if (!at || !Number.isFinite(parseTodoDate(at).getTime())) continue;
    const key =
      item.status === 'completed'
        ? 'completed'
        : isTodoOverdue(item, now)
          ? 'overdue'
          : normalizeTodoDateOnly(at) <= today
            ? 'today'
            : 'upcoming';
    const group = groups.find((group) => group.key === key)!;
    group.entries.push(entry);
    group.instanceCount += entry.missedCount || 1;
  }
  const completed = groups.find((group) => group.key === 'completed')!;
  completed.entries.sort(
    (left, right) =>
      todoTime(todoAgendaAt(right.item), 0) - todoTime(todoAgendaAt(left.item), 0) ||
      stableTodoOrder(left.item, right.item),
  );
  return groups.filter((group) => group.entries.length);
}
