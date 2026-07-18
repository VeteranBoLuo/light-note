import MiniSearch from 'minisearch';
import pool from '../db/index.js';

const CACHE_TTL = 5 * 60 * 1000;
const CHUNK_TARGET_LENGTH = 600;
const CHUNK_MAX_LENGTH = 850;
const CHUNK_OVERLAP_LENGTH = 80;
const SEARCH_RESULT_MULTIPLIER = 8;
const MAX_SEARCH_CANDIDATES = 80;

const cache = new Map();
const cachePromises = new Map();
const cacheTimers = new Map();
const cacheGenerations = new Map();

const LOW_INFORMATION_TERMS = new Set([
  '一下',
  '为什',
  '什么',
  '你好',
  '可以',
  '告诉',
  '哪个',
  '哪些',
  '如何',
  '帮我',
  '我们',
  '我要',
  '是否',
  '有没',
  '有没有',
  '查看',
  '这个',
  '请问',
  '那个',
  '问题',
]);

const QUERY_ALIAS_RULES = [
  { pattern: /云盘/giu, append: ' 云空间' },
  { pattern: /(?:AI|智能)助手/giu, append: ' 轻笺智域' },
  { pattern: /(?:帮助文档|使用文档|使用说明)/giu, append: ' 帮助中心' },
  { pattern: /(?:收藏夹|收藏网址)/giu, append: ' 书签' },
  { pattern: /共创/giu, append: ' 共建轻笺' },
];

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

function normalizeWhitespace(value) {
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
      .replace(/<h[1-6]\b[^>]*>/giu, '\n@@KNOWLEDGE_HEADING@@')
      .replace(/<\/h[1-6]>/giu, '\n')
      .replace(/<br\s*\/?>/giu, '\n')
      .replace(/<li\b[^>]*>/giu, '\n')
      .replace(/<\/(?:p|li|div|section|article|tr|ul|ol|table)>/giu, '\n')
      .replace(/<[^>]+>/gu, ' '),
  );
}

function extractBlocks(content, type) {
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

function tokenizeText(text, { dedupe = false } = {}) {
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

function processTerm(term) {
  const normalized = String(term || '').toLowerCase();
  if (!normalized || LOW_INFORMATION_TERMS.has(normalized)) return null;
  return normalized;
}

function getProcessedQueryTerms(query) {
  return extractTokens(query).map(processTerm).filter(Boolean);
}

function stripMarkup(content, type = '') {
  return normalizeWhitespace(
    extractBlocks(content, type)
      .map((block) => block.text)
      .join('\n'),
  );
}

function normalizePhrase(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/^(?:请问|请|麻烦|帮我|给我|我想|我要|告诉我|查一下|看一下|看看)+/gu, '')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gu, '');
}

function expandQuery(query) {
  let expanded = String(query || '');
  for (const rule of QUERY_ALIAS_RULES) {
    if (rule.pattern.test(expanded)) expanded += rule.append;
    rule.pattern.lastIndex = 0;
  }
  return expanded;
}

function buildSearchBundle(rows) {
  const documents = [];
  for (const row of rows) {
    const chunks = splitKnowledgeContent(row.content, row.type);
    const fallbackText = stripMarkup(row.content, row.type);
    const usableChunks = chunks.length ? chunks : fallbackText ? [{ heading: '', content: fallbackText }] : [];
    usableChunks.forEach((chunk, index) => {
      documents.push({
        id: `${row.id}::${index}`,
        knowledgeId: String(row.id || ''),
        title: String(row.title || ''),
        heading: String(chunk.heading || ''),
        content: String(chunk.content || ''),
        category: String(row.category || ''),
        status: String(row.status || 'internal'),
      });
    });
  }

  const index = new MiniSearch({
    fields: ['title', 'heading', 'content'],
    storeFields: ['knowledgeId', 'title', 'heading', 'content', 'category', 'status'],
    tokenize: (text) => tokenizeText(text),
    processTerm,
  });
  index.addAll(documents);
  return { index, rows, documentCount: documents.length };
}

function clearCacheKey(key) {
  cacheGenerations.set(key, (cacheGenerations.get(key) || 0) + 1);
  cache.delete(key);
  cachePromises.delete(key);
  const timer = cacheTimers.get(key);
  if (timer) clearTimeout(timer);
  cacheTimers.delete(key);
}

/** 写知识库成功后调用；不传参数时同时清理公开与 Root 索引。 */
export function invalidateKnowledgeCache(key) {
  if (key) {
    clearCacheKey(key);
    return;
  }
  for (const cacheKey of new Set(['public', 'all', ...cache.keys(), ...cachePromises.keys(), ...cacheTimers.keys()])) {
    clearCacheKey(cacheKey);
  }
}

async function loadSearchBundle(onlyPublic) {
  const key = onlyPublic ? 'public' : 'all';
  if (cache.has(key)) return cache.get(key);
  if (cachePromises.has(key)) return cachePromises.get(key);
  const generation = cacheGenerations.get(key) || 0;

  const loading = (async () => {
    const whereClause = onlyPublic ? " WHERE status = 'public'" : '';
    const [rows] = await pool.query(
      `SELECT id, title, content, type, category, status
         FROM knowledge_base${whereClause} ORDER BY sort ASC, created_at ASC`,
    );
    const bundle = buildSearchBundle(rows);
    if ((cacheGenerations.get(key) || 0) === generation) {
      cache.set(key, bundle);
      const timer = setTimeout(() => {
        if ((cacheGenerations.get(key) || 0) === generation && cache.get(key) === bundle) {
          clearCacheKey(key);
        }
      }, CACHE_TTL);
      timer.unref?.();
      cacheTimers.set(key, timer);
    }
    return bundle;
  })();

  cachePromises.set(key, loading);
  try {
    return await loading;
  } finally {
    if (cachePromises.get(key) === loading) cachePromises.delete(key);
  }
}

function exactPhraseBoost(result, originalQuery) {
  const query = normalizePhrase(originalQuery);
  if (query.length < 2) return 1;
  const title = normalizePhrase(result.title);
  const heading = normalizePhrase(result.heading);
  const content = normalizePhrase(result.content);
  if (title.includes(query)) return 2.4;
  if (heading.includes(query)) return 1.8;
  if (content.includes(query)) return 1.35;
  return 1;
}

function isWithinOneEdit(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  if (i < a.length || j < b.length) edits += 1;
  return edits <= 1;
}

function evaluateCandidate(result, originalQuery, searchQuery, phase) {
  const queryTerms = getProcessedQueryTerms(searchQuery);
  const matched = new Set((result.terms || []).map((term) => String(term).toLowerCase()));
  const matchEntries = Object.entries(result.match || {});
  const matchedFieldCount = (field) =>
    queryTerms.filter((queryTerm) =>
      matchEntries.some(
        ([derivedTerm, fields]) =>
          Array.isArray(fields) &&
          fields.includes(field) &&
          (queryTerm === derivedTerm ||
            (phase === 'fuzzy' && queryTerm.length >= 4 && isWithinOneEdit(queryTerm, derivedTerm))),
      ),
    ).length;
  const titleMatchedCount = matchedFieldCount('title');
  const headingMatchedCount = matchedFieldCount('heading');
  const distinctiveTitleOrHeadingMatched = queryTerms.some((queryTerm) => {
    const distinctive = /^[a-z0-9]{3,}$/iu.test(queryTerm) || queryTerm.length >= 4;
    if (!distinctive) return false;
    return matchEntries.some(
      ([derivedTerm, fields]) =>
        Array.isArray(fields) &&
        fields.some((field) => field === 'title' || field === 'heading') &&
        (queryTerm === derivedTerm ||
          (phase === 'fuzzy' && queryTerm.length >= 4 && isWithinOneEdit(queryTerm, derivedTerm))),
    );
  });
  const matchedCount = queryTerms.filter((term) => {
    if (matched.has(term)) return true;
    if (phase !== 'fuzzy' || term.length < 4) return false;
    return [...matched].some((candidate) => isWithinOneEdit(term, candidate));
  }).length;
  const coverage = queryTerms.length ? matchedCount / queryTerms.length : 0;
  const phraseBoost = exactPhraseBoost(result, originalQuery);
  const longTermMatched = queryTerms.some(
    (term) => term.length >= 4 && [...matched].some((candidate) => isWithinOneEdit(term, candidate)),
  );
  const phaseWeight = phase === 'exact' ? 1 : phase === 'alias' ? 0.85 : 0.62;
  const fieldBoost = 1 + Math.min(titleMatchedCount * 0.75, 3.75) + Math.min(headingMatchedCount * 0.25, 1);
  const score =
    Number(result.score || 0) *
    phraseBoost *
    phaseWeight *
    fieldBoost *
    (0.8 + Math.min(coverage, 1) * 0.4);
  const confident =
    phraseBoost > 1 ||
    distinctiveTitleOrHeadingMatched ||
    matchedCount >= 2 ||
    (queryTerms.length <= 1 && matchedCount === 1) ||
    (phase === 'fuzzy' && longTermMatched);
  return { ...result, score, confident, coverage, matchedCount };
}

function runSearch(index, originalQuery, searchQuery, phase, candidateLimit) {
  const fuzzy = phase === 'fuzzy';
  const raw = index.search(searchQuery, {
    boost: { title: 5, heading: 2.5, content: 1 },
    combineWith: 'OR',
    tokenize: (text) => tokenizeText(text, { dedupe: true }),
    prefix: (term) => /^[a-z0-9]+$/iu.test(term) && term.length >= 3,
    fuzzy: fuzzy ? (term) => (term.length >= 4 ? 0.2 : false) : false,
    maxFuzzy: 1,
    weights: { fuzzy: 0.2, prefix: 0.35 },
  });
  return raw
    .slice(0, candidateLimit)
    .map((result) => evaluateCandidate(result, originalQuery, searchQuery, phase))
    .filter((result) => result.confident)
    .sort((a, b) => b.score - a.score);
}

function dedupeKnowledgeResults(results, topK) {
  const seen = new Set();
  const deduped = [];
  for (const result of results) {
    const knowledgeId = String(result.knowledgeId || '');
    if (!knowledgeId || seen.has(knowledgeId)) continue;
    seen.add(knowledgeId);
    const section = result.heading && result.heading !== result.title ? `${result.heading}\n` : '';
    deduped.push({
      id: knowledgeId,
      title: result.title || '',
      category: result.category || '',
      status: result.status || 'internal',
      content: `${section}${result.content || ''}`.slice(0, 900),
      score: result.score,
    });
    if (deduped.length >= topK) break;
  }
  return deduped;
}

function calculateLegacyScore(queryTokens, title, content) {
  const titleText = String(title || '').toLowerCase();
  const contentText = String(content || '').toLowerCase();
  let score = 0;
  for (const token of queryTokens) {
    if (titleText.includes(token)) score += 10;
    if (contentText.includes(token)) score += 3;
  }
  return score / Math.sqrt(contentText.length || 1);
}

function retrieveLegacy(rows, query, topK) {
  const queryTokens = extractTokens(query);
  if (!queryTokens.length) return [];
  return rows
    .map((row) => {
      const content = stripMarkup(row.content, row.type).slice(0, 3000);
      return {
        id: String(row.id || ''),
        title: row.title || '',
        category: row.category || '',
        status: row.status || 'internal',
        content: content.slice(0, 800),
        score: calculateLegacyScore(queryTokens, row.title, content),
      };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * 检索知识库。默认使用本地 MiniSearch BM25+ 分块索引；设置
 * KNOWLEDGE_SEARCH_ENGINE=legacy 可在异常时快速回退旧匹配算法。
 */
export async function retrieve(_userId, query, topK = 3, onlyPublic = true) {
  const normalizedQuery = String(query || '').trim();
  if (!normalizedQuery || topK <= 0) return [];
  const bundle = await loadSearchBundle(onlyPublic);
  if (!bundle.rows.length) return [];
  if (process.env.KNOWLEDGE_SEARCH_ENGINE === 'legacy') {
    return retrieveLegacy(bundle.rows, normalizedQuery, topK);
  }

  try {
    const candidateLimit = Math.min(
      MAX_SEARCH_CANDIDATES,
      Math.max(topK * SEARCH_RESULT_MULTIPLIER, topK),
    );
    let candidates = runSearch(bundle.index, normalizedQuery, normalizedQuery, 'exact', candidateLimit);
    if (!candidates.length) {
      const expanded = expandQuery(normalizedQuery);
      if (expanded !== normalizedQuery) {
        candidates = runSearch(bundle.index, normalizedQuery, expanded, 'alias', candidateLimit);
      }
    }
    if (!candidates.length) {
      candidates = runSearch(bundle.index, normalizedQuery, expandQuery(normalizedQuery), 'fuzzy', candidateLimit);
    }
    return dedupeKnowledgeResults(candidates, topK);
  } catch (error) {
    console.error('[knowledge-search] MiniSearch 检索失败，回退旧算法:', error?.message || error);
    return retrieveLegacy(bundle.rows, normalizedQuery, topK);
  }
}
