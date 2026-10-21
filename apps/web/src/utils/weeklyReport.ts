/**
 * 成长周报的纯数据规则：接口与通知快照的归一、称号判定和对比计算。
 * 组件只负责展示；旧版通知快照（滚动 7 天、无 period.kind）也在这里兼容。
 */

export type WeeklyReportPeriodKind = 'current' | 'last';
export type WeeklyReportTypeKey = 'bookmarks' | 'notes' | 'files' | 'todos' | 'organized';
export type WeeklyReportItemType = 'bookmark' | 'note' | 'file';

export const WEEKLY_REPORT_TYPES: readonly WeeklyReportTypeKey[] = [
  'bookmarks',
  'notes',
  'files',
  'todos',
  'organized',
];

export interface WeeklyReportDay {
  day: string;
  bookmarks?: number;
  notes?: number;
  files?: number;
  todos?: number;
  organized?: number;
  exp?: number;
  checkins?: number;
  total?: number;
  future?: boolean;
}

export interface WeeklyReportItem {
  type: WeeklyReportItemType;
  id: string;
  title: string;
  day: string | null;
}

export interface WeeklyReportData {
  bookmarks?: number;
  notes?: number;
  files?: number;
  todos?: number;
  organized?: number;
  exp?: number;
  checkinDays?: number;
  activeDays?: number;
  level?: number;
  levelName?: string;
  generatedAt?: string;
  period?: {
    kind?: WeeklyReportPeriodKind;
    start?: string;
    end?: string;
    dataEnd?: string;
    elapsedDays?: number;
    inProgress?: boolean;
    week?: number;
    weekYear?: number;
    compareStart?: string;
    compareEnd?: string;
  };
  days?: WeeklyReportDay[];
  prev?: Partial<Record<WeeklyReportTypeKey | 'exp', number>>;
  items?: WeeklyReportItem[];
}

export interface WeeklyReportChartDay {
  day: string;
  total: number;
  checkedIn: boolean;
  future: boolean;
  isToday: boolean;
}

export interface NormalizedWeeklyReport {
  kind: WeeklyReportPeriodKind | null;
  start: string | null;
  end: string | null;
  dataEnd: string | null;
  elapsedDays: number;
  inProgress: boolean;
  week: number;
  weekYear: number;
  compareStart: string | null;
  compareEnd: string | null;
  counts: Record<WeeklyReportTypeKey, number>;
  prev: Record<WeeklyReportTypeKey, number> | null;
  total: number;
  prevTotal: number;
  created: number;
  completed: number;
  exp: number;
  activeDays: number;
  checkinDays: number;
  days: WeeklyReportChartDay[];
  level: number;
  levelName: string;
  items: WeeklyReportItem[] | null;
  /** 没有记录、签到和经验：生成的周报卡没有可展示的内容。 */
  blank: boolean;
}

export type WeeklyReportMilestoneKey =
  | 'newWeek'
  | 'fullAttendance'
  | 'writer'
  | 'collector'
  | 'organizer'
  | 'doer'
  | 'curator'
  | 'momentum'
  | 'pause'
  | 'seed';

const DAY_MS = 86_400_000;

function safeNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function isIsoDay(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value);
}

function addDays(isoDay: string, amount: number) {
  return new Date(Date.parse(`${isoDay.slice(0, 10)}T00:00:00Z`) + amount * DAY_MS).toISOString().slice(0, 10);
}

/** 只用日期部分计算 ISO 周序号，避免本地时区把日期推到前一天。 */
export function isoWeekOf(isoDay: string) {
  const date = new Date(`${isoDay.slice(0, 10)}T00:00:00Z`);
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const weekYear = date.getUTCFullYear();
  const week = Math.ceil(((date.getTime() - Date.UTC(weekYear, 0, 1)) / DAY_MS + 1) / 7);
  return { week, weekYear };
}

function countsOf(source: Partial<Record<WeeklyReportTypeKey, unknown>> | undefined | null) {
  return Object.fromEntries(WEEKLY_REPORT_TYPES.map((key) => [key, Math.max(0, safeNumber(source?.[key]))])) as Record<
    WeeklyReportTypeKey,
    number
  >;
}

function sumCounts(counts: Record<WeeklyReportTypeKey, number>) {
  return WEEKLY_REPORT_TYPES.reduce((sum, key) => sum + counts[key], 0);
}

function dayTotal(day: WeeklyReportDay) {
  if (day.total != null) return Math.max(0, safeNumber(day.total));
  return sumCounts(countsOf(day));
}

export function normalizeWeeklyReport(raw: WeeklyReportData | null | undefined): NormalizedWeeklyReport | null {
  if (!raw || typeof raw !== 'object') return null;
  const period = raw.period || {};
  const kind = period.kind === 'current' || period.kind === 'last' ? period.kind : null;
  const counts = countsOf(raw);
  const prev = raw.prev ? countsOf(raw.prev) : null;
  const sourceDays = Array.isArray(raw.days) && raw.days.length === 7 ? raw.days : null;
  const start = isIsoDay(period.start)
    ? period.start.slice(0, 10)
    : sourceDays && isIsoDay(sourceDays[0]?.day)
      ? sourceDays[0].day.slice(0, 10)
      : isIsoDay(raw.generatedAt)
        ? addDays(raw.generatedAt, -6)
        : null;
  const inProgress = kind === 'current' && period.inProgress !== false;
  const elapsedDays = Math.min(7, Math.max(1, safeNumber(period.elapsedDays, 7)));
  const days: WeeklyReportChartDay[] = Array.from({ length: 7 }, (_, index) => {
    const source = sourceDays?.[index];
    const future = Boolean(source?.future) || (inProgress && index >= elapsedDays);
    const day = isIsoDay(source?.day) ? source.day.slice(0, 10) : start ? addDays(start, index) : '';
    return {
      day,
      total: source && !future ? dayTotal(source) : 0,
      checkedIn: Boolean(source && !future && safeNumber(source.checkins) > 0),
      future,
      isToday: inProgress && index === elapsedDays - 1,
    };
  });
  const total = sumCounts(counts);
  // 活跃天数只计有记录的天（与每周挑战「有效活跃」同口径）；旧快照同样按逐日数据重算。
  const activeDays = sourceDays ? days.filter((day) => day.total > 0).length : Math.min(7, safeNumber(raw.activeDays));
  const checkinDays = sourceDays
    ? days.filter((day) => day.checkedIn).length
    : Math.min(7, safeNumber(raw.checkinDays));
  const exp = Math.max(0, safeNumber(raw.exp));
  const weekInfo = start ? isoWeekOf(start) : null;
  return {
    kind,
    start,
    end: isIsoDay(period.end) ? period.end.slice(0, 10) : start ? addDays(start, 6) : null,
    dataEnd: isIsoDay(period.dataEnd) ? period.dataEnd.slice(0, 10) : isIsoDay(period.end) ? period.end : null,
    elapsedDays: inProgress ? elapsedDays : 7,
    inProgress,
    week: safeNumber(period.week, weekInfo?.week ?? 0),
    weekYear: safeNumber(period.weekYear, weekInfo?.weekYear ?? 0),
    compareStart: isIsoDay(period.compareStart) ? period.compareStart : null,
    compareEnd: isIsoDay(period.compareEnd) ? period.compareEnd : null,
    counts,
    prev,
    total,
    prevTotal: prev ? sumCounts(prev) : 0,
    created: counts.bookmarks + counts.notes + counts.files,
    completed: counts.todos + counts.organized,
    exp,
    activeDays,
    checkinDays,
    days,
    level: Math.max(1, safeNumber(raw.level, 1)),
    levelName: String(raw.levelName || ''),
    items: Array.isArray(raw.items) ? raw.items : null,
    blank: total === 0 && checkinDays === 0 && exp === 0,
  };
}

/** 本期称号：进行中且还没有记录时是「新的一周」，其余沿用按记录结构判定的规则。 */
export function weeklyReportMilestone(report: NormalizedWeeklyReport): WeeklyReportMilestoneKey {
  const { counts, total } = report;
  if (report.inProgress && total === 0) return 'newWeek';
  if (report.activeDays >= 7) return 'fullAttendance';
  if (counts.notes >= 10) return 'writer';
  if (counts.bookmarks >= 20) return 'collector';
  if (counts.files >= 10) return 'organizer';
  if (counts.todos >= 7) return 'doer';
  if (counts.organized >= 7) return 'curator';
  if (total >= 10) return 'momentum';
  if (total === 0) return 'pause';
  return 'seed';
}

export type WeeklyReportDirection = 'up' | 'down' | 'flat';

export function weeklyReportDirection(delta: number): WeeklyReportDirection {
  return delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
}

/** 周报卡配色随等级变化，与旧版保持同一档位。 */
export function weeklyReportTheme(level: number) {
  if (level >= 13) return 'coral';
  if (level >= 10) return 'gold';
  if (level >= 7) return 'violet';
  if (level >= 4) return 'ocean';
  return 'slate';
}
