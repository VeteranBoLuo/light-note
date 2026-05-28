export type CloudFileCategory =
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'word'
  | 'excel'
  | 'ppt'
  | 'text'
  | 'compress'
  | 'other';

export type CloudPreviewType = 'image' | 'video' | 'pdf' | 'word' | 'excel' | 'ppt' | 'text' | 'unsupported';

export const CLOUD_FILE_CATEGORY_ORDER: CloudFileCategory[] = [
  'image',
  'video',
  'audio',
  'pdf',
  'word',
  'excel',
  'ppt',
  'text',
  'compress',
  'other',
];

export const CLOUD_FILE_CATEGORY_LABEL_KEY: Record<CloudFileCategory, string> = {
  image: 'cloudSpace.image',
  video: 'cloudSpace.video',
  audio: 'cloudSpace.audio',
  pdf: 'cloudSpace.pdf',
  word: 'cloudSpace.word',
  excel: 'cloudSpace.excel',
  ppt: 'cloudSpace.ppt',
  text: 'cloudSpace.text',
  compress: 'cloudSpace.compress',
  other: 'cloudSpace.other',
};

export const CLOUD_FILE_PREVIEW_TYPE_MAP: Record<CloudFileCategory, CloudPreviewType> = {
  image: 'image',
  video: 'video',
  audio: 'unsupported',
  pdf: 'pdf',
  word: 'word',
  excel: 'excel',
  ppt: 'ppt',
  text: 'text',
  compress: 'unsupported',
  other: 'unsupported',
};

const TEXT_MIME_SET = new Set([
  'application/json',
  'application/javascript',
  'application/xml',
  'application/x-sh',
  'application/x-bat',
  'text/markdown',
]);

const TEXT_EXT_SET = new Set([
  'txt',
  'md',
  'markdown',
  'json',
  'js',
  'ts',
  'jsx',
  'tsx',
  'css',
  'html',
  'htm',
  'xml',
  'csv',
  'log',
  'yml',
  'yaml',
]);

function normalizeMimeType(fileType?: string): string {
  return String(fileType || '')
    .trim()
    .toLowerCase()
    .split(';')[0];
}

function getFileExtension(fileName?: string, ext?: string): string {
  const explicit = String(ext || '').trim().toLowerCase();
  if (explicit) return explicit;
  const name = String(fileName || '').trim();
  const idx = name.lastIndexOf('.');
  if (idx <= 0 || idx === name.length - 1) return '';
  return name.slice(idx + 1).toLowerCase();
}

function resolveCloudCategoryFallback(file?: { fileName?: string; fileType?: string; ext?: string }): CloudFileCategory {
  const mime = normalizeMimeType(file?.fileType);
  if (mime.startsWith('text/') || TEXT_MIME_SET.has(mime)) return 'text';
  const extension = getFileExtension(file?.fileName, file?.ext);
  if (TEXT_EXT_SET.has(extension)) return 'text';
  return 'other';
}

export function normalizeCloudFileCategory(category?: string): CloudFileCategory {
  const normalized = String(category || '').trim().toLowerCase();
  return CLOUD_FILE_CATEGORY_ORDER.includes(normalized as CloudFileCategory)
    ? (normalized as CloudFileCategory)
    : 'other';
}

export function getCloudFileCategory(file?: { category?: string; fileName?: string; fileType?: string; ext?: string }): CloudFileCategory {
  const normalized = normalizeCloudFileCategory(file?.category);
  if (normalized !== 'other') return normalized;
  return resolveCloudCategoryFallback(file);
}

export function getCloudPreviewType(file?: { category?: string; fileName?: string; fileType?: string; ext?: string }): CloudPreviewType {
  const category = getCloudFileCategory(file);
  return CLOUD_FILE_PREVIEW_TYPE_MAP[category];
}
