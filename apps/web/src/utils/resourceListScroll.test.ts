import { describe, expect, it } from 'vitest';
import {
  captureResourceListScrollAnchor,
  resolveResourceListScrollAnchor,
  resourceListBackToTopBehavior,
  resourceListBackToTopThreshold,
  shouldShowResourceListBackToTop,
} from './resourceListScroll';

describe('resource list scroll policy', () => {
  it('restores a semantic row after results are reordered', () => {
    const anchor = captureResourceListScrollAnchor({
      items: [{ key: 'a' }, { key: 'b' }, { key: 'c' }],
      itemKey: 'key',
      scrollTop: 112,
      pitch: 54,
    });
    expect(anchor).toEqual({ key: 'c', index: 2, offset: 4 });
    expect(
      resolveResourceListScrollAnchor({
        items: [{ key: 'c' }, { key: 'a' }, { key: 'b' }],
        itemKey: 'key',
        anchor: anchor!,
        pitch: 54,
      }),
    ).toEqual({ keyMatched: true, index: 0, top: 4 });
  });

  it('uses the cursor index while a saved semantic row has not loaded yet', () => {
    const resolved = resolveResourceListScrollAnchor({
      items: Array.from({ length: 40 }, (_, index) => ({ key: `row-${index}` })),
      itemKey: 'key',
      anchor: { key: 'row-80', index: 80, offset: 9 },
      pitch: 54,
      logicalCount: 120,
    });
    expect(resolved).toEqual({ keyMatched: false, index: 80, top: 4329 });
  });

  it('shows the local back-to-top affordance after 1.5 viewports with a 720px floor', () => {
    expect(resourceListBackToTopThreshold(320)).toBe(720);
    expect(resourceListBackToTopThreshold(600)).toBe(900);
    expect(shouldShowResourceListBackToTop({ top: 719, viewportHeight: 320 })).toBe(false);
    expect(shouldShowResourceListBackToTop({ top: 900, viewportHeight: 600 })).toBe(true);
  });

  it('jumps immediately for long distances or reduced motion, and smooth-scrolls only short distances', () => {
    expect(resourceListBackToTopBehavior({ position: { top: 900, viewportHeight: 400 }, reducedMotion: false })).toBe(
      'smooth',
    );
    expect(resourceListBackToTopBehavior({ position: { top: 1600, viewportHeight: 400 }, reducedMotion: false })).toBe(
      'auto',
    );
    expect(resourceListBackToTopBehavior({ position: { top: 848, viewportHeight: 147 }, reducedMotion: false })).toBe(
      'auto',
    );
    expect(resourceListBackToTopBehavior({ position: { top: 900, viewportHeight: 400 }, reducedMotion: true })).toBe(
      'auto',
    );
  });
});
