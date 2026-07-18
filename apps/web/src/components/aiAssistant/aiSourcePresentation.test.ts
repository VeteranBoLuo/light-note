import { describe, expect, it } from 'vitest';
import {
  AI_SOURCE_COLLAPSE_THRESHOLD,
  AI_SOURCE_COMPACT_PREVIEW_LIMIT,
  getAiSourceCompactPreviewCount,
  shouldCollapseAiSources,
} from './aiSourcePresentation';

describe('aiSourcePresentation', () => {
  it('一到两个来源直接展示，三个及以上默认折叠', () => {
    expect(AI_SOURCE_COLLAPSE_THRESHOLD).toBe(3);
    expect(shouldCollapseAiSources(0)).toBe(false);
    expect(shouldCollapseAiSources(1)).toBe(false);
    expect(shouldCollapseAiSources(2)).toBe(false);
    expect(shouldCollapseAiSources(3)).toBe(true);
    expect(shouldCollapseAiSources(10)).toBe(true);
  });

  it('紧凑来源栏保持固定单行高度', () => {
    expect(AI_SOURCE_COMPACT_PREVIEW_LIMIT).toBe(2);
    expect(getAiSourceCompactPreviewCount(0)).toBe(0);
    expect(getAiSourceCompactPreviewCount(1)).toBe(1);
    expect(getAiSourceCompactPreviewCount(2)).toBe(2);
    expect(getAiSourceCompactPreviewCount(3)).toBe(1);
    expect(getAiSourceCompactPreviewCount(12)).toBe(1);
  });
});
