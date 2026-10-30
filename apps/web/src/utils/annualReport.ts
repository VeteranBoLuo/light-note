import type {
  AnnualReportChapter,
  AnnualReportRecordType,
  AnnualReportTitleModifier,
} from '@lightnote/shared/annual-report';
import icon from '@/config/icon';

/** 服务端 GET /growth/annual-report 的响应；明细字段只在本人请求中出现。 */
export interface AnnualResourceItem {
  type: 'bookmark' | 'note' | 'file';
  id: string;
  title: string;
  date: string | null;
}

export interface AnnualReport {
  year: number;
  available: boolean;
  /** 不可用原因：游客需要登录；正式账号未到开放时间。 */
  reason?: 'login' | 'upcoming';
  openFrom?: string;
  phase?: 'preview' | 'final';
  start?: string;
  dataEnd?: string | null;
  timezone?: string;
  tier?: 'full' | 'light' | 'empty';
  chapters?: AnnualReportChapter[];
  batchExcluded?: number;
  profile?: { joinedDay: string | null; joinDays: number | null; level: number; levelName: string | null };
  title?: {
    key: 'combined' | 'starter';
    noun: AnnualReportRecordType | null;
    modifier: AnnualReportTitleModifier | null;
    basis: number | null;
  };
  overview?: {
    total: number;
    byType: Record<AnnualReportRecordType, number>;
    resources: number;
    batchExcluded: number;
    first: AnnualResourceItem | null;
    last: AnnualResourceItem | null;
  };
  rhythm?: {
    activeDays: number;
    days: number[];
    months: number[];
    monthActive: number[];
    longestStreak: { days: number; start: string | null; end: string | null };
    busiestDay: { date: string; count: number } | null;
    busiestMonth: { month: number; count: number } | null;
  };
  notes?: {
    count: number;
    chars: number;
    avgChars: number;
    perMonth: number[];
    mostRevised: { id: string; title: string; versions: number } | null;
    longest: { id: string; title: string; chars: number } | null;
    highlights: { id: string; title: string; versions: number | null; chars: number | null }[];
  } | null;
  bookmarks?: {
    count: number;
    domains: { domain: string; count: number }[];
    busiestDay: { date: string; count: number } | null;
  } | null;
  keywords?: {
    top: { id: string; name: string; count: number }[];
    newTags: { id: string; name: string; count: number; month: number | null }[];
  } | null;
  time?: {
    hours: number[];
    peakHour: number | null;
    peakSegment: { key: string; from: number; to: number; share: number } | null;
    weekdayShare: number;
  } | null;
  action?: {
    todos: number;
    organized: number;
    checkinDays: number;
    longestCheckinStreak: number;
    achievements: number;
    points: number;
    exp: number;
    startLevel: number;
    level: number;
    since: string;
  };
  light?: { items: AnnualResourceItem[]; from: 'join' | 'recent'; weeks: number[] } | null;
}

export const ANNUAL_RECORD_TYPES: AnnualReportRecordType[] = ['bookmark', 'note', 'file', 'todo', 'organize'];

/** 故事卡固定深色画布内的类型色，与周报海报一致，不随主题变化。 */
export const ANNUAL_TYPE_META: Record<AnnualReportRecordType, { icon: string; story: string; dot: string }> = {
  bookmark: { icon: icon.resource.bookmark, story: '#a5a0ff', dot: '#8b7cff' },
  note: { icon: icon.resource.note, story: '#2dd4aa', dot: '#2dd4aa' },
  file: { icon: icon.resource.file, story: '#ffb45c', dot: '#ffa53a' },
  todo: { icon: icon.todoWorkspace.checkSquare, story: '#5ccdfa', dot: '#38bdf8' },
  organize: { icon: icon.growth.organize, story: '#cbd5e1', dot: '#cbd5e1' },
};

export const ANNUAL_CHAPTER_ICONS: Record<AnnualReportChapter, string> = {
  cover: icon.todoWorkspace.star,
  overview: icon.growth.create,
  rhythm: icon.todoWorkspace.calendar,
  notes: icon.resource.note,
  bookmarks: icon.resource.bookmark,
  keywords: icon.resource.tag,
  time: icon.todoWorkspace.clock,
  action: icon.todoWorkspace.checkSquare,
  poster: icon.growth.crown,
};

/** 有明细列表的章节；其余章节在明细位置显示口径说明。 */
export function annualChapterHasDetails(report: AnnualReport, chapter: AnnualReportChapter) {
  if (chapter === 'overview') return Boolean(report.overview?.first || report.light?.items.length);
  if (chapter === 'notes') return Boolean(report.notes?.highlights.length);
  if (chapter === 'bookmarks') return Boolean(report.bookmarks?.domains.length);
  if (chapter === 'keywords') return Boolean(report.keywords?.top.length);
  return false;
}

export function formatAnnualDate(value: string | null | undefined, locale: string) {
  if (!value) return '';
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    Date.parse(`${value}T00:00:00Z`),
  );
}

export type AnnualReportStateKind = 'loading' | 'failed' | 'empty' | 'upcoming' | 'login';

/** 报告无法展示时显示哪种状态；桌面与手机共用。 */
export function annualReportStateKind(
  state: 'loading' | 'ready' | 'failed',
  report: AnnualReport | null | undefined,
): AnnualReportStateKind {
  if (state === 'loading') return 'loading';
  if (state === 'failed') return 'failed';
  if (report?.available) return 'empty';
  return report?.reason === 'login' ? 'login' : 'upcoming';
}

/** 带年份的日期：加入日可能早于报告年份，需要写全。 */
export function formatAnnualFullDate(value: string | null | undefined, locale: string) {
  if (!value) return '';
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    Date.parse(`${value}T00:00:00Z`),
  );
}

export function formatAnnualNumber(value: number | null | undefined, locale: string) {
  return new Intl.NumberFormat(locale).format(Number(value || 0));
}

/** 大数字用紧凑写法：18.6万 / 186K。 */
export function formatAnnualCompact(value: number | null | undefined, locale: string) {
  const number = Number(value || 0);
  if (number < 10_000) return formatAnnualNumber(number, locale);
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(number);
}

export function annualDayIndex(report: AnnualReport, date: string) {
  if (!report.start) return -1;
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${report.start}T00:00:00Z`)) / 86_400_000);
}

/** 年历格子的等级：0 = 无记录，1–4 按当天记录数分档。 */
export function annualDayLevel(count: number) {
  if (!count) return 0;
  if (count >= 15) return 4;
  if (count >= 5) return 3;
  if (count >= 3) return 2;
  return 1;
}

export function annualPosterOwnerKey(user: {
  id?: string;
  adminContext?: { id?: string; subjectUserId?: string; mode?: string } | null;
}) {
  return JSON.stringify([user.id, user.adminContext?.id, user.adminContext?.subjectUserId, user.adminContext?.mode]);
}
