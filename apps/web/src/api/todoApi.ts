import { apiBasePost } from '@/http/request';

export type TodoPriority = 0 | 1 | 2;
export type TodoStatus = 'pending' | 'completed';
export type TodoFilterStatus = 'all' | TodoStatus;
export type TodoSort = 'smart' | 'due' | 'newest' | 'oldest';
export type TodoReminderMode = 'once' | 'repeat';
export type TodoReminderChannel = 'in_app' | 'email';
export type TodoRecurrenceFrequency = 'daily' | 'weekly' | 'monthly';

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
  reminder?: TodoReminderConfig | null;
  /** 兼容旧接口；新代码使用 reminder。 */
  reminderAt?: string | null;
  completedAt?: string | null;
  seriesId?: string | null;
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

export const listTodos = (params: { status: TodoFilterStatus; keyword: string; sort: TodoSort }) =>
  apiBasePost('/api/todo/list', params, { silent: true });
export const countTodos = () => apiBasePost('/api/todo/count', {}, { silent: true });
export const createTodo = (payload: TodoPayload) => apiBasePost('/api/todo/create', payload);
export const updateTodo = (id: string, payload: Partial<TodoPayload>) =>
  apiBasePost('/api/todo/update', { id, ...payload });
export const completeTodo = (id: string) => apiBasePost('/api/todo/complete', { id });
export const reopenTodo = (id: string) => apiBasePost('/api/todo/reopen', { id });
export const deleteTodo = (id: string) => apiBasePost('/api/todo/delete', { id });
export const restoreTodo = (id: string) => apiBasePost('/api/todo/restore', { id });
export const batchSetTodoStatus = (ids: string[], status: TodoStatus, options: { undoCompletion?: boolean } = {}) =>
  apiBasePost('/api/todo/batch-status', { ids, status, ...options });
export const batchDeleteTodos = (ids: string[]) => apiBasePost('/api/todo/batch-delete', { ids });
export const batchRestoreTodos = (ids: string[]) => apiBasePost('/api/todo/batch-restore', { ids });
export const reorderTodos = (
  items: Array<{ id: string; dueAt?: string | null; priority: TodoPriority }>,
) => apiBasePost('/api/todo/reorder', { items });
export const snoozeTodo = (id: string, targetAt: string) =>
  apiBasePost('/api/todo/snooze', { id, targetAt });
