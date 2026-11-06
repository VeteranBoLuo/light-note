import { AI_BILLING_ACTIONS } from './aiBillingCatalog.js';
import { readAiInputDiagnostics } from './aiExecution/diagnostics.js';

const ACTIONS = new Set(AI_BILLING_ACTIONS.map((action) => action.id));

export function normalizeReservationReportOptions({ days = 90, limit = 20_000 } = {}) {
  days = Number(days);
  limit = Number(limit);
  if (!Number.isInteger(days) || days < 1 || days > 365 || !Number.isInteger(limit) || limit < 1 || limit > 20_000) {
    throw Object.assign(new Error('AI_RESERVATION_REPORT_OPTIONS_INVALID'), {
      code: 'AI_RESERVATION_REPORT_OPTIONS_INVALID',
    });
  }
  return { days, limit };
}

function inputScale(tokens) {
  if (!Number.isSafeInteger(tokens) || tokens < 0) return 'unknown';
  if (tokens <= 3_000) return '0-3000';
  if (tokens <= 8_000) return '3001-8000';
  if (tokens <= 15_000) return '8001-15000';
  return '15001+';
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

function reservedForActor(row) {
  try {
    const subjects = typeof row.subjectsJson === 'string' ? JSON.parse(row.subjectsJson) : row.subjectsJson;
    const subject = Array.isArray(subjects)
      ? subjects.find((item) => item.type === 'user' && String(item.key) === String(row.actorId))
      : null;
    const tokens = Number(subject?.reservedTokens);
    return subject && Number.isSafeInteger(tokens) && tokens >= 0 ? tokens : null;
  } catch {
    return null;
  }
}

// 根执行是比较单位；既不使用截断后的 charged_tokens，也不把平台修复混入用户预算。
export function summarizeReservationReport(executions, spans) {
  const groupedSpans = new Map();
  for (const span of spans) {
    if (span.billingScope !== 'user') continue;
    const list = groupedSpans.get(String(span.executionId)) || [];
    list.push(span);
    groupedSpans.set(String(span.executionId), list);
  }
  const groups = new Map();
  let missingUsageExecutions = 0;
  let missingUsageSpans = 0;
  let missingReservations = 0;
  let extraTokensTotal = 0;
  for (const execution of executions) {
    const billable = groupedSpans.get(String(execution.id)) || [];
    const missing = billable.filter(
      (span) =>
        span.usageStatus !== 'reported' ||
        !Number.isSafeInteger(Number(span.totalTokens)) ||
        Number(span.totalTokens) < 0,
    ).length;
    if (!billable.length || missing) {
      missingUsageExecutions++;
      missingUsageSpans += missing;
      continue;
    }
    const reserved = reservedForActor(execution);
    if (reserved === null) {
      missingReservations++;
      continue;
    }
    const actual = billable.reduce((sum, span) => sum + Number(span.totalTokens), 0);
    const diagnostic = readAiInputDiagnostics(execution.inputDiagnostics, execution.skillId);
    const skillId = ACTIONS.has(execution.skillId) ? execution.skillId : 'unknown';
    const operation = diagnostic?.operation || 'default';
    const scale = inputScale(diagnostic?.reservationBudget?.inputTokens);
    const key = JSON.stringify([skillId, operation, scale]);
    const group = groups.get(key) || { skillId, operation, inputScale: scale, samples: 0, excess: [], slack: [] };
    group.samples++;
    const extra = Math.max(0, actual - reserved);
    if (extra > 0) group.excess.push(extra);
    group.slack.push(reserved - actual);
    extraTokensTotal += extra;
    groups.set(key, group);
  }
  return {
    executions: executions.length,
    missingUsageExecutions,
    missingUsageSpans,
    missingReservations,
    extraTokensTotal,
    groups: [...groups.values()]
      .map(({ excess, slack, ...group }) => {
        const extraTokens = excess.reduce((sum, value) => sum + value, 0);
        return {
          ...group,
          observationalOnly: group.samples < 30 || group.inputScale === 'unknown',
          exceedances: excess.length,
          exceedanceRate: excess.length / group.samples,
          extraTokens,
          extraPer1000: (extraTokens * 1000) / group.samples,
          excessP50: percentile(excess, 0.5),
          excessP95: percentile(excess, 0.95),
          slackP50: percentile(slack, 0.5),
          slackP95: percentile(slack, 0.95),
        };
      })
      .sort(
        (a, b) =>
          a.skillId.localeCompare(b.skillId) ||
          a.operation.localeCompare(b.operation) ||
          a.inputScale.localeCompare(b.inputScale),
      ),
  };
}

export async function generateReservationReport(database, rawOptions = {}) {
  const { days, limit } = normalizeReservationReportOptions(rawOptions);
  // 先收窄根执行再查其全部 Span，避免扫描全站 Span 或因截断明细低估实际用量。
  const [rows] = await database.query(
    `SELECT execution.id, execution.actor_user_id AS actorId, execution.skill_id AS skillId,
            execution.input_diagnostics_json AS inputDiagnostics, reservation.subjects_json AS subjectsJson
       FROM ai_executions execution
       JOIN user actor ON actor.id = CONVERT(execution.actor_user_id USING utf8) COLLATE utf8_general_ci
         AND actor.role = 'user'
       LEFT JOIN ai_token_reservations reservation ON reservation.reservation_key = execution.quota_reservation_key
      WHERE execution.billing_policy = 'user' AND execution.model_called = 1 AND execution.status <> 'running'
        AND execution.created_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ? DAY)
      ORDER BY execution.created_at DESC, execution.id DESC LIMIT ?`,
    [days, limit + 1],
  );
  const executions = rows.slice(0, limit);
  const spans = [];
  for (let offset = 0; offset < executions.length; offset += 500) {
    const ids = executions.slice(offset, offset + 500).map((row) => row.id);
    const [part] = await database.query(
      `SELECT execution_id AS executionId, billing_scope AS billingScope,
              usage_status AS usageStatus, total_tokens AS totalTokens
         FROM ai_provider_spans WHERE billing_scope = 'user'
          AND execution_id IN (${ids.map(() => '?').join(',')})`,
      ids,
    );
    spans.push(...part);
  }
  return { days, limit, truncated: rows.length > limit, ...summarizeReservationReport(executions, spans) };
}
