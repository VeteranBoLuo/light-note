export const ADMIN_DEFAULT_TIME_ZONE = 'Asia/Shanghai';

type AdminDateTimeSource = 'beijing' | 'utc';

interface AdminDateTimeFormatOptions {
  source?: AdminDateTimeSource;
  includeSeconds?: boolean;
}

const EXPLICIT_TIME_ZONE_RE = /(?:Z|[+-]\d{2}:?\d{2})$/iu;
const SQL_DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/u;

/**
 * 后台产品统一以北京时间展示。数据库无时区 DATETIME 必须由调用方声明其语义，
 * 禁止交给浏览器按设备所在时区猜测。
 */
export function parseAdminDateTime(value: unknown, source: AdminDateTimeSource = 'beijing') {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  const raw = String(value || '').trim();
  if (!raw) return null;
  let normalized = raw;
  if (SQL_DATE_TIME_RE.test(raw)) {
    normalized = raw.replace(' ', 'T');
    if (!EXPLICIT_TIME_ZONE_RE.test(normalized)) normalized += source === 'utc' ? 'Z' : '+08:00';
  }
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function formatAdminDateTime(
  value: unknown,
  locale = 'zh-CN',
  { source = 'beijing', includeSeconds = true }: AdminDateTimeFormatOptions = {},
) {
  const date = parseAdminDateTime(value, source);
  if (!date) return value ? String(value) : '-';
  return new Intl.DateTimeFormat(locale, {
    timeZone: ADMIN_DEFAULT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' as const } : {}),
    hourCycle: 'h23',
  }).format(date);
}
