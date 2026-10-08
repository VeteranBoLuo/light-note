// Pure text operations shared by API retrieval and isolated preprocessing.
const CHUNK_TARGET_LENGTH = 600;
const CHUNK_MAX_LENGTH = 850;
const CHUNK_OVERLAP_LENGTH = 80;

function decodeHtmlEntities(value) {
  const decodeNumericEntity = (raw, code, radix = 10) => {
    const codePoint = Number.parseInt(code, radix);
    if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return raw;
    try {
      return String.fromCodePoint(codePoint);
    } catch {
      return raw;
    }
  };
  return String(value || '')
    .replace(/&nbsp;|&#160;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&#(\d+);/gu, (raw, code) => decodeNumericEntity(raw, code))
    .replace(/&#x([\da-f]+);/giu, (raw, code) => decodeNumericEntity(raw, code, 16));
}

function stripMarkdownSyntax(value) {
  return String(value || '')
    .replace(/^\s*```[^\n]*$/gmu, '')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/gu, '$1 $2')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/gu, '$1 $2')
    .replace(/\*\*([^*\n]+)\*\*/gu, '$1')
    .replace(/__([^_\n]+)__/gu, '$1')
    .replace(/~~([^~\n]+)~~/gu, '$1')
    .replace(/`([^`\n]+)`/gu, '$1')
    .replace(/\*([^*\n]+)\*/gu, '$1')
    .replace(/_([^_\n]+)_/gu, '$1')
    .replace(/^\s*>\s?/gmu, '')
    .replace(/^\s*[-*+]\s+/gmu, '')
    .replace(/^\s*\d+[.)]\s+/gmu, '');
}

export function normalizeWhitespace(value) {
  return String(value || '')
    .replace(/[\t\f\v]+/gu, ' ')
    .replace(/ +/gu, ' ')
    .replace(/\n\s*\n+/gu, '\n')
    .trim();
}

function prepareStructuredText(content, type = '') {
  const raw = String(content || '');
  const isHtml = type === 'html' || /<[a-z][^>]*>/iu.test(raw);
  if (!isHtml) return stripMarkdownSyntax(decodeHtmlEntities(raw));

  return decodeHtmlEntities(
    raw
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, ' ')
      .replace(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/giu, '$2 ($1)')
      .replace(/<h[1-6]\b[^>]*>/giu, '\n@@KNOWLEDGE_HEADING@@')
      .replace(/<\/h[1-6]>/giu, '\n')
      .replace(/<br\s*\/?>/giu, '\n')
      .replace(/<li\b[^>]*>/giu, '\n')
      .replace(/<\/(?:p|li|div|section|article|tr|ul|ol|table)>/giu, '\n')
      .replace(/<[^>]+>/gu, ' '),
  );
}

export function extractBlocks(content, type) {
  const structured = prepareStructuredText(content, type);
  const blocks = [];
  for (const rawLine of structured.split(/\r?\n/gu)) {
    let line = normalizeWhitespace(rawLine);
    if (!line) continue;

    const htmlHeading = line.startsWith('@@KNOWLEDGE_HEADING@@');
    if (htmlHeading) line = normalizeWhitespace(line.slice('@@KNOWLEDGE_HEADING@@'.length));
    const markdownHeading = /^(#{1,6})\s+(.+)$/u.exec(line);
    if (markdownHeading) line = normalizeWhitespace(markdownHeading[2]);
    if (!line) continue;

    blocks.push({ heading: htmlHeading || Boolean(markdownHeading), text: line });
  }
  return blocks;
}

function chooseSplitPosition(text, maxLength) {
  const minimum = Math.floor(maxLength * 0.55);
  const window = text.slice(minimum, maxLength + 1);
  const punctuation = Math.max(
    window.lastIndexOf('。'),
    window.lastIndexOf('！'),
    window.lastIndexOf('？'),
    window.lastIndexOf('；'),
    window.lastIndexOf('. '),
    window.lastIndexOf('! '),
    window.lastIndexOf('? '),
    window.lastIndexOf('; '),
  );
  if (punctuation >= 0) return minimum + punctuation + 1;
  const whitespace = window.lastIndexOf(' ');
  if (whitespace >= 0) return minimum + whitespace;
  return maxLength;
}

function splitLongText(text, maxLength = CHUNK_MAX_LENGTH, overlap = CHUNK_OVERLAP_LENGTH) {
  const normalized = normalizeWhitespace(text);
  if (normalized.length <= maxLength) return normalized ? [normalized] : [];

  const parts = [];
  let start = 0;
  while (start < normalized.length) {
    const remaining = normalized.slice(start);
    if (remaining.length <= maxLength) {
      parts.push(remaining);
      break;
    }
    const splitAt = chooseSplitPosition(remaining, maxLength);
    parts.push(remaining.slice(0, splitAt).trim());
    const nextStart = start + splitAt - Math.min(overlap, Math.floor(splitAt / 4));
    start = Math.max(start + 1, nextStart);
  }
  return parts.filter(Boolean);
}

/**
 * 将 HTML/Markdown 知识正文按标题和段落切成适合检索的小块。
 * 每块继承最近的章节标题，长段落保留少量重叠，避免答案落在切分边界。
 */
export function splitKnowledgeContent(content, type = '') {
  const blocks = extractBlocks(content, type);
  if (!blocks.length) return [];

  const chunks = [];
  let heading = '';
  let buffer = [];
  let bufferLength = 0;

  const flush = () => {
    const text = normalizeWhitespace(buffer.join('\n'));
    if (text) chunks.push({ heading, content: text });
    buffer = [];
    bufferLength = 0;
  };

  for (const block of blocks) {
    if (block.heading) {
      flush();
      heading = block.text;
      continue;
    }

    for (const part of splitLongText(block.text)) {
      const nextLength = bufferLength + (buffer.length ? 1 : 0) + part.length;
      if (buffer.length && nextLength > CHUNK_MAX_LENGTH) flush();
      buffer.push(part);
      bufferLength += (buffer.length > 1 ? 1 : 0) + part.length;
      if (bufferLength >= CHUNK_TARGET_LENGTH) flush();
    }
  }
  flush();

  if (!chunks.length && heading) chunks.push({ heading: '', content: heading });
  return chunks;
}

export function tokenizeText(text, { dedupe = false } = {}) {
  const cleaned = String(text || '')
    .replace(/[^\w\u4e00-\u9fff]/gu, ' ')
    .trim();
  if (!cleaned) return [];

  const terms = [];
  const fallbackChars = [];
  const chineseRuns = cleaned.match(/[\u4e00-\u9fff]+/gu) || [];
  const englishWords = cleaned.match(/[a-zA-Z0-9]+/gu) || [];

  for (const word of englishWords) {
    if (word.length >= 2) terms.push(word.toLowerCase());
  }

  for (const run of chineseRuns) {
    for (let i = 0; i < run.length; i += 1) {
      const char = run[i];
      if (!'的了是在有我着不就这那和也与而但或及被把对'.includes(char)) fallbackChars.push(char);
      if (i < run.length - 1) terms.push(run.slice(i, i + 2));
    }
    if (run.length >= 3 && run.length <= 8) terms.push(run);
  }

  const result = terms.length ? terms : fallbackChars;
  return dedupe ? [...new Set(result)] : result;
}

/** 中文二字词 + 英文单词分词，保留旧导出供测试与调用方使用。 */
export function extractTokens(text) {
  return tokenizeText(text, { dedupe: true });
}
