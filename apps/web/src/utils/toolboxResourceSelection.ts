import { resourceItemKey, type ResourcePickerItem } from '@/composables/useResourcePickerSearch';
import type { AiScopeRef } from '@/types/aiScope';
import type { NoteTreeItem } from '@/types/noteTree';

export interface ToolboxResourceSelectionGroup {
  type: 'note_branch';
  id: string;
  title: string;
}

export type ToolboxSelectedResource = ResourcePickerItem & {
  selectionGroup?: ToolboxResourceSelectionGroup;
};

export type ToolboxBranchMergeResult =
  | { status: 'merged'; items: ToolboxSelectedResource[]; branchCount: number }
  | { status: 'already_selected'; branchCount: number }
  | { status: 'limit_exceeded'; branchCount: number; totalCount: number };

/**
 * 目录范围只是一种前端快捷选择：这里把根与所有后代展开成普通 note 项，并按资源 key 去重。
 * 这样报价、输入上限和服务端归属校验仍只有一套事实源。
 */
export function mergeToolboxNoteBranchSelection(input: {
  current: ToolboxSelectedResource[];
  scope: AiScopeRef;
  descendants: Array<Pick<NoteTreeItem, 'id' | 'title'>>;
  max: number;
  externalCount?: number;
}): ToolboxBranchMergeResult {
  const { current, scope, descendants } = input;
  const group: ToolboxResourceSelectionGroup = { type: 'note_branch', id: scope.id, title: scope.title };
  const branchByKey = new Map<string, ToolboxSelectedResource>();
  const branchItems: ResourcePickerItem[] = [
    { type: 'note', id: scope.id, title: scope.title },
    ...descendants.map((item) => ({ type: 'note' as const, id: item.id, title: item.title })),
  ];
  for (const item of branchItems) branchByKey.set(resourceItemKey(item), { ...item, selectionGroup: group });

  const currentByKey = new Map(current.map((item) => [resourceItemKey(item), item]));
  const additions = [...branchByKey.values()].filter((item) => !currentByKey.has(resourceItemKey(item)));
  const branchAlreadyGrouped = [...branchByKey.keys()].every(
    (key) => currentByKey.get(key)?.selectionGroup?.id === scope.id,
  );
  if (!additions.length && branchAlreadyGrouped) {
    return { status: 'already_selected', branchCount: branchByKey.size };
  }

  const totalCount = current.length + additions.length + Math.max(0, Number(input.externalCount) || 0);
  if (totalCount > input.max) return { status: 'limit_exceeded', branchCount: branchByKey.size, totalCount };

  const items = current.map((item) => branchByKey.get(resourceItemKey(item)) || item);
  items.push(...additions);
  return { status: 'merged', items, branchCount: branchByKey.size };
}

/** 单独取消目录中的一项后，其余项退回普通多选，避免继续冒充“完整目录”。 */
export function removeToolboxSelectedResource(current: ToolboxSelectedResource[], item: ResourcePickerItem) {
  const key = resourceItemKey(item);
  const groupId = current.find((entry) => resourceItemKey(entry) === key)?.selectionGroup?.id;
  return current
    .filter((entry) => resourceItemKey(entry) !== key)
    .map((entry) => {
      if (!groupId || entry.selectionGroup?.id !== groupId) return entry;
      const { selectionGroup: _selectionGroup, ...plainItem } = entry;
      return plainItem;
    });
}
