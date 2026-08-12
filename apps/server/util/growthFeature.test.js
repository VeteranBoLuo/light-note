import { describe, expect, it } from 'vitest';
import { isGrowthCenterV2Enabled } from './growthFeature.js';

describe('growth center v2 rollout', () => {
  it('非生产默认开放，生产默认只开放 root 与测试账号', () => {
    expect(isGrowthCenterV2Enabled({ userId: 'u1', userRole: 'user', env: { NODE_ENV: 'test' } })).toBe(true);
    expect(isGrowthCenterV2Enabled({ userId: 'root-1', userRole: 'root', env: { NODE_ENV: 'production' } })).toBe(
      true,
    );
    expect(
      isGrowthCenterV2Enabled({
        userId: 'test-1',
        userRole: 'user',
        env: { NODE_ENV: 'production', GROWTH_CENTER_V2_TEST_USER_IDS: 'test-1,test-2' },
      }),
    ).toBe(true);
    expect(isGrowthCenterV2Enabled({ userId: 'u1', userRole: 'user', env: { NODE_ENV: 'production' } })).toBe(false);
  });

  it('显式总开关优先于灰度，百分比桶对同一账号保持稳定', () => {
    expect(
      isGrowthCenterV2Enabled({
        userId: 'u1',
        userRole: 'root',
        env: { NODE_ENV: 'production', GROWTH_CENTER_V2_ENABLED: 'false', GROWTH_CENTER_V2_ROLLOUT_PERCENT: '100' },
      }),
    ).toBe(false);
    expect(
      isGrowthCenterV2Enabled({
        userId: 'u1',
        userRole: 'user',
        env: { NODE_ENV: 'production', GROWTH_CENTER_V2_ROLLOUT_PERCENT: '100' },
      }),
    ).toBe(true);
    expect(
      isGrowthCenterV2Enabled({
        userId: 'u1',
        userRole: 'user',
        env: { NODE_ENV: 'production', GROWTH_CENTER_V2_ROLLOUT_PERCENT: '0' },
      }),
    ).toBe(false);
  });
});
