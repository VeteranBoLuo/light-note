import type { NoteTreeItem } from '@/types/noteTree';

export interface FlatNoteTreeItem extends NoteTreeItem {
  depth: number;
}

/**
 * 列表中的路径只展示父级目录；当前笔记标题已经在卡片/行首出现，不能再重复一遍。
 * 同时兼容新后端的 path 数组和旧后端只返回 pathText 的响应。
 */
export function getNoteParentPathText(note: {
  title?: unknown;
  path?: Array<{ id?: unknown; title?: unknown }> | null;
  pathText?: unknown;
}) {
  if (Array.isArray(note.path)) {
    return note.path
      .slice(0, -1)
      .map((item) => String(item?.title || '').trim())
      .filter(Boolean)
      .join(' / ');
  }
  const segments = String(note.pathText || '')
    .split(' / ')
    .map((item) => item.trim())
    .filter(Boolean);
  if (segments.at(-1) === String(note.title || '').trim()) segments.pop();
  return segments.join(' / ');
}

/**
 * 列表搜索/根目录视图会返回完整 path；最后一项是当前笔记，倒数第二项才是可打开的父页面。
 * 旧接口可能只有 parentId，因此保留兼容回退，但绝不根据标题反查，避免重名页面跳错。
 */
export function getNoteParentTargetId(note: {
  parentId?: unknown;
  path?: Array<{ id?: unknown }> | null;
}) {
  const pathParentId = Array.isArray(note.path) && note.path.length > 1 ? note.path.at(-2)?.id : null;
  return String(pathParentId || note.parentId || '').trim();
}

export function flattenNoteTree(items: NoteTreeItem[] = []): FlatNoteTreeItem[] {
  const result: FlatNoteTreeItem[] = [];
  const visited = new Set<string>();
  const visit = (nodes: NoteTreeItem[], depth: number) => {
    for (const node of Array.isArray(nodes) ? nodes : []) {
      const id = String(node?.id || '').trim();
      if (!id || visited.has(id)) continue;
      visited.add(id);
      result.push({ ...node, id, depth });
      if (Array.isArray(node.children) && node.children.length) visit(node.children, depth + 1);
    }
  };
  visit(items, 1);
  return result;
}

export function collectNoteDescendantIds(items: NoteTreeItem[] = [], rootId: string) {
  const normalizedRootId = String(rootId || '').trim();
  if (!normalizedRootId) return new Set<string>();
  const childrenByParent = new Map<string, string[]>();
  for (const node of flattenNoteTree(items)) {
    const parentId = String(node.parentId || '').trim();
    if (!parentId) continue;
    const children = childrenByParent.get(parentId) || [];
    children.push(node.id);
    childrenByParent.set(parentId, children);
  }
  const descendants = new Set<string>();
  const queue = [...(childrenByParent.get(normalizedRootId) || [])];
  while (queue.length) {
    const id = queue.shift();
    if (!id || descendants.has(id) || id === normalizedRootId) continue;
    descendants.add(id);
    queue.push(...(childrenByParent.get(id) || []));
  }
  return descendants;
}

export function canMoveNoteSubtreeToDepth(targetParentDepth: number, subtreeRelativeDepth: number, maxDepth: number) {
  const parentDepth = Math.max(0, Math.trunc(Number(targetParentDepth) || 0));
  const relativeDepth = Math.max(0, Math.trunc(Number(subtreeRelativeDepth) || 0));
  const normalizedMaxDepth = Math.trunc(Number(maxDepth) || 0);
  return normalizedMaxDepth > 0 && parentDepth + 1 + relativeDepth <= normalizedMaxDepth;
}
