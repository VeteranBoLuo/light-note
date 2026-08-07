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
      simpleCreateEnabled: true,
      singleTaskScheduleEnabled: true,
      independentTaskAdvancedEnabled: true,
      quickReminderPresetsEnabled: true,
    });

    vi.stubEnv('TODO_PLAN_V2', 'false');
    expect(getTodoPlanFeatureState()).toEqual({
      enabled: false,
      schedulerEnabled: true,
      aiEnabled: false,
      conversionEnabled: false,
      simpleCreateEnabled: false,
      singleTaskScheduleEnabled: false,
      independentTaskAdvancedEnabled: false,
      quickReminderPresetsEnabled: false,
    });
  });

  it('支持方案中的小写开关名并返回稳定错误码', () => {
    vi.stubEnv('todo_plan_v2_scheduler', 'off');
    expect(getTodoPlanFeatureState().schedulerEnabled).toBe(false);
    expect(() => assertTodoPlanFeatureEnabled('scheduler')).toThrowError(
      expect.objectContaining({ code: 'TODO_PLAN_V2_DISABLED', status: 503 }),
    );
  });

  it('细粒度开关会阻止对应的新建能力，但不影响基础 V2', () => {
    vi.stubEnv('TODO_SINGLE_TASK_SCHEDULE', 'false');
    vi.stubEnv('TODO_INDEPENDENT_TASK_ADVANCED', 'false');
    expect(() => assertTodoPlanFeatureEnabled('base')).not.toThrow();
    expect(() => assertTodoPlanFeatureEnabled('singleSchedule')).toThrowError(
      expect.objectContaining({ code: 'TODO_PLAN_V2_DISABLED', status: 503 }),
    );
    expect(() => assertTodoPlanFeatureEnabled('independentAdvanced')).toThrowError(
      expect.objectContaining({ code: 'TODO_PLAN_V2_DISABLED', status: 503 }),
    );
  });
});
