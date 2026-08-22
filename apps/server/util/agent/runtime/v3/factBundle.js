import crypto from 'node:crypto';

const FACT_BUNDLE_VERSION = 1;
const MAX_FACTS = 80;
const MAX_INLINE_RESOURCES = 50;
const MAX_FACT_BYTES = 24_000;
const VALID_COMPLETENESS = new Set(['complete', 'partial', 'empty', 'unknown']);

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalValue(value[key])]),
  );
}

function digest(value) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(canonicalValue(value)))
    .digest('hex');
}

function boundedText(value, max = 240) {
  return String(value || '')
    .trim()
    .slice(0, max);
}

function finiteCount(value) {
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

function normalizeCompleteness(metadata = {}) {
  if (metadata.complete === true)
    return finiteCount(metadata.totalCount ?? metadata.total) === 0 ? 'empty' : 'complete';
  if (metadata.partial === true) return 'partial';
  const value = String(metadata.completeness || 'unknown');
  return VALID_COMPLETENESS.has(value) ? value : 'unknown';
}

function publicRangeQualifiers(metadata = {}) {
  const output = [];
  for (const [slot, record] of Object.entries(metadata.resolvedRanges || {})) {
    const range = record?.range || {};
    output.push(
      Object.freeze({
        slot: boundedText(slot, 64),
        expression: boundedText(record?.expression, 80),
        localStart: boundedText(range.localStart, 32),
        localEndExclusive: boundedText(range.localEndExclusive, 32),
        timeZone: boundedText(range.timeZone, 64),
      }),
    );
  }
  return Object.freeze(output.filter((item) => item.slot));
}

function safeResource(source = {}) {
  const type = boundedText(source.type || source.resourceType, 32);
  const id = boundedText(source.id || source.resourceId, 255);
  if (!type || !id) return null;
  let url = '';
  try {
    const parsed = new URL(String(source.url || ''));
    if (
      ['http:', 'https:'].includes(parsed.protocol) &&
      !parsed.username &&
      !parsed.password &&
      parsed.href.length <= 2_048
    ) {
      url = parsed.href;
    }
  } catch {
    url = '';
  }
  return Object.freeze({
    type,
    id,
    title: boundedText(source.title, 240),
    ...(url && /^https?:\/\//iu.test(url) ? { url } : {}),
  });
}

function freezeFact(value) {
  return Object.freeze({
    id: boundedText(value.id, 64),
    goalId: boundedText(value.goalId, 64),
    capabilityId: boundedText(value.capabilityId, 120),
    kind: boundedText(value.kind, 40),
    key: boundedText(value.key, 160),
    value: structuredClone(value.value),
    unit: boundedText(value.unit, 40),
    label: boundedText(value.label, 160),
    exact: value.exact === true,
    qualifiers: Object.freeze(canonicalValue(value.qualifiers || {})),
    evidenceRef: boundedText(value.evidenceRef, 128),
  });
}

function fitFacts(values = []) {
  const output = [];
  let bytes = 0;
  for (const value of values.slice(0, MAX_FACTS)) {
    const fact = freezeFact(value);
    const size = Buffer.byteLength(JSON.stringify(fact), 'utf8');
    if (bytes + size > MAX_FACT_BYTES) break;
    bytes += size;
    output.push(fact);
  }
  return Object.freeze(output);
}

/**
 * 将单次真实工具结果投影成请求级权威事实。
 *
 * 这里只消费 Manifest、结果元数据和工具已经公开投影的 sources；不读取工具名、不扫描
 * raw 对象，也不把正文写入事实包。新增工具只需遵守统一 resultContract/metadata/source
 * 协议，不需要在 Handler 增加分支。
 */
export function buildAgentFactBundle({ capability, toolRunId, goalId, result } = {}) {
  if (!capability || result?.status !== 'success') return null;
  const evidenceRef = boundedText(toolRunId, 128) || `tool:${capability.id}`;
  const resolvedGoalId = boundedText(goalId, 64) || capability.id;
  const metadata = result.resultMetadata || {};
  const completeness = normalizeCompleteness(metadata);
  const ranges = publicRangeQualifiers(metadata);
  const qualifiers = Object.freeze({ completeness, ranges });
  const facts = [];
  const total = metadata.totalExact === true ? finiteCount(metadata.totalCount ?? metadata.total) : null;
  const returned = finiteCount(metadata.returned);
  const entityType = boundedText(capability.resultContract?.entityType || capability.domains?.[0], 40) || 'item';

  if (total != null) {
    facts.push({
      goalId: resolvedGoalId,
      capabilityId: capability.id,
      kind: 'count',
      key: `${capability.id}.total`,
      value: total,
      unit: entityType,
      label: capability.label,
      exact: true,
      qualifiers,
      evidenceRef,
    });
  }
  if (returned != null) {
    facts.push({
      goalId: resolvedGoalId,
      capabilityId: capability.id,
      kind: 'returned_count',
      key: `${capability.id}.returned`,
      value: returned,
      unit: entityType,
      label: capability.label,
      exact: true,
      qualifiers,
      evidenceRef,
    });
  }

  const inlineLimit = Math.min(
    MAX_INLINE_RESOURCES,
    Math.max(1, Number(capability.queryBudget?.maxInlineRefs) || MAX_INLINE_RESOURCES),
  );
  const resources = (Array.isArray(result.sources) ? result.sources : [])
    .map(safeResource)
    .filter(Boolean)
    .slice(0, inlineLimit);
  if (resources.length) {
    facts.push({
      goalId: resolvedGoalId,
      capabilityId: capability.id,
      kind: 'entity_list',
      key: `${capability.id}.items`,
      value: resources,
      unit: entityType,
      label: capability.label,
      exact: true,
      qualifiers: Object.freeze({
        ...qualifiers,
        projectionCompleteness:
          metadata.stableIdCoverage === 'complete' && resources.length === returned ? 'complete' : 'partial',
      }),
      evidenceRef,
    });
  }

  const summary = boundedText(result.summary, 4_000);
  if (summary) {
    facts.push({
      goalId: resolvedGoalId,
      capabilityId: capability.id,
      kind: 'tool_summary',
      key: `${capability.id}.summary`,
      value: summary,
      unit: '',
      label: capability.label,
      exact: false,
      qualifiers: Object.freeze({
        ...qualifiers,
        projectionCompleteness: metadata.summary?.truncated === true ? 'partial' : 'complete',
      }),
      evidenceRef,
    });
  }

  const normalizedFacts = fitFacts(facts.map((fact, index) => ({ ...fact, id: `${evidenceRef}:f${index + 1}` })));
  const payload = { version: FACT_BUNDLE_VERSION, facts: normalizedFacts };
  return Object.freeze({ ...payload, digest: digest(payload) });
}

export function mergeAgentFactBundles(values = []) {
  const facts = [];
  const seen = new Set();
  for (const bundle of Array.isArray(values) ? values : []) {
    for (const fact of Array.isArray(bundle?.facts) ? bundle.facts : []) {
      const key = `${fact.evidenceRef}\0${fact.key}\0${JSON.stringify(canonicalValue(fact.value))}`;
      if (seen.has(key)) continue;
      seen.add(key);
      facts.push({ ...fact, id: `f${facts.length + 1}` });
    }
  }
  const normalizedFacts = fitFacts(facts);
  const payload = { version: FACT_BUNDLE_VERSION, facts: normalizedFacts };
  return Object.freeze({ ...payload, digest: digest(payload) });
}

export function factBundlePromptProjection(bundle) {
  if (!bundle?.facts?.length) return null;
  return Object.freeze({
    version: FACT_BUNDLE_VERSION,
    digest: bundle.digest,
    facts: Object.freeze(
      bundle.facts.map((fact) =>
        Object.freeze({
          id: fact.id,
          goalId: fact.goalId,
          kind: fact.kind,
          key: fact.key,
          value: structuredClone(fact.value),
          unit: fact.unit,
          exact: fact.exact,
          qualifiers: fact.qualifiers,
        }),
      ),
    ),
  });
}

export function buildPublicAgentFactBlocks(bundle) {
  const facts = Array.isArray(bundle?.facts) ? bundle.facts : [];
  const completeCountByGoal = new Map(
    facts
      .filter((fact) => fact.kind === 'count' && ['complete', 'empty'].includes(fact.qualifiers?.completeness))
      .map((fact) => [fact.goalId || fact.capabilityId, fact.value]),
  );
  return Object.freeze(
    facts
      .filter((fact) => fact.exact === true)
      .filter(
        (fact) =>
          fact.kind !== 'returned_count' || completeCountByGoal.get(fact.goalId || fact.capabilityId) !== fact.value,
      )
      .map((fact) =>
        Object.freeze({
          type: 'fact',
          factId: fact.id,
          kind: fact.kind,
          key: fact.key,
          value: structuredClone(fact.value),
          unit: fact.unit,
          label: fact.label,
          qualifiers: fact.qualifiers,
        }),
      ),
  );
}

export const __testing = Object.freeze({ canonicalValue, finiteCount, normalizeCompleteness, safeResource });
