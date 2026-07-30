export const VIEWPORT_BREAKPOINTS = {
  mobile: 768,
  desktop: 1200,
  compact: 1400,
} as const;

export function isMobileViewport(width: number): boolean {
  return width < VIEWPORT_BREAKPOINTS.mobile;
}

export function isCompactViewport(width: number): boolean {
  return width < VIEWPORT_BREAKPOINTS.compact;
}
