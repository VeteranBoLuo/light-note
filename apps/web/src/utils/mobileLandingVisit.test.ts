// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MOBILE_LANDING_VISIT_STORAGE_KEY } from '@/config/appEntryBootstrap.ts';
import { hasVisitedMobileLanding, markMobileLandingVisited } from './mobileLandingVisit';

describe('移动官网首访记录', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('只在明确记录后识别为回访', () => {
    expect(hasVisitedMobileLanding()).toBe(false);

    markMobileLandingVisited();

    expect(localStorage.getItem(MOBILE_LANDING_VISIT_STORAGE_KEY)).toBe('1');
    expect(hasVisitedMobileLanding()).toBe(true);
  });

  it('存储不可用时保持官网可访问', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });

    expect(() => markMobileLandingVisited()).not.toThrow();
    expect(hasVisitedMobileLanding()).toBe(false);
  });
});
