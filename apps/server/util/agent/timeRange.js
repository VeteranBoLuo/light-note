/**
 * 时间表达式解析
 *
 * 将中文时间表达转为精确的起止时间字符串（格式：YYYY-MM-DD HH:MM:SS）。
 * 不涉及时区转换，所有时间以服务器本地时间为准。
 *
 * 设计原则（参考 ai-assistant time-range.ts）：
 * - AI 做语义决策输出表达式字符串 → 后端精确计算时间戳
 * - 支持的表达式见 parseTimeRange 注释
 */

/**
 * 补零
 * @param {number} n
 * @returns {string}
 */
function pad(n) {
  return String(n).padStart(2, '0');
}

/**
 * 日期 → "YYYY-MM-DD HH:MM:SS"
 * @param {Date} d
 * @returns {string}
 */
function fmt(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * 日期 → "YYYY-MM-DD 00:00:00"
 * @param {Date} d
 * @returns {string}
 */
function dayStart(d) {
  d.setHours(0, 0, 0, 0);
  return fmt(d);
}

/**
 * 日期 → "YYYY-MM-DD 23:59:59"
 * @param {Date} d
 * @returns {string}
 */
function dayEnd(d) {
  d.setHours(23, 59, 59, 999);
  return fmt(d);
}

/**
 * 获取某月最后一天
 * @param {number} year
 * @param {number} month - 1-12
 * @returns {Date}
 */
function lastDayOfMonth(year, month) {
  return new Date(year, month, 0); // 下个月第 0 天 = 本月最后一天
}

// ---- 解析入口 ----

/**
 * 解析时间表达式，返回 { start, end } 或 null（表示"全部"，不加时间过滤）。
 *
 * 支持的表达式：
 *   "最近N天" / "近N天"  →  N 天前 00:00 → 现在
 *   "最近N小时" / "近N小时" → 精确向前滚动 N 小时 → 现在
 *   "最近N周" / "近N周"  →  N 周前周一 00:00 → 现在
 *   "最近N个月" / "近N个月" → N 个月前 1 日 00:00 → 现在
 *   "今天" / "今日"     →  今天 00:00 → 现在
 *   "昨天" / "昨日"     →  昨天 00:00 → 昨天 23:59
 *   "前天"             →  前天 00:00 → 前天 23:59
 *   "本周" / "这周"    →  本周一 00:00 → 现在
 *   "上周"             →  上周一 00:00 → 上周日 23:59
 *   "本月" / "这个月"  →  本月 1 日 00:00 → 现在
 *   "上个月" / "上月"  →  上月 1 日 00:00 → 上月最后一天 23:59
 *   "今年" / "本年"    →  1 月 1 日 00:00 → 现在
 *   "去年"             →  去年 1 月 1 日 00:00 → 去年 12 月 31 日 23:59
 *   "全部" / "all" / "" / null / undefined → null
 *   "YYYY年"           →  该年 1 月 1 日 → 该年 12 月 31 日（如 "2025年"）
 *   "N月" / "N月份"    →  该月 1 日 → 该月最后一天（如 "5月"）
 *
 * @param {string|null|undefined} expr
 * @param {{ now?: Date|string|number }} options 测试或调用方可注入基准时间
 * @returns {{ start: string, end: string } | null}
 */
export function parseTimeRange(expr, { now: nowInput = new Date() } = {}) {
  if (!expr || typeof expr !== 'string') return null;

  const s = expr.trim();
  if (!s || s === '全部' || s.toLowerCase() === 'all') return null;

  const now = new Date(nowInput);
  if (!Number.isFinite(now.getTime())) return null;

  // ---- 最近 N 小时（滚动窗口，不按自然日取整） ----
  let m = s.match(/^(?:最近|近)\s*(\d+)\s*个?\s*小时$/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n <= 0) return null;
    const start = new Date(now.getTime() - n * 60 * 60 * 1000);
    return { start: fmt(start), end: fmt(now) };
  }

  // ---- 最近 N 天 ----
  m = s.match(/^(?:最近|近)\s*(\d+)\s*天$/);
  if (m) {
    const n = parseInt(m[1], 10);
    const start = new Date(now);
    start.setDate(start.getDate() - n);
    return { start: dayStart(start), end: fmt(now) };
  }

  // ---- 最近 N 周 ----
  m = s.match(/^(?:最近|近)\s*(\d+)\s*周$/);
  if (m) {
    const n = parseInt(m[1], 10);
    const start = new Date(now);
    start.setDate(start.getDate() - n * 7);
    // 取到该周周一
    const dayOfWeek = start.getDay(); // 0=周日
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    start.setDate(start.getDate() - diffToMonday);
    return { start: dayStart(start), end: fmt(now) };
  }

  // ---- 最近 N 个月 ----
  m = s.match(/^(?:最近|近)\s*(\d+)\s*个?\s*月$/);
  if (m) {
    const n = parseInt(m[1], 10);
    const start = new Date(now);
    start.setMonth(start.getMonth() - n);
    start.setDate(1);
    return { start: dayStart(start), end: fmt(now) };
  }

  // ---- 今天 / 今日 ----
  if (s === '今天' || s === '今日') {
    const today = new Date(now);
    return { start: dayStart(today), end: fmt(now) };
  }

  // ---- 昨天 ----
  if (s === '昨天' || s === '昨日') {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    const d2 = new Date(d);
    return { start: dayStart(d), end: dayEnd(d2) };
  }

  // ---- 前天 ----
  if (s === '前天') {
    const d = new Date(now);
    d.setDate(d.getDate() - 2);
    const d2 = new Date(d);
    return { start: dayStart(d), end: dayEnd(d2) };
  }

  // ---- 本周 ----
  if (s === '本周' || s === '这周') {
    const d = new Date(now);
    const dayOfWeek = d.getDay(); // 0=周日
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    d.setDate(d.getDate() - diffToMonday);
    return { start: dayStart(d), end: fmt(now) };
  }

  // ---- 上周 ----
  if (s === '上周') {
    const end = new Date(now);
    const dayOfWeek = end.getDay();
    const diffToLastSunday = dayOfWeek === 0 ? 0 : dayOfWeek;
    end.setDate(end.getDate() - diffToLastSunday); // 上周日

    const start = new Date(end);
    start.setDate(start.getDate() - 6); // 上周一
    return { start: dayStart(start), end: dayEnd(end) };
  }

  // ---- 本月 ----
  if (s === '本月' || s === '这个月') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: dayStart(start), end: fmt(now) };
  }

  // ---- 上个月 ----
  if (s === '上个月' || s === '上月') {
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-11
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const start = new Date(prevYear, prevMonth, 1);
    const end = lastDayOfMonth(prevYear, prevMonth + 1);
    return { start: dayStart(start), end: dayEnd(end) };
  }

  // ---- 今年 ----
  if (s === '今年' || s === '本年') {
    const start = new Date(now.getFullYear(), 0, 1);
    return { start: dayStart(start), end: fmt(now) };
  }

  // ---- 去年 ----
  if (s === '去年') {
    const y = now.getFullYear() - 1;
    const start = new Date(y, 0, 1);
    const end = new Date(y, 11, 31);
    return { start: dayStart(start), end: dayEnd(end) };
  }

  // ---- YYYY年 ----
  m = s.match(/^(\d{4})\s*年$/);
  if (m) {
    const y = parseInt(m[1], 10);
    const start = new Date(y, 0, 1);
    const end = new Date(y, 11, 31);
    return { start: dayStart(start), end: dayEnd(end) };
  }

  // ---- N月 / N月份 ----
  m = s.match(/^(\d{1,2})\s*月(?:份)?$/);
  if (m) {
    const month = parseInt(m[1], 10);
    if (month < 1 || month > 12) return null;
    const y = now.getFullYear();
    const start = new Date(y, month - 1, 1);
    const end = lastDayOfMonth(y, month);
    return { start: dayStart(start), end: dayEnd(end) };
  }

  // 不认识的表达式 → 返回 null，视为"全部"
  return null;
}

function shortDateTime(value, { withTime = false } = {}) {
  const text = String(value || '');
  return withTime ? text.slice(0, 16) : text.slice(0, 10);
}

/**
 * 将后端已经解析完成的时间范围转换成用户可核验的口径说明。
 * 这里只展示解析结果，不重新计算范围，避免界面文案与真实 SQL 边界漂移。
 */
export function describeResolvedTimeRange(expr, range, locale = 'zh-CN') {
  if (!range?.start || !range?.end) return '';
  const expression = String(expr || '').trim();
  const english = String(locale || '')
    .toLowerCase()
    .startsWith('en');
  const startDate = shortDateTime(range.start);
  const endDate = shortDateTime(range.end);
  const endTime = String(range.end).slice(11, 16);

  if (expression === '今天' || expression === '今日') {
    return english ? `today (${startDate}, through ${endTime})` : `今天（${startDate}，截至 ${endTime}）`;
  }
  if (expression === '昨天' || expression === '昨日') {
    return english ? `yesterday (${startDate})` : `昨天（${startDate}）`;
  }
  if (/^(?:最近|近)\s*24\s*个?\s*小时$/u.test(expression)) {
    const window = `${shortDateTime(range.start, { withTime: true })} 至 ${shortDateTime(range.end, { withTime: true })}`;
    return english
      ? `the last 24 hours (${shortDateTime(range.start, { withTime: true })} to ${shortDateTime(range.end, { withTime: true })})`
      : `最近24小时（${window}）`;
  }
  if (startDate === endDate) {
    return english
      ? `${expression || 'the requested range'} (${startDate})`
      : `${expression || '所选范围'}（${startDate}）`;
  }
  return english
    ? `${expression || 'the requested range'} (${startDate} to ${endDate})`
    : `${expression || '所选范围'}（${startDate} 至 ${endDate}）`;
}

/**
 * 明确表示「不限时间」的说法。
 *
 * parseTimeRange 对「全部」和「压根看不懂的表达式」都返回 null，平台级统计不能容忍这种混同：
 * 前者是全量口径，后者必须让本轮失败并追问，否则会把无法识别的时间条件悄悄当成全量返回。
 */
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

/**
 * 解析「必须给出口径」的时间范围：识别不了就抛错，不静默降级成全量。
 *
 * 供跨用户的平台级统计/清单工具共用，让它们的时间口径始终一致——口径一旦漂移，
 * 同一个问题的计数和明细会互相矛盾。
 *
 * @param {string} value
 * @param {{ label?: string, allowAll?: boolean }} options allowAll=true 时「全部」返回 null（不加时间过滤）
 * @returns {{ start: string, end: string } | null}
 */
export function parseRequiredTimeRange(value, { label = '时间', allowAll = false } = {}) {
  const expression = String(value || '').trim();
  if (allowAll && isAllTimeExpression(expression)) return null;
  const time = parseTimeRange(expression);
  if (!time) throw new Error(`${label}范围无法识别`);
  return time;
}
