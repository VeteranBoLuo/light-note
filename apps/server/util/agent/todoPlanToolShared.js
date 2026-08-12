import crypto from 'crypto';

const MAX_TITLE = 200;
const MAX_DESCRIPTION = 2_000;

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function cleanString(value, max = 255) {
  return String(value ?? '')
    .trim()
    .slice(0, max);
}

function normalizeChecklist(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => ({
      id: typeof item === 'string' ? '' : cleanString(item?.id, 64),
      text: cleanString(typeof item === 'string' ? item : item?.text, 200),
    }))
    .filter((item) => Boolean(item.text))
    .slice(0, 50)
    .map((item) => ({ id: item.id || crypto.randomUUID(), text: item.text, done: false }));
}

export function normalizeTodoPlanToolArgs(input = {}) {
  const timing = object(input.timing);
  const plan = object(input.plan);
  const end = object(plan.end);
  const reminder = object(input.reminder);
  const trigger = object(reminder.trigger);
  const nudge = object(reminder.nudge);
  const requestedPlanType = cleanString(plan.type || input.planType || 'once', 24);
  const taskMode = cleanString(
    input.taskMode || (input.singleTaskReminder ? 'single' : requestedPlanType === 'once' ? 'single' : 'independent'),
    24,
  );
  const planType = taskMode === 'single' ? 'once' : requestedPlanType;
  const singleTaskReminder = object(input.singleTaskReminder);
  const singleOnce = object(singleTaskReminder.once);
  const singleRepeat = object(singleTaskReminder.repeat);
  const singleStop = object(singleRepeat.stop);
  const priority = Number(input.priority ?? 1);
  const startTime = cleanString(timing.startTime || input.startTime, 5) || null;
  const dueTime = cleanString(timing.dueTime || input.dueTime, 5) || null;
  const reminderTriggerType = cleanString(
    trigger.type || (startTime ? 'at_start' : dueTime ? 'before_due' : 'fixed_time'),
    24,
  );
  return {
    taskMode,
    title: cleanString(input.title, MAX_TITLE),
    description: cleanString(input.description, MAX_DESCRIPTION),
    priority: [0, 1, 2].includes(priority) ? priority : 1,
    checklist: normalizeChecklist(input.checklist),
    timing: {
      timezone: cleanString(timing.timezone || input.timezone || 'Asia/Shanghai', 64),
      anchorDate: cleanString(timing.anchorDate || input.anchorDate, 10),
      startTime,
      dueTime,
      dueDayOffset: Number(timing.dueDayOffset || input.dueDayOffset || 0),
    },
    plan: {
      type: planType,
      ...(planType === 'scheduled'
        ? {
            frequency: cleanString(plan.frequency || 'daily', 16),
            interval: Number(plan.interval || 1),
            weekdays: Array.isArray(plan.weekdays) ? plan.weekdays.map(Number) : undefined,
            monthDay: plan.monthDay === undefined ? undefined : Number(plan.monthDay),
            shortMonthPolicy: cleanString(plan.shortMonthPolicy || 'last_day', 16),
            end: {
              mode: cleanString(end.mode || 'never', 16),
              ...(end.count === undefined ? {} : { count: Number(end.count) }),
              ...(end.untilDate ? { untilDate: cleanString(end.untilDate, 10) } : {}),
            },
          }
        : planType === 'after_completion'
          ? {
              interval: Number(plan.interval || 1),
              unit: cleanString(plan.unit || 'day', 16),
              end: {
                mode: cleanString(end.mode || 'never', 16),
                ...(end.count === undefined ? {} : { count: Number(end.count) }),
              },
            }
          : {}),
      ...(plan.pastPolicy ? { pastPolicy: cleanString(plan.pastPolicy, 32) } : {}),
    },
    reminder: {
      mode: cleanString(reminder.mode || 'none', 24),
      trigger: {
        type: reminderTriggerType,
        ...(reminderTriggerType === 'fixed_time'
          ? { fixedTime: cleanString(trigger.fixedTime || '09:00', 5) }
          : {}),
        ...(trigger.offsetMinutes === undefined ? {} : { offsetMinutes: Number(trigger.offsetMinutes) }),
      },
      channels: Array.isArray(reminder.channels) ? reminder.channels.map((item) => cleanString(item, 16)) : [],
      ...(reminder.targetEmail ? { targetEmail: cleanString(reminder.targetEmail, 254) } : {}),
      quietPolicy: cleanString(reminder.quietPolicy || 'defer_once', 24),
      ...(reminder.mode === 'nudge'
        ? {
            nudge: {
              intervalMinutes: Number(nudge.intervalMinutes || 60),
              stop: cleanString(nudge.stop || 'completion_or_due', 32),
              maxCount: Number(nudge.maxCount || 4),
            },
          }
        : {}),
    },
    ...(taskMode === 'single'
      ? {
          singleTaskReminder: {
            version: 1,
            mode: cleanString(singleTaskReminder.mode || 'none', 16),
            ...(singleTaskReminder.mode === 'once'
              ? {
                  once: {
                    type: cleanString(singleOnce.type || 'at_due', 24),
                    ...(singleOnce.offsetMinutes === undefined
                      ? {}
                      : { offsetMinutes: Number(singleOnce.offsetMinutes) }),
                    ...(singleOnce.fixedAt ? { fixedAt: cleanString(singleOnce.fixedAt, 32) } : {}),
                  },
                }
              : {}),
            ...(singleTaskReminder.mode === 'repeat'
              ? {
                  repeat: {
                    kind: cleanString(singleRepeat.kind || 'interval', 16),
                    ...(singleRepeat.startAt ? { startAt: cleanString(singleRepeat.startAt, 32) } : {}),
                    ...(singleRepeat.startDate ? { startDate: cleanString(singleRepeat.startDate, 10) } : {}),
                    ...(singleRepeat.intervalMinutes === undefined
                      ? {}
                      : { intervalMinutes: Number(singleRepeat.intervalMinutes) }),
                    ...(Array.isArray(singleRepeat.weekdays) ? { weekdays: singleRepeat.weekdays.map(Number) } : {}),
                    ...(Array.isArray(singleRepeat.monthDays) ? { monthDays: singleRepeat.monthDays.map(Number) } : {}),
                    ...(singleRepeat.localTime ? { localTime: cleanString(singleRepeat.localTime, 5) } : {}),
                    ...(singleRepeat.shortMonthPolicy
                      ? { shortMonthPolicy: cleanString(singleRepeat.shortMonthPolicy, 16) }
                      : {}),
                    stop: {
                      type: cleanString(singleStop.type || 'completion_or_due', 32),
                      ...(singleStop.until ? { until: cleanString(singleStop.until, 32) } : {}),
                      ...(singleStop.maxCount === undefined ? {} : { maxCount: Number(singleStop.maxCount) }),
                    },
                  },
                }
              : {}),
            channels: Array.isArray(singleTaskReminder.channels)
              ? singleTaskReminder.channels.map((item) => cleanString(item, 16))
              : [],
            ...(singleTaskReminder.targetEmail
              ? { targetEmail: cleanString(singleTaskReminder.targetEmail, 254) }
              : {}),
          },
        }
      : {}),
  };
}

const timingSchema = {
  type: 'object',
  properties: {
    timezone: { type: 'string', description: 'IANA 时区，例如 Asia/Shanghai' },
    anchorDate: {
      type: 'string',
      description: '首项日期 YYYY-MM-DD，可选；独立重复计划省略时按计划时区的今天开始，且不会补写开始或截止时间',
    },
    startTime: { type: 'string', description: '每项开始时刻 HH:mm，可选' },
    dueTime: { type: 'string', description: '每项截止时刻 HH:mm，可选' },
    dueDayOffset: {
      type: 'integer',
      minimum: 0,
      description: '截止相对开始日期的自然日偏移，可跨月或跨年',
    },
  },
  required: ['timezone'],
};

const planSchema = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['once', 'scheduled', 'after_completion'] },
    frequency: { type: 'string', enum: ['daily', 'weekly', 'monthly'] },
    interval: { type: 'integer', minimum: 1, maximum: 365 },
    unit: { type: 'string', enum: ['day', 'week', 'month'] },
    weekdays: { type: 'array', items: { type: 'integer', minimum: 1, maximum: 7 } },
    monthDay: { type: 'integer', minimum: 1, maximum: 31 },
    shortMonthPolicy: { type: 'string', enum: ['last_day', 'skip'] },
    pastPolicy: {
      type: 'string',
      enum: ['keep_overdue', 'restart_today_keep_count', 'skip_missed'],
      description: '首项已过去时必须由用户明确选择，不能替用户猜',
    },
    end: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['never', 'until', 'count'] },
        untilDate: { type: 'string', description: '包含当天，YYYY-MM-DD' },
        count: { type: 'integer', minimum: 1, maximum: 366 },
      },
      required: ['mode'],
    },
  },
  required: ['type'],
};

const reminderSchema = {
  type: 'object',
  properties: {
    mode: { type: 'string', enum: ['none', 'once_per_instance', 'nudge'] },
    trigger: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['at_start', 'fixed_time', 'before_due'] },
        fixedTime: { type: 'string', description: 'HH:mm' },
        offsetMinutes: { type: 'integer', minimum: 0, maximum: 43200 },
      },
      required: ['type'],
    },
    channels: { type: 'array', items: { type: 'string', enum: ['in_app', 'email'] } },
    targetEmail: { type: 'string' },
    quietPolicy: { type: 'string', enum: ['defer_once', 'skip'] },
    nudge: {
      type: 'object',
      properties: {
        intervalMinutes: { type: 'integer', minimum: 5, maximum: 43200 },
        stop: { type: 'string', enum: ['completion_or_due', 'max_count'] },
        maxCount: { type: 'integer', minimum: 1, maximum: 20 },
      },
    },
  },
  required: ['mode'],
};

const singleTaskReminderSchema = {
  type: 'object',
  description: '一条待办上的提醒计划。重复提醒不会生成多条待办。',
  properties: {
    version: { type: 'integer', enum: [1] },
    mode: { type: 'string', enum: ['none', 'once', 'repeat'] },
    once: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['at_due', 'at_start', 'before_due', 'fixed_at'] },
        offsetMinutes: { type: 'integer', minimum: 0, maximum: 43200 },
        fixedAt: { type: 'string', description: 'YYYY-MM-DD HH:mm' },
      },
    },
    repeat: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['interval', 'weekly', 'monthly'] },
        startAt: { type: 'string', description: '首次提醒 YYYY-MM-DD HH:mm' },
        startDate: { type: 'string', description: '本地开始日期 YYYY-MM-DD' },
        intervalMinutes: { type: 'integer', minimum: 5, maximum: 525600 },
        weekdays: { type: 'array', items: { type: 'integer', minimum: 1, maximum: 7 } },
        monthDays: { type: 'array', items: { type: 'integer', minimum: 1, maximum: 31 } },
        localTime: { type: 'string', description: '本地提醒时间 HH:mm' },
        shortMonthPolicy: { type: 'string', enum: ['last_day', 'skip'] },
        stop: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['completion_or_due', 'completion', 'until', 'max_count', 'manual'],
            },
            until: { type: 'string' },
            maxCount: { type: 'integer', minimum: 1, maximum: 500 },
          },
          required: ['type'],
        },
      },
      required: ['kind', 'stop'],
    },
    channels: { type: 'array', items: { type: 'string', enum: ['in_app', 'email'] } },
    targetEmail: { type: 'string' },
  },
  required: ['version', 'mode', 'channels'],
};

export const TODO_PLAN_TOOL_PARAMETERS = {
  type: 'object',
  properties: {
    taskMode: {
      type: 'string',
      enum: ['single', 'independent'],
      description:
        '默认必须用 single：每天/每周/每月提醒同一件事。只有用户明确要求每次日程分别完成、每天生成一条独立待办时才用 independent。',
    },
    title: { type: 'string', maxLength: MAX_TITLE },
    description: { type: 'string', maxLength: MAX_DESCRIPTION },
    priority: { type: 'integer', enum: [0, 1, 2] },
    checklist: {
      type: 'array',
      maxItems: 50,
      items: { type: 'string', maxLength: 200 },
      description: '清单文本数组，可选',
    },
    timing: timingSchema,
    plan: planSchema,
    reminder: reminderSchema,
    singleTaskReminder: singleTaskReminderSchema,
  },
  required: ['title', 'timing', 'plan', 'reminder'],
};

export function todoPlanPreviewCard(preview) {
  return {
    title: '创建任务计划',
    target: preview.normalizedPlan?.title || '新任务计划',
    impact: `${preview.displaySummary.title}；${preview.displaySummary.range}。${preview.displaySummary.reminder}。`,
    details: [
      { key: 'timing', value: preview.displaySummary.timing || '未设置' },
      { key: 'instances', value: String(preview.occurrenceCount ?? `${preview.generatedNowCount}+`) },
      { key: 'reminderJobs', value: String(preview.reminderJobCount || 0) },
      ...(preview.nextReminderAt ? [{ key: 'nextReminderAt', value: preview.nextReminderAt }] : []),
      ...(preview.skippedCount ? [{ key: 'skippedCount', value: String(preview.skippedCount) }] : []),
    ],
  };
}
