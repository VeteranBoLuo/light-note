import { NOTE_TREE_MAX_DEPTH, type NoteTreeItem } from '@/types/noteTree';

export interface FlatNoteTreeItem extends NoteTreeItem {
  depth: number;
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

export function canMoveNoteSubtreeToDepth(targetParentDepth: number, subtreeRelativeDepth: number) {
  const parentDepth = Math.max(0, Math.trunc(Number(targetParentDepth) || 0));
  const relativeDepth = Math.max(0, Math.trunc(Number(subtreeRelativeDepth) || 0));
  return parentDepth + 1 + relativeDepth <= NOTE_TREE_MAX_DEPTH;
}
