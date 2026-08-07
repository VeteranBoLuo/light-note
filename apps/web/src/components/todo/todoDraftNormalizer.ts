import type {
  TodoCreateInitialValues,
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
