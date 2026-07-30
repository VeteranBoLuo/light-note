import type { TodoItem } from '@/api/todoApi';

export type TodoGroupKey = 'overdue' | 'today' | 'upcoming' | 'later' | 'noDate' | 'completed';
export type TodoQuickDue = 'today' | 'tomorrow' | 'week' | 'none';
export type TodoSnoozePreset = 'tenMinutes' | 'tomorrow' | 'nextWeek';

export function parseTodoDate(value: string | number | Date) {
  if (value instanceof Date) return new Date(value);
  return new Date(typeof value === 'string' ? value.replace(' ', 'T') : value);
}

export function localTodoDateTime(date: Date) {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

export function toTodoLocalInput(value?: string | null) {
  if (!value) return '';
  const raw = String(value).trim();
  // 服务端 DATETIME 没有时区语义，必须保持原墙上时间，不能再次套用浏览器偏移。
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?$/.test(raw)) {
    return raw.replace(' ', 'T').slice(0, 16);
  }
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return raw.replace(' ', 'T').slice(0, 16);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function todayDueDate(now: Date) {
  const due = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 17);
  if (due.getTime() > now.getTime()) return due;
  const anHourLater = new Date(now.getTime() + 60 * 60_000);
  if (anHourLater.getDate() === now.getDate()) return anHourLater;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59);
}

export function todoGroupKey(item: Pick<TodoItem, 'status' | 'dueAt'>, now = new Date()): TodoGroupKey {
  if (item.status === 'completed') return 'completed';
  if (!item.dueAt) return 'noDate';
  const due = parseTodoDate(item.dueAt).getTime();
  if (!Number.isFinite(due)) return 'noDate';
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  const nextWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 8).getTime();
  if (due < now.getTime()) return 'overdue';
  if (due < tomorrow) return 'today';
  if (due < nextWeek) return 'upcoming';
  return 'later';
}

export function dueForTodoGroup(key: TodoGroupKey, now = new Date()) {
  if (key === 'noDate') return null;
  const date =
    key === 'overdue'
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 17)
      : key === 'today'
        ? todayDueDate(now)
        : key === 'upcoming'
          ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 17)
          : new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14, 17);
  return localTodoDateTime(date);
}

export function quickTodoDueAt(preset: TodoQuickDue, now = new Date()) {
  if (preset === 'none') return null;
  const date =
    preset === 'today'
      ? todayDueDate(now)
      : preset === 'tomorrow'
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9)
        : new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 9);
  return localTodoDateTime(date);
}

export function todoSnoozeAt(preset: TodoSnoozePreset, now = new Date()) {
  let target = new Date(now.getTime() + 10 * 60_000);
  if (preset === 'tomorrow') target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9);
  if (preset === 'nextWeek') {
    const days = ((8 - now.getDay()) % 7) || 7;
    target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 9);
  }
  return localTodoDateTime(target);
}
