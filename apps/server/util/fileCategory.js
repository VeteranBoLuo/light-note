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
  ['application/sql', 'text'],
  ['application/toml', 'text'],
  ['application/yaml', 'text'],
  ['application/x-yaml', 'text'],
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
  ['avif', 'image'],
  ['ico', 'image'],
  ['mp4', 'video'],
  ['avi', 'video'],
  ['mov', 'video'],
  ['wmv', 'video'],
  ['flv', 'video'],
  ['webm', 'video'],
  ['m4v', 'video'],
  ['ogv', 'video'],
  ['mp3', 'audio'],
  ['wav', 'audio'],
  ['ogg', 'audio'],
  ['flac', 'audio'],
  ['aac', 'audio'],
  ['m4a', 'audio'],
  ['oga', 'audio'],
  ['opus', 'audio'],
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
  ['yml', 'text'],
  ['yaml', 'text'],
  ['py', 'text'],
  ['java', 'text'],
  ['go', 'text'],
  ['rs', 'text'],
  ['c', 'text'],
  ['cc', 'text'],
  ['cpp', 'text'],
  ['cxx', 'text'],
  ['h', 'text'],
  ['hpp', 'text'],
  ['sql', 'text'],
  ['sh', 'text'],
  ['bash', 'text'],
  ['zsh', 'text'],
  ['fish', 'text'],
  ['vue', 'text'],
  ['svelte', 'text'],
  ['toml', 'text'],
  ['ini', 'text'],
  ['conf', 'text'],
  ['cfg', 'text'],
  ['properties', 'text'],
  ['gradle', 'text'],
  ['kt', 'text'],
  ['kts', 'text'],
  ['swift', 'text'],
  ['rb', 'text'],
  ['php', 'text'],
  ['pl', 'text'],
  ['r', 'text'],
  ['dart', 'text'],
  ['lua', 'text'],
  ['zip', 'compress'],
  ['rar', 'compress'],
  ['7z', 'compress'],
  ['tar', 'compress'],
  ['gz', 'compress'],
  ['bz2', 'compress'],
  ['xz', 'compress'],
]);

export function normalizeFileCategory(category = '') {
  const normalized = String(category || '')
    .trim()
    .toLowerCase();
  return FILE_CATEGORY_ORDER.includes(normalized) ? normalized : 'other';
}

export function normalizeMimeType(fileType = '') {
  return String(fileType || '')
    .trim()
    .toLowerCase()
    .split(';')[0];
}

export function getFileExtension(fileName = '') {
  return path
    .extname(String(fileName || ''))
    .replace(/^\./, '')
    .toLowerCase();
}

export function resolveFileCategory({ fileName = '', fileType = '', category = '' } = {}) {
  const explicitCategory = normalizeFileCategory(category);
  if (
    explicitCategory !== 'other' ||
    String(category || '')
      .trim()
      .toLowerCase() === 'other'
  ) {
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

function toSqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function groupMapValues(map) {
  const grouped = new Map();
  for (const [key, category] of map.entries()) {
    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category).push(key);
  }
  return grouped;
}

/**
 * 生成与 resolveFileCategory 同口径的 MySQL CASE 表达式。
 *
 * 文件列表需要先在数据库内完成分类过滤再分页；否则只能把全部文件查出、
 * 逐条签名后再在 Node 进程里过滤，分页也就失去了意义。
 */
export function buildFileCategorySql({ fileNameSql = 'files.file_name', fileTypeSql = 'files.file_type' } = {}) {
  const normalizedMime = `LOWER(TRIM(SUBSTRING_INDEX(COALESCE(${fileTypeSql}, ''), ';', 1)))`;
  const normalizedExtension = `LOWER(SUBSTRING_INDEX(COALESCE(${fileNameSql}, ''), '.', -1))`;
  const cases = [];

  for (const [category, mimeTypes] of groupMapValues(EXACT_MIME_CATEGORY_MAP).entries()) {
    cases.push(`WHEN ${normalizedMime} IN (${mimeTypes.map(toSqlString).join(', ')}) THEN ${toSqlString(category)}`);
  }
  for (const [prefix, category] of MIME_PREFIX_CATEGORY_LIST) {
    cases.push(`WHEN ${normalizedMime} LIKE ${toSqlString(`${prefix}%`)} THEN ${toSqlString(category)}`);
  }
  for (const [category, extensions] of groupMapValues(EXTENSION_CATEGORY_MAP).entries()) {
    cases.push(
      `WHEN LOCATE('.', COALESCE(${fileNameSql}, ''), 2) > 0 AND ${normalizedExtension} IN (${extensions
        .map(toSqlString)
        .join(', ')}) THEN ${toSqlString(category)}`,
    );
  }

  return `(CASE ${cases.join(' ')} ELSE 'other' END)`;
}
