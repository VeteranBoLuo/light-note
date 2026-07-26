export const VIEWPORT_BREAKPOINTS = {
  mobile: 768,
  desktop: 1200,
} as const;

export function isMobileViewport(width: number): boolean {
  return width < VIEWPORT_BREAKPOINTS.mobile;
}
