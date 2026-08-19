import { apiBasePost } from '@/http/request';

export type TodoPriority = 0 | 1 | 2;
export type TodoStatus = 'pending' | 'completed';
export type TodoFilterStatus = 'all' | TodoStatus;
export type TodoSort = 'smart' | 'action' | 'priority' | 'due' | 'newest' | 'oldest';
export type TodoReminderMode = 'once' | 'repeat';
export type TodoReminderChannel = 'in_app' | 'email';
export type TodoRecurrenceFrequency = 'daily' | 'weekly' | 'monthly';
export type TodoPlanType = 'once' | 'scheduled' | 'after_completion';
export type TodoPlanEndMode = 'never' | 'until' | 'count';
export type TodoPastPolicy = 'keep_overdue' | 'restart_today_keep_count' | 'skip_missed';
export type TodoReminderV2Mode = 'none' | 'once_per_instance' | 'nudge';
export type TodoReminderTriggerType = 'at_start' | 'fixed_time' | 'before_due';
export type TodoPlanScope = 'current' | 'future' | 'series';
export type TodoTaskMode = 'single' | 'independent';
export type TodoSingleReminderMode = 'none' | 'once' | 'repeat';
export type TodoSingleRepeatKind = 'interval' | 'weekly' | 'monthly';
export type TodoSingleReminderStopType = 'completion_or_due' | 'completion' | 'until' | 'max_count' | 'manual';

export interface TodoPlanFeatureState {
  enabled: boolean;
  schedulerEnabled: boolean;
  aiEnabled: boolean;
  conversionEnabled: boolean;
  simpleCreateEnabled: boolean;
  singleTaskScheduleEnabled: boolean;
  independentTaskAdvancedEnabled: boolean;
  quickReminderPresetsEnabled: boolean;
}

export interface TodoSingleTaskReminderSchedule {
  version: 1;
  mode: TodoSingleReminderMode;
  once?: {
    type: 'at_due' | 'at_start' | 'before_due' | 'fixed_at';
    offsetMinutes?: number;
    fixedAt?: string;
  };
  repeat?: {
    kind: TodoSingleRepeatKind;
    startAt?: string;
    startDate?: string;
    intervalMinutes?: number;
    weekdays?: number[];
    monthDays?: number[];
    localTime?: string;
    shortMonthPolicy?: 'last_day' | 'skip';
    stop: {
      type: TodoSingleReminderStopType;
      until?: string;
      maxCount?: number;
    };
  };
  channels: TodoReminderChannel[];
  targetEmail?: string | null;
  quietPolicy?: 'defer_once' | 'skip';
  nextAt?: string | null;
  remainingCount?: number;
  paused?: boolean;
}

export interface TodoRecurrence {
  frequency: TodoRecurrenceFrequency;
  interval: number;
  endAt?: string | null;
}

export interface TodoReminderConfig {
  mode: TodoReminderMode;
  channels: TodoReminderChannel[];
  startAt: string;
  endAt?: string | null;
  intervalMinutes?: number | null;
  email?: string | null;
}

export interface TodoReminderV2Config {
  mode: TodoReminderV2Mode;
  trigger?: {
    type: TodoReminderTriggerType;
    fixedTime?: string | null;
    offsetMinutes?: number | null;
  };
  channels: TodoReminderChannel[];
  targetEmail?: string | null;
  quietPolicy?: 'defer_once' | 'skip';
  nudge?: {
    intervalMinutes: number;
    stop: 'completion_or_due' | 'max_count';
    maxCount: number;
  };
  /** 列表 hydration 返回的运行态摘要。 */
  nextAt?: string | null;
  remainingCount?: number;
  paused?: boolean;
}

export interface TodoPlanTiming {
  timezone: string;
  anchorDate?: string | null;
  startTime?: string | null;
  dueTime?: string | null;
  dueDayOffset?: number;
}

export interface TodoPlanConfig {
  type: TodoPlanType;
  frequency?: TodoRecurrenceFrequency;
  interval?: number;
  unit?: 'day' | 'week' | 'month';
  weekdays?: number[];
  monthDay?: number;
  shortMonthPolicy?: 'last_day' | 'skip';
  end?: {
    mode: TodoPlanEndMode;
    untilDate?: string | null;
    count?: number | null;
  };
  pastPolicy?: TodoPastPolicy | null;
}

export interface TodoPlanDraft {
  title: string;
  description?: string;
  checklist?: TodoChecklistItem[];
  priority?: TodoPriority;
  sortOrder?: number;
  resourceRefs?: TodoResourceRefInput[];
  timing: TodoPlanTiming;
  plan: TodoPlanConfig;
  reminder: TodoReminderV2Config;
  taskMode?: TodoTaskMode;
  singleTaskReminder?: TodoSingleTaskReminderSchedule;
}

export interface TodoPlanWritePayload extends TodoPlanDraft {
  previewHash: string;
  idempotencyKey: string;
}

export interface TodoPlanPreview {
  previewHash: string;
  occurrenceCount: number | null;
  generatedNowCount: number;
  actionableCount: number;
  skippedCount: number;
  reminderJobCount: number;
  theoreticalReminderJobCount: number;
  nextReminderAt?: string | null;
  requiredChoices: string[];
  warnings: Array<{ code: string; [key: string]: unknown }>;
  firstOccurrence?: { occurrenceDate: string | null; startAt?: string | null; dueAt?: string | null } | null;
  lastOccurrence?: { occurrenceDate: string | null; startAt?: string | null; dueAt?: string | null } | null;
  displaySummary: { title: string; range: string; timing: string; reminder: string };
}

export interface TodoSeriesView {
  id: string;
  repeatMode: 'scheduled' | 'after_completion';
  status: 'active' | 'paused' | 'ended';
  timezone: string;
  version: number;
  createdAt?: string | null;
  plan: TodoPlanConfig | null;
  timing: TodoPlanTiming | null;
  progress: { completed: number; skipped: number; generated: number; total: number | null };
}

export interface TodoChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface TodoResourceRefInput {
  type: 'bookmark' | 'note' | 'file';
  id: string;
}

export interface TodoResourceRefView extends TodoResourceRefInput {
  /** 当前权限下解析出的实时标题;目标失效时回落到快照 */
  title: string;
  snapshotTitle: string;
  available: boolean;
  url?: string;
}

export interface TodoItem {
  id: string;
  title: string;
  description?: string;
  checklist: TodoChecklistItem[];
  priority: TodoPriority;
  sortOrder?: number;
  status: TodoStatus;
  dueAt?: string | null;
  startAt?: string | null;
  /** 服务端按提醒、开始、截止和实例日期计算出的下一步处理时间。 */
  actionAt?: string | null;
  reminder?: TodoReminderConfig | TodoReminderV2Config | TodoSingleTaskReminderSchedule | null;
  /** 兼容旧接口；新代码使用 reminder。 */
  reminderAt?: string | null;
  completedAt?: string | null;
  seriesId?: string | null;
  series?: TodoSeriesView | null;
  planVersion?: 1 | 2;
  seriesVersion?: number | null;
  occurrenceNo?: number | null;
  occurrenceDate?: string | null;
  instanceTimezone?: string | null;
  isException?: boolean;
  instanceState?: 'normal' | 'skipped';
  recurrence?: TodoRecurrence | null;
  recurrenceInstanceAt?: string | null;
  createdAt: string;
  updatedAt: string;
  resourceRefs?: TodoResourceRefView[];
}

export interface TodoPayload {
  title: string;
  description?: string;
  checklist?: TodoChecklistItem[];
  priority?: TodoPriority;
  dueAt?: string | null;
  reminder?: TodoReminderConfig | null;
  recurrence?: TodoRecurrence | null;
  /** 兼容旧调用方；服务端会转换为单次站内提醒。 */
  reminderAt?: string | null;
  /** 传入即整体替换关联的参考资料;不传表示不改动 */
  resourceRefs?: TodoResourceRefInput[];
}

export type TodoQuickReminderPreset = 'none' | 'before_due_1h' | 'daily_0900';

export interface TodoCreateInitialValues extends Partial<
  Pick<TodoPayload, 'title' | 'description' | 'priority' | 'dueAt' | 'checklist'>
> {
  quickReminderPreset?: TodoQuickReminderPreset;
}

export type TodoEditorSubmission =
  | { kind: 'legacy'; payload: TodoPayload }
  | { kind: 'v2'; scope: TodoPlanScope; payload: TodoPlanWritePayload; convertLegacyTodoId?: string };

export const listTodos = (params: { status: TodoFilterStatus; keyword: string; sort: TodoSort }) =>
  apiBasePost('/api/todo/list', params, { silent: true });
export const countTodos = () => apiBasePost('/api/todo/count', {}, { silent: true });
export const createTodo = (payload: TodoPayload) => apiBasePost('/api/todo/create', payload);
export const getTodoPlanV2Config = () => apiBasePost('/api/todo/v2/config', {}, { silent: true });
export const previewTodoPlanV2 = (payload: TodoPlanDraft) =>
  apiBasePost('/api/todo/v2/preview', payload, { silent: true });
export const createTodoPlanV2 = (payload: TodoPlanWritePayload) => apiBasePost('/api/todo/v2/create', payload);
export const ensureTodoCalendarRangeV2 = (endDate: string) =>
  apiBasePost('/api/todo/v2/calendar-range', { endDate }, { silent: true });
export const previewLegacyTodoConversionV2 = (legacyTodoId: string, payload: TodoPlanDraft) =>
  apiBasePost('/api/todo/v2/convert-preview', { legacyTodoId, ...payload }, { silent: true });
export const convertLegacyTodoPlanV2 = (legacyTodoId: string, payload: TodoPlanWritePayload) =>
  apiBasePost('/api/todo/v2/convert', {
    legacyTodoId,
    legacyConversionAcknowledged: true,
    ...payload,
  });
export const previewTodoPlanUpdateV2 = (todoId: string, scope: TodoPlanScope, payload: TodoPlanDraft) =>
  apiBasePost('/api/todo/v2/update-preview', { todoId, scope, ...payload }, { silent: true });
export const updateTodoPlanV2 = (
  todoId: string,
  scope: TodoPlanScope,
  payload: TodoPlanWritePayload,
  options?: { silent?: boolean },
) => apiBasePost('/api/todo/v2/update', { todoId, scope, ...payload }, options);
export const pauseTodoSeriesV2 = (seriesId: string, idempotencyKey: string) =>
  apiBasePost('/api/todo/v2/series/pause', { seriesId, idempotencyKey });
export const resumeTodoSeriesV2 = (seriesId: string, idempotencyKey: string) =>
  apiBasePost('/api/todo/v2/series/resume', { seriesId, idempotencyKey });
export const stopTodoSeriesV2 = (seriesId: string, idempotencyKey: string) =>
  apiBasePost('/api/todo/v2/series/stop', { seriesId, idempotencyKey });
export const skipTodoInstanceV2 = (todoId: string, idempotencyKey: string) =>
  apiBasePost('/api/todo/v2/instance/skip', { todoId, idempotencyKey });
export const deleteTodoPlanV2 = (todoId: string, scope: TodoPlanScope, idempotencyKey: string) =>
  apiBasePost('/api/todo/v2/delete', { todoId, scope, idempotencyKey });
export const updateTodo = (id: string, payload: Partial<TodoPayload>, options?: { silent?: boolean }) =>
  apiBasePost('/api/todo/update', { id, ...payload }, options);
export const completeTodo = (id: string, options?: { silent?: boolean }) =>
  apiBasePost('/api/todo/complete', { id }, options);
export const reopenTodo = (id: string) => apiBasePost('/api/todo/reopen', { id });
export const deleteTodo = (id: string) => apiBasePost('/api/todo/delete', { id });
export const restoreTodo = (id: string) => apiBasePost('/api/todo/restore', { id });
export const batchSetTodoStatus = (ids: string[], status: TodoStatus, options: { undoCompletion?: boolean } = {}) =>
  apiBasePost('/api/todo/batch-status', { ids, status, ...options });
export const batchDeleteTodos = (ids: string[]) => apiBasePost('/api/todo/batch-delete', { ids });
export const batchRestoreTodos = (ids: string[]) => apiBasePost('/api/todo/batch-restore', { ids });
export const reorderTodos = (items: Array<{ id: string; dueAt?: string | null; priority: TodoPriority }>) =>
  apiBasePost('/api/todo/reorder', { items });
export const snoozeTodo = (id: string, targetAt: string, options?: { silent?: boolean }) =>
  apiBasePost('/api/todo/snooze', { id, targetAt }, options);
