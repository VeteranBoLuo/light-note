import { describe, expect, it } from 'vitest';
import { shouldPreloadLargeFeature } from './largeFeaturePreload';

describe('shouldPreloadLargeFeature', () => {
  it('桌面、前台、正常网络允许空闲预热', () => {
    expect(
      shouldPreloadLargeFeature({
        mobile: false,
        online: true,
        visibilityState: 'visible',
        connection: { effectiveType: '4g' },
      }),
    ).toBe(true);
  });

  it.each([
    { mobile: true, online: true, visibilityState: 'visible', connection: { effectiveType: '4g' } },
    { mobile: false, online: false, visibilityState: 'visible', connection: { effectiveType: '4g' } },
    { mobile: false, online: true, visibilityState: 'hidden', connection: { effectiveType: '4g' } },
    { mobile: false, online: true, visibilityState: 'visible', connection: { effectiveType: '2g' } },
    { mobile: false, online: true, visibilityState: 'visible', connection: { saveData: true } },
  ])('移动、离线、后台或受限网络不抢占带宽 %#', (context) => {
    expect(shouldPreloadLargeFeature(context)).toBe(false);
  });
});
