export type DataExportType = "notes" | "bookmarks" | "files";
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
}
export interface DataExportFailure {
  title: string;
  code: string;
}
export const DATA_EXPORT_TYPES: readonly DataExportType[];
export const DATA_EXPORT_ACTIVE: readonly string[];
export const DATA_EXPORT_DEFAULTS: DataExportOptions;
export function normalizeDataExportOptions(input: unknown): DataExportOptions;
export function safeExportName(value: unknown, fallback?: string): string;
export function uniqueExportName(
  value: unknown,
  used: Set<string>,
  extension?: string,
): string;
export function splitExportText(value: unknown, limit?: number): string[];

export function resolveDataExportNoteFormat(type: string, format: DataExportOptions["noteFormat"]): "html" | "markdown" | "json";
