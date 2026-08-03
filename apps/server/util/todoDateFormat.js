const ZH_WEEKDAYS = Object.freeze(['周日', '周一', '周二', '周三', '周四', '周五', '周六']);
const EN_WEEKDAYS = Object.freeze(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
const EN_MONTHS = Object.freeze(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);

function pad(value) {
  return String(value).padStart(2, '0');
}

function validDateParts(parts) {
  if (!parts) return null;
  const { year, month, day, hour, minute, second } = parts;
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    !Number.isInteger(second) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return null;
  }
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return { ...parts, weekday: date.getDay() };
}

function datePartsFromDate(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return null;
  return validDateParts({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds(),
  });
}

function datePartsFromString(value) {
  const raw = String(value || '').trim();
  const wallClockMatch = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(raw);
  if (wallClockMatch) {
    return validDateParts({
      year: Number(wallClockMatch[1]),
      month: Number(wallClockMatch[2]),
      day: Number(wallClockMatch[3]),
      hour: Number(wallClockMatch[4] || 0),
      minute: Number(wallClockMatch[5] || 0),
      second: Number(wallClockMatch[6] || 0),
    });
  }
  const parsed = new Date(raw.replace(' ', 'T'));
  return datePartsFromDate(parsed);
}

function dateParts(value) {
  if (value instanceof Date) return datePartsFromDate(value);
  if (value === null || value === undefined || value === '') return null;
  return datePartsFromString(value);
}

export function normalizeTodoLocale(value) {
  return String(value || '').toLowerCase().startsWith('en') ? 'en-US' : 'zh-CN';
}

/**
 * 待办截止时间是服务端 DATETIME 的墙上时间，不携带时区语义。
 * 展示时保留日期和时间本身，不使用 Date.prototype.toString()，避免泄漏运行时的英文时区串。
 */
export function formatTodoDueAt(value, locale = 'zh-CN') {
  const parts = dateParts(value);
  if (!parts) return '';
  const normalizedLocale = normalizeTodoLocale(locale);
  const clock = `${pad(parts.hour)}:${pad(parts.minute)}`;
  if (normalizedLocale === 'en-US') {
    const period = parts.hour >= 12 ? 'PM' : 'AM';
    const hour = parts.hour % 12 || 12;
    return `${EN_WEEKDAYS[parts.weekday]}, ${EN_MONTHS[parts.month - 1]} ${parts.day}, ${parts.year}, ${hour}:${pad(
      parts.minute,
    )} ${period}`;
  }
  return `${parts.year}年${parts.month}月${parts.day}日（${ZH_WEEKDAYS[parts.weekday]}）${clock}`;
}
