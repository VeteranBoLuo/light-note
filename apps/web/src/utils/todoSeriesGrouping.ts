import type { TodoItem } from '@/api/todoApi';
import { compareTodoOccurrences } from '@/utils/todoPlanning';

export type TodoListNode =
  | { kind: 'item'; key: string; item: TodoItem }
  | { kind: 'series'; key: string; seriesId: string; representative: TodoItem; items: TodoItem[] };

export interface TodoMatrixEntry {
  item: TodoItem;
  seriesId: string | null;
  seriesCount: number;
}

function completedTime(item: TodoItem) {
  const value = item.completedAt || item.updatedAt;
  const time = value ? new Date(String(value).replace(' ', 'T')).getTime() : Number.NaN;
  return Number.isFinite(time) ? time : 0;
}

/**
 * 只聚合同一 seriesId 的固定日程实例；同标题或“完成后再次安排”都不能误合并。
 * 数据行仍保持独立，聚合仅生成列表视图模型。
 */
export function buildTodoListNodes(items: readonly TodoItem[]): TodoListNode[] {
  const seriesBuckets = new Map<string, TodoItem[]>();
  for (const item of items) {
    if (!item.seriesId || item.series?.repeatMode !== 'scheduled') continue;
    const bucketKey = `${item.seriesId}:${item.status}`;
    const bucket = seriesBuckets.get(bucketKey) || [];
    bucket.push(item);
    seriesBuckets.set(bucketKey, bucket);
  }

  const groupByRepresentativeId = new Map<string, Extract<TodoListNode, { kind: 'series' }>>();
  const groupedItemIds = new Set<string>();
  for (const [bucketKey, bucket] of seriesBuckets) {
    if (bucket.length < 2) continue;
    const pending = bucket.filter((entry) => entry.status === 'pending').sort(compareTodoOccurrences);
    const completed = bucket
      .filter((entry) => entry.status === 'completed')
      .sort((left, right) => completedTime(right) - completedTime(left));
    const representative = pending[0] || completed[0] || bucket[0];
    const seriesId = representative.seriesId || '';
    const node: Extract<TodoListNode, { kind: 'series' }> = {
      kind: 'series',
      key: `series:${bucketKey}`,
      seriesId,
      representative,
      items: [...pending, ...completed],
    };
    groupByRepresentativeId.set(representative.id, node);
    for (const entry of bucket) groupedItemIds.add(entry.id);
  }

  const result: TodoListNode[] = [];
  for (const item of items) {
    const group = groupByRepresentativeId.get(item.id);
    if (group) result.push(group);
    else if (!groupedItemIds.has(item.id)) result.push({ kind: 'item', key: `todo:${item.id}`, item });
  }
  return result;
}

/** 四象限以系列的下一项为代表，同时保留系列语义供卡片展示。 */
export function buildTodoMatrixEntries(items: readonly TodoItem[]): TodoMatrixEntry[] {
  return buildTodoListNodes(items).map((node) =>
    node.kind === 'series'
      ? {
          item: node.representative,
          seriesId: node.seriesId,
          seriesCount: node.items.length,
        }
      : {
          item: node.item,
          seriesId: null,
          seriesCount: 1,
        },
  );
}

/** @deprecated 新代码应使用 buildTodoMatrixEntries()，避免丢失系列标识。 */
export function collapseTodoSeriesForMatrix(items: readonly TodoItem[]) {
  return buildTodoMatrixEntries(items).map((entry) => entry.item);
}
