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
export const AI_DOCUMENT_MAX_CHUNKS = 220;
const COVERAGE_VERSION = 1;

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

function documentError(code, message, coverage) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  if (coverage) error.coverage = coverage;
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

function prepareText(value, limit = AI_DOCUMENT_MAX_CHARS) {
  const fullText = cleanText(value);
  if (!fullText) throw documentError('EMPTY_DOCUMENT', '文件中没有可解析的文本内容');
  return {
    fullText,
    text: fullText.slice(0, limit),
    truncated: fullText.length > limit,
  };
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

function chunkSegment(segment, segmentIndex, maxLength = 1800, overlap = 180) {
  const text = segment.content;
  if (text.length <= maxLength) {
    return [{ ...segment, _segmentIndex: segmentIndex, _start: 0, _end: text.length }];
  }
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + maxLength);
    if (end < text.length) {
      const boundary = Math.max(text.lastIndexOf('\n', end), text.lastIndexOf('。', end), text.lastIndexOf('. ', end));
      if (boundary > start + Math.floor(maxLength * 0.55)) end = boundary + 1;
    }
    const content = cleanText(text.slice(start, end));
    if (content) chunks.push({ ...segment, content, _segmentIndex: segmentIndex, _start: start, _end: end });
    if (end >= text.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks;
}

function createChunkCandidates(segments) {
  return segments.flatMap((segment, index) => chunkSegment(segment, index));
}

function finalizeChunks(segments) {
  const candidates = createChunkCandidates(segments);
  const stored = candidates.slice(0, AI_DOCUMENT_MAX_CHUNKS);
  const coveredRangesBySegment = new Map();
  for (const chunk of stored) {
    const ranges = coveredRangesBySegment.get(chunk._segmentIndex) || [];
    ranges.push([chunk._start, chunk._end]);
    coveredRangesBySegment.set(chunk._segmentIndex, ranges);
  }
  let coveredSegmentChars = 0;
  for (const ranges of coveredRangesBySegment.values()) {
    ranges.sort((left, right) => left[0] - right[0]);
    let [start, end] = ranges[0];
    for (const [nextStart, nextEnd] of ranges.slice(1)) {
      if (nextStart <= end) end = Math.max(end, nextEnd);
      else {
        coveredSegmentChars += end - start;
        start = nextStart;
        end = nextEnd;
      }
    }
    coveredSegmentChars += end - start;
  }
  return {
    candidateCount: candidates.length,
    storedSegmentIndexes: [...new Set(stored.map((chunk) => chunk._segmentIndex))],
    coveredSegmentChars,
    totalSegmentChars: segments.reduce((total, segment) => total + String(segment.content || '').length, 0),
    chunks: stored.map((chunk, index) => ({
      chunkIndex: index,
      content: chunk.content,
      locatorType: chunk.locatorType,
      locatorValue: chunk.locatorValue,
      contentHash: crypto.createHash('sha256').update(chunk.content).digest('hex'),
    })),
  };
}

function clampRatio(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, Number(value.toFixed(4))));
}

function range(unit, start, end, code, reason) {
  return { unit, start, end, code, reason };
}

function reason(code, message) {
  return { code, message };
}

function coalescePageRanges(pageNumbers, code, message) {
  const pages = [...new Set(pageNumbers.map(Number).filter((page) => Number.isInteger(page) && page > 0))].sort(
    (left, right) => left - right,
  );
  const ranges = [];
  let start = pages[0];
  let previous = pages[0];
  for (const page of pages.slice(1)) {
    if (page === previous + 1) {
      previous = page;
      continue;
    }
    ranges.push(range('pages', start, previous, code, message));
    start = page;
    previous = page;
  }
  if (start) ranges.push(range('pages', start, previous, code, message));
  return ranges;
}

function buildCoverage({
  totalChars,
  parsedChars,
  processedChars,
  totalPages,
  parsedPages,
  processedPages,
  totalChunks,
  parsedChunks,
  processedChunks,
  failedRanges = [],
  reasons = [],
  truncated = false,
}) {
  const normalizedTotalChars = Math.max(0, Number(totalChars || 0));
  const normalizedTotalPages = Math.max(0, Number(totalPages || 0));
  const charRatio = normalizedTotalChars > 0 ? Number(processedChars || 0) / normalizedTotalChars : null;
  const pageRatio = normalizedTotalPages > 1 ? Number(processedPages || 0) / normalizedTotalPages : null;
  const coverageRatio = clampRatio(
    charRatio == null
      ? pageRatio == null
        ? 0
        : pageRatio
      : pageRatio == null
        ? charRatio
        : Math.min(charRatio, pageRatio),
  );
  const uniqueReasons = [];
  const seenReasons = new Set();
  for (const item of reasons) {
    if (!item?.code || seenReasons.has(item.code)) continue;
    seenReasons.add(item.code);
    uniqueReasons.push(item);
  }
  const isTruncated = Boolean(truncated);
  const hasFailures = failedRanges.length > 0 || uniqueReasons.length > 0;
  return {
    version: COVERAGE_VERSION,
    metadataAvailable: true,
    total: {
      chars: normalizedTotalChars,
      pages: normalizedTotalPages,
      chunks: Math.max(0, Number(totalChunks || 0)),
    },
    parsed: {
      chars: Math.max(0, Number(parsedChars || 0)),
      pages: Math.max(0, Number(parsedPages || 0)),
      chunks: Math.max(0, Number(parsedChunks || 0)),
    },
    processed: {
      chars: Math.max(0, Number(processedChars || 0)),
      pages: Math.max(0, Number(processedPages || 0)),
      chunks: Math.max(0, Number(processedChunks || 0)),
    },
    truncated: isTruncated,
    complete: coverageRatio >= 0.9999 && !isTruncated && !hasFailures,
    coverageRatio,
    failedRanges,
    reasons: uniqueReasons,
  };
}

function buildFailedCoverage({ code, message, totalChars = 0, totalPages = 0, totalChunks = 0 }) {
  const failedRanges = [];
  if (totalPages > 0) failedRanges.push(range('pages', 1, totalPages, code, message));
  else if (totalChars > 0) failedRanges.push(range('characters', 1, totalChars, code, message));
  else failedRanges.push(range('document', 1, 1, code, message));
  return buildCoverage({
    totalChars,
    parsedChars: 0,
    processedChars: 0,
    totalPages,
    parsedPages: 0,
    processedPages: 0,
    totalChunks,
    parsedChunks: 0,
    processedChunks: 0,
    failedRanges,
    reasons: [reason(code, message)],
    truncated: false,
  });
}

export async function parseDocumentBuffer(
  buffer,
  descriptor,
  { ocrProvider = localOcrProvider, pdfParser = pdfParse, signal } = {},
) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    const message = '文件内容为空';
    throw documentError('EMPTY_DOCUMENT', message, buildFailedCoverage({ code: 'EMPTY_DOCUMENT', message }));
  }
  const meta = validateDocumentDescriptor(descriptor);
  let coverageSeed = { totalChars: 0, totalPages: meta.expectedType.startsWith('image/') ? 1 : 0, totalChunks: 0 };
  let text = '';
  let fullText = '';
  let segments = [];
  let fullSegments = [];
  let totalPages = 1;
  let parsedPages = 1;
  let missingPageNumbers = [];

  try {
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
      totalPages = Number(result.numpages || pages.length);
      coverageSeed.totalPages = totalPages;
      if (totalPages > 300) {
        const message = 'PDF 页数不能超过 300 页';
        throw documentError(
          'DOCUMENT_TOO_LONG',
          message,
          buildFailedCoverage({ code: 'DOCUMENT_TOO_LONG', message, totalPages }),
        );
      }
      const embeddedText = cleanText(result.text || pages.join('\n\n'));
      if (embeddedText) {
        const prepared = prepareText(embeddedText);
        fullText = prepared.fullText;
        text = prepared.text;
        coverageSeed.totalChars = fullText.length;
        if (pages.some((page) => cleanText(page))) {
          fullSegments = pages
            .map((content, index) => ({
              content: cleanText(content),
              locatorType: 'page',
              locatorValue: `第 ${index + 1} 页`,
            }))
            .filter((item) => item.content);
          let remainingChars = AI_DOCUMENT_MAX_CHARS;
          segments = fullSegments
            .map((segment) => {
              const pageText = segment.content.slice(0, Math.max(0, remainingChars));
              remainingChars -= pageText.length;
              return { ...segment, content: pageText };
            })
            .filter((item) => item.content);
          parsedPages = prepared.truncated ? Math.min(totalPages, segments.length) : totalPages;
        } else {
          const locatorValue = totalPages > 1 ? `第 1-${totalPages} 页` : '第 1 页';
          fullSegments = [{ content: fullText, locatorType: 'page', locatorValue }];
          segments = [{ content: text, locatorType: 'page', locatorValue }];
          parsedPages = prepared.truncated ? 1 : totalPages;
        }
      } else {
        const ocrPages = await ocrProvider.recognizePdf(buffer, { pageCount: totalPages, signal });
        const normalizedPages = (Array.isArray(ocrPages) ? ocrPages : [])
          .map((page) => ({ pageNumber: Number(page.pageNumber), content: cleanText(page.content) }))
          .filter((page) => Number.isInteger(page.pageNumber) && page.pageNumber > 0 && page.content)
          .sort((left, right) => left.pageNumber - right.pageNumber);
        const parsedPageNumbers = new Set(normalizedPages.map((page) => page.pageNumber));
        missingPageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1).filter(
          (page) => !parsedPageNumbers.has(page),
        );
        fullText = cleanText(normalizedPages.map((page) => page.content).join('\n\n'));
        if (!fullText) throw documentError('EMPTY_DOCUMENT', 'OCR 未能从 PDF 图片中识别出文字');
        coverageSeed.totalChars = fullText.length;
        const prepared = prepareText(fullText);
        text = prepared.text;
        fullSegments = normalizedPages.map((page) => ({
          content: page.content,
          locatorType: 'page',
          locatorValue: `第 ${page.pageNumber} 页`,
        }));
        let remainingChars = AI_DOCUMENT_MAX_CHARS;
        segments = fullSegments
          .map((segment) => {
            const pageText = segment.content.slice(0, Math.max(0, remainingChars));
            remainingChars -= pageText.length;
            return { ...segment, content: pageText };
          })
          .filter((item) => item.content);
        parsedPages = segments.length;
      }
    } else if (meta.extension === '.docx') {
      if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
        throw documentError('FILE_CONTENT_INVALID', '文件内容与 DOCX 格式不一致');
      }
      const result = await mammoth.extractRawText({ buffer });
      const prepared = prepareText(result.value);
      fullText = prepared.fullText;
      text = prepared.text;
      coverageSeed.totalChars = fullText.length;
      fullSegments = splitParagraphs(fullText);
      segments = splitParagraphs(text);
    } else if (meta.expectedType.startsWith('image/')) {
      const result = await ocrProvider.recognizeImage(buffer, { extension: meta.extension, signal });
      const prepared = prepareText(result.content);
      fullText = prepared.fullText;
      text = prepared.text;
      coverageSeed.totalChars = fullText.length;
      fullSegments = [{ content: fullText, locatorType: 'page', locatorValue: '图片' }];
      segments = [{ content: text, locatorType: 'page', locatorValue: '图片' }];
    } else {
      const prepared = prepareText(decodeText(buffer));
      fullText = prepared.fullText;
      text = prepared.text;
      coverageSeed.totalChars = fullText.length;
      if (meta.extension === '.csv') {
        fullSegments = splitCsv(fullText);
        segments = splitCsv(text);
      } else if (meta.extension === '.md' || meta.extension === '.markdown') {
        fullSegments = splitMarkdown(fullText);
        segments = splitMarkdown(text);
      } else {
        fullSegments = splitParagraphs(fullText);
        segments = splitParagraphs(text);
      }
    }

    if (!segments.length) segments = splitParagraphs(text);
    if (!fullSegments.length) fullSegments = splitParagraphs(fullText);
    const totalChunkCount = createChunkCandidates(fullSegments).length;
    coverageSeed = { totalChars: fullText.length, totalPages, totalChunks: totalChunkCount };
    const finalized = finalizeChunks(segments);
    if (!finalized.chunks.length) {
      const message = '文件中没有可解析的文本内容';
      throw documentError(
        'EMPTY_DOCUMENT',
        message,
        buildFailedCoverage({ code: 'EMPTY_DOCUMENT', message, ...coverageSeed }),
      );
    }

    const failedRanges = [];
    const reasons = [];
    if (text.length < fullText.length) {
      const message = `文字超过 ${AI_DOCUMENT_MAX_CHARS.toLocaleString('en-US')} 字符，仅保留前部可解析内容`;
      failedRanges.push(range('characters', text.length + 1, fullText.length, 'CHAR_LIMIT', message));
      reasons.push(reason('CHAR_LIMIT', message));
    }
    if (finalized.chunks.length < finalized.candidateCount) {
      const message = `分块超过 ${AI_DOCUMENT_MAX_CHUNKS} 个，仅持久化前 ${AI_DOCUMENT_MAX_CHUNKS} 个`;
      failedRanges.push(range('chunks', finalized.chunks.length + 1, finalized.candidateCount, 'CHUNK_LIMIT', message));
      reasons.push(reason('CHUNK_LIMIT', message));
    }
    if (missingPageNumbers.length) {
      const message = '这些页面没有识别到可靠文字';
      failedRanges.push(...coalescePageRanges(missingPageNumbers, 'OCR_PAGE_NO_TEXT', message));
      reasons.push(reason('OCR_PAGE_NO_TEXT', message));
    }

    const storedCharRatio = finalized.totalSegmentChars
      ? Math.min(1, finalized.coveredSegmentChars / finalized.totalSegmentChars)
      : 0;
    const processedChars = Math.min(text.length, Math.round(text.length * storedCharRatio));
    let processedPages = parsedPages;
    if (finalized.chunks.length < finalized.candidateCount && totalPages > 1) {
      processedPages = Math.min(parsedPages, finalized.storedSegmentIndexes.length);
    }
    const coverage = buildCoverage({
      totalChars: fullText.length,
      parsedChars: text.length,
      processedChars,
      totalPages,
      parsedPages,
      processedPages,
      totalChunks: totalChunkCount,
      parsedChunks: finalized.candidateCount,
      processedChunks: finalized.chunks.length,
      failedRanges,
      reasons,
      truncated: text.length < fullText.length || finalized.chunks.length < finalized.candidateCount,
    });
    return { text, chunks: finalized.chunks, extractedChars: processedChars, coverage };
  } catch (error) {
    if (!error.coverage) {
      const code = error.code || 'DOCUMENT_PARSE_FAILED';
      const message = String(error.message || '文件解析失败').replace(/^[A-Z][A-Z0-9_]+:\s*/, '');
      error.coverage = buildFailedCoverage({ code, message, ...coverageSeed });
    }
    throw error;
  }
}

export function getSupportedDocumentAccept() {
  return Object.keys(TYPE_BY_EXTENSION).join(',');
}
