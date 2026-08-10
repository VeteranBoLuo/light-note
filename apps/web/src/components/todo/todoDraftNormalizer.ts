import type {
  TodoCreateInitialValues,
  TodoItem,
  TodoPlanConfig,
  TodoPlanDraft,
  TodoPlanTiming,
  TodoPriority,
  TodoReminderV2Config,
  TodoReminderChannel,
  TodoResourceRefInput,
  TodoSingleTaskReminderSchedule,
} from '@/api/todoApi';

export interface TodoCreateDraftV3 {
  task: {
    title: string;
    description: string;
    priority: TodoPriority;
    checklist: Array<{ id: string; text: string; done: boolean }>;
    contextRefs: TodoResourceRefInput[];
  };
  timing: {
    startAt: string | null;
    dueAt: string | null;
    timezone: string;
  };
  reminder: TodoSingleTaskReminderSchedule;
  independentTasks: {
    enabled: boolean;
    plan: TodoPlanConfig;
    reminder: TodoReminderV2Config;
  };
}

function datePart(value?: string | null) {
  return String(value || '').slice(0, 10) || null;
}

function timePart(value?: string | null) {
  return String(value || '').slice(11, 16) || null;
}

function localDayDiff(start: string, end: string) {
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  return Math.max(0, Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86_400_000));
}

function localToday() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function suggestTodoPlanEndDate(anchorAt?: string | null) {
  const anchorDate = datePart(anchorAt) || localToday();
  const [year, month, day] = anchorDate.split('-').map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + 30));
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${result.getUTCFullYear()}-${pad(result.getUTCMonth() + 1)}-${pad(result.getUTCDate())}`;
}

function normalizeTiming(draft: TodoCreateDraftV3): TodoPlanTiming {
  const startDate = datePart(draft.timing.startAt);
  const dueDate = datePart(draft.timing.dueAt);
  const anchorDate = startDate || dueDate;
  const startTime = startDate ? timePart(draft.timing.startAt) : null;
  const dueTime = dueDate ? timePart(draft.timing.dueAt) : null;
  const dueDateEndsScheduledPlan = Boolean(
    draft.independentTasks.enabled &&
    draft.independentTasks.plan.type === 'scheduled' &&
    draft.independentTasks.plan.end?.mode === 'until' &&
    dueDate &&
    dueDate === draft.independentTasks.plan.end.untilDate,
  );
  const dueDayOffset =
    startDate && dueDate
      ? dueDateEndsScheduledPlan
        ? startTime && dueTime && dueTime < startTime
          ? 1
          : 0
        : localDayDiff(startDate, dueDate)
      : 0;
  return {
    timezone: draft.timing.timezone || 'Asia/Shanghai',
    anchorDate,
    startTime,
    dueTime,
    dueDayOffset,
  };
}

function normalizeSingleReminder(
  value: TodoSingleTaskReminderSchedule,
  timing: TodoCreateDraftV3['timing'],
): TodoSingleTaskReminderSchedule {
  if (value.mode === 'none') return { version: 1, mode: 'none', channels: [] };
  const channels: TodoReminderChannel[] = value.channels?.length ? [...new Set(value.channels)] : ['in_app'];
  if (value.mode === 'once') {
    return {
      version: 1,
      mode: 'once',
      once: { ...(value.once || { type: timing.dueAt ? 'at_due' : 'fixed_at' }) },
      channels,
      ...(channels.includes('email') ? { targetEmail: value.targetEmail || '' } : {}),
      quietPolicy: value.quietPolicy || 'defer_once',
    };
  }
  const repeat = value.repeat || {
    kind: 'interval' as const,
    intervalMinutes: 1440,
    stop: { type: 'completion_or_due' as const },
  };
  const startDate =
    repeat.startDate || datePart(repeat.startAt) || datePart(timing.startAt) || datePart(timing.dueAt) || localToday();
  return {
    version: 1,
    mode: 'repeat',
    repeat: {
      ...repeat,
      ...(repeat.kind === 'interval'
        ? { startAt: repeat.startAt || timing.startAt || timing.dueAt || `${startDate} 09:00` }
        : { startDate, localTime: repeat.localTime || '09:00' }),
    },
    channels,
    ...(channels.includes('email') ? { targetEmail: value.targetEmail || '' } : {}),
    quietPolicy: value.quietPolicy || 'defer_once',
  };
}

export function normalizeTodoCreateDraft(draft: TodoCreateDraftV3): TodoPlanDraft {
  const timing = normalizeTiming(draft);
  const base = {
    title: draft.task.title.trim(),
    description: draft.task.description.trim(),
    priority: draft.task.priority,
    checklist: draft.task.checklist
      .map((item) => ({ ...item, text: item.text.trim() }))
      .filter((item) => item.text)
      .slice(0, 50),
    resourceRefs: draft.task.contextRefs,
    timing,
  };
  if (draft.independentTasks.enabled) {
    return {
      ...base,
      taskMode: 'independent',
      plan: draft.independentTasks.plan,
      reminder: draft.independentTasks.reminder,
    };
  }
  return {
    ...base,
    taskMode: 'single',
    plan: { type: 'once' },
    reminder: { mode: 'none', channels: [] },
    singleTaskReminder: normalizeSingleReminder(draft.reminder, draft.timing),
  };
}

function isSingleTaskReminderSchedule(reminder: TodoItem['reminder']): reminder is TodoSingleTaskReminderSchedule {
  return Boolean(reminder && 'version' in reminder && reminder.version === 1);
}

function isV2ReminderConfig(reminder: TodoItem['reminder']): reminder is TodoReminderV2Config {
  return Boolean(reminder && ['none', 'once_per_instance', 'nudge'].includes(reminder.mode));
}

/**
 * 把列表已加载的 v2 单任务还原成“仅修改当前项”所需的完整计划草稿。
 * 快捷操作不能只 PATCH dueAt：v2 的日期、提醒规则和 Reminder Job 必须继续由
 * 确定性计划预览统一计算，否则截止时间与实际提醒会逐渐漂移。
 */
export function normalizeCurrentTodoPlanDraft(
  item: TodoItem,
  overrides: { dueAt?: string | null; startAt?: string | null } = {},
): TodoPlanDraft {
  const reminder = item.reminder;
  const singleTaskReminder = isSingleTaskReminderSchedule(reminder) ? JSON.parse(JSON.stringify(reminder)) : null;
  const draft: TodoCreateDraftV3 = {
    task: {
      title: item.title,
      description: item.description || '',
      priority: item.priority,
      checklist: (item.checklist || []).map((entry) => ({ ...entry })),
      contextRefs: (item.resourceRefs || []).map(({ type, id }) => ({ type, id })),
    },
    timing: {
      startAt: overrides.startAt !== undefined ? overrides.startAt : item.startAt || null,
      dueAt: overrides.dueAt !== undefined ? overrides.dueAt : item.dueAt || null,
      timezone: item.instanceTimezone || 'Asia/Shanghai',
    },
    reminder: singleTaskReminder || { version: 1, mode: 'none', channels: [] },
    independentTasks: {
      enabled: false,
      plan: { type: 'once' },
      reminder: isV2ReminderConfig(reminder) ? JSON.parse(JSON.stringify(reminder)) : { mode: 'none', channels: [] },
    },
  };
  if (singleTaskReminder) return normalizeTodoCreateDraft(draft);
  return {
    ...normalizeTodoCreateDraft(draft),
    reminder: draft.independentTasks.reminder,
    singleTaskReminder: undefined,
  };
}

export function applyQuickPreset(draft: TodoCreateDraftV3, initial?: TodoCreateInitialValues) {
  if (!initial?.quickReminderPreset || initial.quickReminderPreset === 'none') return;
  if (initial.quickReminderPreset === 'before_due_1h') {
    draft.reminder = {
      version: 1,
      mode: 'once',
      once: { type: 'before_due', offsetMinutes: 60 },
      channels: ['in_app'],
    };
    return;
  }
  draft.reminder = {
    version: 1,
    mode: 'repeat',
    repeat: {
      kind: 'interval',
      startAt: `${datePart(initial.dueAt) || localToday()} 09:00`,
      intervalMinutes: 1440,
      stop: { type: initial.dueAt ? 'completion_or_due' : 'completion' },
    },
    channels: ['in_app'],
  };
}

export function normalizeQuickTodoInitial(initial: TodoCreateInitialValues & { title: string }): TodoPlanDraft {
  const draft: TodoCreateDraftV3 = {
    task: {
      title: initial.title,
      description: initial.description || '',
      priority: initial.priority ?? 1,
      checklist: initial.checklist || [],
      contextRefs: [],
    },
    timing: { startAt: null, dueAt: initial.dueAt || null, timezone: 'Asia/Shanghai' },
    reminder: { version: 1, mode: 'none', channels: [] },
    independentTasks: {
      enabled: false,
      plan: {
        type: 'scheduled',
        frequency: 'daily',
        interval: 1,
        end: { mode: 'until', untilDate: suggestTodoPlanEndDate(initial.dueAt) },
      },
      reminder: { mode: 'none', channels: [] },
    },
  };
  applyQuickPreset(draft, initial);
  return normalizeTodoCreateDraft(draft);
}
