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
  errorCode: string | null;
  noteId: string | null;
  selected: boolean;
  imageCount: number;
}
export interface NoteImportTask {
  id: string;
  status: string;
  parentId: string | null;
  errorCode: string | null;
  createTime: string;
  items: NoteImportItem[];
}
