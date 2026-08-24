import pool from '../db/index.js';
import { AI_BILLING_ACTIONS, listPublicAiBillingCatalog, resolveAiBillingAction } from './aiBillingCatalog.js';

const ALLOWED_DAYS = new Set([7, 30, 90]);
const ALLOWED_PAGE_SIZES = new Set([10, 20, 50, 100]);
export const AI_USAGE_MODULES = Object.freeze([
  'all',
  'note',
  'bookmark',
  'file',
  'todo',
  'search',
  'help',
  'tag',
  'other',
]);
const ALLOWED_MODULES = new Set(AI_USAGE_MODULES);

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

export function normalizeAiUsageQuery(input = {}) {
  const daysCandidate = Math.floor(Number(input.days));
  const pageSizeCandidate = Math.floor(Number(input.pageSize));
  const moduleCandidate = String(input.module || 'all')
    .trim()
    .toLowerCase();
  return Object.freeze({
    days: ALLOWED_DAYS.has(daysCandidate) ? daysCandidate : 7,
    page: boundedInteger(input.page, 1, 1, 10_000),
    pageSize: ALLOWED_PAGE_SIZES.has(pageSizeCandidate) ? pageSizeCandidate : 20,
    module: ALLOWED_MODULES.has(moduleCandidate) ? moduleCandidate : 'all',
  });
}

function safeNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

function epochMs(value) {
  const parsed = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function publicAction(skillId, taskType) {
  const action = resolveAiBillingAction({ skillId, taskType });
  return action
    ? { actionId: action.id, module: action.module, labelKey: action.labelKey, unit: action.unit }
    : { actionId: 'other', module: 'other', labelKey: 'otherAiAction', unit: 'request' };
}

function moduleMatches(row, module) {
  return module === 'all' || publicAction(row.skill_id, row.task_type).module === module;
}

function sqlPlaceholders(values) {
  return values.map(() => '?').join(', ');
}

/** SQL 结构只由服务端白名单目录生成，用户输入永远只决定选哪一组参数。 */
function buildModuleFilter(module) {
  if (module === 'all') return { sql: '', params: [] };
  const actions = module === 'other' ? AI_BILLING_ACTIONS : AI_BILLING_ACTIONS.filter((item) => item.module === module);
  const skillIds = [...new Set(actions.map((item) => item.id))];
  const taskTypes = [...new Set(actions.flatMap((item) => item.taskTypes))];
  const knownExpression = `(
    COALESCE(skill_id, '') IN (${sqlPlaceholders(skillIds)})
    OR COALESCE(task_type, '') IN (${sqlPlaceholders(taskTypes)})
  )`;
  return {
    sql: ` AND ${module === 'other' ? `NOT ${knownExpression}` : knownExpression}`,
    params: [...skillIds, ...taskTypes],
  };
}

function mapUsageItem(row) {
  const action = publicAction(row.skill_id, row.task_type);
  const providerTokens = safeNumber(row.provider_tokens);
  const chargedTokens = safeNumber(row.charged_tokens);
  return {
    id: String(row.id || ''),
    ...action,
    createdAt: epochMs(row.created_at),
    status: String(row.status || 'failed'),
    modelCalled: row.model_called === true || Number(row.model_called) === 1,
    providerCallCount: safeNumber(row.provider_call_count),
    providerTokens,
    chargedTokens,
    platformCoveredTokens: Math.max(0, providerTokens - chargedTokens),
    usageComplete: row.usage_complete === true || Number(row.usage_complete) === 1,
    quotaSettlementStatus: String(row.quota_settlement_status || 'pending'),
    durationMs: safeNumber(row.duration_ms),
  };
}

function mysqlDateKey(date) {
  if (typeof date === 'string') return date.slice(0, 10);
  if (date instanceof Date && Number.isFinite(date.getTime())) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return '';
}

function aggregateModules(rows, selectedModule) {
  const modules = new Map();
  for (const row of rows) {
    const action = publicAction(row.skill_id, row.task_type);
    if (selectedModule !== 'all' && action.module !== selectedModule) continue;
    const current = modules.get(action.module) || {
      module: action.module,
      chargedTokens: 0,
      providerTokens: 0,
      actions: 0,
    };
    current.chargedTokens += safeNumber(row.charged_tokens);
    current.providerTokens += safeNumber(row.provider_tokens);
    current.actions += safeNumber(row.actions);
    modules.set(action.module, current);
  }
  return [...modules.values()].sort(
    (left, right) => right.chargedTokens - left.chargedTokens || right.actions - left.actions,
  );
}

function usageStoreError() {
  const error = new Error('AI 用量明细暂不可用');
  error.code = 'AI_USAGE_STORE_UNAVAILABLE';
  error.status = 503;
  return error;
}

/**
 * 只查询“谁实际支付额度”的 actor_user_id。管理员查看他人资料时，subject_user_id 可能
 * 是被代管用户，若按 subject 查询会把管理员触发的 AI 成本错误展示给对方。
 */
export async function getUserAiUsage(userId, rawQuery = {}, database = pool) {
  const actorUserId = String(userId || '')
    .trim()
    .slice(0, 128);
  if (!actorUserId || actorUserId === 'visitor') {
    const error = new Error('登录后才能查看 AI 用量明细');
    error.code = 'AI_USAGE_AUTH_REQUIRED';
    error.status = 401;
    throw error;
  }
  const query = normalizeAiUsageQuery(rawQuery);
  try {
    const offset = (query.page - 1) * query.pageSize;
    const moduleFilter = buildModuleFilter(query.module);
    const where = `actor_user_id = ?
      AND billing_policy = 'user'
      AND model_called = 1
      AND created_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ? DAY)${moduleFilter.sql}`;
    const whereParams = [actorUserId, query.days, ...moduleFilter.params];
    const [itemsResult, summaryResult, dailyResult, moduleResult] = await Promise.all([
      database.query(
        `SELECT id, skill_id, task_type, status, model_called, provider_call_count,
                provider_tokens, charged_tokens, usage_complete, quota_settlement_status,
                duration_ms, created_at
           FROM ai_executions
          WHERE ${where}
          ORDER BY created_at DESC, id DESC
          LIMIT ? OFFSET ?`,
        [...whereParams, query.pageSize, offset],
      ),
      database.query(
        `SELECT COUNT(*) AS model_actions,
                COALESCE(SUM(charged_tokens), 0) AS charged_tokens,
                COALESCE(SUM(provider_tokens), 0) AS provider_tokens,
                COALESCE(SUM(GREATEST(0, provider_tokens - charged_tokens)), 0) AS platform_covered_tokens,
                COALESCE(SUM(CASE WHEN charged_tokens = 0 THEN 1 ELSE 0 END), 0) AS zero_charge_model_actions,
                COALESCE(SUM(CASE WHEN DATE(created_at) = CURRENT_DATE THEN charged_tokens ELSE 0 END), 0)
                  AS today_charged_tokens
           FROM ai_executions
          WHERE ${where}`,
        whereParams,
      ),
      database.query(
        `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS usage_date,
                SUM(charged_tokens) AS charged_tokens,
                SUM(provider_tokens) AS provider_tokens,
                COUNT(*) AS actions
           FROM ai_executions
          WHERE ${where}
          GROUP BY DATE(created_at)
          ORDER BY DATE(created_at) ASC`,
        whereParams,
      ),
      database.query(
        `SELECT skill_id, task_type, SUM(charged_tokens) AS charged_tokens,
                SUM(provider_tokens) AS provider_tokens, COUNT(*) AS actions
           FROM ai_executions
          WHERE ${where}
          GROUP BY skill_id, task_type`,
        whereParams,
      ),
    ]);
    const itemRows = Array.isArray(itemsResult?.[0]) ? itemsResult[0] : [];
    const summaryRow = summaryResult?.[0]?.[0] || {};
    const dailyRows = Array.isArray(dailyResult?.[0]) ? dailyResult[0] : [];
    const moduleRows = Array.isArray(moduleResult?.[0]) ? moduleResult[0] : [];
    const total = safeNumber(summaryRow.model_actions);
    const items = itemRows.map(mapUsageItem);
    const summary = {
      chargedTokens: safeNumber(summaryRow.charged_tokens),
      providerTokens: safeNumber(summaryRow.provider_tokens),
      platformCoveredTokens: safeNumber(summaryRow.platform_covered_tokens),
      todayChargedTokens: safeNumber(summaryRow.today_charged_tokens),
      modelActions: total,
      zeroChargeModelActions: safeNumber(summaryRow.zero_charge_model_actions),
    };

    return {
      query,
      summary,
      daily: dailyRows.map((row) => ({
        date: String(row.usage_date || ''),
        chargedTokens: safeNumber(row.charged_tokens),
        providerTokens: safeNumber(row.provider_tokens),
        actions: safeNumber(row.actions),
      })),
      modules: aggregateModules(moduleRows, query.module),
      items,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
      catalog: listPublicAiBillingCatalog(),
    };
  } catch (error) {
    if (error?.code === 'AI_USAGE_AUTH_REQUIRED') throw error;
    throw usageStoreError();
  }
}

export const aiUsageServiceInternals = Object.freeze({
  mapUsageItem,
  publicAction,
  aggregateModules,
  buildModuleFilter,
  moduleMatches,
  mysqlDateKey,
});
