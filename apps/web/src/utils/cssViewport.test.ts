import { describe, expect, it } from 'vitest';
import { resolveViewportUnitValue, supportsDynamicViewportUnits, toLegacyViewportFallback } from './cssViewport';

describe('cssViewport', () => {
  it.each([
    ['min(76dvh, 640px)', 'min(76vh, 640px)'],
    ['calc(100dvh - 32px)', 'calc(100vh - 32px)'],
    ['min-height: 100svh; max-height: 100lvh', 'min-height: 100vh; max-height: 100vh'],
    ['48px', '48px'],
  ])('为旧 WebView 转换动态视口单位：%s', (input, expected) => {
    expect(toLegacyViewportFallback(input)).toBe(expected);
  });

  it('现代浏览器保留动态单位，旧 WebView 才降级', () => {
    expect(resolveViewportUnitValue('min(82dvh, 720px)', true)).toBe('min(82dvh, 720px)');
    expect(resolveViewportUnitValue('min(82dvh, 720px)', false)).toBe('min(82vh, 720px)');
  });

  it('CSS.supports 异常时安全回退', () => {
    expect(supportsDynamicViewportUnits({ supports: () => true })).toBe(true);
    expect(
      supportsDynamicViewportUnits({
        supports: () => {
          throw new Error('unsupported');
        },
      }),
    ).toBe(false);
  });
});
