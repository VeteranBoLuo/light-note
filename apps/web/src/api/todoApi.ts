import { apiBasePost } from '@/http/request';

export type TodoPriority = 0 | 1 | 2;
export type TodoStatus = 'pending' | 'completed';
export type TodoSort = 'smart' | 'due' | 'newest' | 'oldest';

export interface TodoChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface TodoItem {
  id: string;
  title: string;
  description?: string;
  checklist: TodoChecklistItem[];
  priority: TodoPriority;
  status: TodoStatus;
  dueAt?: string | null;
  reminderAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TodoPayload {
  title: string;
  description?: string;
  checklist?: TodoChecklistItem[];
  priority?: TodoPriority;
  dueAt?: string | null;
  reminderAt?: string | null;
}

export const listTodos = (params: { status: TodoStatus; keyword: string; sort: TodoSort }) =>
  apiBasePost('/api/todo/list', params, { silent: true });
export const countTodos = () => apiBasePost('/api/todo/count', {}, { silent: true });
export const createTodo = (payload: TodoPayload) => apiBasePost('/api/todo/create', payload);
export const updateTodo = (id: string, payload: Partial<TodoPayload>) =>
  apiBasePost('/api/todo/update', { id, ...payload });
export const completeTodo = (id: string) => apiBasePost('/api/todo/complete', { id });
export const reopenTodo = (id: string) => apiBasePost('/api/todo/reopen', { id });
export const deleteTodo = (id: string) => apiBasePost('/api/todo/delete', { id });
