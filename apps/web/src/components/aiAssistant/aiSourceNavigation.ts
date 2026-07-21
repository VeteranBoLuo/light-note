export type AiSourceType = 'note' | 'bookmark' | 'file' | 'knowledge' | 'document' | 'tag' | 'folder' | 'web' | 'todo';

export type AiSourceTarget =
  | 'note-detail'
  | 'bookmark-url'
  | 'bookmark-edit'
  | 'bookmark-snapshot'
  | 'cloud-file'
  | 'cloud-folder'
  | 'help-article'
  // 仅兼容已保存在浏览器中的旧来源；公开知识不再跳转 SEO 页面。
  | 'public-knowledge'
  | 'knowledge-admin'
  | 'tag-detail'
  | 'todo-inbox'
  | 'web-url'
  | 'temporary-document';

export interface AiCoverageCounts {
  chars: number;
  pages: number;
  chunks: number;
}

export interface AiCoverageFailedRange {
  unit?: string;
  start?: number;
  end?: number;
  code?: string;
  reason?: string;
  /** 兼容早期来源协议。 */
  type?: string;
  /** 兼容早期来源协议。 */
  value?: string;
}

export interface AiCoverageReason {
  code?: string;
  message?: string;
}

export interface AiSourceCoverage {
  metadataAvailable: boolean;
  complete: boolean;
  truncated: boolean;
  coverageRatio: number | null;
  total: AiCoverageCounts;
  processed: AiCoverageCounts;
  failedRanges?: AiCoverageFailedRange[];
  reasons?: AiCoverageReason[];
  parserVersion?: string;
}

export interface AiCoverageSelection {
  mode?: string;
  available?: Partial<AiCoverageCounts>;
  scanned?: Partial<AiCoverageCounts>;
  included?: Partial<AiCoverageCounts>;
  scanRatio?: number | null;
  contextRatio?: number | null;
  outputChars?: number;
  chapterCount?: number;
}

export interface AiDocumentCoverageEntry {
  sourceId: string;
  fileName: string;
  status?: string;
  parse: AiSourceCoverage;
  selection?: AiCoverageSelection;
  fullDocumentClaimAllowed?: boolean;
}

export interface AiCoverageLimitation {
  sourceId?: string;
  fileName?: string;
  code?: string;
  message?: string;
}

export interface AiCoverageOverall extends AiSourceCoverage {
  documentCount?: number;
  fullDocumentClaimAllowed?: boolean;
  failedRangeCount?: number;
  limitations?: AiCoverageLimitation[];
  selection?: {
    available?: Partial<AiCoverageCounts>;
    scanned?: Partial<AiCoverageCounts>;
    included?: Partial<AiCoverageCounts>;
    scanRatio?: number | null;
    contextRatio?: number | null;
  };
}

export interface AiCoverageReport {
  documents: AiDocumentCoverageEntry[];
  overall?: AiCoverageOverall | null;
}

export interface AiEvidenceLocator {
  type?: string;
  value?: string;
  label?: string;
  page?: number | string;
  section?: string;
  paragraph?: number | string;
  start?: number | string;
  end?: number | string;
}

export interface AiEvidenceReference {
  citationKey: string;
  evidenceRef?: string;
  sourceId?: string;
  resourceId?: string;
  sourceTitle?: string;
  excerpt?: string;
  locator?: AiEvidenceLocator | null;
  resourceVersion?: string;
}

export interface AiSource {
  type: AiSourceType;
  id: string;
  title: string;
  url?: string;
  excerpt?: string;
  target?: AiSourceTarget;
  documentId?: string;
  fileId?: string;
  sourceType?: 'temporary' | 'cloud';
  locatorType?: 'page' | 'section' | 'row' | 'paragraph';
  locatorValue?: string;
  category?: string;
  status?: 'public' | 'internal';
  hasSnapshot?: boolean;
  coverage?: AiSourceCoverage;
  evidence?: AiEvidenceReference[];
  citationKey?: string;
  evidenceRef?: string;
  sourceId?: string;
  resourceId?: string;
  locator?: AiEvidenceLocator | null;
  resourceVersion?: string;
}

export type AiCoverageState = 'complete' | 'partial' | 'unknown' | 'failed';

export interface AiResolvedEvidence extends AiEvidenceReference {
  source?: AiSource;
}

export interface AiEvidenceGroup {
  citationKey: string;
  items: AiResolvedEvidence[];
}

export interface AiCoverageRangeLabels {
  range: string;
  units: Partial<Record<'page' | 'char' | 'chunk' | 'paragraph', string>>;
}

export interface AiEvidenceLocatorLabels {
  types: Partial<Record<'page' | 'section' | 'paragraph' | 'row' | 'chunk' | 'status', string>>;
  pageValue: (value: string) => string;
  sectionValue: (value: string) => string;
  paragraphValue: (value: string) => string;
}

export type AiSourceNavigation =
  | { kind: 'internal'; target: string | { path: string; query?: Record<string, string> } }
  | { kind: 'external'; url: string }
  | { kind: 'none' };

function finiteRatio(value: unknown): number | null {
  if (value == null || value === '') return null;
  const ratio = Number(value);
  return Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : null;
}

function countCoverageUnits(value?: Partial<AiCoverageCounts>) {
  if (!value) return 0;
  return ['chars', 'pages', 'chunks'].reduce((total, unit) => {
    const count = Number(value[unit as keyof AiCoverageCounts]);
    return total + (Number.isFinite(count) ? Math.max(0, count) : 0);
  }, 0);
}

export function getAiCoverageRatio(coverage?: AiSourceCoverage | null): number | null {
  return finiteRatio(coverage?.coverageRatio);
}

export function resolveAiCoverageState(coverage?: AiSourceCoverage | null, sourceStatus = ''): AiCoverageState {
  if (sourceStatus === 'failed') return 'failed';
  if (!coverage || coverage.metadataAvailable === false || getAiCoverageRatio(coverage) == null) return 'unknown';
  if (coverage.complete && !coverage.truncated && getAiCoverageRatio(coverage)! >= 0.9999) return 'complete';
  const processed = countCoverageUnits(coverage.processed);
  const hasFailure = Boolean(coverage.failedRanges?.length || coverage.reasons?.length);
  if (processed === 0 && hasFailure) return 'failed';
  return 'partial';
}

export function formatAiCoverageRange(
  range: AiCoverageFailedRange,
  labels: Partial<AiCoverageRangeLabels> = {},
): string {
  const rawUnit = String(range.unit || range.type || labels.range || 'range').trim();
  const units = labels.units || {};
  const unit =
    {
      page: units.page || 'page',
      pages: units.page || 'page',
      char: units.char || 'character',
      chars: units.char || 'character',
      character: units.char || 'character',
      characters: units.char || 'character',
      chunk: units.chunk || 'chunk',
      chunks: units.chunk || 'chunk',
      paragraph: units.paragraph || 'paragraph',
      paragraphs: units.paragraph || 'paragraph',
    }[rawUnit.toLowerCase()] || rawUnit;
  const explicitValue = String(range.value || '').trim();
  const start = Number(range.start);
  const end = Number(range.end);
  const hasStart = Number.isFinite(start) && start >= 0;
  const hasEnd = Number.isFinite(end) && end >= 0;
  const coordinates = hasStart
    ? `${Math.trunc(start)}${hasEnd && end !== start ? `–${Math.trunc(end)}` : ''}`
    : explicitValue;
  const code = String(range.code || '').trim();
  return [coordinates ? `${unit} ${coordinates}` : unit, code ? `(${code})` : ''].filter(Boolean).join(' ');
}

export function formatAiEvidenceLocator(
  locator?: AiEvidenceLocator | null,
  labels: Partial<AiEvidenceLocatorLabels> = {},
): string {
  if (!locator) return '';
  const rawType = String(locator.type || '').trim();
  const types = labels.types || {};
  const type =
    {
      page: types.page || 'page',
      section: types.section || 'section',
      paragraph: types.paragraph || 'paragraph',
      row: types.row || 'row',
      chunk: types.chunk || 'chunk',
      status: types.status || 'status',
    }[rawType.toLowerCase()] || rawType;
  const value = String(locator.value || locator.label || '').trim();
  const start = String(locator.start ?? '').trim();
  const end = String(locator.end ?? '').trim();
  const coordinates = start ? `${start}${end && end !== start ? `–${end}` : ''}` : '';
  if (value) return [type, value, coordinates].filter(Boolean).join(' · ');
  if (locator.page != null && locator.page !== '') {
    const rawValue = String(locator.page);
    return [labels.pageValue?.(rawValue) || `${types.page || 'page'} ${rawValue}`, coordinates]
      .filter(Boolean)
      .join(' · ');
  }
  if (locator.section) {
    const rawValue = String(locator.section).trim();
    return [labels.sectionValue?.(rawValue) || `${types.section || 'section'} ${rawValue}`, coordinates]
      .filter(Boolean)
      .join(' · ');
  }
  if (locator.paragraph != null && locator.paragraph !== '') {
    const rawValue = String(locator.paragraph);
    return [labels.paragraphValue?.(rawValue) || `${types.paragraph || 'paragraph'} ${rawValue}`, coordinates]
      .filter(Boolean)
      .join(' · ');
  }
  return [type, coordinates].filter(Boolean).join(' · ');
}

function evidenceIdentity(item: AiEvidenceReference) {
  if (item.evidenceRef) return `ref:${item.evidenceRef}`;
  return [
    item.citationKey,
    item.sourceId || item.resourceId,
    item.resourceVersion,
    formatAiEvidenceLocator(item.locator),
    item.excerpt,
  ].join('|');
}

function sourceEvidenceKeys(source: AiSource) {
  return [
    source.id,
    source.sourceId,
    source.resourceId,
    `${source.type}:${source.id}`,
    source.documentId,
    source.fileId,
  ].filter((value): value is string => Boolean(value));
}

function compareCitationKeys(left: string, right: string) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
  return left.localeCompare(right, undefined, { numeric: true });
}

export function groupAiEvidence(sources: AiSource[], evidence: AiEvidenceReference[] = []): AiEvidenceGroup[] {
  const sourceByKey = new Map<string, AiSource | null>();
  for (const source of sources) {
    for (const key of sourceEvidenceKeys(source)) {
      const existing = sourceByKey.get(key);
      if (!sourceByKey.has(key) || (existing && existing.type === source.type && existing.id === source.id)) {
        sourceByKey.set(key, source);
      } else {
        // resourceId 在不同资源类型间可能重号；有歧义时宁可保持静态，也不导航到错误来源。
        sourceByKey.set(key, null);
      }
    }
  }
  const candidates: AiResolvedEvidence[] = evidence.map((item) => ({ ...item }));
  for (const source of sources) {
    for (const item of source.evidence || []) {
      candidates.push({
        ...item,
        sourceId: item.sourceId || source.sourceId || source.id,
        resourceId: item.resourceId || source.resourceId,
        sourceTitle: item.sourceTitle || source.title,
        excerpt: item.excerpt || source.excerpt,
        source,
      });
    }
    if (source.citationKey || source.evidenceRef) {
      candidates.push({
        citationKey: String(source.citationKey || '').trim(),
        evidenceRef: source.evidenceRef,
        sourceId: source.sourceId || source.id,
        resourceId: source.resourceId,
        sourceTitle: source.title,
        excerpt: source.excerpt,
        locator:
          source.locator ||
          (source.locatorType || source.locatorValue
            ? { type: source.locatorType, value: source.locatorValue }
            : undefined),
        resourceVersion: source.resourceVersion,
        source,
      });
    }
  }
  const seen = new Set<string>();
  const groups = new Map<string, AiResolvedEvidence[]>();
  for (const candidate of candidates) {
    const citationKey = String(candidate.citationKey || '').trim();
    if (!citationKey) continue;
    const normalized: AiResolvedEvidence = {
      ...candidate,
      citationKey,
      source:
        candidate.source ||
        sourceByKey.get(String(candidate.sourceId || '')) ||
        sourceByKey.get(String(candidate.resourceId || '')) ||
        undefined,
    };
    if (!normalized.sourceTitle) normalized.sourceTitle = normalized.source?.title;
    if (!normalized.excerpt) normalized.excerpt = normalized.source?.excerpt;
    if (!normalized.resourceVersion) normalized.resourceVersion = normalized.source?.resourceVersion;
    const identity = evidenceIdentity(normalized);
    if (seen.has(identity)) continue;
    seen.add(identity);
    const items = groups.get(citationKey) || [];
    items.push(normalized);
    groups.set(citationKey, items);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => compareCitationKeys(left, right))
    .map(([citationKey, items]) => ({ citationKey, items }));
}

export function normalizeSourceHref(value?: string): string {
  const raw = String(value || '').trim();
  if (!raw || raw.startsWith('//')) return '';
  try {
    if (raw.startsWith('/')) {
      const parsed = new URL(raw, 'https://light-note.invalid');
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    if (!/^https?:\/\//i.test(raw)) return '';
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return '';
    return parsed.href;
  } catch {
    return '';
  }
}

function internal(path: string, query?: Record<string, string>): AiSourceNavigation {
  return { kind: 'internal', target: query ? { path, query } : path };
}

function external(url?: string): AiSourceNavigation {
  const safeUrl = normalizeSourceHref(url);
  return safeUrl ? { kind: 'external', url: safeUrl } : { kind: 'none' };
}

function resolveExplicitTarget(source: AiSource): AiSourceNavigation | null {
  if (!source.target) return null;
  if (source.target === 'note-detail') return source.id ? internal(`/noteLibrary/${source.id}`) : { kind: 'none' };
  if (source.target === 'bookmark-url') return external(source.url);
  if (source.target === 'bookmark-edit')
    return source.id ? internal(`/manage/editBookmark/${source.id}`) : { kind: 'none' };
  if (source.target === 'bookmark-snapshot')
    return source.id ? internal('/manage/bookmarkMg', { snapshot: source.id }) : { kind: 'none' };
  if (source.target === 'cloud-file')
    return source.fileId || source.id
      ? internal('/cloudSpace', { fileId: String(source.fileId || source.id) })
      : { kind: 'none' };
  if (source.target === 'cloud-folder')
    return source.id ? internal('/cloudSpace', { folderId: source.id }) : { kind: 'none' };
  if (source.target === 'help-article') return source.id ? internal('/help', { article: source.id }) : { kind: 'none' };
  if (source.target === 'public-knowledge') return { kind: 'none' };
  if (source.target === 'knowledge-admin')
    return source.id ? internal('/knowledgeBase', { article: source.id }) : { kind: 'none' };
  if (source.target === 'tag-detail') return source.id ? internal(`/tag/${source.id}`) : { kind: 'none' };
  if (source.target === 'todo-inbox') return internal('/inbox');
  if (source.target === 'web-url' || source.target === 'temporary-document') return external(source.url);
  return { kind: 'none' };
}

export function resolveAiSourceNavigation(source: AiSource): AiSourceNavigation {
  const explicit = resolveExplicitTarget(source);
  if (explicit) return explicit;

  // 兼容上线前已经保存在浏览器本地的旧会话；新来源均应由服务端显式返回 target。
  if (source.type === 'note') return source.id ? internal(`/noteLibrary/${source.id}`) : { kind: 'none' };
  if (source.type === 'file') return source.id ? internal('/cloudSpace', { fileId: source.id }) : { kind: 'none' };
  if (source.type === 'document') {
    if (source.fileId && source.sourceType !== 'temporary') {
      return internal('/cloudSpace', { fileId: source.fileId });
    }
    return external(source.url);
  }
  if (source.type === 'knowledge') {
    if (!source.id) return { kind: 'none' };
    if (source.status === 'public' && source.category === '帮助中心') {
      return internal('/help', { article: source.id });
    }
    return { kind: 'none' };
  }
  if (source.type === 'bookmark') {
    const urlNavigation = external(source.url);
    if (urlNavigation.kind !== 'none') return urlNavigation;
    return source.id ? internal(`/manage/editBookmark/${source.id}`) : { kind: 'none' };
  }
  if (source.type === 'tag') return source.id ? internal(`/tag/${source.id}`) : { kind: 'none' };
  if (source.type === 'folder') return source.id ? internal('/cloudSpace', { folderId: source.id }) : { kind: 'none' };
  if (source.type === 'todo') return internal('/inbox');
  if (source.type === 'web') return external(source.url);
  return { kind: 'none' };
}
