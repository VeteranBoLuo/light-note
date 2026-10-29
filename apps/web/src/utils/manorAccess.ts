type ManorGrowth = { features?: { manor?: boolean } } | null | undefined;

/** The server decides the manor audience; admin previews never enter it. */
export const canOpenManor = (growth: ManorGrowth, adminContext: unknown) => Boolean(growth?.features?.manor) && !adminContext;

/**
 * The scene layout relies on container queries and individual transform properties
 * (Chromium 105+, Safari 16+). Older App WebViews would render a broken scene.
 */
export function manorBrowserSupported() {
  return typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
    && CSS.supports('container-type', 'size') && CSS.supports('translate', '1px');
}

/** The scene is Chinese-only for now: English UI hides the entry, while direct links still work. */
export const showManorEntry = (growth: ManorGrowth, adminContext: unknown, locale: string) =>
  canOpenManor(growth, adminContext) && locale.startsWith('zh') && manorBrowserSupported();
