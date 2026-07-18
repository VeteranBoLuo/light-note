import { describe, expect, it } from 'vitest';
import { AI_SOURCE_COLLAPSE_THRESHOLD, shouldCollapseAiSources } from './aiSourcePresentation';

describe('aiSourcePresentation', () => {
  it('一到两个来源直接展示，三个及以上默认折叠', () => {
    expect(AI_SOURCE_COLLAPSE_THRESHOLD).toBe(3);
    expect(shouldCollapseAiSources(0)).toBe(false);
    expect(shouldCollapseAiSources(1)).toBe(false);
    expect(shouldCollapseAiSources(2)).toBe(false);
    expect(shouldCollapseAiSources(3)).toBe(true);
    expect(shouldCollapseAiSources(10)).toBe(true);
  });
});
