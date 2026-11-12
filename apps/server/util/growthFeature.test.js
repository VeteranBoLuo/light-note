import { describe, expect, it } from 'vitest';
import { isGrowthCenterV2Enabled } from './growthFeature.js';

describe('growth center v2', () => {
  it('未配置时在任何运行环境都开放，不依赖 NODE_ENV', () => {
    expect(isGrowthCenterV2Enabled({ env: {} })).toBe(true);
    expect(isGrowthCenterV2Enabled({ env: { NODE_ENV: 'production' } })).toBe(true);
    expect(isGrowthCenterV2Enabled({ env: { NODE_ENV: 'test' } })).toBe(true);
  });

  it('只有显式关闭才回退旧版', () => {
    for (const value of ['false', '0', 'off', 'no']) {
      expect(isGrowthCenterV2Enabled({ env: { NODE_ENV: 'production', GROWTH_CENTER_V2_ENABLED: value } })).toBe(false);
    }
    expect(isGrowthCenterV2Enabled({ env: { NODE_ENV: 'production', GROWTH_CENTER_V2_ENABLED: 'true' } })).toBe(true);
    expect(isGrowthCenterV2Enabled({ env: { NODE_ENV: 'production', GROWTH_CENTER_V2_ENABLED: 'unexpected' } })).toBe(
      true,
    );
  });
});
