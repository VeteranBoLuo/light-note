/**
 * 笔记模板占位变量替换。
 *
 * 支持的变量（双花括号，允许内部空格）：
 *   {{date}}     → 2026-07-17（本地时区，禁用 toISOString：北京凌晨会差一天）
 *   {{time}}     → 09:05
 *   {{datetime}} → 2026-07-17 09:05
 *   {{weekStart}} / {{weekEnd}} → 本周周一 / 周日（本地日期）
 *   {{weekday}}  → 星期五 / Friday（按传入 locale）
 *
 * 未知变量保留原文不误删，方便用户把 {{xxx}} 当普通占位文字用。
 */

const pad = (n: number) => String(n).padStart(2, '0');

export const NOTE_TEMPLATE_VARIABLES = ['date', 'time', 'datetime', 'weekday', 'weekStart', 'weekEnd'] as const;

export function renderNoteTemplate(text: string, options?: { now?: Date; locale?: string }): string {
  if (!text) return text ?? '';
  const now = options?.now ?? new Date();
  const locale = options?.locale || 'zh-CN';
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const formatDate = (value: Date) => `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const vars: Record<string, string> = {
    date,
    weekStart: formatDate(weekStart),
    weekEnd: formatDate(weekEnd),
    time,
    datetime: `${date} ${time}`,
    weekday: new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(now),
  };
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (raw, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : raw,
  );
}
