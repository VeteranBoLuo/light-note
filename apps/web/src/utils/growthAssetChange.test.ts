import { describe, expect, it } from 'vitest';
import { formatGrowthAssetChange } from './growthAssetChange';

describe('growth asset change formatter', () => {
  it('shows lottery AI grants as explicit permanent-balance changes', () => {
    expect(formatGrowthAssetChange({ type: 'ai', amount: 100_000 }, 'zh-CN')).toBe('+10 万 AI');
    expect(formatGrowthAssetChange({ type: 'ai', amount: 600_000 }, 'en-US')).toBe('+600K AI');
  });

  it('shows storage grants with compact units', () => {
    expect(formatGrowthAssetChange({ type: 'storage', amount: 128 }, 'zh-CN')).toBe('+128MB');
    expect(formatGrowthAssetChange({ type: 'storage', amount: 2048 }, 'en-US')).toBe('+2GB');
  });
});
