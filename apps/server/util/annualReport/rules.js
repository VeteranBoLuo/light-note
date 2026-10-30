/**
 * 年度报告的纯规则：年度区间、批量识别、逐日/逐时聚合、章节门槛与称号。
 * 不访问数据库，便于用固定样例覆盖边界；SQL 取数与明细补读在 build.js。
 */
import { ANNUAL_REPORT_CHAPTERS, ANNUAL_REPORT_LIGHT_CHAPTERS } from '@lightnote/shared/annual-report';
import { DEFAULT_GROWTH_PREFERENCES, dayKeyAtOffset } from '../growthPreferences.js';
import { addUtcDays, compactDay, dayKeyToUtcDate, isoDay, serverLocalSql } from '../weeklyReport.js';

const DAY_MS = 86_400_000;

/** 同一账号同一类型在任一 10 分钟窗口内达到 30 条，视为批量导入或上传。 */
export const ANNUAL_BATCH_WINDOW_MS = 10 * 60_000;
export const ANNUAL_BATCH_THRESHOLD = 30;

/** 成长体系（签到、经验、积分、成就）在 2026-07-08 上线，此前没有流水。 */
export const GROWTH_SYSTEM_SINCE = '2026-07-08';

export const ANNUAL_THRESHOLDS = Object.freeze({
  lightActiveDays: 7,
  lightRecords: 10,
  notes: 3,
  bookmarks: 5,
  keywordTags: 3,
  keywordMinUses: 2,
  timeRecords: 30,
});

const TITLE_NOUN_ORDER = ['bookmark', 'note', 'file', 'todo', 'organize'];

/**
 * 账号时区下的年度统计区间。预览期统计到前一天；跨过次年 1 月 1 日后统计完整一年并定稿。
 * 边界换算成服务器本地时间后用于 SQL，与周报同一写法。
 */
export function getAnnualReportRange({ year, now = new Date(), calendar = null } = {}) {
  const utcOffsetMinutes = calendar?.utcOffsetMinutes ?? DEFAULT_GROWTH_PREFERENCES.utcOffsetMinutes;
  const shiftMinutes = Number(calendar?.shiftMinutes || 0);
  const today = dayKeyToUtcDate(dayKeyAtOffset(now, utcOffsetMinutes));
  const start = new Date(Date.UTC(year, 0, 1));
  const yearNext = new Date(Date.UTC(year + 1, 0, 1));
  const next = today.getTime() < yearNext.getTime() ? today : yearNext;
  const elapsedDays = Math.max(0, Math.round((next.getTime() - start.getTime()) / DAY_MS));
  return {
    year,
    phase: today.getTime() >= yearNext.getTime() ? 'final' : 'preview',
    start: isoDay(start),
    dataEnd: elapsedDays > 0 ? isoDay(addUtcDays(next, -1)) : null,
    elapsedDays,
    today: isoDay(today),
    shiftMinutes,
    utcOffsetMinutes,
    startKey: compactDay(start),
    endKey: elapsedDays > 0 ? compactDay(addUtcDays(next, -1)) : null,
    startSql: serverLocalSql(start, shiftMinutes),
    nextSql: serverLocalSql(next, shiftMinutes),
  };
}

/** 把 SQL 返回的账号本地时间（'YYYY-MM-DD HH:mm:ss'）解析为可按 UTC 读取日、时、星期的时间戳。 */
export function parseLocalTime(value) {
  const text = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(text)) return null;
  const time = Date.parse(`${text.slice(0, 19).replace(' ', 'T')}Z`);
  return Number.isFinite(time) ? time : null;
}

/**
 * 标记批量记录：同类型按时间排序后用双指针滑动窗口，窗口内达到阈值时整窗标记。
 * 返回新数组，不修改入参；时间缺失的记录直接丢弃。
 */
export function markBatchRecords(
  records = [],
  { windowMs = ANNUAL_BATCH_WINDOW_MS, threshold = ANNUAL_BATCH_THRESHOLD } = {},
) {
  const byType = new Map();
  for (const record of records) {
    if (!Number.isFinite(record?.time)) continue;
    const list = byType.get(record.type) || [];
    list.push({ ...record, batch: false });
    byType.set(record.type, list);
  }
  const result = [];
  for (const list of byType.values()) {
    list.sort((left, right) => left.time - right.time);
    let left = 0;
    let markedThrough = -1;
    for (let right = 0; right < list.length; right++) {
      while (list[right].time - list[left].time >= windowMs) left++;
      if (right - left + 1 >= threshold) {
        for (let index = Math.max(left, markedThrough + 1); index <= right; index++) list[index].batch = true;
        markedThrough = right;
      }
    }
    result.push(...list);
  }
  return result.sort((left, right) => left.time - right.time);
}

function emptyTypeCounts() {
  return { bookmark: 0, note: 0, file: 0, todo: 0, organize: 0 };
}

function dayKeyOf(time) {
  return new Date(time).toISOString().slice(0, 10);
}

/** 最长连续：输入升序去重的 'YYYY-MM-DD'，同长取更早的一段。 */
export function longestStreak(dayKeys = []) {
  let best = { days: 0, start: null, end: null };
  let runStart = null;
  let previous = null;
  let length = 0;
  for (const key of dayKeys) {
    const time = Date.parse(`${key}T00:00:00Z`);
    if (previous !== null && time - previous === DAY_MS) {
      length++;
    } else {
      runStart = key;
      length = 1;
    }
    if (length > best.days) best = { days: length, start: runStart, end: key };
    previous = time;
  }
  return best;
}

function pickMax(entries) {
  let best = null;
  for (const entry of entries) if (!best || entry.count > best.count) best = entry;
  return best && best.count > 0 ? best : null;
}

/**
 * 非批量记录的全年聚合。records 已带 batch 标记，time 为账号本地时间戳。
 * 活跃天只计非批量记录，与日历格子同口径，避免出现“活跃但 0 条”的格子。
 */
export function summarizeAnnualRecords(records = [], range) {
  const counted = records.filter((record) => !record.batch);
  const byType = emptyTypeCounts();
  const batchByType = emptyTypeCounts();
  const dayCounts = new Map();
  const months = Array(12).fill(0);
  const monthActive = Array(12).fill(0);
  const hours = Array(24).fill(0);
  let weekend = 0;
  for (const record of records) if (record.batch && record.type in batchByType) batchByType[record.type]++;
  for (const record of counted) {
    if (!(record.type in byType)) continue;
    byType[record.type]++;
    const date = new Date(record.time);
    const key = dayKeyOf(record.time);
    dayCounts.set(key, (dayCounts.get(key) || 0) + 1);
    months[date.getUTCMonth()]++;
    hours[date.getUTCHours()]++;
    const weekday = date.getUTCDay();
    if (weekday === 0 || weekday === 6) weekend++;
  }
  const activeKeys = [...dayCounts.keys()].sort();
  for (const key of activeKeys) monthActive[Number(key.slice(5, 7)) - 1]++;
  const total = Object.values(byType).reduce((sum, value) => sum + value, 0);
  const share = (value) => (total ? value / total : 0);
  const busiestDay = pickMax(activeKeys.map((date) => ({ date, count: dayCounts.get(date) })));
  const busiestMonthEntry = pickMax(months.map((count, index) => ({ month: index + 1, count })));
  const days = [];
  if (range?.elapsedDays) {
    const start = new Date(`${range.start}T00:00:00Z`);
    for (let index = 0; index < range.elapsedDays; index++)
      days.push(dayCounts.get(isoDay(addUtcDays(start, index))) || 0);
  }
  const peakHour = total ? hours.indexOf(Math.max(...hours)) : null;
  return {
    total,
    byType,
    batchExcluded: Object.values(batchByType).reduce((sum, value) => sum + value, 0),
    batchByType,
    activeDays: activeKeys.length,
    days,
    months,
    monthActive,
    longestStreak: longestStreak(activeKeys),
    busiestDay,
    busiestMonth: busiestMonthEntry ? { month: busiestMonthEntry.month, count: busiestMonthEntry.count } : null,
    hours,
    peakHour,
    nightShare: share(hours[21] + hours[22] + hours[23]),
    morningShare: share(hours[6] + hours[7] + hours[8]),
    weekendShare: share(weekend),
    first: counted[0] || null,
    last: counted.at(-1) || null,
  };
}

/** 少数据：活跃不足 7 天或记录不足 10 条；一条都没有时不生成报告。 */
export function classifyAnnualTier(summary) {
  if (!summary?.total) return 'empty';
  if (summary.activeDays < ANNUAL_THRESHOLDS.lightActiveDays || summary.total < ANNUAL_THRESHOLDS.lightRecords) {
    return 'light';
  }
  return 'full';
}

/** 数据不够的章节整页跳过，不出现“0 篇”的页。门槛只在这里定义。 */
export function selectAnnualChapters(tier, facts = {}) {
  if (tier === 'empty') return [];
  if (tier === 'light') return [...ANNUAL_REPORT_LIGHT_CHAPTERS];
  const keep = {
    cover: true,
    overview: true,
    rhythm: Number(facts.activeDays || 0) >= ANNUAL_THRESHOLDS.lightActiveDays,
    notes: Number(facts.notes || 0) >= ANNUAL_THRESHOLDS.notes,
    bookmarks: Number(facts.bookmarks || 0) >= ANNUAL_THRESHOLDS.bookmarks,
    keywords: Number(facts.keywordTags || 0) >= ANNUAL_THRESHOLDS.keywordTags,
    time: Number(facts.total || 0) >= ANNUAL_THRESHOLDS.timeRecords,
    action: Number(facts.todos || 0) > 0 || Number(facts.checkinDays || 0) > 0,
    poster: true,
  };
  return ANNUAL_REPORT_CHAPTERS.filter((key) => keep[key]);
}

/**
 * 年度称号：占比最高的记录类型决定名词，时间特征决定修饰；少数据账号固定为「启程者」。
 * basis 是修饰（或主类型）对应的比例/天数，供文案引用，保证称号和说明同源。
 */
export function resolveAnnualTitle(tier, summary) {
  if (tier !== 'full') return { key: 'starter', noun: null, modifier: null, basis: null };
  const noun = TITLE_NOUN_ORDER.reduce(
    (best, type) => (summary.byType[type] > summary.byType[best] ? type : best),
    TITLE_NOUN_ORDER[0],
  );
  const percent = (value) => Math.round(value * 100);
  if (summary.nightShare >= 0.35)
    return { key: 'combined', noun, modifier: 'night', basis: percent(summary.nightShare) };
  if (summary.morningShare >= 0.25) {
    return { key: 'combined', noun, modifier: 'morning', basis: percent(summary.morningShare) };
  }
  if (summary.weekendShare >= 0.45) {
    return { key: 'combined', noun, modifier: 'weekend', basis: percent(summary.weekendShare) };
  }
  if (summary.longestStreak.days >= 14) {
    return { key: 'combined', noun, modifier: 'steady', basis: summary.longestStreak.days };
  }
  return { key: 'combined', noun, modifier: null, basis: percent(summary.byType[noun] / summary.total) };
}

/** 24 小时按段汇总，返回占比最高的时段，时间页标题用它。 */
const TIME_SEGMENTS = [
  ['lateNight', 0, 6],
  ['morning', 6, 9],
  ['forenoon', 9, 12],
  ['afternoon', 12, 18],
  ['evening', 18, 21],
  ['night', 21, 24],
];
export function peakTimeSegment(hours = []) {
  const total = hours.reduce((sum, value) => sum + value, 0);
  if (!total) return null;
  let best = null;
  for (const [key, from, to] of TIME_SEGMENTS) {
    const count = hours.slice(from, to).reduce((sum, value) => sum + value, 0);
    if (!best || count > best.count) best = { key, from, to, count };
  }
  return { key: best.key, from: best.from, to: best.to, share: Math.round((best.count / total) * 100) };
}

/**
 * 少数据海报的每周记录：今年加入且不超过 12 周时从加入那周起算，否则取最近 12 周。
 * 周一为一周开始，与周报一致。
 */
export function weeklyBuckets(records = [], range, joinedDay = null) {
  if (!range?.dataEnd) return { from: 'recent', weeks: [] };
  const end = new Date(`${range.dataEnd}T00:00:00Z`);
  const mondayOf = (date) => addUtcDays(date, 1 - (date.getUTCDay() || 7));
  const endMonday = mondayOf(end);
  const joined = joinedDay && joinedDay >= range.start ? new Date(`${joinedDay}T00:00:00Z`) : null;
  const joinMonday = joined ? mondayOf(joined) : null;
  const sinceJoinWeeks = joinMonday ? Math.round((endMonday - joinMonday) / (7 * DAY_MS)) + 1 : Infinity;
  const from = sinceJoinWeeks <= 12 ? 'join' : 'recent';
  const count = from === 'join' ? sinceJoinWeeks : 12;
  const firstMonday = addUtcDays(endMonday, -(count - 1) * 7);
  const weeks = Array(count).fill(0);
  for (const record of records) {
    if (record.batch) continue;
    const index = Math.floor((record.time - firstMonday.getTime()) / (7 * DAY_MS));
    if (index >= 0 && index < count) weeks[index]++;
  }
  return { from, weeks };
}

/** 书签网址的主机名，去掉 www.；无法解析的网址不计入网站排行。 */
export function bookmarkDomain(url) {
  try {
    const host = new URL(String(url || '').trim()).hostname.toLowerCase();
    return host.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

/** 最长连签：签到日 'YYYYMMDD' 集合转成 ISO 日期后复用连续天计算。 */
export function longestCheckinStreak(dayKeys = []) {
  const keys = [...new Set(dayKeys.map((key) => String(key)))]
    .filter((key) => /^\d{8}$/.test(key))
    .map((key) => `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}`)
    .sort();
  return longestStreak(keys).days;
}
