export const NOTE_IMPORT_LIMITS: Readonly<{
  documents: number;
  uploadBytes: number;
  expandedBytes: number;
  entries: number;
  contentLength: number;
}>;
export const NOTE_IMPORT_EXTENSIONS: readonly string[];
export const NOTE_IMPORT_STATES: readonly string[];
export const NOTE_IMPORT_WARNINGS: readonly string[];
export interface NoteImportItem {
  id: string;
  title: string;
  sourceName: string;
  type: string;
  status: string;
  warnings: string[];
  warningDetails?: NoteImportWarningDetail[] | null;
  errorCode: string | null;
  noteId: string | null;
  selected: boolean;
  imageCount: number;
}
export interface NoteImportTask {
  id: string;
  status: string;
  uploadBytes?: number;
  progress?: NoteImportProgress | null;
  finishedAt?: string | null;
  parentId: string | null;
  errorCode: string | null;
  createTime: string;
  items: NoteImportItem[];
}

export interface NoteImportProgress {
  stage: 'reading' | 'extracting_images' | 'sanitizing' | 'parsed' | 'publishing_images' | 'writing_note';
  currentFile?: string;
  currentItemId?: string;
  filesDone: number;
  filesTotal: number | null;
  imagesDone: number;
  imagesTotal: number | null;
  updatedAt: string;
}
export interface NoteImportWarningDetail { code: string; count: number; sources: string[]; }
