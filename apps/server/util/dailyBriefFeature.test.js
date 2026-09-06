import { describe, expect, it } from 'vitest';
import { isDailyBriefFeatureEnabled, preserveDailyBriefPreference } from './dailyBriefFeature.js';

describe('dailyBriefFeature', () => {
  it('发布开关默认开启但可显式关闭', () => {
    expect(isDailyBriefFeatureEnabled({})).toBe(true);
    expect(isDailyBriefFeatureEnabled({ AI_DAILY_BRIEF_ENABLED: 'off' })).toBe(false);
  });

  it('普通偏好整对象保存不能覆盖专用简报开关', () => {
    expect(
      JSON.parse(
        preserveDailyBriefPreference({ theme: 'night', dailyBrief: true }, { theme: 'day', dailyBrief: false }),
      ),
    ).toEqual({ theme: 'night', dailyBrief: false });
    expect(JSON.parse(preserveDailyBriefPreference({ theme: 'night', dailyBrief: false }, { theme: 'day' }))).toEqual({
      theme: 'night',
    });
  });

  it('旧客户端整对象偏好保存也不能重开已关闭的自动更新', () => {
    expect(
      JSON.parse(
        preserveDailyBriefPreference(
          { theme: 'night', dailyBriefAutoUpdate: true },
          { dailyBrief: true, dailyBriefAutoUpdate: false },
        ),
      ),
    ).toEqual({ theme: 'night', dailyBrief: true, dailyBriefAutoUpdate: false });
  });
});
