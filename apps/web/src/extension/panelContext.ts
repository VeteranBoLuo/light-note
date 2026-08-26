export function parseExtensionPanelTabId(search: string): number | null {
  const rawTabId = new URLSearchParams(search).get('tabId');
  if (!rawTabId || !/^\d+$/u.test(rawTabId)) return null;

  const tabId = Number(rawTabId);
  return Number.isSafeInteger(tabId) && tabId >= 0 ? tabId : null;
}

export function currentExtensionPanelTabId(): number | null {
  const search = typeof location === 'undefined' ? '' : location.search;
  return parseExtensionPanelTabId(search);
}

export function buildExtensionPanelPath(tabId: number): string {
  if (!Number.isSafeInteger(tabId) || tabId < 0) {
    throw new TypeError('扩展侧栏标签页 ID 无效');
  }
  return `sidepanel.html?tabId=${tabId}`;
}
