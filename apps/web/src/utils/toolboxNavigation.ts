import type { Router } from 'vue-router';

export type ToolboxReturnContext = 'workbench' | 'task';
export type ToolboxReturnDecision = 'back' | 'replace-home';

const ALLOWED_PARENT_ROUTE_NAMES: Record<ToolboxReturnContext, readonly string[]> = {
  workbench: ['toolboxHome'],
  task: ['toolboxHome', 'toolboxWorkbench'],
};

const TOOLBOX_SCROLL_STATE_KEY = '__lightnoteToolboxScroll';
const TOOLBOX_SCROLL_TTL_MS = 6 * 60 * 60 * 1000;

export type ToolboxScrollSnapshot = {
  schemaVersion: 1;
  routeFullPath: string;
  identityKey: string;
  top: number;
  left: number;
  updatedAt: number;
};

type ScrollElement = Pick<HTMLElement, 'scrollTop' | 'scrollLeft' | 'scrollHeight' | 'clientHeight'> &
  Partial<Pick<HTMLElement, 'scrollWidth' | 'clientWidth'>>;

function normalizedOffset(value: unknown): number {
  const offset = Number(value);
  return Number.isFinite(offset) ? Math.max(0, offset) : 0;
}

export function saveToolboxScrollSnapshot(options: {
  routeFullPath: string;
  identityKey: string;
  element: ScrollElement | null;
  history?: Pick<History, 'state' | 'replaceState'> | null;
  now?: number;
}): ToolboxScrollSnapshot | null {
  const { element } = options;
  const history =
    options.history === undefined ? (typeof window === 'undefined' ? null : window.history) : options.history;
  if (!element || !history) return null;
  const snapshot: ToolboxScrollSnapshot = {
    schemaVersion: 1,
    routeFullPath: String(options.routeFullPath || ''),
    identityKey: String(options.identityKey || ''),
    top: normalizedOffset(element.scrollTop),
    left: normalizedOffset(element.scrollLeft),
    updatedAt: Number(options.now ?? Date.now()),
  };
  history.replaceState({ ...(history.state || {}), [TOOLBOX_SCROLL_STATE_KEY]: snapshot }, '');
  return snapshot;
}

export function restoreToolboxScrollSnapshot(options: {
  routeFullPath: string;
  identityKey: string;
  element: ScrollElement | null;
  historyState?: unknown;
  now?: number;
}): boolean {
  const { element } = options;
  if (!element) return false;
  const state =
    options.historyState === undefined
      ? typeof window === 'undefined'
        ? null
        : window.history.state
      : options.historyState;
  const snapshot = (state as Record<string, unknown> | null)?.[TOOLBOX_SCROLL_STATE_KEY] as
    ToolboxScrollSnapshot | undefined;
  const now = Number(options.now ?? Date.now());
  if (
    !snapshot ||
    snapshot.schemaVersion !== 1 ||
    snapshot.routeFullPath !== String(options.routeFullPath || '') ||
    snapshot.identityKey !== String(options.identityKey || '') ||
    !Number.isFinite(snapshot.updatedAt) ||
    now - snapshot.updatedAt > TOOLBOX_SCROLL_TTL_MS ||
    snapshot.updatedAt > now + 60_000
  ) {
    return false;
  }
  const maxTop = Math.max(0, normalizedOffset(element.scrollHeight) - normalizedOffset(element.clientHeight));
  const maxLeft = Math.max(0, normalizedOffset(element.scrollWidth) - normalizedOffset(element.clientWidth));
  element.scrollTop = Math.min(normalizedOffset(snapshot.top), maxTop);
  element.scrollLeft =
    element.scrollWidth === undefined
      ? normalizedOffset(snapshot.left)
      : Math.min(normalizedOffset(snapshot.left), maxLeft);
  return true;
}

/**
 * 工具箱二级页只返回可确定的工具箱父页。
 *
 * 直接深链、刷新恢复或来自其他模块的历史都不盲目 back，避免退出应用或
 * 跳到不相关页面；这些情况使用 replace 回首页，不再制造“子页 -> 首页 -> 子页”循环。
 */
export function resolveToolboxReturnDecision(
  router: Pick<Router, 'resolve'>,
  context: ToolboxReturnContext,
  historyBack: unknown,
): ToolboxReturnDecision {
  if (typeof historyBack !== 'string' || !historyBack.startsWith('/') || historyBack.startsWith('//')) {
    return 'replace-home';
  }

  try {
    const resolved = router.resolve(historyBack);
    const routeName = typeof resolved.name === 'string' ? resolved.name : '';
    return resolved.meta.mobileShell === 'toolbox' && ALLOWED_PARENT_ROUTE_NAMES[context].includes(routeName)
      ? 'back'
      : 'replace-home';
  } catch {
    return 'replace-home';
  }
}

export function returnFromToolboxPage(router: Router, context: ToolboxReturnContext): ToolboxReturnDecision {
  const decision = resolveToolboxReturnDecision(router, context, router.options.history.state.back);
  if (decision === 'back') {
    router.back();
  } else {
    void router.replace({ name: 'toolboxHome' });
  }
  return decision;
}
