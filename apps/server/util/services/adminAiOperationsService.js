import pool from '../../db/index.js';
import { INTERNAL_ROLES } from '../internalRoles.js';
import {
  adminCursorScope,
  adminCursorTime,
  decodeAdminListCursor,
  encodeAdminListCursor,
  normalizeAdminListLimit,
} from '../adminListCursor.js';
import {
  AI_USAGE_MODULES,
  buildAiUsageModuleFilter,
  mapAiUsageExecution,
  mapAiUsageProviderSpan,
  resolveAiUsageAction,
} from '../aiUsageService.js';

const PERIOD_DAYS = new Set([7, 30, 90]);
const MODULES = new Set(AI_USAGE_MODULES);
const STATUSES = new Set(['all', 'success', 'partial', 'failed', 'quota_blocked', 'aborted', 'running', 'attention']);
const PROVIDER_PATTERN = /^[a-z0-9][a-z0-9._-]{0,31}$/u;
const EXECUTION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ROOT_JOINS = `LEFT JOIN \`user\` actor ON actor.id = e.actor_user_id
  LEFT JOIN \`user\` subject ON subject.id = e.subject_user_id`;
const STALE_RUNNING_SQL = `(e.status = 'running' AND (
  (e.lease_expires_at IS NOT NULL AND e.lease_expires_at < CURRENT_TIMESTAMP)
  OR (e.lease_expires_at IS NULL AND e.updated_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 60 MINUTE))
))`;
const SETTLEMENT_ATTENTION_SQL = `(e.model_called = 1 AND e.status <> 'running'
  AND e.quota_settlement_status IN ('pending', 'deferred', 'reservation_failed'))`;
const USAGE_ATTENTION_SQL = `(e.model_called = 1 AND e.status <> 'running' AND e.usage_complete = 0)`;
const ATTENTION_SQL = `(e.status = 'failed' OR ${STALE_RUNNING_SQL}
  OR ${SETTLEMENT_ATTENTION_SQL} OR ${USAGE_ATTENTION_SQL})`;

function boundedInteger(value, fallback, min, max) {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function safeNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

function safeDecimal(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, Math.round(number * 1_000_000) / 1_000_000) : 0;
}

function epochMs(value) {
  const parsed = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function percent(numerator, denominator) {
  const total = safeNumber(denominator);
  if (!total) return 0;
  return Math.round((safeNumber(numerator) / total) * 1_000) / 10;
}

function normalizeProvider(value) {
  const normalized = String(value || 'all')
    .trim()
    .toLowerCase();
  return normalized === 'all' || !PROVIDER_PATTERN.test(normalized) ? 'all' : normalized;
}

export function normalizeAdminAiOperationsQuery(input = {}) {
  const periodCandidate = Math.trunc(Number(input.periodDays));
  const moduleCandidate = String(input.module || 'all')
    .trim()
    .toLowerCase();
  const statusCandidate = String(input.status || 'all')
    .trim()
    .toLowerCase();
  return Object.freeze({
    periodDays: PERIOD_DAYS.has(periodCandidate) ? periodCandidate : 7,
    module: MODULES.has(moduleCandidate) ? moduleCandidate : 'all',
    status: STATUSES.has(statusCandidate) ? statusCandidate : 'all',
    provider: normalizeProvider(input.provider),
    keyword: String(input.keyword || '')
      .trim()
      .slice(0, 80),
    hideInternal: input.hideInternal !== false && input.hideInternal !== 'false',
    limit: normalizeAdminListLimit(input.limit, 50),
  });
}

function buildRootWhere(query, { includeProvider = true } = {}) {
  const clauses = ['e.created_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ? DAY)'];
  const params = [query.periodDays];
  const moduleFilter = buildAiUsageModuleFilter(query.module, 'e.');
  if (moduleFilter.sql) {
    clauses.push(moduleFilter.sql.replace(/^\s*AND\s+/u, ''));
    params.push(...moduleFilter.params);
  }
  if (query.status === 'attention') {
    clauses.push(ATTENTION_SQL);
  } else if (query.status !== 'all') {
    clauses.push('e.status = ?');
    params.push(query.status);
  }
  if (includeProvider && query.provider !== 'all') {
    clauses.push(`EXISTS (
      SELECT 1 FROM ai_provider_spans provider_filter
       WHERE provider_filter.execution_id = e.id AND provider_filter.provider = ?
    )`);
    params.push(query.provider);
  }
  if (query.hideInternal) {
    clauses.push(`(actor.role IS NULL OR actor.role NOT IN (${INTERNAL_ROLES.map(() => '?').join(', ')}))`);
    params.push(...INTERNAL_ROLES);
  }
  if (query.keyword) {
    const like = `%${query.keyword}%`;
    clauses.push(`(
      e.id LIKE ? OR e.request_id LIKE ? OR e.actor_user_id LIKE ? OR actor.alias LIKE ? OR actor.email LIKE ?
      OR e.subject_user_id LIKE ? OR subject.alias LIKE ? OR subject.email LIKE ?
    )`);
    params.push(like, like, like, like, like, like, like, like);
  }
  return { sql: clauses.join(' AND '), params };
}

function shanghaiDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function fillDailySeries(rows, days, now = new Date()) {
  const byDate = new Map(
    rows.map((row) => [
      String(row.usage_date || '').slice(0, 10),
      {
        date: String(row.usage_date || '').slice(0, 10),
        executions: safeNumber(row.executions),
        modelActions: safeNumber(row.model_actions),
        providerTokens: safeNumber(row.provider_tokens),
        chargedTokens: safeNumber(row.charged_tokens),
        delivered: safeNumber(row.delivered),
        failures: safeNumber(row.failures),
      },
    ]),
  );
  const endKey = shanghaiDateKey(now);
  const end = Date.parse(`${endKey}T00:00:00.000Z`);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(end - (days - index - 1) * 86_400_000).toISOString().slice(0, 10);
    return (
      byDate.get(date) || {
        date,
        executions: 0,
        modelActions: 0,
        providerTokens: 0,
        chargedTokens: 0,
        delivered: 0,
        failures: 0,
      }
    );
  });
}

function aggregateModules(rows) {
  const modules = new Map();
  for (const row of rows) {
    const action = resolveAiUsageAction(row.skill_id, row.task_type);
    const current = modules.get(action.module) || {
      module: action.module,
      executions: 0,
      modelActions: 0,
      providerTokens: 0,
      chargedTokens: 0,
      failures: 0,
    };
    current.executions += safeNumber(row.executions);
    current.modelActions += safeNumber(row.model_actions);
    current.providerTokens += safeNumber(row.provider_tokens);
    current.chargedTokens += safeNumber(row.charged_tokens);
    current.failures += safeNumber(row.failures);
    modules.set(action.module, current);
  }
  return [...modules.values()].sort(
    (left, right) =>
      right.providerTokens - left.providerTokens ||
      right.modelActions - left.modelActions ||
      right.executions - left.executions,
  );
}

function mapProviders(rows) {
  return rows.map((row) => ({
    provider: String(row.provider || '').slice(0, 32) || null,
    model: String(row.model || '').slice(0, 96) || null,
    calls: safeNumber(row.calls),
    tokens: safeNumber(row.tokens),
    estimatedCost: safeDecimal(row.estimated_cost),
    failedCalls: safeNumber(row.failed_calls),
    missingUsageCalls: safeNumber(row.missing_usage_calls),
    platformCalls: safeNumber(row.platform_calls),
  }));
}

function executionErrorCategory(errorCode, status) {
  const code = String(errorCode || '').toUpperCase();
  if (!code) return status === 'failed' ? 'unknown' : null;
  if (code.includes('TIMEOUT')) return 'timeout';
  if (code.includes('ABORT')) return 'aborted';
  if (code.includes('QUOTA') || code.includes('RATE_LIMIT')) return 'quota';
  if (code.includes('NETWORK')) return 'network';
  if (code.includes('OUTPUT') || code.includes('VALIDATION') || code.includes('PROTOCOL')) return 'output_invalid';
  if (code.includes('STORE') || code.includes('PERSIST') || code.includes('DATABASE')) return 'storage';
  if (code.includes('PROVIDER') || code.includes('MODEL')) return 'provider';
  return 'unknown';
}

function safeErrorCode(value) {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();
  if (!normalized) return null;
  return /^[A-Z0-9][A-Z0-9._:-]{0,63}$/u.test(normalized) ? normalized : 'AI_EXECUTION_FAILED';
}

function actorView(id, alias, role) {
  return {
    id: String(id || '').slice(0, 128),
    alias: String(alias || '').slice(0, 120) || null,
    role: String(role || '').slice(0, 32) || null,
  };
}

function emptySpanSummary() {
  return {
    providers: new Set(),
    models: new Set(),
    estimatedCost: 0,
    failedCalls: 0,
    missingUsageCalls: 0,
    platformCalls: 0,
  };
}

function aggregateExecutionSpans(rows) {
  const summaries = new Map();
  for (const row of rows) {
    const executionId = String(row.execution_id || '');
    const summary = summaries.get(executionId) || emptySpanSummary();
    if (row.provider) summary.providers.add(String(row.provider).slice(0, 32));
    if (row.model) summary.models.add(String(row.model).slice(0, 96));
    summary.estimatedCost += safeDecimal(row.estimated_cost);
    if (row.status === 'failed') summary.failedCalls += 1;
    if (row.usage_status !== 'reported') summary.missingUsageCalls += 1;
    if (
      row.billing_scope === 'platform' ||
      String(row.stage || '')
        .toLowerCase()
        .endsWith('_repair')
    ) {
      summary.platformCalls += 1;
    }
    summaries.set(executionId, summary);
  }
  return summaries;
}

function mapAdminExecution(row, spanSummary = emptySpanSummary()) {
  const execution = mapAiUsageExecution(row);
  const terminalModelExecution = execution.modelCalled && execution.status !== 'running';
  return {
    ...execution,
    requestId: String(row.request_id || '').slice(0, 64),
    actor: actorView(row.actor_user_id, row.actor_alias, row.actor_role),
    subject: actorView(row.subject_user_id, row.subject_alias, row.subject_role),
    billingPolicy: String(row.billing_policy || '').slice(0, 16),
    surface: String(row.surface || '').slice(0, 64),
    skillVersion: row.skill_version == null ? null : safeNumber(row.skill_version),
    billingRuleVersion: row.billing_rule_version == null ? null : safeNumber(row.billing_rule_version),
    validationRuleVersion: row.validation_rule_version == null ? null : safeNumber(row.validation_rule_version),
    providers: [...spanSummary.providers],
    models: [...spanSummary.models],
    estimatedCost: safeDecimal(spanSummary.estimatedCost),
    failedProviderCalls: safeNumber(spanSummary.failedCalls),
    missingUsageCalls: safeNumber(spanSummary.missingUsageCalls),
    platformCalls: safeNumber(spanSummary.platformCalls),
    errorCategory: executionErrorCategory(row.error_code, execution.status),
    errorCode: safeErrorCode(row.error_code),
    staleRunning: Number(row.stale_running) === 1,
    usageAttention: terminalModelExecution && !execution.usageComplete,
    settlementAttention:
      terminalModelExecution && ['pending', 'deferred', 'reservation_failed'].includes(execution.quotaSettlementStatus),
    updatedAt: epochMs(row.updated_at),
  };
}

function serviceError(error) {
  if (
    ['ADMIN_LIST_CURSOR_INVALID', 'AI_OPERATIONS_EXECUTION_ID_INVALID', 'AI_OPERATIONS_EXECUTION_NOT_FOUND'].includes(
      error?.code,
    )
  ) {
    if (error.code === 'ADMIN_LIST_CURSOR_INVALID') error.status = 400;
    return error;
  }
  const wrapped = new Error('AI 运行账本暂不可用');
  wrapped.code =
    error?.code === 'ER_NO_SUCH_TABLE' ? 'AI_OPERATIONS_SCHEMA_MISSING' : 'AI_OPERATIONS_STORE_UNAVAILABLE';
  wrapped.status = 503;
  return wrapped;
}

function executionSelect() {
  return `e.id, e.request_id, e.actor_user_id, e.subject_user_id, e.billing_policy, e.surface,
    e.task_type, e.skill_id, e.skill_version, e.billing_rule_version, e.validation_rule_version,
    e.status, e.model_called, e.provider_call_count, e.provider_tokens, e.charged_tokens,
    e.usage_complete, e.quota_settlement_status, e.error_code, e.duration_ms,
    e.created_at, e.updated_at, actor.alias AS actor_alias, actor.role AS actor_role,
    subject.alias AS subject_alias, subject.role AS subject_role,
    ${STALE_RUNNING_SQL} AS stale_running`;
}

export async function getAdminAiOperationsOverview(rawQuery = {}, database = pool, now = new Date()) {
  const query = normalizeAdminAiOperationsQuery(rawQuery);
  const where = buildRootWhere(query);
  try {
    const [summaryResult, dailyResult, moduleResult, providerResult] = await Promise.all([
      database.query(
        `SELECT COUNT(*) AS executions,
                COUNT(DISTINCT e.actor_user_id) AS actors,
                COALESCE(SUM(e.model_called = 1), 0) AS model_actions,
                COALESCE(SUM(e.provider_call_count), 0) AS provider_calls,
                COALESCE(SUM(e.provider_tokens), 0) AS provider_tokens,
                COALESCE(SUM(e.charged_tokens), 0) AS charged_tokens,
                COALESCE(SUM(GREATEST(0, e.provider_tokens - e.charged_tokens)), 0) AS platform_covered_tokens,
                COALESCE(SUM(e.status = 'success'), 0) AS succeeded,
                COALESCE(SUM(e.status = 'partial'), 0) AS partial,
                COALESCE(SUM(e.status = 'failed'), 0) AS failed,
                COALESCE(SUM(e.status = 'quota_blocked'), 0) AS quota_blocked,
                COALESCE(SUM(e.status = 'aborted'), 0) AS aborted,
                COALESCE(SUM(e.status = 'running'), 0) AS running,
                COALESCE(SUM(${STALE_RUNNING_SQL}), 0) AS stale_running,
                COALESCE(SUM(${USAGE_ATTENTION_SQL}), 0) AS usage_missing,
                COALESCE(SUM(${SETTLEMENT_ATTENTION_SQL}), 0) AS settlement_attention,
                COALESCE(SUM(e.status IN ('success', 'partial', 'failed') AND e.duration_ms > 0), 0)
                  AS quality_sample,
                COALESCE(AVG(CASE WHEN e.status IN ('success', 'partial', 'failed') AND e.duration_ms > 0
                  THEN e.duration_ms END), 0) AS average_duration_ms
           FROM ai_executions e
           ${ROOT_JOINS}
          WHERE ${where.sql}`,
        where.params,
      ),
      database.query(
        `SELECT DATE_FORMAT(CONVERT_TZ(e.created_at, @@session.time_zone, '+08:00'), '%Y-%m-%d') AS usage_date,
                COUNT(*) AS executions,
                COALESCE(SUM(e.model_called = 1), 0) AS model_actions,
                COALESCE(SUM(e.provider_tokens), 0) AS provider_tokens,
                COALESCE(SUM(e.charged_tokens), 0) AS charged_tokens,
                COALESCE(SUM(e.status IN ('success', 'partial')), 0) AS delivered,
                COALESCE(SUM(e.status = 'failed'), 0) AS failures
           FROM ai_executions e
           ${ROOT_JOINS}
          WHERE ${where.sql}
          GROUP BY usage_date
          ORDER BY usage_date ASC`,
        where.params,
      ),
      database.query(
        `SELECT e.skill_id, e.task_type, COUNT(*) AS executions,
                COALESCE(SUM(e.model_called = 1), 0) AS model_actions,
                COALESCE(SUM(e.provider_tokens), 0) AS provider_tokens,
                COALESCE(SUM(e.charged_tokens), 0) AS charged_tokens,
                COALESCE(SUM(e.status = 'failed'), 0) AS failures
           FROM ai_executions e
           ${ROOT_JOINS}
          WHERE ${where.sql}
          GROUP BY e.skill_id, e.task_type`,
        where.params,
      ),
      database.query(
        `SELECT span.provider, span.model, COUNT(*) AS calls,
                COALESCE(SUM(span.total_tokens), 0) AS tokens,
                COALESCE(SUM(span.estimated_cost), 0) AS estimated_cost,
                COALESCE(SUM(span.status = 'failed'), 0) AS failed_calls,
                COALESCE(SUM(span.usage_status <> 'reported'), 0) AS missing_usage_calls,
                COALESCE(SUM(span.billing_scope = 'platform' OR RIGHT(span.stage, 7) = '_repair'), 0)
                  AS platform_calls
           FROM ai_provider_spans span
           INNER JOIN ai_executions e ON e.id = span.execution_id
           ${ROOT_JOINS}
          WHERE ${where.sql}
          GROUP BY span.provider, span.model
          ORDER BY calls DESC, tokens DESC`,
        where.params,
      ),
    ]);
    const summaryRow = summaryResult?.[0]?.[0] || {};
    const qualitySample = safeNumber(summaryRow.quality_sample);
    let durationP95 = 0;
    if (qualitySample > 0) {
      const p95Offset = Math.max(0, Math.ceil(qualitySample * 0.95) - 1);
      const [durationRows] = await database.query(
        `SELECT e.duration_ms
           FROM ai_executions e
           ${ROOT_JOINS}
          WHERE ${where.sql}
            AND e.status IN ('success', 'partial', 'failed') AND e.duration_ms > 0
          ORDER BY e.duration_ms ASC, e.id ASC
          LIMIT ?, 1`,
        [...where.params, p95Offset],
      );
      durationP95 = safeNumber(durationRows?.[0]?.duration_ms);
    }

    const succeeded = safeNumber(summaryRow.succeeded);
    const partial = safeNumber(summaryRow.partial);
    const failed = safeNumber(summaryRow.failed);
    const delivered = succeeded + partial;
    const qualityDenominator = delivered + failed;
    const staleRunning = safeNumber(summaryRow.stale_running);
    const usageMissing = safeNumber(summaryRow.usage_missing);
    const settlementAttention = safeNumber(summaryRow.settlement_attention);
    const providers = mapProviders(Array.isArray(providerResult?.[0]) ? providerResult[0] : []);

    return {
      query,
      timezone: 'Asia/Shanghai',
      generatedAt: now.getTime(),
      summary: {
        executions: safeNumber(summaryRow.executions),
        actors: safeNumber(summaryRow.actors),
        modelActions: safeNumber(summaryRow.model_actions),
        providerCalls: safeNumber(summaryRow.provider_calls),
        providerTokens: safeNumber(summaryRow.provider_tokens),
        chargedTokens: safeNumber(summaryRow.charged_tokens),
        platformCoveredTokens: safeNumber(summaryRow.platform_covered_tokens),
        estimatedCost: safeDecimal(providers.reduce((total, item) => total + item.estimatedCost, 0)),
        delivered,
        succeeded,
        partial,
        failed,
        quotaBlocked: safeNumber(summaryRow.quota_blocked),
        aborted: safeNumber(summaryRow.aborted),
        running: safeNumber(summaryRow.running),
        deliveryRate: percent(delivered, qualityDenominator),
        technicalErrorRate: percent(failed, qualityDenominator),
        averageDurationMs: safeNumber(summaryRow.average_duration_ms),
        durationP95,
        anomalySignals: failed + staleRunning + usageMissing + settlementAttention,
        staleRunning,
        usageMissing,
        settlementAttention,
      },
      daily: fillDailySeries(Array.isArray(dailyResult?.[0]) ? dailyResult[0] : [], query.periodDays, now),
      modules: aggregateModules(Array.isArray(moduleResult?.[0]) ? moduleResult[0] : []),
      providers,
    };
  } catch (error) {
    throw serviceError(error);
  }
}

export async function queryAdminAiExecutions(rawQuery = {}, database = pool) {
  const query = normalizeAdminAiOperationsQuery(rawQuery);
  const scope = adminCursorScope('ai-operations-executions', [
    query.periodDays,
    query.module,
    query.status,
    query.provider,
    query.keyword,
    query.hideInternal,
  ]);
  try {
    const cursor = decodeAdminListCursor(rawQuery?.cursor, scope);
    const baseWhere = buildRootWhere(query);
    const listClauses = [baseWhere.sql];
    const listParams = [...baseWhere.params];
    if (cursor) {
      const at = new Date(adminCursorTime(cursor.value));
      listClauses.push('(e.created_at < ? OR (e.created_at = ? AND e.id < ?))');
      listParams.push(at, at, cursor.id);
    }
    const [itemsResult, countResult] = await Promise.all([
      database.query(
        `SELECT ${executionSelect()}
           FROM ai_executions e
           ${ROOT_JOINS}
          WHERE ${listClauses.join(' AND ')}
          ORDER BY e.created_at DESC, e.id DESC
          LIMIT ?`,
        [...listParams, query.limit + 1],
      ),
      cursor
        ? Promise.resolve([[]])
        : database.query(
            `SELECT COUNT(*) AS total
               FROM ai_executions e
               ${ROOT_JOINS}
              WHERE ${baseWhere.sql}`,
            baseWhere.params,
          ),
    ]);
    const rows = Array.isArray(itemsResult?.[0]) ? itemsResult[0] : [];
    const hasMore = rows.length > query.limit;
    const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
    let spanRows = [];
    if (pageRows.length) {
      const ids = pageRows.map((row) => String(row.id));
      const [result] = await database.query(
        `SELECT execution_id, provider, model, status, usage_status, billing_scope, stage, estimated_cost
           FROM ai_provider_spans
          WHERE execution_id IN (${ids.map(() => '?').join(', ')})
          ORDER BY execution_id, sequence_no ASC, created_at ASC, id ASC`,
        ids,
      );
      spanRows = Array.isArray(result) ? result : [];
    }
    const spanSummaries = aggregateExecutionSpans(spanRows);
    const items = pageRows.map((row) => mapAdminExecution(row, spanSummaries.get(String(row.id))));
    const last = pageRows[pageRows.length - 1];
    const response = {
      query,
      items,
      hasMore,
      nextCursor:
        hasMore && last ? encodeAdminListCursor(scope, { value: epochMs(last.created_at), id: String(last.id) }) : null,
    };
    if (!cursor) response.total = safeNumber(countResult?.[0]?.[0]?.total);
    return response;
  } catch (error) {
    throw serviceError(error);
  }
}

export async function getAdminAiExecutionDetail(executionId, database = pool) {
  const normalizedId = String(executionId || '').trim();
  if (!EXECUTION_ID_PATTERN.test(normalizedId)) {
    const error = new Error('AI 执行标识无效');
    error.code = 'AI_OPERATIONS_EXECUTION_ID_INVALID';
    error.status = 400;
    throw error;
  }
  try {
    const [executionRows] = await database.query(
      `SELECT ${executionSelect()}
         FROM ai_executions e
         ${ROOT_JOINS}
        WHERE e.id = ?
        LIMIT 1`,
      [normalizedId],
    );
    const row = Array.isArray(executionRows) ? executionRows[0] : null;
    if (!row) {
      const error = new Error('AI 执行记录不存在');
      error.code = 'AI_OPERATIONS_EXECUTION_NOT_FOUND';
      error.status = 404;
      throw error;
    }
    const [spanRows] = await database.query(
      `SELECT stage, provider, model, status, trigger_code, usage_status, billing_scope,
              sequence_no, estimated_tokens, prompt_tokens, completion_tokens, total_tokens,
              estimated_cost, duration_ms, error_code, created_at
         FROM ai_provider_spans
        WHERE execution_id = ?
        ORDER BY CASE WHEN sequence_no > 0 THEN sequence_no ELSE 2147483647 END ASC,
                 created_at ASC, id ASC`,
      [normalizedId],
    );
    const spans = Array.isArray(spanRows) ? spanRows : [];
    const summaries = aggregateExecutionSpans(spans.map((span) => ({ ...span, execution_id: normalizedId })));
    const execution = mapAdminExecution(row, summaries.get(normalizedId));
    const waiveUserCharge = execution.status === 'failed' && execution.chargedTokens === 0;
    return {
      execution,
      calls: spans.map((span, index) => ({
        ...mapAiUsageProviderSpan(span, index + 1, { waiveUserCharge }),
        estimatedCost: safeDecimal(span.estimated_cost),
      })),
      privacy: 'governance_metadata_only',
    };
  } catch (error) {
    throw serviceError(error);
  }
}

export const adminAiOperationsServiceInternals = Object.freeze({
  ATTENTION_SQL,
  buildRootWhere,
  fillDailySeries,
  aggregateModules,
  aggregateExecutionSpans,
  mapAdminExecution,
  executionErrorCategory,
});
