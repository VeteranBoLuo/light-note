import path from 'path';

export const FILE_CATEGORY_ORDER = [
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

const EXACT_MIME_CATEGORY_MAP = new Map([
  ['application/pdf', 'pdf'],
  ['application/msword', 'word'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'word'],
  ['application/vnd.ms-word', 'word'],
  ['application/vnd.ms-excel', 'excel'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'excel'],
  ['application/vnd.ms-powerpoint', 'ppt'],
  ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'ppt'],
  ['application/zip', 'compress'],
  ['application/x-zip-compressed', 'compress'],
  ['application/x-rar-compressed', 'compress'],
  ['application/vnd.rar', 'compress'],
  ['application/x-7z-compressed', 'compress'],
  ['application/x-tar', 'compress'],
  ['application/gzip', 'compress'],
  ['application/x-gzip', 'compress'],
  ['application/x-bzip2', 'compress'],
  ['application/x-xz', 'compress'],
  ['application/json', 'text'],
  ['application/javascript', 'text'],
  ['application/xml', 'text'],
  ['text/plain', 'text'],
  ['text/html', 'text'],
  ['text/css', 'text'],
  ['text/javascript', 'text'],
  ['text/xml', 'text'],
  ['text/csv', 'text'],
  ['text/markdown', 'text'],
  ['application/x-sh', 'text'],
  ['application/x-bat', 'text'],
]);

const MIME_PREFIX_CATEGORY_LIST = [
  ['image/', 'image'],
  ['video/', 'video'],
  ['audio/', 'audio'],
  ['text/', 'text'],
];

const EXTENSION_CATEGORY_MAP = new Map([
  ['jpg', 'image'],
  ['jpeg', 'image'],
  ['png', 'image'],
  ['gif', 'image'],
  ['bmp', 'image'],
  ['webp', 'image'],
  ['svg', 'image'],
  ['mp4', 'video'],
  ['avi', 'video'],
  ['mov', 'video'],
  ['wmv', 'video'],
  ['flv', 'video'],
  ['webm', 'video'],
  ['m4v', 'video'],
  ['mp3', 'audio'],
  ['wav', 'audio'],
  ['ogg', 'audio'],
  ['flac', 'audio'],
  ['aac', 'audio'],
  ['pdf', 'pdf'],
  ['doc', 'word'],
  ['docx', 'word'],
  ['xls', 'excel'],
  ['xlsx', 'excel'],
  ['csv', 'text'],
  ['ppt', 'ppt'],
  ['pptx', 'ppt'],
  ['txt', 'text'],
  ['html', 'text'],
  ['htm', 'text'],
  ['css', 'text'],
  ['js', 'text'],
  ['ts', 'text'],
  ['jsx', 'text'],
  ['tsx', 'text'],
  ['json', 'text'],
  ['xml', 'text'],
  ['md', 'text'],
  ['markdown', 'text'],
  ['log', 'text'],
  ['zip', 'compress'],
  ['rar', 'compress'],
  ['7z', 'compress'],
  ['tar', 'compress'],
  ['gz', 'compress'],
  ['bz2', 'compress'],
  ['xz', 'compress'],
]);

export function normalizeFileCategory(category = '') {
  const normalized = String(category || '').trim().toLowerCase();
  return FILE_CATEGORY_ORDER.includes(normalized) ? normalized : 'other';
}

export function normalizeMimeType(fileType = '') {
  return String(fileType || '')
    .trim()
    .toLowerCase()
    .split(';')[0];
}

export function getFileExtension(fileName = '') {
  return path.extname(String(fileName || '')).replace(/^\./, '').toLowerCase();
}

export function resolveFileCategory({ fileName = '', fileType = '', category = '' } = {}) {
  const explicitCategory = normalizeFileCategory(category);
  if (explicitCategory !== 'other' || String(category || '').trim().toLowerCase() === 'other') {
    return explicitCategory;
  }

  const mimeType = normalizeMimeType(fileType);
  if (mimeType && EXACT_MIME_CATEGORY_MAP.has(mimeType)) {
    return EXACT_MIME_CATEGORY_MAP.get(mimeType);
  }

  const prefixMatch = MIME_PREFIX_CATEGORY_LIST.find(([prefix]) => mimeType.startsWith(prefix));
  if (prefixMatch) {
    return prefixMatch[1];
  }

  const extension = getFileExtension(fileName);
  if (extension && EXTENSION_CATEGORY_MAP.has(extension)) {
    return EXTENSION_CATEGORY_MAP.get(extension);
  }

  return 'other';
}

