export type ToolboxCoverageIssueKind =
  | 'bookmarkMetadataOnly'
  | 'drawingNoText'
  | 'noReadableText'
  | 'fileNotReady'
  | 'uploadIncomplete'
  | 'unavailable'
  | 'contentTruncated'
  | 'recognitionFallback'
  | 'recognitionUncertain'
  | 'retrievalNotExhaustive'
  | 'selectedNotRepresented'
  | 'coverageUnavailable'
  | 'partial';

export type ToolboxSourceState = 'complete' | 'partial' | 'unavailable';

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as UnknownRecord) : null;
}

function primitiveText(value: unknown) {
  return ['string', 'number'].includes(typeof value) ? String(value).trim() : '';
}

function sourceIdentity(source: UnknownRecord) {
  const type = toolboxSourceType(source);
  let id = primitiveText(source.resourceId) || primitiveText(source.id);
  if (!primitiveText(source.resourceId) && id.startsWith(`${type}:`)) id = id.slice(type.length + 1);
  return type !== 'unknown' && id ? `${type}:${id}` : '';
}

function normalizedCoverageResource(source: UnknownRecord) {
  const complete = source.coverageComplete;
  return {
    ...source,
    resourceType: primitiveText(source.resourceType) || primitiveText(source.type),
    resourceId: primitiveText(source.resourceId) || primitiveText(source.id),
    coverage: {
      ...(typeof complete === 'boolean' ? { complete } : {}),
      status: primitiveText(source.status),
      includedChars: source.includedChars,
      warnings: Array.isArray(source.warnings) ? source.warnings : [],
    },
  };
}

/**
 * AI 的 sources 只包含有可读证据的材料，coverage.resources 还包含空内容、解析中等材料。
 * 展示层在这里合并两者，既不丢失未参与项，也不把内部资源标识直接交给模板。
 */
export function toolboxArtifactSourceRecords(sources: unknown, coverage: unknown): UnknownRecord[] {
  const sourceList = (Array.isArray(sources) ? sources : []).map(asRecord).filter(Boolean) as UnknownRecord[];
  const coverageRecord = asRecord(coverage);
  const coverageList = (Array.isArray(coverageRecord?.resources) ? coverageRecord.resources : [])
    .map(asRecord)
    .filter(Boolean)
    .map((source) => normalizedCoverageResource(source as UnknownRecord));
  const coverageByIdentity = new Map(
    coverageList.map((source) => [sourceIdentity(source), source] as const).filter(([identity]) => identity),
  );
  const represented = new Set<string>();
  const merged = sourceList.map((source) => {
    const identity = sourceIdentity(source);
    const covered = identity ? coverageByIdentity.get(identity) : null;
    if (identity) represented.add(identity);
    if (!covered) return source;
    return {
      ...covered,
      ...source,
      coverage: { ...(asRecord(covered.coverage) || {}), ...(asRecord(source.coverage) || {}) },
    };
  });
  for (const source of coverageList) {
    const identity = sourceIdentity(source);
    if (!identity || represented.has(identity)) continue;
    merged.push(source);
  }
  return merged;
}

function warningCode(value: unknown) {
  const record = asRecord(value);
  const raw = primitiveText(record?.code) || primitiveText(record?.reason) || primitiveText(value);
  return raw.split(':', 1)[0].trim().toLowerCase();
}

export function toolboxCoverageIssueKind(value: unknown): ToolboxCoverageIssueKind {
  const code = warningCode(value);
  if (code.includes('bookmark_page_content_unavailable')) return 'bookmarkMetadataOnly';
  if (code.includes('note_drawing_no_text')) return 'drawingNoText';
  if (
    ['note_empty', 'todo_empty', 'file_no_readable_text', 'no_text', 'empty'].includes(code) ||
    code.includes('ocr_empty')
  )
    return 'noReadableText';
  if (['file_not_parsed', 'file_parsing_queued', 'file_parsing_in_progress'].includes(code)) return 'fileNotReady';
  if (code === 'file_upload_incomplete') return 'uploadIncomplete';
  if (code === 'file_parsing_failed' || code === 'resource_unavailable') return 'unavailable';
  if (
    code === 'resource_content_truncated' ||
    code === 'source_content_incomplete' ||
    code.startsWith('source_coverage_') ||
    code.includes('truncated')
  )
    return 'contentTruncated';
  if (code === 'image_recognition_fallback') return 'recognitionFallback';
  if (code === 'image_recognition_uncertain') return 'recognitionUncertain';
  if (code === 'semantic_retrieval_not_exhaustive') return 'retrievalNotExhaustive';
  if (code === 'selected_resource_not_represented') return 'selectedNotRepresented';
  if (code === 'coverage_missing') return 'coverageUnavailable';
  return 'partial';
}

export function toolboxCoverageIssueKinds(values: unknown): ToolboxCoverageIssueKind[] {
  const list = Array.isArray(values) ? values : values == null ? [] : [values];
  return [...new Set(list.map(toolboxCoverageIssueKind))];
}

export function toolboxSourceType(source: UnknownRecord): 'bookmark' | 'note' | 'file' | 'todo' | 'unknown' {
  const type = primitiveText(source.resourceType) || primitiveText(source.type);
  return ['bookmark', 'note', 'file', 'todo'].includes(type)
    ? (type as 'bookmark' | 'note' | 'file' | 'todo')
    : 'unknown';
}

export function toolboxSourceLocator(source: UnknownRecord): { type: string; value: string } | null {
  const locator = source.locator;
  const record = asRecord(locator);
  if (record) {
    const type = primitiveText(record.type);
    const value = primitiveText(record.value);
    return type || value ? { type, value } : null;
  }
  const value = primitiveText(locator);
  return value && value !== '[object Object]' ? { type: '', value } : null;
}

export function toolboxSourceIncludedChars(source: UnknownRecord) {
  const coverage = asRecord(source.coverage);
  const candidate = coverage?.includedChars ?? source.includedChars;
  const value = Number(candidate);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

export function toolboxSourceExcerpt(source: UnknownRecord) {
  const excerpt = primitiveText(source.excerpt);
  return excerpt.length > 240 ? `${excerpt.slice(0, 239)}…` : excerpt;
}

export function toolboxSourceStatus(source: UnknownRecord) {
  const coverage = asRecord(source.coverage);
  return (primitiveText(coverage?.status) || primitiveText(source.status)).toLowerCase();
}

export function toolboxSourceWarningKinds(source: UnknownRecord) {
  const coverage = asRecord(source.coverage);
  return toolboxCoverageIssueKinds(coverage?.warnings ?? source.warnings);
}

export function toolboxSourceState(source: UnknownRecord): ToolboxSourceState {
  const coverage = asRecord(source.coverage);
  const status = toolboxSourceStatus(source);
  const warnings = toolboxSourceWarningKinds(source);
  const includedChars = toolboxSourceIncludedChars(source);
  if (
    ['failed', 'empty', 'no_text', 'unavailable', 'parsing', 'queued', 'not_parsed', 'awaiting_upload'].includes(
      status,
    ) &&
    includedChars === 0
  )
    return 'unavailable';
  if (status === 'metadata_only' || coverage?.complete === false || warnings.length) return 'partial';
  return 'complete';
}

export function toolboxSourceFileType(source: UnknownRecord) {
  const value = primitiveText(source.fileType);
  if (!value) return '';
  const subtype = value.includes('/') ? value.split('/').pop() || value : value;
  return subtype.replace('jpeg', 'JPG').replace('plain', 'TXT').toUpperCase();
}
