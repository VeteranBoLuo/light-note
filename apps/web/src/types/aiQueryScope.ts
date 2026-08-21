export type AiQueryCompleteness = 'complete' | 'partial';

export interface AiResolvedQueryRange {
  slot: string;
  expression: string;
  description: string;
  localStart: string;
  localEndExclusive: string;
  timeZone: string;
}

export interface AiQueryScopeProjection {
  completeness: AiQueryCompleteness;
  truncated: boolean;
  truncationReason: string | null;
}

/**
 * 服务端查询结果契约的安全公开投影。
 *
 * 它只用于向客户端保存/核验本轮真实查询口径，不包含工具原始结果、资源正文或存储时区，
 * 也不得被客户端反向拼成下一轮材料或工具参数。
 */
export interface AiQueryScope {
  schemaVersion: 1;
  tool: string;
  total: number | null;
  returned: number;
  totalExact: boolean;
  completeness: AiQueryCompleteness;
  truncated: boolean;
  truncationReason: string | null;
  stableReferenceCount: number;
  stableIdCoverage: AiQueryCompleteness;
  projection: AiQueryScopeProjection;
  resolvedRanges: AiResolvedQueryRange[];
}

const COMPLETENESS = new Set<AiQueryCompleteness>(['complete', 'partial']);

function safeCount(value: unknown): number | null {
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

function safeIdentifier(value: unknown, maxLength: number) {
  const identifier = String(value || '')
    .trim()
    .slice(0, maxLength + 1);
  return identifier.length <= maxLength && /^[A-Za-z][A-Za-z0-9_.-]*$/.test(identifier) ? identifier : '';
}

function safeText(value: unknown, maxLength: number) {
  return String(value || '')
    .trim()
    .slice(0, maxLength);
}

function safeNullableIdentifier(value: unknown, maxLength: number) {
  const identifier = safeIdentifier(value, maxLength);
  return identifier || null;
}

function normalizeCompleteness(value: unknown): AiQueryCompleteness | null {
  const completeness = String(value || '') as AiQueryCompleteness;
  return COMPLETENESS.has(completeness) ? completeness : null;
}

function normalizeResolvedRanges(value: unknown): AiResolvedQueryRange[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const raw = item as Record<string, unknown>;
      const slot = safeIdentifier(raw.slot, 64);
      const description = safeText(raw.description, 240);
      const timeZone = safeText(raw.timeZone, 64);
      if (!slot || !description || !timeZone || !/^[A-Za-z0-9_+:/.-]+$/.test(timeZone)) return null;
      return {
        slot,
        expression: safeText(raw.expression, 80),
        description,
        localStart: safeText(raw.localStart, 32),
        localEndExclusive: safeText(raw.localEndExclusive, 32),
        timeZone,
      };
    })
    .filter((item): item is AiResolvedQueryRange => Boolean(item))
    .slice(0, 8);
}

export function normalizeAiQueryScopes(value: unknown): AiQueryScope[] {
  if (!Array.isArray(value)) return [];
  const scopes: AiQueryScope[] = [];
  for (const item of value.slice(0, 20)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const raw = item as Record<string, unknown>;
    const tool = safeIdentifier(raw.tool, 64);
    const returned = safeCount(raw.returned);
    const completeness = normalizeCompleteness(raw.completeness);
    const stableIdCoverage = normalizeCompleteness(raw.stableIdCoverage);
    const projectionRaw =
      raw.projection && typeof raw.projection === 'object' && !Array.isArray(raw.projection)
        ? (raw.projection as Record<string, unknown>)
        : null;
    const projectionCompleteness = normalizeCompleteness(projectionRaw?.completeness);
    if (
      Number(raw.schemaVersion) !== 1 ||
      !tool ||
      returned == null ||
      !completeness ||
      !stableIdCoverage ||
      !projectionRaw ||
      !projectionCompleteness
    ) {
      continue;
    }
    const total = raw.total == null ? null : safeCount(raw.total);
    const totalExact = raw.totalExact === true && total != null;
    scopes.push({
      schemaVersion: 1,
      tool,
      total: totalExact ? total : null,
      returned,
      totalExact,
      completeness,
      truncated: raw.truncated === true,
      truncationReason: safeNullableIdentifier(raw.truncationReason, 64),
      stableReferenceCount: safeCount(raw.stableReferenceCount) ?? 0,
      stableIdCoverage,
      projection: {
        completeness: projectionCompleteness,
        truncated: projectionRaw.truncated === true,
        truncationReason: safeNullableIdentifier(projectionRaw.truncationReason, 64),
      },
      resolvedRanges: normalizeResolvedRanges(raw.resolvedRanges),
    });
  }
  return scopes;
}
