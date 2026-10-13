export type FileCategory =
  'image' | 'video' | 'audio' | 'pdf' | 'word' | 'excel' | 'ppt' | 'text' | 'compress' | 'other';
export type FilePreviewType =
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'word'
  | 'excel'
  | 'csv'
  | 'ppt'
  | 'html'
  | 'text'
  | 'archive'
  | 'converted-pdf'
  | 'unsupported';
export interface FileCategoryInput {
  fileName?: string;
  fileType?: string;
  ext?: string;
  category?: string;
}
export interface FileCategoryRule {
  readonly category: FileCategory;
  readonly extensions?: readonly string[];
  readonly mimeTypes?: readonly string[];
  readonly mimePrefixes?: readonly string[];
}
export interface FileFormat extends FileCategoryRule {
  readonly id: string;
  readonly previewType: FilePreviewType;
  readonly playbackMime?: string;
}
export declare const FILE_CATEGORY_ORDER: readonly FileCategory[];
export declare const FILE_FORMATS: readonly FileFormat[];
export declare const FILE_CATEGORY_RULES: readonly FileCategoryRule[];
export declare function normalizeFileCategoryField(value?: unknown): string;
export declare function normalizeFileCategory(value?: unknown): FileCategory;
export declare function normalizeFileMimeType(value?: unknown): string;
export declare function getFileCategoryExtension(fileName?: unknown, explicitExtension?: unknown): string;
export declare function resolveFileCategory(file?: FileCategoryInput | null): FileCategory;
export declare function resolveFileFormat(file?: FileCategoryInput | null): FileFormat | null;
export declare function resolveFilePreviewType(file?: FileCategoryInput | null): FilePreviewType;
export declare function resolveFilePlaybackMimeType(file?: FileCategoryInput | null): string;
