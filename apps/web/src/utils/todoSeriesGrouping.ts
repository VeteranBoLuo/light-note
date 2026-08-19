import type { TodoItem, TodoSort } from '@/api/todoApi';
import {
  compareTodoOccurrences,
  normalizeTodoDateOnly,
  parseTodoDate,
  todoActionAt,
  todoGroupKey,
  type TodoGroupKey,
} from '@/utils/todoPlanning';

export type TodoListNode =
  | { kind: 'item'; key: string; item: TodoItem; bucket: TodoGroupKey }
  | {
      kind: 'series';
      key: string;
      seriesId: string;
      representative: TodoItem;
      items: TodoItem[];
      seriesItems: TodoItem[];
      bucket: TodoGroupKey;
    };

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

function seriesCreatedTime(item: TodoItem) {
  return todoTime(item.series?.createdAt || item.createdAt, 0);
}

function compareForSort(left: TodoItem, right: TodoItem, sort: TodoSort) {
  if (left.status === 'completed' || right.status === 'completed') {
    const completedDiff = completedTime(right) - completedTime(left);
    if (completedDiff) return completedDiff;
  }
  if (sort === 'priority' || sort === 'smart') {
    const priorityDiff = Number(right.priority || 0) - Number(left.priority || 0);
    if (priorityDiff) return priorityDiff;
  }
  if (sort === 'newest' || sort === 'oldest') {
    const direction = sort === 'newest' ? -1 : 1;
    const createdDiff = (seriesCreatedTime(left) - seriesCreatedTime(right)) * direction;
    if (createdDiff) return createdDiff;
  }
  if (sort === 'due') {
    const dueDiff = todoTime(left.dueAt, Number.POSITIVE_INFINITY) - todoTime(right.dueAt, Number.POSITIVE_INFINITY);
    if (dueDiff) return dueDiff;
  }
  const actionDiff =
    todoTime(todoActionAt(left), Number.POSITIVE_INFINITY) - todoTime(todoActionAt(right), Number.POSITIVE_INFINITY);
  if (actionDiff) return actionDiff;
  return stableTodoOrder(left, right);
}

/**
 * 列表先按时间状态切桶，再在桶内折叠固定日程系列。
 * 同一系列可以同时出现在“已逾期 / 今天 / 即将到来”中，避免最早实例遮住今天实例。
 */
export function buildTodoListNodes(
  items: readonly TodoItem[],
  options: { now?: Date; sort?: TodoSort } = {},
): TodoListNode[] {
  const now = options.now || new Date();
  const sort = options.sort || 'smart';
  const allSeriesItems = new Map<string, TodoItem[]>();
  const bucketSeriesItems = new Map<string, TodoItem[]>();
  const standalone: TodoListNode[] = [];

  for (const item of items) {
    const bucket = todoGroupKey(item, now);
    if (!isScheduledSeries(item)) {
      standalone.push({ kind: 'item', key: `todo:${item.id}`, item, bucket });
      continue;
    }
    const seriesId = String(item.seriesId);
    const all = allSeriesItems.get(seriesId) || [];
    all.push(item);
    allSeriesItems.set(seriesId, all);
    const bucketKey = `${seriesId}:${item.status}:${bucket}`;
    const current = bucketSeriesItems.get(bucketKey) || [];
    current.push(item);
    bucketSeriesItems.set(bucketKey, current);
  }

  const nodes = [...standalone];
  for (const [bucketKey, bucketItems] of bucketSeriesItems) {
    const ordered = [...bucketItems].sort((left, right) => compareForSort(left, right, sort));
    const representative = ordered[0];
    const seriesId = String(representative.seriesId);
    const bucket = todoGroupKey(representative, now);
    if ((allSeriesItems.get(seriesId) || []).length === 1) {
      nodes.push({ kind: 'item', key: `todo:${representative.id}`, item: representative, bucket });
      continue;
    }
    nodes.push({
      kind: 'series',
      key: `series:${bucketKey}`,
      seriesId,
      representative,
      items: ordered,
      seriesItems: [...(allSeriesItems.get(seriesId) || ordered)].sort(compareTodoOccurrences),
      bucket,
    });
  }

  return nodes.sort((left, right) => {
    const leftItem = left.kind === 'series' ? left.representative : left.item;
    const rightItem = right.kind === 'series' ? right.representative : right.item;
    return compareForSort(leftItem, rightItem, sort);
  });
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
    if (isScheduledSeries(item) && item.status === 'pending' && day && day < today) {
      const seriesId = String(item.seriesId);
      const current = missedSeries.get(seriesId) || [];
      current.push(item);
      missedSeries.set(seriesId, current);
      continue;
    }
    result.push({ item, seriesId: isScheduledSeries(item) ? String(item.seriesId) : null, missedCount: 0 });
  }
  for (const [seriesId, missed] of missedSeries) {
    const ordered = [...missed].sort((left, right) => compareTodoOccurrences(right, left));
    result.push({ item: ordered[0], seriesId, missedCount: ordered.length });
  }
  return result.sort((left, right) => compareTodoOccurrences(left.item, right.item));
}

/** @deprecated 新代码应使用 buildTodoMatrixEntries()，避免丢失系列标识。 */
export function collapseTodoSeriesForMatrix(items: readonly TodoItem[], now = new Date()) {
  return buildTodoMatrixEntries(items, now).map((entry) => entry.item);
}
