import { Temporal } from '@js-temporal/polyfill';

/**
 * Agent 时间范围唯一解析器。
 *
 * - 用户日历语义在 IANA `timeZone` 中计算；
 * - SQL 边界统一转换到 `storageTimeZone`，匹配项目现有 DATETIME 存储口径；
 * - 新查询统一使用半开区间 `[start, endExclusive)`；
 * - `end` 仅保留给尚未迁移的旧调用方，值为 `endExclusive - 1 秒`。
 */

export const DEFAULT_AGENT_TIME_ZONE = 'Asia/Shanghai';
export const DEFAULT_AGENT_STORAGE_TIME_ZONE = 'Asia/Shanghai';

const MAX_TIME_ZONE_LENGTH = 64;

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatZonedDateTime(value) {
  return `${value.year}-${pad(value.month)}-${pad(value.day)} ${pad(value.hour)}:${pad(value.minute)}:${pad(value.second)}`;
}

export function normalizeAgentTimeZone(value, fallback = DEFAULT_AGENT_TIME_ZONE) {
  const candidate = String(value || '')
    .trim()
    .slice(0, MAX_TIME_ZONE_LENGTH);
  try {
    if (candidate) Temporal.Now.zonedDateTimeISO(candidate);
    if (candidate) return candidate;
  } catch {
    // 非法客户端输入统一走安全默认值，不能进入日期计算或 SQL。
  }
  const safeFallback = String(fallback || DEFAULT_AGENT_TIME_ZONE)
    .trim()
    .slice(0, MAX_TIME_ZONE_LENGTH);
  try {
    Temporal.Now.zonedDateTimeISO(safeFallback);
    return safeFallback;
  } catch {
    return DEFAULT_AGENT_TIME_ZONE;
  }
}

function instantFrom(value, timeZone) {
  if (value instanceof Temporal.Instant) return value;
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return null;
    return Temporal.Instant.from(value.toISOString());
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return Temporal.Instant.fromEpochMilliseconds(value);
  }
  const text = String(value || '').trim();
  if (!text) return Temporal.Now.instant();
  try {
    return Temporal.Instant.from(text);
  } catch {
    try {
      return Temporal.PlainDateTime.from(text.replace(' ', 'T'))
        .toZonedDateTime(timeZone, {
          disambiguation: 'compatible',
        })
        .toInstant();
    } catch {
      return null;
    }
  }
}

function startOfDay(value, timeZone) {
  return value.toPlainDate().toZonedDateTime(timeZone);
}

function startOfPlainDate(value, timeZone) {
  return value.toZonedDateTime(timeZone);
}

function startOfMonth(year, month, timeZone) {
  return Temporal.PlainDate.from({ year, month, day: 1 }).toZonedDateTime(timeZone);
}

function floorToSecond(value) {
  return value.with({ millisecond: 0, microsecond: 0, nanosecond: 0 });
}

function canonicalRange(startValue, endExclusiveValue, { timeZone, storageTimeZone }) {
  const start = floorToSecond(startValue);
  const endExclusive = floorToSecond(endExclusiveValue);
  if (Temporal.ZonedDateTime.compare(start, endExclusive) >= 0) return null;
  const end = endExclusive.subtract({ seconds: 1 });
  const storageStart = start.toInstant().toZonedDateTimeISO(storageTimeZone);
  const storageEnd = end.toInstant().toZonedDateTimeISO(storageTimeZone);
  const storageEndExclusive = endExclusive.toInstant().toZonedDateTimeISO(storageTimeZone);
  return Object.freeze({
    start: formatZonedDateTime(storageStart),
    end: formatZonedDateTime(storageEnd),
    endExclusive: formatZonedDateTime(storageEndExclusive),
    timeZone,
    storageTimeZone,
    localStart: formatZonedDateTime(start),
    localEnd: formatZonedDateTime(end),
    localEndExclusive: formatZonedDateTime(endExclusive),
  });
}

function throughNow(start, now, options) {
  const current = floorToSecond(now);
  return canonicalRange(start, current.add({ seconds: 1 }), options);
}

function completePeriod(start, endExclusive, options) {
  return canonicalRange(start, endExclusive, options);
}

/**
 * 将中文时间表达式解析成服务端权威范围。
 *
 * @param {string|null|undefined} expr
 * @param {{ now?: Date|string|number|Temporal.Instant, timeZone?: string, storageTimeZone?: string }} options
 * @returns {{ start: string, end: string, endExclusive: string, timeZone: string, storageTimeZone: string, localStart: string, localEnd: string, localEndExclusive: string } | null}
 */
export function parseTimeRange(
  expr,
  { now: nowInput = new Date(), timeZone: requestedTimeZone, storageTimeZone: requestedStorageTimeZone } = {},
) {
  if (!expr || typeof expr !== 'string') return null;
  const expression = expr.trim();
  if (!expression || isAllTimeExpression(expression)) return null;

  const timeZone = normalizeAgentTimeZone(
    requestedTimeZone,
    process.env.AGENT_DEFAULT_TIME_ZONE || DEFAULT_AGENT_TIME_ZONE,
  );
  const storageTimeZone = normalizeAgentTimeZone(
    requestedStorageTimeZone,
    process.env.AGENT_STORAGE_TIME_ZONE || DEFAULT_AGENT_STORAGE_TIME_ZONE,
  );
  const instant = instantFrom(nowInput, timeZone);
  if (!instant) return null;
  const now = instant.toZonedDateTimeISO(timeZone);
  const options = { timeZone, storageTimeZone };

  let match = expression.match(/^(?:最近|近)\s*(\d+)\s*个?\s*小时$/u);
  if (match) {
    const count = Number.parseInt(match[1], 10);
    if (count <= 0) return null;
    const current = floorToSecond(now);
    return throughNow(current.subtract({ hours: count }), current, options);
  }

  match = expression.match(/^(?:最近|近)\s*(\d+)\s*天$/u);
  if (match) {
    const count = Number.parseInt(match[1], 10);
    if (count <= 0) return null;
    return throughNow(startOfDay(now, timeZone).subtract({ days: count - 1 }), now, options);
  }

  match = expression.match(/^(?:最近|近)\s*(\d+)\s*周$/u);
  if (match) {
    const count = Number.parseInt(match[1], 10);
    if (count <= 0) return null;
    const anchor = now.toPlainDate().subtract({ weeks: count });
    const monday = anchor.subtract({ days: anchor.dayOfWeek - 1 });
    return throughNow(startOfPlainDate(monday, timeZone), now, options);
  }

  match = expression.match(/^(?:最近|近)\s*(\d+)\s*个?\s*月$/u);
  if (match) {
    const count = Number.parseInt(match[1], 10);
    if (count <= 0) return null;
    const month = now.toPlainDate().subtract({ months: count });
    return throughNow(startOfMonth(month.year, month.month, timeZone), now, options);
  }

  const relativeDays = new Map([
    ['前天', -2],
    ['昨天', -1],
    ['昨日', -1],
    ['今天', 0],
    ['今日', 0],
    ['明天', 1],
    ['后天', 2],
  ]);
  if (relativeDays.has(expression)) {
    const offset = relativeDays.get(expression);
    const date = now.toPlainDate().add({ days: offset });
    const start = startOfPlainDate(date, timeZone);
    return offset === 0 ? throughNow(start, now, options) : completePeriod(start, start.add({ days: 1 }), options);
  }

  if (expression === '本周' || expression === '这周') {
    const today = now.toPlainDate();
    const monday = today.subtract({ days: today.dayOfWeek - 1 });
    return throughNow(startOfPlainDate(monday, timeZone), now, options);
  }

  if (expression === '上周') {
    const today = now.toPlainDate();
    const thisMonday = today.subtract({ days: today.dayOfWeek - 1 });
    const start = startOfPlainDate(thisMonday.subtract({ weeks: 1 }), timeZone);
    return completePeriod(start, start.add({ weeks: 1 }), options);
  }

  if (expression === '本月' || expression === '这个月') {
    return throughNow(startOfMonth(now.year, now.month, timeZone), now, options);
  }

  if (expression === '上个月' || expression === '上月') {
    const previous = now.toPlainDate().subtract({ months: 1 });
    const start = startOfMonth(previous.year, previous.month, timeZone);
    return completePeriod(start, start.add({ months: 1 }), options);
  }

  if (expression === '今年' || expression === '本年') {
    return throughNow(startOfMonth(now.year, 1, timeZone), now, options);
  }

  if (expression === '去年') {
    const start = startOfMonth(now.year - 1, 1, timeZone);
    return completePeriod(start, start.add({ years: 1 }), options);
  }

  match = expression.match(/^(\d{4})\s*年$/u);
  if (match) {
    const start = startOfMonth(Number.parseInt(match[1], 10), 1, timeZone);
    return completePeriod(start, start.add({ years: 1 }), options);
  }

  match = expression.match(/^(\d{1,2})\s*月(?:份)?$/u);
  if (match) {
    const month = Number.parseInt(match[1], 10);
    if (month < 1 || month > 12) return null;
    const start = startOfMonth(now.year, month, timeZone);
    return completePeriod(start, start.add({ months: 1 }), options);
  }

  match = expression.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/u);
  if (!match) match = expression.match(/^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]$/u);
  if (match) {
    try {
      const date = Temporal.PlainDate.from({
        year: Number.parseInt(match[1], 10),
        month: Number.parseInt(match[2], 10),
        day: Number.parseInt(match[3], 10),
      });
      const start = startOfPlainDate(date, timeZone);
      return completePeriod(start, start.add({ days: 1 }), options);
    } catch {
      return null;
    }
  }

  return null;
}

function shortDateTime(value, { withTime = false } = {}) {
  const text = String(value || '');
  return withTime ? text.slice(0, 16) : text.slice(0, 10);
}

/** 展示 Binder 已解析完成的用户本地范围，不重新计算。 */
export function describeResolvedTimeRange(expr, range, locale = 'zh-CN') {
  const startValue = range?.localStart || range?.start;
  const endValue = range?.localEnd || range?.end;
  if (!startValue || !endValue) return '';
  const expression = String(expr || '').trim();
  const english = String(locale || '')
    .toLowerCase()
    .startsWith('en');
  const startDate = shortDateTime(startValue);
  const endDate = shortDateTime(endValue);
  const endTime = String(endValue).slice(11, 16);
  const zone = range?.timeZone ? ` · ${range.timeZone}` : '';

  if (expression === '今天' || expression === '今日') {
    return english ? `today (${startDate}, through ${endTime}${zone})` : `今天（${startDate}，截至 ${endTime}${zone}）`;
  }
  if (expression === '昨天' || expression === '昨日') {
    return english ? `yesterday (${startDate}${zone})` : `昨天（${startDate}${zone}）`;
  }
  if (/^(?:最近|近)\s*24\s*个?\s*小时$/u.test(expression)) {
    const start = shortDateTime(startValue, { withTime: true });
    const end = shortDateTime(endValue, { withTime: true });
    return english ? `the last 24 hours (${start} to ${end}${zone})` : `最近24小时（${start} 至 ${end}${zone}）`;
  }
  if (startDate === endDate) {
    return english
      ? `${expression || 'the requested range'} (${startDate}${zone})`
      : `${expression || '所选范围'}（${startDate}${zone}）`;
  }
  return english
    ? `${expression || 'the requested range'} (${startDate} to ${endDate}${zone})`
    : `${expression || '所选范围'}（${startDate} 至 ${endDate}${zone}）`;
}

const ALL_TIME_EXPRESSIONS = new Set([
  '全部',
  '所有',
  '全量',
  '累计',
  '历史',
  '当前',
  '目前',
  '现在',
  '当前项目',
  '目前项目',
  '当前全站',
  '目前全站',
  '截至目前',
  '截至现在',
  'all',
  'current',
  'overall',
]);

export function isAllTimeExpression(value) {
  return ALL_TIME_EXPRESSIONS.has(
    String(value || '')
      .trim()
      .toLowerCase(),
  );
}

/** 解析必须给出合法口径的时间范围；不认识的表达式不能静默退化为全量。 */
export function parseRequiredTimeRange(
  value,
  { label = '时间', allowAll = false, now, timeZone, storageTimeZone } = {},
) {
  const expression = String(value || '').trim();
  if (allowAll && isAllTimeExpression(expression)) return null;
  const time = parseTimeRange(expression, { now, timeZone, storageTimeZone });
  if (!time) throw new Error(`${label}范围无法识别`);
  return time;
}

const BOUND_AGENT_TIME_RANGES = Symbol('boundAgentTimeRanges');

function temporalContextOptions(context = {}) {
  const temporal = context.temporalContext || {};
  return {
    now: temporal.currentInstant || temporal.currentDateTime || context.now,
    timeZone: temporal.timeZone || context.timeZone,
    storageTimeZone: temporal.storageTimeZone || context.storageTimeZone,
  };
}

function temporalRangeError(label) {
  const error = new Error(`${label || '时间'}范围无法识别`);
  error.code = 'TOOL_TIME_RANGE_INVALID';
  error.status = 400;
  return error;
}

/**
 * 在 Tool Policy 通过公开 schema 校验后，给参数对象绑定只在服务端可见的权威范围。
 * V3 可直接传入 Binder 的 resolvedTemporalRanges；legacy 则在这里用同一个请求级
 * temporalContext 解析一次。Symbol 不会进入确认令牌、日志或模型上下文。
 */
export function bindAgentTemporalRanges({ tool, args, context = {} } = {}) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return args;
  const slots = Array.isArray(tool?.temporalSlots) ? tool.temporalSlots : [];
  if (!slots.length) return args;
  const authoritative = context.resolvedTemporalRanges || {};
  const bound = {};
  for (const slot of slots) {
    const name = String(slot?.name || '').trim();
    if (!name) continue;
    if (Object.hasOwn(authoritative, name)) {
      const record = authoritative[name];
      bound[name] = Object.freeze({
        expression: String(record?.expression ?? args[name] ?? '').trim(),
        range: record?.range ?? record?.resolved ?? null,
        source: 'binder',
      });
      continue;
    }
    const expression = String(args[name] || '').trim();
    if (!expression) continue;
    if (slot.allowAll === true && isAllTimeExpression(expression)) {
      bound[name] = Object.freeze({ expression, range: null, source: 'tool_policy' });
      continue;
    }
    const range = parseTimeRange(expression, temporalContextOptions(context));
    if (!range) throw temporalRangeError(slot.label || name);
    bound[name] = Object.freeze({ expression, range, source: 'tool_policy' });
  }
  Object.defineProperty(args, BOUND_AGENT_TIME_RANGES, {
    value: Object.freeze(bound),
    configurable: true,
    enumerable: false,
  });
  return args;
}

/**
 * 工具读取统一时间绑定。直接单测工具时没有经过 Tool Policy，因此保留同一解析器的
 * fallback；线上 V3/legacy 执行都优先消费已绑定范围，不会按进程时区重复计算。
 */
export function resolveAgentTimeRange(
  args,
  slotName,
  { context = {}, defaultExpression = '', required = false, allowAll = false, label = '时间' } = {},
) {
  const bound = args?.[BOUND_AGENT_TIME_RANGES]?.[slotName];
  if (bound) return bound.range;
  const authoritative = context?.resolvedTemporalRanges?.[slotName];
  if (authoritative && typeof authoritative === 'object') {
    return authoritative.range ?? authoritative.resolved ?? null;
  }
  const expression = String(args?.[slotName] || defaultExpression || '').trim();
  if (!expression) {
    if (required) throw temporalRangeError(label);
    return null;
  }
  if (allowAll && isAllTimeExpression(expression)) return null;
  const range = parseTimeRange(expression, temporalContextOptions(context));
  if (!range && required) throw temporalRangeError(label);
  if (!range && expression) throw temporalRangeError(label);
  return range;
}

/** 返回可进入结果契约的时间口径副本，不泄露 Symbol 或内部上下文。 */
export function projectAgentTemporalRanges(args) {
  const bound = args?.[BOUND_AGENT_TIME_RANGES] || {};
  return Object.freeze(
    Object.fromEntries(
      Object.entries(bound).map(([name, record]) => [
        name,
        Object.freeze({ expression: record.expression, range: record.range, source: record.source }),
      ]),
    ),
  );
}
