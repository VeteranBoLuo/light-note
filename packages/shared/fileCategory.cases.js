import { FILE_FORMATS } from './fileCategory.js';

// Explicit regression expectations, reused by web, server and real MySQL tests.
/** @type {Array<[import('./fileCategory.js').FileCategoryInput, import('./fileCategory.js').FileCategory, import('./fileCategory.js').FilePreviewType]>} */
export const FILE_CATEGORY_CASES = [
  [
    { fileName: '报告', fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
    'word',
    'word',
  ],
  [{ fileName: '说明.txt', fileType: 'application/msword' }, 'text', 'text'],
  [{ fileName: 'photo.png', category: 'other' }, 'image', 'image'],
  [{ fileName: ' photo.JPG ', fileType: '' }, 'image', 'image'],
  [{ fileName: '方案.csv', fileType: 'text/plain', category: 'text' }, 'excel', 'csv'],
  [{ fileName: '方案.CSV', fileType: 'application/vnd.ms-excel' }, 'excel', 'csv'],
  [{ fileName: '数据', fileType: ' TEXT/CSV ; charset=utf-8 ' }, 'excel', 'csv'],
  [{ fileName: 'document.docx', fileType: 'application/msword', category: 'text' }, 'word', 'word'],
  [{ fileName: 'sheet.xlsx', fileType: 'text/plain' }, 'excel', 'excel'],
  [{ fileName: 'slides.pptx', fileType: 'application/vnd.ms-powerpoint' }, 'ppt', 'ppt'],
  [{ fileName: 'page.html', fileType: 'image/png', category: 'image' }, 'text', 'html'],
  [{ fileName: 'readme.txt', fileType: 'text/html' }, 'text', 'text'],
  [{ fileName: '未知.bin', fileType: 'text/html', category: 'text' }, 'text', 'unsupported'],
  [{ fileName: '未知.bin', fileType: 'image/png', category: 'image' }, 'image', 'unsupported'],
  [{ fileName: '未知.bin', fileType: 'application/msword' }, 'word', 'unsupported'],
  [{ fileName: '未知.bin', fileType: 'text/csv' }, 'excel', 'unsupported'],
  [{ fileName: '未知.bin', category: 'word' }, 'word', 'unsupported'],
  [{ category: 'image' }, 'image', 'unsupported'],
  [{ fileName: '无后缀', fileType: 'image/png' }, 'image', 'image'],
  [{ fileName: '无后缀', fileType: 'video/mp4' }, 'video', 'video'],
  [{ fileName: '无后缀', fileType: 'audio/mpeg' }, 'audio', 'audio'],
  [{ fileName: '无后缀', fileType: 'text/html' }, 'text', 'html'],
  [{ fileName: 'archive.tar.gz', fileType: 'text/plain' }, 'compress', 'archive'],
  [{ fileName: '.png' }, 'other', 'unsupported'],
  [{ fileName: 'file.', fileType: 'application/pdf' }, 'pdf', 'pdf'],
  [{ fileName: 'file.pńg', fileType: 'ímage/png' }, 'other', 'unsupported'],
  [{ fileName: 'a.png\t' }, 'other', 'unsupported'],
  [{}, 'other', 'unsupported'],
];

// Exercise every declared alias through the three implementations, including casing/spacing.
/** @type {import('./fileCategory.js').FileCategoryInput[]} */
export const FILE_CATEGORY_PARITY_INPUTS = [
  ...FILE_CATEGORY_CASES.map(([file]) => file),
  ...FILE_FORMATS.flatMap((format) => [
    ...(format.extensions || []).flatMap((ext) => [
      { fileName: `example.${ext}`, fileType: 'application/octet-stream' },
      { fileName: ` 中文.${ext.toUpperCase()} `, fileType: 'text/plain', category: 'other' },
    ]),
    ...(format.mimeTypes || []).flatMap((fileType) => [
      { fileName: '无后缀', fileType },
      { fileName: '未知.bin', fileType: ` ${fileType.toUpperCase()} ; charset=utf-8 ` },
    ]),
    ...(format.mimePrefixes || []).map((prefix) => ({ fileName: '无后缀', fileType: `${prefix}x-example` })),
  ]),
];
