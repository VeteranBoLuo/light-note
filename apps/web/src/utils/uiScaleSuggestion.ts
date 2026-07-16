export const COMPACT_SCALE_MIN_WIDTH = 1280;
export const COMPACT_SCALE_MAX_WIDTH = 1599;

const COMPACT_SCALE_ROUTES = new Set([
  'workbenches',
  'home',
  'home:id',
  'home:search',
  'noteLibrary',
  'cloudSpace',
  'searchCenter',
  'bookmarkMg',
  'tagMg',
  'trash',
]);

export interface CompactScaleSuggestionState {
  viewportWidth: number;
  routeName: string;
  uiScale?: 'small' | 'medium' | 'large';
  isRegistered: boolean;
  isMobile: boolean;
  isAdminPreview: boolean;
  hasFinePointer: boolean;
  dismissed: boolean;
}

export function isCompactScaleSuggestionRoute(routeName: string): boolean {
  return COMPACT_SCALE_ROUTES.has(routeName);
}

/**
 * 中等宽度桌面在标准缩放下容易显得拥挤，给出一次“小号界面”建议。
 * 使用 CSS 视口宽度而非物理屏幕尺寸，兼容系统缩放和不同 DPI。
 */
export function shouldSuggestCompactScale(state: CompactScaleSuggestionState): boolean {
  const scale = state.uiScale || 'medium';
  return (
    state.isRegistered &&
    !state.isMobile &&
    !state.isAdminPreview &&
    state.hasFinePointer &&
    !state.dismissed &&
    scale === 'medium' &&
    state.viewportWidth >= COMPACT_SCALE_MIN_WIDTH &&
    state.viewportWidth <= COMPACT_SCALE_MAX_WIDTH &&
    isCompactScaleSuggestionRoute(state.routeName)
  );
}
