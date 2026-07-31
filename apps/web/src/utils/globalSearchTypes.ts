/**
 * 搜索类型边界。
 *
 * 待办是行动对象，不是资料对象：它可以被全局搜索找到，但不能自动继承资源能力。
 * 因此类型必须分开声明，而不是把 'todo' 直接塞进一个万能的 SearchType 让所有调用方接受。
 *
 * - 全局搜索        → GlobalSearchType（含待办）
 * - 资料四页签/选择器 → ResourceSearchType（不含待办）
 * - 标签操作        → TaggableResourceType
 * - 加入待整理      → InboxableResourceType
 * - @ 资源引用      → ReferenceableResourceType
 */

export type ResourceSearchType = 'bookmark' | 'note' | 'file' | 'tag';
export type GlobalSearchType = ResourceSearchType | 'todo';
export type TaggableResourceType = 'bookmark' | 'note' | 'file';
export type InboxableResourceType = 'bookmark' | 'note' | 'file';
export type ReferenceableResourceType = 'bookmark' | 'note' | 'file';

export const RESOURCE_SEARCH_TYPES: readonly ResourceSearchType[] = ['bookmark', 'note', 'file', 'tag'];
export const GLOBAL_SEARCH_TYPES: readonly GlobalSearchType[] = [...RESOURCE_SEARCH_TYPES, 'todo'];
export const TAGGABLE_RESOURCE_TYPES: readonly TaggableResourceType[] = ['bookmark', 'note', 'file'];
export const INBOXABLE_RESOURCE_TYPES: readonly InboxableResourceType[] = ['bookmark', 'note', 'file'];
export const REFERENCEABLE_RESOURCE_TYPES: readonly ReferenceableResourceType[] = ['bookmark', 'note', 'file'];

export function isResourceSearchType(value: unknown): value is ResourceSearchType {
  return RESOURCE_SEARCH_TYPES.includes(String(value || '') as ResourceSearchType);
}

export function isGlobalSearchType(value: unknown): value is GlobalSearchType {
  return GLOBAL_SEARCH_TYPES.includes(String(value || '') as GlobalSearchType);
}

export function isTaggableResourceType(value: unknown): value is TaggableResourceType {
  return TAGGABLE_RESOURCE_TYPES.includes(String(value || '') as TaggableResourceType);
}

export function isInboxableResourceType(value: unknown): value is InboxableResourceType {
  return INBOXABLE_RESOURCE_TYPES.includes(String(value || '') as InboxableResourceType);
}

export function isReferenceableResourceType(value: unknown): value is ReferenceableResourceType {
  return REFERENCEABLE_RESOURCE_TYPES.includes(String(value || '') as ReferenceableResourceType);
}

/** 从任意结果集合中剔除待办，供只接受资料对象的调用方使用 */
export function keepResourceItems<T extends { type: string }>(
  items: readonly T[],
): Array<T & { type: ResourceSearchType }> {
  return items.filter((item): item is T & { type: ResourceSearchType } => isResourceSearchType(item.type));
}
