export const VIEWPORT_BREAKPOINTS = {
  mobile: 768,
  desktop: 1200,
  compact: 1400,
} as const;

export type ViewportDeviceType = 'mobile' | 'tablet' | 'desktop';

/**
 * 唯一的视口设备类型解析器。
 *
 * 页面布局、移动端共享渲染基线和首屏内联脚本都必须遵循这里的边界；
 * 不得在业务模块复制一套近似断点，否则浏览器预览与 App 会在平板宽度分叉。
 */
export function resolveViewportDeviceType(width: number, coarsePointer = false): ViewportDeviceType {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : VIEWPORT_BREAKPOINTS.compact;

  if (safeWidth < VIEWPORT_BREAKPOINTS.mobile) return 'mobile';
  if (safeWidth < VIEWPORT_BREAKPOINTS.desktop) return 'tablet';
  if (safeWidth < VIEWPORT_BREAKPOINTS.compact && coarsePointer) return 'tablet';
  return 'desktop';
}

export function usesMobileDeviceLayout(width: number, coarsePointer = false): boolean {
  return resolveViewportDeviceType(width, coarsePointer) !== 'desktop';
}

export function isMobileViewport(width: number): boolean {
  return width < VIEWPORT_BREAKPOINTS.mobile;
}

export function isCompactViewport(width: number): boolean {
  return width < VIEWPORT_BREAKPOINTS.compact;
}
