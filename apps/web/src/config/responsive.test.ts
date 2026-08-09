import { describe, expect, it } from 'vitest';
import {
  resolveViewportDeviceType,
  usesMobileDeviceLayout,
  VIEWPORT_BREAKPOINTS,
} from './responsive';

describe('共享响应式设备解析', () => {
  it.each([
    [390, false, 'mobile'],
    [VIEWPORT_BREAKPOINTS.mobile - 1, false, 'mobile'],
    [VIEWPORT_BREAKPOINTS.mobile, false, 'tablet'],
    [VIEWPORT_BREAKPOINTS.desktop - 1, false, 'tablet'],
    [VIEWPORT_BREAKPOINTS.desktop, false, 'desktop'],
    [1366, true, 'tablet'],
    [1366, false, 'desktop'],
    [VIEWPORT_BREAKPOINTS.compact, true, 'desktop'],
  ] as const)('%ipx / coarse=%s => %s', (width, coarsePointer, expected) => {
    expect(resolveViewportDeviceType(width, coarsePointer)).toBe(expected);
  });

  it('移动渲染基线与页面布局使用相同设备边界', () => {
    expect(usesMobileDeviceLayout(390)).toBe(true);
    expect(usesMobileDeviceLayout(1024)).toBe(true);
    expect(usesMobileDeviceLayout(1366, true)).toBe(true);
    expect(usesMobileDeviceLayout(1366, false)).toBe(false);
    expect(usesMobileDeviceLayout(1440, true)).toBe(false);
  });

  it('异常宽度安全回退桌面布局', () => {
    expect(resolveViewportDeviceType(Number.NaN, true)).toBe('desktop');
    expect(resolveViewportDeviceType(0, true)).toBe('desktop');
  });
});
