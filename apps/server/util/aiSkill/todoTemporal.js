import { Temporal } from '@js-temporal/polyfill';
import { aiSkillError } from './errors.js';

const DEFAULT_TIME_ZONE = 'Asia/Singapore';
const DATE_ONLY_DEFAULT_TIME = Object.freeze({ hour: 23, minute: 59, second: 0 });
const MAX_RELATIVE_DAYS = 3650;

const RELATIVE_DAY_OFFSETS = new Map([
  ['前天', -2],
  ['昨天', -1],
  ['昨日', -1],
  ['今天', 0],
  ['今日', 0],
  ['明天', 1],
  ['后天', 2],
  ['大后天', 3],
  ['the day before yesterday', -2],
  ['yesterday', -1],
  ['today', 0],
  ['tomorrow', 1],
  ['the day after tomorrow', 2],
]);

const WEEKDAY_INDEX = new Map([
  ['一', 1],
  ['二', 2],
  ['三', 3],
  ['四', 4],
  ['五', 5],
  ['六', 6],
  ['日', 7],
  ['天', 7],
  ['monday', 1],
  ['tuesday', 2],
  ['wednesday', 3],
  ['thursday', 4],
  ['friday', 5],
  ['saturday', 6],
  ['sunday', 7],
]);

const CHINESE_DIGITS = Object.freeze({
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
});

function invalidTemporal(message) {
  return aiSkillError('AI_SKILL_STRUCTURED_OUTPUT_INVALID', message, 502);
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLowerCase();
}

function assertQuotedExpression(instruction, expression, label) {
  const quoted = normalizeText(expression);
  if (!quoted) return '';
  if (!normalizeText(instruction).includes(quoted)) {
    throw invalidTemporal(`${label}必须原样摘录自用户描述`);
  }
  return quoted;
}

function safeTimeZone(value) {
  const candidate = String(value || '').trim();
  try {
    Temporal.Now.zonedDateTimeISO(candidate);
    return candidate;
  } catch {
    throw invalidTemporal('客户端时区无效');
  }
}

function instantFrom(value) {
  if (value instanceof Temporal.Instant) return value;
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw invalidTemporal('服务端当前时间无效');
    return Temporal.Instant.from(value.toISOString());
  }
  if (typeof value === 'number' && Number.isFinite(value)) return Temporal.Instant.fromEpochMilliseconds(value);
  try {
    return Temporal.Instant.from(String(value));
  } catch {
    throw invalidTemporal('服务端当前时间无效');
  }
}

function parseChineseInteger(value) {
  const text = String(value || '').trim();
  if (/^\d{1,4}$/u.test(text)) return Number.parseInt(text, 10);
  if (!/^[零〇一二两三四五六七八九十百]+$/u.test(text)) return null;
  let total = 0;
  let current = 0;
  for (const char of text) {
    if (char === '十' || char === '百') {
      const unit = char === '十' ? 10 : 100;
      total += (current || 1) * unit;
      current = 0;
      continue;
    }
    current = CHINESE_DIGITS[char];
  }
  return total + current;
}

function plainDate(year, month, day) {
  try {
    return Temporal.PlainDate.from({ year: Number(year), month: Number(month), day: Number(day) });
  } catch {
    throw invalidTemporal('日期表达式无效');
  }
}

function parseDateExpression(expression, today) {
  if (!expression) return null;
  const normalized = normalizeText(expression);
  const relativeOffset = RELATIVE_DAY_OFFSETS.get(normalized);
  if (relativeOffset != null) return today.add({ days: relativeOffset });

  let match = normalized.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/u);
  if (!match) match = normalized.match(/^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?$/u);
  if (match) return plainDate(match[1], match[2], match[3]);

  match = normalized.match(/^(\d{1,2})[-/.](\d{1,2})$/u);
  if (!match) match = normalized.match(/^(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?$/u);
  if (match) return plainDate(today.year, match[1], match[2]);

  match = normalized.match(/^([零〇一二两三四五六七八九十百\d]{1,4})\s*天\s*(后|以后|前|以前)$/u);
  if (match) {
    const count = parseChineseInteger(match[1]);
    if (!Number.isSafeInteger(count) || count < 0 || count > MAX_RELATIVE_DAYS) {
      throw invalidTemporal('相对日期超出支持范围');
    }
    return today.add({ days: ['前', '以前'].includes(match[2]) ? -count : count });
  }
  match = normalized.match(/^in\s+(\d{1,4})\s+days?$/u);
  if (match) {
    const count = Number.parseInt(match[1], 10);
    if (count > MAX_RELATIVE_DAYS) throw invalidTemporal('相对日期超出支持范围');
    return today.add({ days: count });
  }
  match = normalized.match(/^(\d{1,4})\s+days?\s+ago$/u);
  if (match) {
    const count = Number.parseInt(match[1], 10);
    if (count > MAX_RELATIVE_DAYS) throw invalidTemporal('相对日期超出支持范围');
    return today.subtract({ days: count });
  }

  match = normalized.match(/^(本|这|下|下下|上)?\s*(?:周|星期|礼拜)([一二三四五六日天])$/u);
  if (match) {
    const weekOffset = { 本: 0, 这: 0, 下: 1, 下下: 2, 上: -1 }[match[1] || '本'];
    const monday = today.subtract({ days: today.dayOfWeek - 1 }).add({ weeks: weekOffset });
    return monday.add({ days: WEEKDAY_INDEX.get(match[2]) - 1 });
  }
  match = normalized.match(/^(next\s+|this\s+|last\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/u);
  if (match) {
    const target = WEEKDAY_INDEX.get(match[2]);
    const qualifier = String(match[1] || '').trim();
    if (qualifier === 'next') {
      const days = (target - today.dayOfWeek + 7) % 7;
      return today.add({ days: days || 7 });
    }
    if (qualifier === 'last') {
      const days = (today.dayOfWeek - target + 7) % 7;
      return today.subtract({ days: days || 7 });
    }
    return today.add({ days: (target - today.dayOfWeek + 7) % 7 });
  }

  throw invalidTemporal('暂时无法确定该日期表达式，请使用更明确的日期');
}

function parseTimeExpression(expression) {
  if (!expression) return null;
  const normalized = normalizeText(expression);
  let hour;
  let minute = 0;
  let second = 0;
  let period = '';
  let dayOffset = 0;

  let match = normalized.match(
    /^(凌晨|早上|上午|中午|下午|傍晚|晚上)?\s*(\d{1,2})\s*(?:点|时)(?:(半|一刻|三刻)|(\d{1,2})\s*分?)?$/u,
  );
  if (match) {
    period = match[1] || '';
    hour = Number.parseInt(match[2], 10);
    minute = match[3] === '半' ? 30 : match[3] === '一刻' ? 15 : match[3] === '三刻' ? 45 : Number(match[4] || 0);
  } else {
    match = normalized.match(/^(\d{1,2})(?::(\d{2}))(?::(\d{2}))?\s*(am|pm)?$/u);
    if (match) {
      hour = Number.parseInt(match[1], 10);
      minute = Number.parseInt(match[2], 10);
      second = Number.parseInt(match[3] || '0', 10);
      period = match[4] || '';
    } else {
      match = normalized.match(/^(\d{1,2})\s*(am|pm)$/u);
      if (!match) throw invalidTemporal('暂时无法确定该时间表达式，请使用更明确的时间');
      hour = Number.parseInt(match[1], 10);
      period = match[2];
    }
  }

  if (period === '晚上' && hour === 12) {
    hour = 0;
    dayOffset = 1;
  } else if (['下午', '傍晚', '晚上', 'pm'].includes(period) && hour < 12) {
    hour += 12;
  }
  if (['凌晨', '早上', '上午', 'am'].includes(period) && hour === 12) hour = 0;
  if (period === '中午' && hour < 11) hour += 12;
  if (hour > 23 || minute > 59 || second > 59 || hour < 0 || minute < 0 || second < 0) {
    throw invalidTemporal('时间表达式无效');
  }
  return { hour, minute, second, dayOffset };
}

function formatDateTime(value) {
  return `${value.toPlainDate().toString()} ${String(value.hour).padStart(2, '0')}:${String(value.minute).padStart(2, '0')}:${String(value.second).padStart(2, '0')}`;
}

/**
 * 模型只允许原样摘录用户说过的日期/时间片段；所有绝对时间计算都在服务端完成。
 * 日期未带时间时采用产品统一的本地日末截止口径，只有时间时采用用户时区的当天。
 */
export function resolveTodoTemporalIntent(
  { instruction, temporal } = {},
  { now = new Date(), timeZone = DEFAULT_TIME_ZONE } = {},
) {
  const value = temporal && typeof temporal === 'object' && !Array.isArray(temporal) ? temporal : {};
  const unknown = Object.keys(value).filter((key) => !['dateExpression', 'timeExpression'].includes(key));
  if (unknown.length) throw invalidTemporal(`temporal 包含未知字段：${unknown.join(', ')}`);
  const dateExpression = assertQuotedExpression(instruction, value.dateExpression, '日期表达式');
  const timeExpression = assertQuotedExpression(instruction, value.timeExpression, '时间表达式');
  if (!dateExpression && !timeExpression) return Object.freeze({ dueAt: null, overdue: false });

  const zone = safeTimeZone(timeZone);
  const current = instantFrom(now).toZonedDateTimeISO(zone);
  const parsedDate = parseDateExpression(dateExpression, current.toPlainDate()) || current.toPlainDate();
  const parsedTime = parseTimeExpression(timeExpression);
  const date = parsedTime?.dayOffset ? parsedDate.add({ days: parsedTime.dayOffset }) : parsedDate;
  const time = parsedTime
    ? { hour: parsedTime.hour, minute: parsedTime.minute, second: parsedTime.second }
    : DATE_ONLY_DEFAULT_TIME;
  let due;
  try {
    due = date.toPlainDateTime(time).toZonedDateTime(zone, { disambiguation: 'compatible' });
  } catch {
    throw invalidTemporal('日期时间组合无效');
  }
  const currentSecond = current.with({ millisecond: 0, microsecond: 0, nanosecond: 0 });
  return Object.freeze({
    dueAt: formatDateTime(due),
    overdue: Temporal.ZonedDateTime.compare(due, currentSecond) < 0,
  });
}

export const todoTemporalInternals = Object.freeze({
  normalizeText,
  parseChineseInteger,
  parseDateExpression,
  parseTimeExpression,
  DATE_ONLY_DEFAULT_TIME,
  MAX_RELATIVE_DAYS,
});
