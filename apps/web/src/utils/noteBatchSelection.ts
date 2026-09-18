import type { NoteTreeItem } from '@/types/noteTree';

/** 合并目录中已展开的页面与已加载列表；折叠分支缓存不属于本次全选范围。 */
export function collectNoteBatchCandidates(
  list: Array<{ id: string; [key: string]: any }>,
  childrenByParent: Record<string, NoteTreeItem[]>,
  expandedIds: Set<string>,
  rootKey: string,
) {
  const candidates = new Map<string, { id: string; [key: string]: any }>();
  const visit = (parentId: string) => {
    for (const node of childrenByParent[parentId] || []) {
      if (candidates.has(String(node.id))) continue;
      candidates.set(String(node.id), node);
      if (expandedIds.has(node.id)) visit(node.id);
    }
  };
  visit(rootKey);
  // 列表快照包含更完整的正文类型与操作元数据。
  for (const note of list) candidates.set(String(note.id), note);
  return [...candidates.values()];
}
