import { describe, expect, it } from 'vitest';
import { shouldSuggestCompactScale, type CompactScaleSuggestionState } from './uiScaleSuggestion';

const eligibleState: CompactScaleSuggestionState = {
  viewportWidth: 1470,
  routeName: 'searchCenter',
  uiScale: 'medium',
  isRegistered: true,
  isMobile: false,
  isAdminPreview: false,
  hasFinePointer: true,
  dismissed: false,
};

describe('shouldSuggestCompactScale', () => {
  it('在 1470 宽度的资源中心为标准缩放用户提供建议', () => {
    expect(shouldSuggestCompactScale(eligibleState)).toBe(true);
  });

  it.each([
    { uiScale: 'small' as const },
    { uiScale: 'large' as const },
    { viewportWidth: 1279 },
    { viewportWidth: 1600 },
    { routeName: 'settings' },
    { isRegistered: false },
    { isMobile: true },
    { isAdminPreview: true },
    { hasFinePointer: false },
    { dismissed: true },
  ])('不在不适用场景重复打扰用户：%o', (patch) => {
    expect(shouldSuggestCompactScale({ ...eligibleState, ...patch })).toBe(false);
  });
});
