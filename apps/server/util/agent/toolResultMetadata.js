import { projectAgentTemporalRanges } from './timeRange.js';
import { describeResolvedTimeRange } from './timeRange.js';

const RESULT_METADATA_VERSION = '0.1';

function finiteCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? Math.trunc(count) : null;
}

function freezeRanges(value = {}) {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(value || {}).map(([name, record]) => [
        String(name),
        Object.freeze({
          expression: String(record?.expression || '').trim(),
          range: record?.range || null,
          source: String(record?.source || '').trim() || 'tool',
        }),
      ]),
    ),
  );
}

/**
 * 列表/计数工具的最低结果闭环。cursor 留给 ResultSet 2.0；Phase 0B 先确保模型和
 * trace 能区分总量、实际返回量、完整/部分与截断原因。
 */
export function buildQueryResultMetadata({
  total,
  returned,
  exactTotal = true,
  coverage,
  truncationReason,
  resolvedRanges = {},
} = {}) {
  const normalizedTotal = finiteCount(total);
  const normalizedReturned = finiteCount(returned) ?? 0;
  const totalKnown = exactTotal === true && normalizedTotal != null;
  const complete =
    coverage === 'complete'
      ? true
      : coverage === 'partial'
        ? false
        : totalKnown && normalizedReturned >= normalizedTotal;
  const truncated = totalKnown ? normalizedReturned < normalizedTotal : Boolean(truncationReason === 'limit');
  return Object.freeze({
    version: RESULT_METADATA_VERSION,
    total: normalizedTotal,
    returned: normalizedReturned,
    totalExact: totalKnown,
    completeness: complete ? 'complete' : 'partial',
    complete,
    partial: !complete,
    truncated,
    truncationReason: truncationReason || (truncated ? 'limit' : !complete ? 'unknown_coverage' : null),
    resolvedRanges: freezeRanges(resolvedRanges),
  });
}

export function withQueryResultMetadata(
  result,
  { exactTotal = true, coverage, truncationReason, resolvedRanges = {} } = {},
) {
  const items = Array.isArray(result?.items) ? result.items : [];
  return {
    ...(result || {}),
    resultMetadata: buildQueryResultMetadata({
      total: result?.total,
      returned: items.length,
      exactTotal,
      coverage,
      truncationReason,
      resolvedRanges,
    }),
  };
}

/** 执行器补充稳定引用覆盖与两层文本预算截断，不修改工具的业务 raw。 */
export function finalizeToolResultMetadata({
  raw,
  args,
  dependencyRefs = [],
  summaryOriginalLength = 0,
  summaryReturnedLength = 0,
} = {}) {
  const items = Array.isArray(raw?.items) ? raw.items : Array.isArray(raw) ? raw : [];
  const hasExactTotal = raw && !Array.isArray(raw) && Number.isFinite(Number(raw.total));
  const base =
    raw?.resultMetadata ||
    buildQueryResultMetadata({
      total: raw && !Array.isArray(raw) ? raw.total : null,
      returned: items.length,
      exactTotal: hasExactTotal,
      coverage: hasExactTotal ? undefined : items.length ? 'partial' : 'complete',
    });
  const temporalRanges = projectAgentTemporalRanges(args);
  const stableReferenceCount = Array.isArray(dependencyRefs) ? dependencyRefs.length : 0;
  const stableIdCoverage = items.length === 0 || stableReferenceCount >= items.length ? 'complete' : 'partial';
  const summaryTruncated = summaryReturnedLength < summaryOriginalLength;
  return Object.freeze({
    ...base,
    resolvedRanges: Object.keys(temporalRanges).length ? temporalRanges : base.resolvedRanges,
    stableReferenceCount,
    stableIdCoverage,
    summary: Object.freeze({
      originalLength: finiteCount(summaryOriginalLength) ?? 0,
      returnedLength: finiteCount(summaryReturnedLength) ?? 0,
      truncated: summaryTruncated,
      truncationReason: summaryTruncated ? 'result_budget' : null,
    }),
  });
}

function formatResolvedRangeRecord(record, locale) {
  return describeResolvedTimeRange(record?.expression, record?.range, locale);
}

/**
 * 将结构化结果元数据渲染成给回答模型与用户核验的确定性事实。
 *
 * 这里不读取工具名、不猜业务语义：只披露工具已经证明的时间口径、返回量、总量和
 * 完整性。空字符串表示该结果没有值得披露的查询元数据（例如普通写操作）。
 */
export function formatToolResultMetadataDisclosure(metadata, locale = 'zh-CN') {
  if (!metadata || typeof metadata !== 'object') return '';
  const english = String(locale || '')
    .toLowerCase()
    .startsWith('en');
  const resolvedRanges = Object.values(metadata.resolvedRanges || {})
    .map((record) => formatResolvedRangeRecord(record, locale))
    .filter(Boolean);
  const returned = finiteCount(metadata.returned);
  const total = metadata.totalExact === true ? finiteCount(metadata.total) : null;
  const hasCount = returned != null && (total != null || returned > 0 || metadata.partial === true);
  const facts = [];

  if (resolvedRanges.length) {
    facts.push(`${english ? 'resolved range' : '时间范围'}: ${resolvedRanges.join('; ')}`);
  }
  if (hasCount) {
    facts.push(
      total == null
        ? `${english ? 'returned' : '已返回'} ${returned}${english ? ' items; exact total unavailable' : ' 条；总量未精确计算'}`
        : `${english ? 'returned' : '已返回'} ${returned}/${total}${english ? ' items' : ' 条'}`,
    );
  }
  if (metadata.partial === true || metadata.truncated === true) {
    const reason = String(metadata.truncationReason || '').trim();
    const reasonText =
      reason === 'limit'
        ? english
          ? 'limited by the result cap'
          : '受返回条数上限限制'
        : reason === 'result_budget'
          ? english
            ? 'limited by the result text budget'
            : '受结果文本预算限制'
          : english
            ? 'coverage is not complete'
            : '覆盖范围不完整';
    facts.push(`${english ? 'partial query set' : '查询集合为部分结果'} (${reasonText})`);
  } else if (metadata.complete === true && (hasCount || resolvedRanges.length)) {
    facts.push(english ? 'complete query set' : '查询集合完整');
  }

  if (metadata.summary?.truncated === true) {
    facts.push(
      english
        ? 'answer material is partial (limited by the result text budget)'
        : '回答材料为部分结果 (受结果文本预算限制)',
    );
  }

  if (!facts.length) return '';
  return `${english ? '[Verified query scope]' : '【已核验查询口径】'}${facts.join(english ? '; ' : '；')}`;
}

function publicRangeRecord(slot, record, locale) {
  const range = record?.range;
  if (!range?.localStart || !range?.localEnd || !range?.localEndExclusive || !range?.timeZone) return null;
  const description = formatResolvedRangeRecord(record, locale);
  if (!description) return null;
  const normalizedSlot = String(slot || '').trim();
  if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(normalizedSlot)) return null;
  return Object.freeze({
    slot: normalizedSlot,
    expression: String(record?.expression || '')
      .trim()
      .slice(0, 80),
    description: String(description).slice(0, 240),
    // 公开协议只允许用户本地边界；禁止在本地字段缺失时退回 SQL 存储时区边界。
    localStart: String(range.localStart || '').slice(0, 32),
    localEndExclusive: String(range.localEndExclusive || '').slice(0, 32),
    timeZone: String(range.timeZone || '').slice(0, 64),
  });
}

/**
 * 将成功读取工具的结果契约投影成可公开响应字段。
 *
 * 只输出计数、完整性、本地时间口径和稳定引用覆盖，不输出工具 raw、SQL 存储时区或资源正文。
 * 这让 SSE、普通响应和断流恢复都能确定性携带查询口径，不再依赖最终模型主动复述。
 */
export function buildPublicToolQueryScopes(toolResults = [], locale = 'zh-CN') {
  const scopes = [];
  for (const item of (Array.isArray(toolResults) ? toolResults : []).slice(0, 20)) {
    if (item?.status !== 'success' || !item?.resultMetadata || typeof item.resultMetadata !== 'object') continue;
    const metadata = item.resultMetadata;
    const returned = finiteCount(metadata.returned) ?? 0;
    const total = metadata.totalExact === true ? finiteCount(metadata.total) : null;
    const totalExact = metadata.totalExact === true && total != null;
    const resolvedRanges = Object.entries(metadata.resolvedRanges || {})
      .map(([slot, record]) => publicRangeRecord(slot, record, locale))
      .filter(Boolean);
    const hasQueryFacts = totalExact || metadata.partial === true || resolvedRanges.length > 0;
    if (!hasQueryFacts) continue;
    const summaryTruncated = metadata.summary?.truncated === true;
    scopes.push(
      Object.freeze({
        schemaVersion: 1,
        tool: String(item.name || '')
          .trim()
          .slice(0, 64),
        total,
        returned,
        totalExact,
        completeness: metadata.complete === true ? 'complete' : 'partial',
        truncated: metadata.truncated === true,
        truncationReason: metadata.truncationReason ? String(metadata.truncationReason).slice(0, 64) : null,
        stableReferenceCount: finiteCount(metadata.stableReferenceCount) ?? 0,
        stableIdCoverage: metadata.stableIdCoverage === 'complete' ? 'complete' : 'partial',
        projection: Object.freeze({
          completeness: summaryTruncated ? 'partial' : 'complete',
          truncated: summaryTruncated,
          truncationReason: summaryTruncated ? 'result_budget' : null,
        }),
        resolvedRanges: Object.freeze(resolvedRanges),
      }),
    );
  }
  return Object.freeze(scopes);
}

export const __testing = Object.freeze({ finiteCount, freezeRanges, formatResolvedRangeRecord, publicRangeRecord });
