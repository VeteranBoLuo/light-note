export const RESOURCE_LIST_PAGE_SIZE = 48;
export const SEARCH_PAGE_SIZE = 40;
export const RESOURCE_LOAD_MORE_THRESHOLD = 360;

export interface ResourceSortMove {
  id: string;
  previousId: string | null;
  nextId: string | null;
}

function getResourceId(item: any) {
  return String(item?.id ?? '').trim();
}

export function mergeResourcePage<T>(current: T[], incoming: T[], getKey: (item: T) => string = getResourceId): T[] {
  const merged = new Map<string, T>();
  [...current, ...incoming].forEach((item) => {
    const key = getKey(item);
    if (key) merged.set(key, item);
  });
  return Array.from(merged.values());
}

export function isNearResourceScrollEnd(
  element: Pick<HTMLElement, 'scrollTop' | 'clientHeight' | 'scrollHeight'>,
  threshold = RESOURCE_LOAD_MORE_THRESHOLD,
) {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= threshold;
}

export function hasResourceOrderChanged<T>(before: T[], after: T[]) {
  if (before.length !== after.length) return true;
  return before.some((item, index) => getResourceId(item) !== getResourceId(after[index]));
}

/**
 * 生成分页列表安全排序所需的相邻锚点。
 *
 * 底部资源尚未加载时，previousId/nextId 仍能准确描述“移动到当前两项之间”，
 * 后端据此在完整排序中定位，不需要前端把已加载前缀从 0 开始重新编号。
 */
export function buildResourceSortMove<T>(
  items: T[],
  movedId: string,
  sameGroup: (candidate: T, moved: T) => boolean = () => true,
): ResourceSortMove | null {
  const normalizedMovedId = String(movedId || '').trim();
  const moved = items.find((item) => getResourceId(item) === normalizedMovedId);
  if (!moved) return null;

  const group = items.filter((item) => sameGroup(item, moved));
  const index = group.findIndex((item) => getResourceId(item) === normalizedMovedId);
  if (index < 0 || group.length < 2) return null;

  return {
    id: normalizedMovedId,
    previousId: index > 0 ? getResourceId(group[index - 1]) : null,
    nextId: index < group.length - 1 ? getResourceId(group[index + 1]) : null,
  };
}
