import { FILE_PREVIEW_EXTRA_TEXT_EXTENSIONS, FILE_PREVIEW_STRATEGY, resolveFilePreviewFormat } from '@lightnote/shared';

export type CloudFileCategory =
  'image' | 'video' | 'audio' | 'pdf' | 'word' | 'excel' | 'ppt' | 'text' | 'compress' | 'other';

export type CloudPreviewType =
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'word'
  | 'excel'
  | 'ppt'
  | 'html'
  | 'text'
  | 'archive'
  | 'converted-pdf'
  | 'unsupported';

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
  audio: 'audio',
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
  'application/sql',
  'application/toml',
  'application/yaml',
  'application/x-yaml',
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
  'py',
  'java',
  'go',
  'rs',
  'c',
  'cc',
  'cpp',
  'cxx',
  'h',
  'hpp',
  'sql',
  'sh',
  'bash',
  'zsh',
  'fish',
  'vue',
  'svelte',
  'toml',
  'ini',
  'conf',
  'cfg',
  'properties',
  'gradle',
  'kt',
  'kts',
  'swift',
  'rb',
  'php',
  'pl',
  'r',
  'dart',
  'lua',
  ...FILE_PREVIEW_EXTRA_TEXT_EXTENSIONS,
]);

const MEDIA_EXTENSION_MIME_MAP: Record<'video' | 'audio', ReadonlyMap<string, string>> = {
  video: new Map([
    ['mp4', 'video/mp4'],
    ['m4v', 'video/mp4'],
    ['webm', 'video/webm'],
    ['mov', 'video/quicktime'],
    ['ogv', 'video/ogg'],
    ['avi', 'video/x-msvideo'],
    ['wmv', 'video/x-ms-wmv'],
    ['flv', 'video/x-flv'],
  ]),
  audio: new Map([
    ['mp3', 'audio/mpeg'],
    ['wav', 'audio/wav'],
    ['ogg', 'audio/ogg'],
    ['oga', 'audio/ogg'],
    ['opus', 'audio/ogg; codecs=opus'],
    ['flac', 'audio/flac'],
    ['aac', 'audio/aac'],
    ['m4a', 'audio/mp4'],
  ]),
};

const IMAGE_EXT_SET = new Set(['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'avif', 'ico']);
const VIDEO_EXT_SET: ReadonlySet<string> = new Set(MEDIA_EXTENSION_MIME_MAP.video.keys());
const AUDIO_EXT_SET: ReadonlySet<string> = new Set(MEDIA_EXTENSION_MIME_MAP.audio.keys());
const COMPRESS_EXT_SET = new Set(['zip', 'zipx', 'rar', '7z', 'tar', 'tgz', 'tbz', 'tbz2', 'txz', 'gz', 'bz2', 'xz']);

const HTML_EXT_SET = new Set(['html', 'htm']);

function normalizeMimeType(fileType?: string): string {
  return String(fileType || '')
    .trim()
    .toLowerCase()
    .split(';')[0];
}

function getFileExtension(fileName?: string, ext?: string): string {
  const explicit = String(ext || '')
    .trim()
    .toLowerCase();
  if (explicit) return explicit;
  const name = String(fileName || '').trim();
  const idx = name.lastIndexOf('.');
  if (idx <= 0 || idx === name.length - 1) return '';
  return name.slice(idx + 1).toLowerCase();
}

export function isLegacyOfficeFile(file?: { fileName?: string; fileType?: string; ext?: string }): boolean {
  return resolveFilePreviewFormat(file)?.strategy === FILE_PREVIEW_STRATEGY.CONVERTED_PDF;
}

export function isHtmlFile(file?: { fileName?: string; fileType?: string; ext?: string }): boolean {
  const extension = getFileExtension(file?.fileName, file?.ext);
  if (extension) return HTML_EXT_SET.has(extension);
  return normalizeMimeType(file?.fileType) === 'text/html';
}

function resolveCloudCategoryFallback(file?: {
  fileName?: string;
  fileType?: string;
  ext?: string;
}): CloudFileCategory {
  const mime = normalizeMimeType(file?.fileType);
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('text/') || TEXT_MIME_SET.has(mime)) return 'text';
  const extension = getFileExtension(file?.fileName, file?.ext);
  if (IMAGE_EXT_SET.has(extension)) return 'image';
  if (VIDEO_EXT_SET.has(extension)) return 'video';
  if (AUDIO_EXT_SET.has(extension)) return 'audio';
  if (extension === 'pdf') return 'pdf';
  if (extension === 'doc' || extension === 'docx') return 'word';
  if (extension === 'rtf' || extension === 'odt') return 'word';
  if (extension === 'xls' || extension === 'xlsx') return 'excel';
  if (extension === 'ods') return 'excel';
  if (extension === 'ppt' || extension === 'pptx') return 'ppt';
  if (extension === 'odp') return 'ppt';
  if (COMPRESS_EXT_SET.has(extension)) return 'compress';
  if (TEXT_EXT_SET.has(extension)) return 'text';
  return 'other';
}

export function normalizeCloudFileCategory(category?: string): CloudFileCategory {
  const normalized = String(category || '')
    .trim()
    .toLowerCase();
  return CLOUD_FILE_CATEGORY_ORDER.includes(normalized as CloudFileCategory)
    ? (normalized as CloudFileCategory)
    : 'other';
}

export function getCloudFileCategory(file?: {
  category?: string;
  fileName?: string;
  fileType?: string;
  ext?: string;
}): CloudFileCategory {
  const normalized = normalizeCloudFileCategory(file?.category);
  if (normalized !== 'other') return normalized;
  return resolveCloudCategoryFallback(file);
}

export function getCloudPreviewType(file?: {
  category?: string;
  fileName?: string;
  fileType?: string;
  ext?: string;
}): CloudPreviewType {
  const derivedFormat = resolveFilePreviewFormat(file);
  if (derivedFormat?.strategy === FILE_PREVIEW_STRATEGY.CONVERTED_PDF) return 'converted-pdf';
  if (derivedFormat?.strategy === FILE_PREVIEW_STRATEGY.ARCHIVE_MANIFEST) return 'archive';
  // HTML 必须进入独立沙箱，不能作为普通文本通过 v-html 注入轻笺页面。
  if (isHtmlFile(file)) return 'html';
  const category = getCloudFileCategory(file);
  return CLOUD_FILE_PREVIEW_TYPE_MAP[category];
}

export type CloudMediaPlaybackSupport = 'supported' | 'unsupported' | 'unknown';

export function getCloudMediaMimeType(file?: {
  category?: string;
  fileName?: string;
  fileType?: string;
  ext?: string;
}): string {
  const previewType = getCloudPreviewType(file);
  if (previewType !== 'video' && previewType !== 'audio') return '';

  const declaredMime = normalizeMimeType(file?.fileType);
  if (declaredMime.startsWith(`${previewType}/`)) return declaredMime;

  const extension = getFileExtension(file?.fileName, file?.ext);
  return MEDIA_EXTENSION_MIME_MAP[previewType].get(extension) || '';
}

export function getCloudMediaPlaybackSupport(
  file?: {
    category?: string;
    fileName?: string;
    fileType?: string;
    ext?: string;
  },
  canPlayType?: (mimeType: string) => CanPlayTypeResult,
): CloudMediaPlaybackSupport {
  const previewType = getCloudPreviewType(file);
  if (previewType !== 'video' && previewType !== 'audio') return 'unknown';

  const mimeType = getCloudMediaMimeType(file);
  if (!mimeType) return 'unknown';

  let check = canPlayType;
  if (!check && typeof document !== 'undefined') {
    const media = document.createElement(previewType);
    check = media.canPlayType.bind(media);
  }
  if (!check) return 'unknown';

  try {
    return check(mimeType) ? 'supported' : 'unsupported';
  } catch {
    return 'unknown';
  }
}
