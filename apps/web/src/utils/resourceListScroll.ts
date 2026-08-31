export interface ResourceListScrollAnchor {
  /** 稳定资源键；结果重新排序时仍优先回到同一项。 */
  key: string;
  /** 键暂未加载时的游标位置回退。 */
  index: number;
  /** 锚点项顶部相对视口顶部的偏移。 */
  offset: number;
}

export interface ResourceListScrollPosition {
  top: number;
  viewportHeight: number;
}

function normalizedPitch(pitch: number) {
  return Math.max(1, Number(pitch) || 1);
}

export function captureResourceListScrollAnchor<T extends Record<string, unknown>>({
  items,
  itemKey,
  scrollTop,
  pitch,
}: {
  items: T[];
  itemKey: string;
  scrollTop: number;
  pitch: number;
}): ResourceListScrollAnchor | null {
  if (!items.length) return null;
  const rowPitch = normalizedPitch(pitch);
  const top = Math.max(0, Number(scrollTop) || 0);
  const logicalIndex = Math.max(0, Math.floor(top / rowPitch));
  const loadedIndex = Math.min(items.length - 1, logicalIndex);
  const keyValue = items[loadedIndex]?.[itemKey];
  return {
    key: keyValue == null ? '' : String(keyValue),
    index: logicalIndex,
    offset: Math.max(0, Math.min(rowPitch - 1, top - logicalIndex * rowPitch)),
  };
}

export function resolveResourceListScrollAnchor<T extends Record<string, unknown>>({
  items,
  itemKey,
  anchor,
  pitch,
  logicalCount = items.length,
}: {
  items: T[];
  itemKey: string;
  anchor: ResourceListScrollAnchor;
  pitch: number;
  logicalCount?: number;
}) {
  const rowPitch = normalizedPitch(pitch);
  const keyedIndex = anchor.key ? items.findIndex((item) => String(item?.[itemKey] ?? '') === anchor.key) : -1;
  const upperBound = Math.max(0, Math.max(items.length, Math.trunc(logicalCount || 0)) - 1);
  const index = keyedIndex >= 0 ? keyedIndex : Math.min(upperBound, Math.max(0, Math.trunc(anchor.index || 0)));
  return {
    keyMatched: keyedIndex >= 0,
    index,
    top: Math.max(0, index * rowPitch + Math.max(0, Math.min(rowPitch - 1, anchor.offset || 0))),
  };
}

export function resourceListBackToTopThreshold(viewportHeight: number) {
  return Math.max(720, Math.max(0, Number(viewportHeight) || 0) * 1.5);
}

export function shouldShowResourceListBackToTop(position: ResourceListScrollPosition) {
  return Math.max(0, position.top) >= resourceListBackToTopThreshold(position.viewportHeight);
}

export function resourceListBackToTopBehavior({
  position,
  reducedMotion,
}: {
  position: ResourceListScrollPosition;
  reducedMotion: boolean;
}): ScrollBehavior {
  if (reducedMotion) return 'auto';
  const longDistance = Math.max(720, Math.max(0, position.viewportHeight) * 3);
  return Math.max(0, position.top) >= longDistance ? 'auto' : 'smooth';
}
