const FEATURE_ENV = Object.freeze({
  base: ['TODO_PLAN_V2', 'todo_plan_v2'],
  scheduler: ['TODO_PLAN_V2_SCHEDULER', 'todo_plan_v2_scheduler'],
  ai: ['TODO_PLAN_V2_AI', 'todo_plan_v2_ai'],
  conversion: ['TODO_PLAN_V2_CONVERSION', 'todo_plan_v2_conversion'],
  simpleCreate: ['TODO_SIMPLE_CREATE_UI', 'todo_simple_create_ui'],
  singleSchedule: ['TODO_SINGLE_TASK_SCHEDULE', 'todo_single_task_schedule'],
  independentAdvanced: ['TODO_INDEPENDENT_TASK_ADVANCED', 'todo_independent_task_advanced'],
  quickReminderPresets: ['TODO_QUICK_REMINDER_PRESETS', 'todo_quick_reminder_presets'],
});

function readFlag(keys, fallback = true) {
  const raw = keys.map((key) => process.env[key]).find((value) => value !== undefined);
  if (raw === undefined) return fallback;
  return !['0', 'false', 'off', 'no'].includes(String(raw).trim().toLowerCase());
}

export function getTodoPlanFeatureState() {
  const enabled = readFlag(FEATURE_ENV.base);
  return {
    enabled,
    // 调度器可独立保持开启，以便关闭新建入口时继续履行已存在的 v2 计划。
    schedulerEnabled: readFlag(FEATURE_ENV.scheduler),
    aiEnabled: enabled && readFlag(FEATURE_ENV.ai),
    conversionEnabled: enabled && readFlag(FEATURE_ENV.conversion),
    simpleCreateEnabled: enabled && readFlag(FEATURE_ENV.simpleCreate),
    singleTaskScheduleEnabled: enabled && readFlag(FEATURE_ENV.singleSchedule),
    independentTaskAdvancedEnabled: enabled && readFlag(FEATURE_ENV.independentAdvanced),
    quickReminderPresetsEnabled: enabled && readFlag(FEATURE_ENV.quickReminderPresets),
  };
}

export function assertTodoPlanFeatureEnabled(feature = 'base') {
  const state = getTodoPlanFeatureState();
  const enabled =
    feature === 'scheduler'
      ? state.schedulerEnabled
      : feature === 'ai'
        ? state.aiEnabled
        : feature === 'conversion'
          ? state.conversionEnabled
          : feature === 'simpleCreate'
            ? state.simpleCreateEnabled
            : feature === 'singleSchedule'
              ? state.singleTaskScheduleEnabled
              : feature === 'independentAdvanced'
                ? state.independentTaskAdvancedEnabled
                : feature === 'quickReminderPresets'
                  ? state.quickReminderPresetsEnabled
                  : state.enabled;
  if (enabled) return state;
  const error = new Error('新版待办计划功能当前未开放');
  error.code = 'TODO_PLAN_V2_DISABLED';
  error.status = 503;
  throw error;
}

export const todoPlanFeatureInternals = { readFlag };
