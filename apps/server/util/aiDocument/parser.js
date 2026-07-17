import crypto from 'node:crypto';
import path from 'node:path';
import mammoth from 'mammoth';
// pdf-parse 的包入口在 ESM/Vitest 下会误判为 CLI 调试模式并读取其测试 PDF，
// 直接使用实际解析实现，避免导入时产生文件系统副作用。
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { parse as parseCsv } from 'csv-parse/sync';
import { localOcrProvider } from './localOcr.js';

export const AI_DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;
export const AI_DOCUMENT_MAX_CHARS = 300_000;

const TYPE_BY_EXTENSION = Object.freeze({
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.csv': 'text/csv',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
});

const ALLOWED_MIME_BY_EXTENSION = Object.freeze({
  '.txt': new Set(['text/plain', 'application/octet-stream']),
  '.md': new Set(['text/markdown', 'text/x-markdown', 'text/plain', 'application/octet-stream']),
  '.markdown': new Set(['text/markdown', 'text/x-markdown', 'text/plain', 'application/octet-stream']),
  '.csv': new Set([
    'text/csv',
    'application/csv',
    'application/vnd.ms-excel',
    'text/plain',
    'application/octet-stream',
  ]),
  '.pdf': new Set(['application/pdf', 'application/octet-stream']),
  '.docx': new Set([
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
    'application/octet-stream',
  ]),
  '.png': new Set(['image/png', 'application/octet-stream']),
  '.jpg': new Set(['image/jpeg', 'image/jpg', 'application/octet-stream']),
  '.jpeg': new Set(['image/jpeg', 'image/jpg', 'application/octet-stream']),
  '.webp': new Set(['image/webp', 'application/octet-stream']),
});

function documentError(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  return error;
}

export function normalizeDocumentFileName(value) {
  const name = path
    .basename(
      String(value || '')
        .normalize('NFC')
        .replace(/[\u0000-\u001f\u007f]/g, ''),
    )
    .trim();
  if (!name || name === '.' || name === '..') throw documentError('FILE_NAME_REQUIRED', '文件名不能为空');
  return name.slice(0, 255);
}

export function validateDocumentDescriptor({ fileName, fileType, fileSize }) {
  const normalizedName = normalizeDocumentFileName(fileName);
  const extension = path.extname(normalizedName).toLowerCase();
  const expectedType = TYPE_BY_EXTENSION[extension];
  const normalizedType = String(fileType || expectedType)
    .split(';')[0]
    .trim()
    .toLowerCase();
  const size = Number(fileSize || 0);
  if (!expectedType) {
    throw documentError('UNSUPPORTED_FILE_TYPE', '暂时仅支持 TXT、Markdown、CSV、PDF、DOCX、PNG、JPG 和 WebP');
  }
  if (!ALLOWED_MIME_BY_EXTENSION[extension]?.has(normalizedType)) {
    throw documentError('FILE_TYPE_MISMATCH', '文件扩展名与 MIME 类型不一致');
  }
  if (!Number.isFinite(size) || size <= 0) throw documentError('FILE_SIZE_INVALID', '文件大小无效');
  if (size > AI_DOCUMENT_MAX_BYTES) throw documentError('FILE_TOO_LARGE', '文件不能超过 20MB');
  return {
    fileName: normalizedName,
    fileType: normalizedType.slice(0, 160),
    fileSize: Math.trunc(size),
    extension,
    expectedType,
  };
}

function cleanText(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function decodeText(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
  const nullBytes = sample.reduce((count, byte) => count + (byte === 0 ? 1 : 0), 0);
  if (sample.length && nullBytes / sample.length > 0.01) {
    throw documentError('FILE_CONTENT_INVALID', '文本文件编码或内容不受支持');
  }
  return cleanText(new TextDecoder('utf-8', { fatal: false }).decode(buffer));
}

function cutText(value, limit = AI_DOCUMENT_MAX_CHARS) {
  const text = cleanText(value);
  if (!text) throw documentError('EMPTY_DOCUMENT', '文件中没有可解析的文本内容');
  return text.slice(0, limit);
}

function splitMarkdown(text) {
  const lines = text.split('\n');
  const sections = [];
  let title = '正文';
  let body = [];
  const flush = () => {
    const content = cleanText(body.join('\n'));
    if (content) sections.push({ content, locatorType: 'section', locatorValue: title });
  };
  for (const line of lines) {
    const heading = /^#{1,6}\s+(.+)$/.exec(line.trim());
    if (heading) {
      flush();
      title = heading[1].trim().slice(0, 150) || '正文';
      body = [line];
    } else {
      body.push(line);
    }
  }
  flush();
  return sections.length ? sections : [{ content: text, locatorType: 'section', locatorValue: '正文' }];
}

function splitCsv(text) {
  let records;
  try {
    records = parseCsv(text, {
      bom: true,
      relax_column_count: true,
      relax_quotes: true,
      skip_empty_lines: true,
    });
  } catch {
    throw documentError('FILE_CONTENT_INVALID', 'CSV 格式无法解析');
  }
  if (!records.length) throw documentError('EMPTY_DOCUMENT', 'CSV 中没有可解析的数据');
  const header = records[0].map((value) => cleanText(value)).join(' | ');
  return records.slice(1).map((row, index) => ({
    content: `${header}\n${row.map((value) => cleanText(value)).join(' | ')}`,
    locatorType: 'row',
    locatorValue: `第 ${index + 2} 行`,
  }));
}

function splitParagraphs(text) {
  return text
    .split(/\n\s*\n/)
    .map(cleanText)
    .filter(Boolean)
    .map((content, index) => ({ content, locatorType: 'paragraph', locatorValue: `第 ${index + 1} 段` }));
}

function chunkSegment(segment, maxLength = 1800, overlap = 180) {
  const text = segment.content;
  if (text.length <= maxLength) return [segment];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + maxLength);
    if (end < text.length) {
      const boundary = Math.max(text.lastIndexOf('\n', end), text.lastIndexOf('。', end), text.lastIndexOf('. ', end));
      if (boundary > start + Math.floor(maxLength * 0.55)) end = boundary + 1;
    }
    const content = cleanText(text.slice(start, end));
    if (content) chunks.push({ ...segment, content });
    if (end >= text.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks;
}

function finalizeChunks(segments) {
  const chunks = segments.flatMap((segment) => chunkSegment(segment)).slice(0, 220);
  if (!chunks.length) throw documentError('EMPTY_DOCUMENT', '文件中没有可解析的文本内容');
  return chunks.map((chunk, index) => ({
    chunkIndex: index,
    content: chunk.content,
    locatorType: chunk.locatorType,
    locatorValue: chunk.locatorValue,
    contentHash: crypto.createHash('sha256').update(chunk.content).digest('hex'),
  }));
}

export async function parseDocumentBuffer(
  buffer,
  descriptor,
  { ocrProvider = localOcrProvider, pdfParser = pdfParse, signal } = {},
) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw documentError('EMPTY_DOCUMENT', '文件内容为空');
  const meta = validateDocumentDescriptor(descriptor);
  let text = '';
  let segments = [];

  if (meta.extension === '.pdf') {
    if (buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw documentError('FILE_CONTENT_INVALID', '文件内容与 PDF 格式不一致');
    }
    const pages = [];
    const result = await pdfParser(buffer, {
      pagerender: async (pageData) => {
        const content = await pageData.getTextContent();
        const pageText = cleanText(content.items.map((item) => item.str || '').join(' '));
        pages.push(pageText);
        return pageText;
      },
    });
    if (Number(result.numpages || pages.length) > 300) {
      throw documentError('DOCUMENT_TOO_LONG', 'PDF 页数不能超过 300 页');
    }
    const embeddedText = cleanText(result.text || pages.join('\n\n'));
    if (embeddedText) {
      text = cutText(embeddedText);
      let remainingChars = AI_DOCUMENT_MAX_CHARS;
      segments = pages
        .map((content, index) => {
          const pageText = cleanText(content).slice(0, Math.max(0, remainingChars));
          remainingChars -= pageText.length;
          return { content: pageText, locatorType: 'page', locatorValue: `第 ${index + 1} 页` };
        })
        .filter((item) => item.content);
    } else {
      const ocrPages = await ocrProvider.recognizePdf(buffer, {
        pageCount: Number(result.numpages || pages.length),
        signal,
      });
      text = cutText(ocrPages.map((page) => page.content).join('\n\n'));
      let remainingChars = AI_DOCUMENT_MAX_CHARS;
      segments = ocrPages
        .map((page) => {
          const pageText = cleanText(page.content).slice(0, Math.max(0, remainingChars));
          remainingChars -= pageText.length;
          return { content: pageText, locatorType: 'page', locatorValue: `第 ${page.pageNumber} 页` };
        })
        .filter((item) => item.content);
    }
  } else if (meta.extension === '.docx') {
    if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      throw documentError('FILE_CONTENT_INVALID', '文件内容与 DOCX 格式不一致');
    }
    const result = await mammoth.extractRawText({ buffer });
    text = cutText(result.value);
    segments = splitParagraphs(text);
  } else if (meta.expectedType.startsWith('image/')) {
    const result = await ocrProvider.recognizeImage(buffer, { extension: meta.extension, signal });
    text = cutText(result.content);
    segments = [{ content: text, locatorType: 'page', locatorValue: '图片' }];
  } else {
    text = cutText(decodeText(buffer));
    if (meta.extension === '.csv') segments = splitCsv(text);
    else if (meta.extension === '.md' || meta.extension === '.markdown') segments = splitMarkdown(text);
    else segments = splitParagraphs(text);
  }

  if (!segments.length) segments = splitParagraphs(text);
  const chunks = finalizeChunks(segments);
  return { text, chunks, extractedChars: text.length };
}

export function getSupportedDocumentAccept() {
  return Object.keys(TYPE_BY_EXTENSION).join(',');
}
