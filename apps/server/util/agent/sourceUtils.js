import { stableAgentErrorCode } from './logSafety.js';

const SOURCE_TYPES = new Set(['note', 'bookmark', 'file', 'knowledge', 'document', 'tag', 'folder', 'web']);

const SOURCE_TARGETS = new Set([
  'note-detail',
  'bookmark-url',
  'bookmark-edit',
  'bookmark-snapshot',
  'cloud-file',
  'cloud-folder',
  'help-article',
  'knowledge-admin',
  'tag-detail',
  'web-url',
  'temporary-document',
]);

const TARGETS_REQUIRING_ID = new Set([
  'note-detail',
  'bookmark-edit',
  'bookmark-snapshot',
  'cloud-file',
  'cloud-folder',
  'help-article',
  'knowledge-admin',
  'tag-detail',
]);

function boundedText(value, maxLength) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function boundedCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? Math.min(Math.trunc(count), Number.MAX_SAFE_INTEGER) : 0;
}

function normalizeCoverageCounts(value) {
  const input = value && typeof value === 'object' ? value : {};
  return {
    chars: boundedCount(input.chars),
    pages: boundedCount(input.pages),
    chunks: boundedCount(input.chunks),
  };
}

function normalizeSourceCoverage(value) {
  if (!value || typeof value !== 'object') return undefined;
  const ratio = value.coverageRatio == null ? null : Number(value.coverageRatio);
  const failedRanges = Array.isArray(value.failedRanges)
    ? value.failedRanges.slice(0, 20).map((range) => ({
        ...(boundedText(range?.unit, 24) ? { unit: boundedText(range.unit, 24) } : {}),
        ...(Number.isFinite(Number(range?.start)) ? { start: Math.max(0, Number(range.start)) } : {}),
        ...(Number.isFinite(Number(range?.end)) ? { end: Math.max(0, Number(range.end)) } : {}),
        ...(boundedText(range?.code, 64) ? { code: boundedText(range.code, 64) } : {}),
        ...(boundedText(range?.type, 24) ? { type: boundedText(range.type, 24) } : {}),
        ...(boundedText(range?.value, 120) ? { value: boundedText(range.value, 120) } : {}),
        ...(boundedText(range?.reason, 160) ? { reason: boundedText(range.reason, 160) } : {}),
      }))
    : [];
  const reasons = Array.isArray(value.reasons)
    ? value.reasons.slice(0, 12).map((reason) => ({
        ...(boundedText(reason?.code, 64) ? { code: boundedText(reason.code, 64) } : {}),
        ...(boundedText(reason?.message, 240) ? { message: boundedText(reason.message, 240) } : {}),
      }))
    : [];
  return {
    metadataAvailable: Boolean(value.metadataAvailable),
    complete: Boolean(value.complete),
    truncated: Boolean(value.truncated),
    coverageRatio: Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : null,
    total: normalizeCoverageCounts(value.total),
    processed: normalizeCoverageCounts(value.processed),
    ...(boundedText(value.parserVersion, 48) ? { parserVersion: boundedText(value.parserVersion, 48) } : {}),
    ...(failedRanges.length ? { failedRanges } : {}),
    ...(reasons.length ? { reasons } : {}),
  };
}

export function normalizeSourceUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : '';
  } catch {
    return '';
  }
}

function inferTarget(type, url) {
  if (type === 'note') return 'note-detail';
  if (type === 'bookmark') return url ? 'bookmark-url' : 'bookmark-edit';
  if (type === 'file') return 'cloud-file';
  if (type === 'tag') return 'tag-detail';
  if (type === 'folder') return 'cloud-folder';
  if (type === 'web') return 'web-url';
  return undefined;
}

export function resolveKnowledgeSourceTarget(source, userRole) {
  if (source?.status === 'public' && source?.category === '帮助中心') return 'help-article';
  if (source?.status === 'internal' && userRole === 'root') return 'knowledge-admin';
  return undefined;
}

export function normalizeAgentSource(input) {
  if (!input || typeof input !== 'object') return null;
  const type = String(input.type || '').trim();
  if (!SOURCE_TYPES.has(type)) return null;

  const targetInput = input.target && typeof input.target === 'object' ? input.target : null;
  const url = normalizeSourceUrl(input.url || targetInput?.url);
  const resourceId = boundedText(input.resourceId, 255) || undefined;
  const fileId = boundedText(input.fileId || targetInput?.fileId, 255) || undefined;
  const documentId = boundedText(input.documentId, 255) || undefined;
  let id = resourceId || boundedText(input.id, 255);
  if (!id && type === 'document') id = documentId || fileId || '';
  if (!id && type === 'web') id = url;

  const requestedTarget = targetInput?.type || input.target;
  let target = SOURCE_TARGETS.has(requestedTarget) ? requestedTarget : inferTarget(type, url);
  if (target === 'bookmark-url' && !url) target = id ? 'bookmark-edit' : undefined;
  if (target === 'cloud-file' && type === 'document' && !fileId) target = undefined;
  if (target === 'web-url' && !url) return null;
  if (target === 'temporary-document' && !url) target = undefined;
  if (target && TARGETS_REQUIRING_ID.has(target) && !id) return null;

  // 临时文档的签名 URL 可能过期，仍保留其静态来源信息；其他来源必须有稳定标识或安全 URL。
  if (!id && !url) return null;
  if (type === 'knowledge' && !id) return null;

  const title = boundedText(input.title || input.name || input.fileName || input.file_name || url || '未命名', 160);
  if (!title) return null;
  const excerpt = boundedText(input.excerpt || input.content || input.description, 240);
  const locatorType = boundedText(input.locatorType || input.locator?.type, 24);
  const locatorValue = boundedText(input.locatorValue || input.locator?.value, 160);
  const category = boundedText(input.category, 50);
  const coverage = normalizeSourceCoverage(input.coverage);
  const sourceId = boundedText(input.sourceId, 96);
  const evidenceRef = boundedText(input.evidenceRef, 96);
  const citationKey = boundedText(input.citationKey, 32);
  const resourceVersion = boundedText(input.resourceVersion, 96);

  return {
    type,
    id,
    ...(sourceId ? { sourceId } : {}),
    ...(resourceId ? { resourceId } : {}),
    title,
    ...(url ? { url } : {}),
    ...(excerpt ? { excerpt } : {}),
    ...(target ? { target } : {}),
    ...(documentId ? { documentId } : {}),
    ...(fileId ? { fileId } : {}),
    ...(['temporary', 'cloud'].includes(input.sourceType) ? { sourceType: input.sourceType } : {}),
    ...(['page', 'section', 'row', 'paragraph'].includes(locatorType) ? { locatorType } : {}),
    ...(locatorValue ? { locatorValue } : {}),
    ...(evidenceRef ? { evidenceRef } : {}),
    ...(citationKey ? { citationKey } : {}),
    ...(resourceVersion ? { resourceVersion } : {}),
    ...(category ? { category } : {}),
    ...(['public', 'internal'].includes(input.status) ? { status: input.status } : {}),
    ...(typeof input.hasSnapshot === 'boolean' ? { hasSnapshot: input.hasSnapshot } : {}),
    ...(coverage ? { coverage } : {}),
  };
}

function sourceIdentity(source) {
  if (source.evidenceRef) return `evidence:${source.evidenceRef}`;
  if (source.type === 'document') return `document:${source.documentId || source.fileId || source.id}`;
  if (source.type === 'web') return `web:${source.url}`;
  return `${source.type}:${source.id}`;
}

export function dedupeAgentSources(inputs) {
  const seen = new Set();
  const output = [];
  for (const input of Array.isArray(inputs) ? inputs : []) {
    const source = normalizeAgentSource(input);
    if (!source) continue;
    const identity = sourceIdentity(source);
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);
    output.push(source);
  }
  return output;
}

const PROTECTED_MARKDOWN_CODE = /(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`)/gu;
// 只排除紧跟 `(` 的内联链接(如 [1](url)),不再排除紧跟 `[` 的情况——连写 [3][4] 是两个独立引用,都应识别。
const CITATION_MARKER = /\[(\d+)\](?!\s*\()/gu;

function transformMarkdownOutsideCode(content, transform) {
  return String(content || '')
    .split(PROTECTED_MARKDOWN_CODE)
    .map((segment, index) => (index % 2 === 1 ? segment : transform(segment)))
    .join('');
}

/**
 * 只审计正文中的证据编号；代码块、行内代码和数字 Markdown 链接不是引用标记。
 */
export function auditAgentCitations(content, evidence = []) {
  const allowed = new Set(evidence.map((item) => String(item?.citationKey || '')).filter(Boolean));
  const cited = new Set();
  const invalid = new Set();
  transformMarkdownOutsideCode(content, (segment) => {
    for (const match of segment.matchAll(CITATION_MARKER)) {
      if (allowed.has(match[1])) cited.add(match[1]);
      else invalid.add(match[1]);
    }
    return segment;
  });
  return {
    citedKeys: [...cited],
    invalidKeys: [...invalid],
    verifiedCitationCount: cited.size,
    evidenceCount: evidence.length,
  };
}

/**
 * 模型偶尔会生成不存在的编号。保留结论文字供用户判断，但移除虚假的证据标记，
 * 防止它在界面上看起来像已经核验并可跳转的引用。
 */
export function removeInvalidAgentCitations(content, invalidKeys = []) {
  const invalid = new Set(invalidKeys.map(String).filter(Boolean));
  if (!invalid.size) return String(content || '');
  return transformMarkdownOutsideCode(content, (segment) =>
    segment.replace(CITATION_MARKER, (marker, key) => (invalid.has(String(key)) ? '' : marker)),
  );
}

function defaultRows(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.items)) return raw.items;
  return raw?.id ? [raw] : [];
}

function defaultSourceFromRow(tool, row) {
  const type = tool.sourceType;
  const url = type === 'bookmark' ? row.url : undefined;
  const target =
    typeof tool.sourceTarget === 'function'
      ? tool.sourceTarget(row)
      : tool.sourceTarget || inferTarget(type, normalizeSourceUrl(url));
  return {
    type,
    id: row.id ?? row.slug ?? row.fileId ?? row.file_id,
    title: row.title || row.name || row.fileName || row.file_name,
    url,
    excerpt: row.excerpt || row.content || row.description,
    target,
    hasSnapshot: typeof row.hasSnapshot === 'boolean' ? row.hasSnapshot : undefined,
  };
}

export function resolveToolSources(tool, raw, args, ctx) {
  try {
    const candidates =
      typeof tool?.toSources === 'function'
        ? tool.toSources(raw, args, ctx)
        : tool?.sourceType
          ? (typeof tool.sourceRows === 'function' ? tool.sourceRows(raw) : defaultRows(raw))
              .slice(0, 10)
              .map((row) => defaultSourceFromRow(tool, row))
          : [];
    return dedupeAgentSources(candidates).slice(0, 10);
  } catch (error) {
    console.error(
      '[Agent] source extraction failed tool=%s code=%s',
      tool?.name || 'unknown',
      stableAgentErrorCode(error),
    );
    return [];
  }
}
