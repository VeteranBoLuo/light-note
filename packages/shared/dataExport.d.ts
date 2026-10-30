export type DataExportType = "notes" | "bookmarks" | "files" | "extractions";
export type DataExportStatus =
  | "queued"
  | "running"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled"
  | "expired";
export interface DataExportOptions {
  types: DataExportType[];
  noteFormat: "original" | "html" | "markdown";
  includeImages: boolean;
}
export interface DataExportRequest extends DataExportOptions {
  requestId: string;
}
export interface DataExportTask {
  id: string;
  status: DataExportStatus;
  options: DataExportOptions;
  total: number;
  completed: number;
  failed: number;
  stage: string;
  expiresAt: string;
  canDownload: boolean;
  errorCode?: string;
  /** 可下载时的压缩包字节数；读取失败时缺省。 */
  archiveBytes?: number;
}
export interface DataExportFailure {
  title: string;
  code: string;
}
export const DATA_EXPORT_TYPES: readonly DataExportType[];
export const DATA_EXPORT_ACTIVE: readonly string[];
export const DATA_EXPORT_DEFAULTS: DataExportOptions;
export const DATA_EXPORT_FULL_BACKUP: Readonly<DataExportOptions>;
export function isFullDataBackup(types: unknown): boolean;
/** 资料清单与上次成功备份，供「数据与备份」页使用。 */
export interface DataBackupSummary {
  notes: number;
  bookmarks: number;
  files: number;
  fileBytes: number;
  lastBackup: {
    at: string;
    total: number;
    types: DataExportType[];
    status: "completed" | "partial";
    count: number;
  } | null;
}
export function normalizeDataExportOptions(input: unknown): DataExportOptions;
export function safeExportName(value: unknown, fallback?: string): string;
export function uniqueExportName(
  value: unknown,
  used: Set<string>,
  extension?: string,
): string;
export function splitExportText(value: unknown, limit?: number): string[];

export function resolveDataExportNoteFormat(type: string, format: DataExportOptions["noteFormat"]): "html" | "markdown" | "json";
