import type { NoteTreeItem } from '@/types/noteTree';

export type NoteTreeDropPosition = 'inside' | 'before' | 'after' | 'root-start';

export interface NoteTreeDropTarget {
  key: string;
  isTop: boolean;
  parentId: string | null;
  title: string;
  previousId: string | null;
  nextId: string | null;
  position: NoteTreeDropPosition;
}

export interface NoteTreeDragSource {
  id: string;
  isTop: boolean;
  parentId?: string | null;
}

export interface OptimisticNoteTreeMoveResult {
  applied: boolean;
  childrenByParent: Record<string, NoteTreeItem[]>;
}

const TREE_ROW_EDGE_RATIO = 0.28;

/**
 * 目录树节点的上、下边缘表示同级插入，中央表示移入为子页面。
 * 边缘落点以目标节点的置顶分组为准：跨分组拖放时，服务端会同步切换被拖页面的置顶状态。
 */
export function buildTreeNodeDropTarget({
  node,
  source,
  relativeY,
  height,
}: {
  node: Pick<NoteTreeItem, 'id' | 'parentId' | 'title' | 'isTop'>;
  source: NoteTreeDragSource;
  relativeY: number;
  height: number;
}): NoteTreeDropTarget | null {
  if (!node.id || node.id === source.id || !Number.isFinite(relativeY) || !Number.isFinite(height) || height <= 0) {
    return null;
  }

  if (relativeY <= height * TREE_ROW_EDGE_RATIO) {
    return {
      key: node.id,
      isTop: Boolean(node.isTop),
      parentId: node.parentId || null,
      title: node.title,
      previousId: null,
      nextId: node.id,
      position: 'before',
    };
  }
  if (relativeY >= height * (1 - TREE_ROW_EDGE_RATIO)) {
    return {
      key: node.id,
      isTop: Boolean(node.isTop),
      parentId: node.parentId || null,
      title: node.title,
      previousId: node.id,
      nextId: null,
      position: 'after',
    };
  }

  return {
    key: node.id,
    isTop: false,
    parentId: node.id,
    title: node.title,
    previousId: null,
    nextId: null,
    position: 'inside',
  };
}

/** “我的知识库”是根层最前落点；置顶与普通页面仍分别保持自己的分组。 */
export function buildRootStartDropTarget({
  rootItems,
  source,
  title,
  rootKey,
}: {
  rootItems: Array<Pick<NoteTreeItem, 'id' | 'isTop'>>;
  source: NoteTreeDragSource;
  title: string;
  rootKey: string;
}): NoteTreeDropTarget | null {
  const sameGroup = rootItems.filter((item) => Boolean(item.isTop) === source.isTop);
  if (sameGroup[0]?.id === source.id) return null;
  const firstSibling = sameGroup.find((item) => item.id !== source.id);
  return {
    key: rootKey,
    isTop: firstSibling ? Boolean(firstSibling.isTop) : source.parentId == null ? source.isTop : false,
    parentId: null,
    title,
    previousId: null,
    nextId: firstSibling?.id || null,
    position: 'root-start',
  };
}

function treeParentKey(parentId: string | null, rootKey: string) {
  return parentId || rootKey;
}

function normalizeSiblingSort(items: NoteTreeItem[]) {
  let pinnedSort = 0;
  let normalSort = 0;
  return items.map((item) => ({
    ...item,
    sort: item.isTop ? pinnedSort++ : normalSort++,
  }));
}

function updateParentSummary(childrenByParent: Record<string, NoteTreeItem[]>, parentId: string | null, delta: number) {
  if (!parentId || !delta) return;
  for (const [key, items] of Object.entries(childrenByParent)) {
    const index = items.findIndex((item) => item.id === parentId);
    if (index < 0) continue;
    const childCount = Math.max(0, Number(items[index].childCount || 0) + delta);
    const nextItems = [...items];
    nextItems[index] = { ...nextItems[index], childCount, hasChildren: childCount > 0 };
    childrenByParent[key] = nextItems;
    return;
  }
}

/**
 * 在请求发出前把拖拽结果应用到已加载的目录树；调用方保留旧对象即可在失败时完整回滚。
 * 未加载的目标子层只写入内存展示，不会标记为已加载，后续展开仍会由接口校准。
 */
export function moveNoteTreeNodeOptimistically(
  source: Record<string, NoteTreeItem[]>,
  sourceId: string,
  target: NoteTreeDropTarget,
  rootKey = '__light_note_root__',
): OptimisticNoteTreeMoveResult {
  const next = Object.fromEntries(
    Object.entries(source).map(([key, items]) => [key, items.map((item) => ({ ...item }))]),
  ) as Record<string, NoteTreeItem[]>;

  let moved: NoteTreeItem | null = null;
  let sourceKey = '';
  for (const [key, items] of Object.entries(next)) {
    const index = items.findIndex((item) => item.id === sourceId);
    if (index < 0) continue;
    [moved] = items.splice(index, 1);
    sourceKey = key;
    next[key] = normalizeSiblingSort(items);
    break;
  }
  if (!moved) return { applied: false, childrenByParent: source };

  const previousParentId = moved.parentId || null;
  const targetKey = treeParentKey(target.parentId, rootKey);
  const targetItems = sourceKey === targetKey ? next[targetKey] : [...(next[targetKey] || [])];
  const nextAnchorIndex = target.nextId ? targetItems.findIndex((item) => item.id === target.nextId) : -1;
  const previousAnchorIndex = target.previousId ? targetItems.findIndex((item) => item.id === target.previousId) : -1;
  if ((target.nextId && nextAnchorIndex < 0) || (target.previousId && previousAnchorIndex < 0)) {
    return { applied: false, childrenByParent: source };
  }

  let insertIndex = targetItems.length;
  if (nextAnchorIndex >= 0) insertIndex = nextAnchorIndex;
  else if (previousAnchorIndex >= 0) insertIndex = previousAnchorIndex + 1;
  else if (target.position === 'root-start') {
    const firstGroupIndex = targetItems.findIndex((item) => Boolean(item.isTop) === target.isTop);
    insertIndex = firstGroupIndex >= 0 ? firstGroupIndex : target.isTop ? 0 : targetItems.length;
  }

  targetItems.splice(insertIndex, 0, {
    ...moved,
    parentId: target.parentId,
    isTop: target.isTop,
  });
  next[targetKey] = normalizeSiblingSort(targetItems);

  if (previousParentId !== target.parentId) {
    updateParentSummary(next, previousParentId, -1);
    updateParentSummary(next, target.parentId, 1);
  }
  return { applied: true, childrenByParent: next };
}
