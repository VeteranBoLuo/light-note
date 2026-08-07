import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertTodoPlanFeatureEnabled, getTodoPlanFeatureState } from './todoPlanFeature.js';

describe('todoPlanFeature', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('默认全部开启，调度器可独立于新建入口运行', () => {
    expect(getTodoPlanFeatureState()).toEqual({
      enabled: true,
      schedulerEnabled: true,
      aiEnabled: true,
      conversionEnabled: true,
    });

    vi.stubEnv('TODO_PLAN_V2', 'false');
    expect(getTodoPlanFeatureState()).toEqual({
      enabled: false,
      schedulerEnabled: true,
      aiEnabled: false,
      conversionEnabled: false,
    });
  });

  it('支持方案中的小写开关名并返回稳定错误码', () => {
    vi.stubEnv('todo_plan_v2_scheduler', 'off');
    expect(getTodoPlanFeatureState().schedulerEnabled).toBe(false);
    expect(() => assertTodoPlanFeatureEnabled('scheduler')).toThrowError(
      expect.objectContaining({ code: 'TODO_PLAN_V2_DISABLED', status: 503 }),
    );
  });
});
