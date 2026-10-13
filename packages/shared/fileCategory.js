import { FILE_PREVIEW_EXTRA_TEXT_EXTENSIONS, FILE_PREVIEW_FORMATS } from './index.js';

export const FILE_CATEGORY_ORDER = Object.freeze([
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
]);

const TEXT_EXTENSIONS = [
  'txt',
  'md',
  'markdown',
  'json',
  'js',
  'ts',
  'jsx',
  'tsx',
  'css',
  'xml',
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
];

const mediaFormats = (category, entries) =>
  entries.map(([extension, playbackMime]) => ({
    id: `${category}-${extension}`,
    category,
    previewType: category,
    extensions: [extension],
    mimeTypes: [playbackMime.split(';')[0]],
    playbackMime,
  }));

// 每个格式只登记一次；分类与预览分别读取 category 和 previewType。
// 派生格式继续复用 Worker 的注册表，不能把直接预览格式送入派生任务。
export const FILE_FORMATS = Object.freeze(
  [
    ...FILE_PREVIEW_FORMATS,
    {
      id: 'csv',
      category: 'excel',
      previewType: 'csv',
      extensions: ['csv'],
      mimeTypes: ['text/csv', 'application/csv', 'text/x-csv', 'application/x-csv'],
    },
    {
      id: 'html',
      category: 'text',
      previewType: 'html',
      extensions: ['html', 'htm'],
      mimeTypes: ['text/html'],
    },
    { id: 'pdf', category: 'pdf', previewType: 'pdf', extensions: ['pdf'], mimeTypes: ['application/pdf'] },
    {
      id: 'docx',
      category: 'word',
      previewType: 'word',
      extensions: ['docx'],
      mimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    },
    {
      id: 'xlsx',
      category: 'excel',
      previewType: 'excel',
      extensions: ['xlsx'],
      mimeTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    },
    {
      id: 'pptx',
      category: 'ppt',
      previewType: 'ppt',
      extensions: ['pptx'],
      mimeTypes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    },
    {
      id: 'image',
      category: 'image',
      previewType: 'image',
      extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'avif', 'ico'],
      mimePrefixes: ['image/'],
    },
    ...mediaFormats('video', [
      ['mp4', 'video/mp4'],
      ['m4v', 'video/mp4'],
      ['webm', 'video/webm'],
      ['mov', 'video/quicktime'],
      ['ogv', 'video/ogg'],
      ['avi', 'video/x-msvideo'],
      ['wmv', 'video/x-ms-wmv'],
      ['flv', 'video/x-flv'],
    ]),
    ...mediaFormats('audio', [
      ['mp3', 'audio/mpeg'],
      ['wav', 'audio/wav'],
      ['ogg', 'audio/ogg'],
      ['oga', 'audio/ogg'],
      ['opus', 'audio/ogg; codecs=opus'],
      ['flac', 'audio/flac'],
      ['aac', 'audio/aac'],
      ['m4a', 'audio/mp4'],
    ]),
    {
      id: 'text',
      category: 'text',
      previewType: 'text',
      extensions: [...TEXT_EXTENSIONS, ...FILE_PREVIEW_EXTRA_TEXT_EXTENSIONS],
      mimeTypes: [
        'application/json',
        'application/javascript',
        'application/xml',
        'application/sql',
        'application/toml',
        'application/yaml',
        'application/x-yaml',
        'application/x-sh',
        'application/x-bat',
      ],
      mimePrefixes: ['text/'],
    },
    { id: 'video-mime', category: 'video', previewType: 'video', mimePrefixes: ['video/'] },
    { id: 'audio-mime', category: 'audio', previewType: 'audio', mimePrefixes: ['audio/'] },
  ].map((format) =>
    Object.freeze(
      Object.fromEntries(
        Object.entries(format).map(([key, value]) => [
          key,
          Array.isArray(value) ? Object.freeze([...value]) : value,
        ]),
      ),
    ),
  ),
);

// 三个阶段共用同一注册表：已知扩展名、精确 MIME、MIME 前缀。
// SQL 按这个顺序编译，不能自行添加某个格式的例外。
export const FILE_CATEGORY_RULES = Object.freeze(
  ['extensions', 'mimeTypes', 'mimePrefixes'].flatMap((field) => {
    const groups = new Map();
    for (const format of FILE_FORMATS) {
      if (!format[field]?.length) continue;
      if (!groups.has(format.category)) groups.set(format.category, new Set());
      for (const value of format[field])
        groups.get(format.category).add(field === 'extensions' ? value.split('.').pop() : value);
    }
    return [...groups].map(([category, values]) =>
      Object.freeze({ category, [field]: Object.freeze([...values]) }),
    );
  }),
);

// 与数据库 TRIM 一致，首尾普通空格不参与识别，其余字符保留。
export function normalizeFileCategoryField(value = '') {
  return String(value ?? '')
    .replace(/^ +| +$/gu, '')
    .toLowerCase();
}
export function normalizeFileCategory(category = '') {
  const normalized = normalizeFileCategoryField(category);
  return FILE_CATEGORY_ORDER.includes(normalized) ? normalized : 'other';
}
export function normalizeFileMimeType(value = '') {
  return normalizeFileCategoryField(String(value ?? '').split(';')[0]);
}
export function getFileCategoryExtension(fileName = '', explicitExtension = '') {
  const name = normalizeFileCategoryField(fileName);
  const index = name.lastIndexOf('.');
  if (index > 0 && index < name.length - 1) return name.slice(index + 1);
  return normalizeFileCategoryField(explicitExtension).replace(/^[.]/u, '');
}
export function resolveFileCategory(file = {}) {
  const extension = getFileCategoryExtension(file?.fileName, file?.ext).split('.').pop();
  const mime = normalizeFileMimeType(file?.fileType);
  const match = FILE_CATEGORY_RULES.find(
    (rule) =>
      rule.extensions?.includes(extension) ||
      rule.mimeTypes?.includes(mime) ||
      rule.mimePrefixes?.some((prefix) => mime.startsWith(prefix)),
  );
  // 历史分类只兜底无法识别的资源，不能覆盖已识别的格式。
  return match?.category || normalizeFileCategory(file?.category);
}
export function resolveFileFormat(file = {}) {
  const extension = getFileCategoryExtension(file?.fileName, file?.ext);
  if (extension) return FILE_FORMATS.find((format) => format.extensions?.includes(extension)) || null;
  const mime = normalizeFileMimeType(file?.fileType);
  return (
    FILE_FORMATS.find((format) => format.mimeTypes?.includes(mime)) ||
    FILE_FORMATS.find((format) => format.mimePrefixes?.some((prefix) => mime.startsWith(prefix))) ||
    null
  );
}
export function resolveFilePreviewType(file = {}) {
  return resolveFileFormat(file)?.previewType || 'unsupported';
}
export function resolveFilePlaybackMimeType(file = {}) {
  const format = resolveFileFormat(file);
  if (!format || !['video', 'audio'].includes(format.previewType)) return '';
  // 明确格式优先于错误的 MIME；没有后缀的媒体保留声明的 MIME。
  return format.playbackMime || normalizeFileMimeType(file?.fileType);
}
