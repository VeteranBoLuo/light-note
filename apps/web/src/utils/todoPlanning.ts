import type { TodoItem } from '@/api/todoApi';
import { resolveTodoConfiguredReminderAt, resolveTodoNextReminderAt } from '@lightnote/shared/todo-reminder';

export type TodoGroupKey = 'overdue' | 'today' | 'upcoming' | 'later' | 'noDate' | 'completed';
export type TodoSnoozePreset = 'tenMinutes' | 'oneHour' | 'threeHours' | 'oneDay' | 'tomorrow' | 'nextWeek';
export type TodoDateDuePreset = 'today' | 'tomorrow' | 'week';
export type TodoDateFormatOptions = {
  relative?: boolean;
  includeYear?: boolean;
  includeTime?: boolean;
  now?: Date;
  relativeLabels?: {
    today: string;
    tomorrow: string;
  };
};

export function parseTodoDate(value: string | number | Date) {
  if (value instanceof Date) return new Date(value);
  return new Date(typeof value === 'string' ? value.replace(' ', 'T') : value);
}

/**
 * MySQL DATE 在不同驱动配置下可能是 YYYY-MM-DD、ISO 字符串或 Date。
 * 待办实例日期没有时区语义，统一收敛为本地日历日，禁止在调用处自行拼接。
 */
export function normalizeTodoDateOnly(value: string | Date | null | undefined) {
  if (!value) return '';
  const raw = value instanceof Date ? '' : String(value).trim();
  const leadingDate = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (leadingDate) return leadingDate[1];
  const date = value instanceof Date ? value : parseTodoDate(value);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todoNextReminderAt(item: Pick<TodoItem, 'reminder' | 'reminderAt'>) {
  return resolveTodoNextReminderAt(item);
}

/**
 * 提醒 Job 投递后 nextAt 会被清空；列表仍需从提醒规则还原本实例原定的提醒时刻，
 * 才能区分“没有提醒”和“提醒时间已经过去”。
 */
export function todoConfiguredReminderAt(
  item: Pick<TodoItem, 'reminder' | 'reminderAt' | 'startAt' | 'dueAt' | 'occurrenceDate'>,
) {
  return resolveTodoConfiguredReminderAt(item);
}

/** 已过提醒只表达提醒时刻，不等同于待办超过截止时间。 */
export function todoPastReminderAt(
  item: Pick<TodoItem, 'status' | 'reminder' | 'reminderAt' | 'startAt' | 'dueAt' | 'occurrenceDate'>,
  now = new Date(),
) {
  if (item.status !== 'pending' || (item.reminder && 'paused' in item.reminder && item.reminder.paused)) return '';
  const reminderAt = todoNextReminderAt(item) || todoConfiguredReminderAt(item);
  if (!reminderAt) return '';
  const reminderTime = parseTodoDate(reminderAt).getTime();
  return Number.isFinite(reminderTime) && reminderTime < now.getTime() ? reminderAt : '';
}

/** 日历位置只由任务计划决定，提醒不会把任务移动到另一天。 */
export function todoScheduleAt(item: Pick<TodoItem, 'startAt' | 'dueAt' | 'occurrenceDate'>) {
  if (item.startAt) return item.startAt;
  if (item.dueAt) return item.dueAt;
  const occurrenceDate = normalizeTodoDateOnly(item.occurrenceDate);
  return occurrenceDate ? `${occurrenceDate}T00:00:00` : '';
}

/** 列表的“下一步时间”：提醒、开始、截止、实例日期中最早的有效时刻。 */
export function todoActionAt(
  item: Pick<TodoItem, 'actionAt' | 'reminder' | 'reminderAt' | 'startAt' | 'dueAt' | 'occurrenceDate'>,
) {
  if (item.actionAt && Number.isFinite(parseTodoDate(item.actionAt).getTime())) return item.actionAt;
  const candidates = [todoNextReminderAt(item), item.startAt || '', item.dueAt || '', todoScheduleAt(item)]
    .map((value) => ({ value, time: value ? parseTodoDate(value).getTime() : Number.NaN }))
    .filter((entry) => Number.isFinite(entry.time))
    .sort((left, right) => left.time - right.time);
  return candidates[0]?.value || '';
}

export function compareTodoOccurrences(left: TodoItem, right: TodoItem) {
  const leftAt = todoActionAt(left);
  const rightAt = todoActionAt(right);
  const leftTime = leftAt ? parseTodoDate(leftAt).getTime() : Number.POSITIVE_INFINITY;
  const rightTime = rightAt ? parseTodoDate(rightAt).getTime() : Number.POSITIVE_INFINITY;
  if (leftTime !== rightTime) return leftTime - rightTime;
  const leftNo = Number(left.occurrenceNo ?? Number.MAX_SAFE_INTEGER);
  const rightNo = Number(right.occurrenceNo ?? Number.MAX_SAFE_INTEGER);
  if (leftNo !== rightNo) return leftNo - rightNo;
  return String(left.id).localeCompare(String(right.id));
}

function normalizeTodoLocale(locale: string) {
  return String(locale || '')
    .toLowerCase()
    .startsWith('en')
    ? 'en-US'
    : 'zh-CN';
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function clockLabel(date: Date, locale: 'zh-CN' | 'en-US') {
  const minute = String(date.getMinutes()).padStart(2, '0');
  if (locale === 'en-US') {
    const period = date.getHours() >= 12 ? 'PM' : 'AM';
    const hour = date.getHours() % 12 || 12;
    return `${hour}:${minute} ${period}`;
  }
  return `${String(date.getHours()).padStart(2, '0')}:${minute}`;
}

function absoluteTodoDateLabel(
  date: Date,
  locale: 'zh-CN' | 'en-US',
  includeYear: boolean,
  includeTime: boolean,
  now: Date,
) {
  const clock = clockLabel(date, locale);
  const sameYear = date.getFullYear() === now.getFullYear();
  const withYear = includeYear || !sameYear;
  if (locale === 'en-US') {
    const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date);
    const datePart = new Intl.DateTimeFormat(locale, {
      year: withYear ? 'numeric' : undefined,
      month: 'short',
      day: 'numeric',
    }).format(date);
    return includeTime ? `${weekday}, ${datePart}, ${clock}` : `${weekday}, ${datePart}`;
  }
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date);
  const datePart = `${withYear ? `${date.getFullYear()}年` : ''}${date.getMonth() + 1}月${date.getDate()}日`;
  return includeTime ? `${datePart}（${weekday}）${clock}` : `${datePart}（${weekday}）`;
}

export function formatTodoDateTime(
  value: string | number | Date | null | undefined,
  locale = 'zh-CN',
  options: TodoDateFormatOptions = {},
) {
  if (value === null || value === undefined || value === '') return '';
  const date = parseTodoDate(value);
  if (!Number.isFinite(date.getTime())) return '';
  const normalizedLocale = normalizeTodoLocale(locale);
  const includeTime = options.includeTime !== false;
  const now = options.now instanceof Date && Number.isFinite(options.now.getTime()) ? options.now : new Date();
  if (options.relative && options.relativeLabels) {
    if (dateKey(date) === dateKey(now)) {
      return includeTime
        ? `${options.relativeLabels.today} ${clockLabel(date, normalizedLocale)}`
        : options.relativeLabels.today;
    }
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    if (dateKey(date) === dateKey(tomorrow)) {
      return includeTime
        ? `${options.relativeLabels.tomorrow} ${clockLabel(date, normalizedLocale)}`
        : options.relativeLabels.tomorrow;
    }
  }
  return absoluteTodoDateLabel(date, normalizedLocale, options.includeYear !== false, includeTime, now);
}

export function localTodoDateTime(date: Date) {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

const DEFAULT_TODO_TIMEZONE = 'Asia/Shanghai';

/**
 * 待办计划使用没有偏移量的墙上时间；快捷入口必须先在计划时区内确定“今天”，
 * 不能直接借用浏览器或服务器所在时区。
 */
export function todoNowInTimezone(timezone = DEFAULT_TODO_TIMEZONE, now = new Date()) {
  const fallback = () => localTodoDateTime(now);
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    if (values.year && values.month && values.day && values.hour && values.minute) {
      const hour = values.hour === '24' ? '00' : values.hour;
      return `${values.year}-${values.month}-${values.day}T${hour}:${values.minute}`;
    }
  } catch {
    // 非法时区最终仍会由服务端拒绝；表单使用浏览器墙上时间作为可编辑回退。
  }
  return fallback();
}

export function todoTodayInTimezone(timezone = DEFAULT_TODO_TIMEZONE, now = new Date()) {
  return todoNowInTimezone(timezone, now).slice(0, 10);
}

function addTodoCalendarDays(dateValue: string, days: number) {
  const [year, month, day] = dateValue.split('-').map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${result.getUTCFullYear()}-${pad(result.getUTCMonth() + 1)}-${pad(result.getUTCDate())}`;
}

/**
 * “今天 / 明天 / 本周”只表达日历日，不代表用户选择了具体时刻。
 * 在当前 DATETIME 协议下统一映射到该日 23:59，避免 00:00 让任务在当天开始时立即逾期。
 */
export function dueForTodoDatePreset(
  preset: TodoDateDuePreset,
  { timezone = DEFAULT_TODO_TIMEZONE, now = new Date() }: { timezone?: string; now?: Date } = {},
) {
  const today = todoTodayInTimezone(timezone, now);
  let dayOffset = preset === 'tomorrow' ? 1 : 0;
  if (preset === 'week') {
    const [year, month, day] = today.split('-').map(Number);
    dayOffset = (7 - new Date(Date.UTC(year, month - 1, day)).getUTCDay()) % 7;
  }
  return `${addTodoCalendarDays(today, dayOffset)}T23:59`;
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

export function todoGroupKey(
  item: Pick<TodoItem, 'status' | 'dueAt' | 'startAt' | 'occurrenceDate' | 'actionAt' | 'reminder' | 'reminderAt'>,
  now = new Date(),
): TodoGroupKey {
  if (item.status === 'completed') return 'completed';
  const due = item.dueAt ? parseTodoDate(item.dueAt).getTime() : Number.NaN;
  if (Number.isFinite(due) && due < now.getTime()) return 'overdue';
  const occurrenceDate = normalizeTodoDateOnly(item.occurrenceDate);
  const todayDate = normalizeTodoDateOnly(now);
  if (!item.dueAt && occurrenceDate && occurrenceDate < todayDate) return 'overdue';
  // 提醒时间已过只表示通知已经触发，不等于任务逾期。日期分组优先使用计划本身；
  // 只有没有开始/截止/实例日期时，才用仍在今天或未来的提醒作为分组依据。
  const scheduledAt = todoScheduleAt(item);
  const reminderAt = todoNextReminderAt(item);
  const reminderTime = reminderAt ? parseTodoDate(reminderAt).getTime() : Number.NaN;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const actionAt = scheduledAt || (Number.isFinite(reminderTime) && reminderTime >= startOfToday ? reminderAt : '');
  if (!actionAt) return 'noDate';
  const action = parseTodoDate(actionAt).getTime();
  if (!Number.isFinite(action)) return 'noDate';
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  const nextWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 8).getTime();
  if (action < startOfToday) return 'overdue';
  if (action < tomorrow) return 'today';
  if (action < nextWeek) return 'upcoming';
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

export function todoSnoozeAt(preset: TodoSnoozePreset, now = new Date()) {
  const relativeMinutes: Partial<Record<TodoSnoozePreset, number>> = {
    tenMinutes: 10,
    oneHour: 60,
    threeHours: 180,
    oneDay: 24 * 60,
  };
  const minutes = relativeMinutes[preset];
  let target = new Date(now.getTime() + (minutes ?? 10) * 60_000);
  if (preset === 'tomorrow') target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9);
  if (preset === 'nextWeek') {
    const days = (8 - now.getDay()) % 7 || 7;
    target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 9);
  }
  return localTodoDateTime(target);
}
