export type AnnualReportChapter =
  | 'cover'
  | 'overview'
  | 'rhythm'
  | 'notes'
  | 'bookmarks'
  | 'keywords'
  | 'time'
  | 'action'
  | 'poster';
export type AnnualReportRecordType = 'bookmark' | 'note' | 'file' | 'todo' | 'organize';
export type AnnualReportTitleModifier = 'night' | 'morning' | 'weekend' | 'steady';

export interface AnnualReportDefinition {
  readonly year: number;
  readonly announcementId: string;
  readonly achievementKey: string;
  readonly openFrom: string;
  readonly entryUntil: string;
  readonly noticeFrom: string;
  readonly noticeUntil: string;
}

export declare const ANNUAL_REPORT_CHAPTERS: readonly AnnualReportChapter[];
export declare const ANNUAL_REPORT_LIGHT_CHAPTERS: readonly AnnualReportChapter[];
export declare const ANNUAL_REPORT_RECORD_TYPES: readonly AnnualReportRecordType[];
export declare const ANNUAL_REPORT_TITLE_MODIFIERS: readonly AnnualReportTitleModifier[];
export declare const ANNUAL_REPORTS: Readonly<Record<number, AnnualReportDefinition>>;
export declare function getAnnualReportDefinition(year: unknown): AnnualReportDefinition | null;
export declare function isAnnualReportOpen(
  definition: AnnualReportDefinition | null | undefined,
  now?: number | Date,
): boolean;
export declare function isAnnualReportEntryWindow(
  definition: AnnualReportDefinition | null | undefined,
  now?: number | Date,
): boolean;
export declare function isAnnualReportNoticeWindow(
  definition: AnnualReportDefinition | null | undefined,
  now?: number | Date,
): boolean;
