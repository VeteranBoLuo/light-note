import crypto from 'node:crypto';
import * as aiQuota from '../aiQuota.js';
import { getActiveProviderInfo } from '../agent/deepseekClient.js';
import { stableAgentErrorCode } from '../agent/logSafety.js';
import { getActiveAiExecution, runWithAiExecutionContext } from './context.js';
import { defaultAiExecutionPersistence } from './persistence.js';
import { addAiUsage, calculateChargedTokens, normalizeAiUsage } from './usage.js';

const VALID_BILLING_POLICIES = new Set(['user', 'system', 'none']);

function normalizeIdentifier(value, fallback, maxLength = 128) {
  return String(value || fallback || '')
    .trim()
    .slice(0, maxLength);
}

function normalizeTaskType(value) {
  return (
    normalizeIdentifier(value, 'ai_execution', 64)
      .toLowerCase()
      .replace(/[^a-z0-9_.-]+/gu, '_') || 'ai_execution'
  );
}

function resolveExecutionIdentity(config) {
  const request = config.request;
  const actor = config.identity || request?.billingUser || request?.user || {};
  const billingPolicy = String(config.billingPolicy || (request ? 'user' : ''));
  if (!VALID_BILLING_POLICIES.has(billingPolicy)) {
    const error = new Error('AI Execution 缺少明确的额度策略');
    error.code = 'AI_EXECUTION_BILLING_POLICY_REQUIRED';
    throw error;
  }
  if (billingPolicy === 'none' && !normalizeIdentifier(config.billingReason, '', 160)) {
    const error = new Error('不扣模型额度必须声明稳定原因');
    error.code = 'AI_EXECUTION_BILLING_REASON_REQUIRED';
    throw error;
  }
  if (billingPolicy === 'system') {
    const systemId = normalizeTaskType(config.systemId || config.taskType);
    const userId = `system:${systemId}`.slice(0, 128);
    return {
      billingPolicy,
      actorUserId: userId,
      subjectUserId: userId,
      userRole: 'system',
      quotaRequest: request || { headers: { fingerprint: userId }, body: {}, ip: 'ai-execution-system' },
    };
  }
  const actorUserId = normalizeIdentifier(actor.id, 'visitor');
  const subject = config.subjectIdentity || request?.adminContext?.subject || actor;
  return {
    billingPolicy,
    actorUserId,
    subjectUserId: normalizeIdentifier(subject?.id, actorUserId),
    userRole: normalizeIdentifier(actor.role, actorUserId === 'visitor' ? 'visitor' : 'user', 32),
    quotaRequest: request || { headers: {}, body: {}, ip: 'ai-execution-unknown' },
  };
}

function createExecution(config, identity) {
  const requestId = normalizeIdentifier(config.requestId, crypto.randomUUID(), 64);
  if (!requestId) {
    const error = new Error('AI Execution requestId 无效');
    error.code = 'AI_EXECUTION_REQUEST_ID_INVALID';
    throw error;
  }
  return {
    id: crypto.randomUUID(),
    requestId,
    actorUserId: identity.actorUserId,
    subjectUserId: identity.subjectUserId,
    userRole: identity.userRole,
    billingPolicy: identity.billingPolicy,
    billingReason: normalizeIdentifier(config.billingReason, '', 160) || null,
    surface: normalizeTaskType(config.surface || 'unknown'),
    taskType: normalizeTaskType(config.taskType),
    skillId: normalizeIdentifier(config.skillId, '', 96) || null,
    skillVersion: config.skillVersion == null ? null : Math.max(1, Math.floor(Number(config.skillVersion) || 1)),
    startedAt: Date.now(),
    status: 'running',
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    missingUsageSpans: 0,
    providerCallCount: 0,
    chargedTokens: 0,
    durationMs: 0,
    errorCode: null,
    quotaHandle: null,
    quotaReservationPromise: null,
    quotaAdapter: null,
    quotaRequest: identity.quotaRequest,
    quotaSettlementStatus: identity.billingPolicy === 'none' ? 'not_applicable' : 'pending',
    persistenceErrors: [],
    persistence: config.persistence || defaultAiExecutionPersistence,
  };
}

function assertAiExecutionAllowed(config) {
  const restrictions = Array.isArray(config?.request?.securityRestrictions) ? config.request.securityRestrictions : [];
  if (!restrictions.some((item) => item?.restriction_type === 'ai_lock')) return;
  const error = new Error('当前账号的 AI 使用权限已被限制');
  error.code = 'AI_ACCESS_RESTRICTED';
  error.status = 403;
  throw error;
}

async function persistSafely(execution, method, ...args) {
  try {
    await execution.persistence[method](...args);
    return true;
  } catch (error) {
    execution.persistenceErrors.push(stableAgentErrorCode(error));
    return false;
  }
}

export async function runAiExecution(config, operation, dependencies = {}) {
  if (getActiveAiExecution()) {
    const error = new Error('AI Execution 不允许嵌套，子步骤必须复用当前执行');
    error.code = 'AI_EXECUTION_NESTED';
    throw error;
  }
  if (typeof operation !== 'function') {
    const error = new Error('AI Execution 缺少操作');
    error.code = 'AI_EXECUTION_OPERATION_REQUIRED';
    throw error;
  }
  const quota = dependencies.quota || aiQuota;
  const identity = resolveExecutionIdentity(config || {});
  const execution = createExecution(config || {}, identity);
  execution.quotaAdapter = quota;

  const startedPersisted = await persistSafely(execution, 'insertAiExecution', execution);
  if (!startedPersisted) {
    const error = new Error('AI Execution 审计账本暂不可用');
    error.code = execution.persistenceErrors.at(-1) || 'AI_EXECUTION_STORE_UNAVAILABLE';
    error.status = 503;
    throw error;
  }

  let result;
  let caughtError;
  try {
    result = await runWithAiExecutionContext(execution, async () => {
      // AI 能力分散在笔记、书签、文件、待办等业务路由，不能再靠 URL 名称猜测。
      // 在根执行统一门禁，才能保证现在和未来新增的所有模型入口都受同一限制。
      assertAiExecutionAllowed(config);
      return operation();
    });
    execution.status = 'success';
    return result;
  } catch (error) {
    caughtError = error;
    execution.errorCode = stableAgentErrorCode(error);
    execution.status =
      error?.code === 'AI_QUOTA_EXCEEDED' ? 'quota_blocked' : error?.name === 'AbortError' ? 'aborted' : 'failed';
    throw error;
  } finally {
    execution.durationMs = Date.now() - execution.startedAt;
    execution.chargedTokens = calculateChargedTokens({
      usage: execution.usage,
      missingUsageSpans: execution.missingUsageSpans,
      reservedTokens: execution.quotaHandle?.reserved || 0,
    });
    if (execution.quotaHandle) {
      const reconciled = await quota.reconcile(execution.quotaHandle, execution.chargedTokens, {
        aborted: execution.status === 'aborted',
      });
      execution.quotaSettlementStatus = reconciled ? 'reconciled' : 'deferred';
    } else if (identity.billingPolicy !== 'none') {
      // 没有访问 Provider 的缓存命中或确定性动作不需要占位，也不会被“额度已用完”错误拦截。
      execution.quotaSettlementStatus = execution.quotaReservationPromise ? 'reservation_failed' : 'not_used';
    }
    await persistSafely(execution, 'settleAiExecution', execution);
    if (!caughtError && execution.persistenceErrors.length) {
      console.warn('[ai-execution] persistence degraded code=%s', execution.persistenceErrors.at(-1));
    }
  }
}

/**
 * 第一次真实 Provider 调用前懒占位。并发子调用共享同一个 Promise，保证一个用户动作只有一次占位。
 * 缓存命中、确定性解析和本地检索不会触发这里，因此既不扣额度，也不要求用户仍有可用模型额度。
 */
export async function ensureAiExecutionQuotaReservation(execution = getActiveAiExecution()) {
  if (!execution) {
    const error = new Error('模型调用缺少 AI Execution 上下文');
    error.code = 'AI_EXECUTION_REQUIRED';
    error.status = 500;
    throw error;
  }
  if (execution.billingPolicy === 'none') {
    const error = new Error('无模型额度执行禁止访问 Provider');
    error.code = 'AI_EXECUTION_PROVIDER_NOT_BILLABLE';
    error.status = 500;
    throw error;
  }
  if (!execution.quotaReservationPromise) {
    execution.quotaReservationPromise = (async () => {
      const quota = execution.quotaAdapter;
      if (!quota?.reserve) {
        const error = new Error('AI Execution 缺少额度适配器');
        error.code = 'AI_EXECUTION_QUOTA_ADAPTER_REQUIRED';
        error.status = 500;
        throw error;
      }
      execution.quotaHandle = await quota.reserve(execution.quotaRequest, {
        userId: execution.actorUserId,
        userRole: execution.userRole,
        requestId: execution.requestId,
      });
      await persistSafely(execution, 'updateAiExecutionReservation', execution);
      if (execution.quotaHandle?.blocked) {
        execution.quotaSettlementStatus = 'blocked';
        const error = new Error('今日 AI 额度已用完');
        error.code = 'AI_QUOTA_EXCEEDED';
        error.status = 429;
        throw error;
      }
      return execution.quotaHandle;
    })();
  }
  return execution.quotaReservationPromise;
}

/**
 * 成熟业务 Service 可同时被 HTTP、批处理和 Skill Adapter 复用。外层已有根执行时必须复用，
 * 独立调用时才创建根执行，确保批量动作只占位/结算一次且不会形成嵌套账本。
 */
export async function runOrReuseAiExecution(config, operation, dependencies = {}) {
  if (getActiveAiExecution()) return operation();
  return runAiExecution(config, operation, dependencies);
}

export function beginAiProviderSpan({ id, traceId, stage, taskType, kind } = {}) {
  const execution = getActiveAiExecution();
  if (!execution) return null;
  execution.providerCallCount += 1;
  return {
    id: normalizeIdentifier(id, crypto.randomUUID(), 64),
    executionId: execution.id,
    traceId: normalizeIdentifier(traceId, execution.requestId, 64),
    stage: normalizeTaskType(stage || kind || 'provider'),
    taskType: normalizeTaskType(taskType || execution.taskType),
    kind: normalizeIdentifier(kind, 'complete', 16),
    startedAt: Date.now(),
  };
}

export async function finishAiProviderSpan(span, { result, error } = {}) {
  if (!span) return;
  const execution = getActiveAiExecution();
  if (!execution || execution.id !== span.executionId) {
    const mismatch = new Error('Provider Span 与 AI Execution 不匹配');
    mismatch.code = 'AI_EXECUTION_SPAN_CONTEXT_MISMATCH';
    throw mismatch;
  }
  const usage = normalizeAiUsage(result?.usage);
  addAiUsage(execution.usage, usage);
  const usageStatus = result?.usageStatus === 'reported' ? 'reported' : 'missing';
  if (usageStatus === 'missing') execution.missingUsageSpans += 1;
  let providerInfo = { price: { input: 0, output: 0 } };
  try {
    providerInfo = getActiveProviderInfo(result?.provider, result?.model);
  } catch {
    // 未知供应商仍记录原始 usage，成本保持 0，不能影响额度结算。
  }
  const price = providerInfo.price || { input: 0, output: 0 };
  const estimatedCost = Number(
    (
      (usage.promptTokens / 1_000_000) * Number(price.input || 0) +
      (usage.completionTokens / 1_000_000) * Number(price.output || 0)
    ).toFixed(6),
  );
  await persistSafely(execution, 'insertAiProviderSpan', {
    ...span,
    provider: result?.provider || null,
    model: result?.model || null,
    status: error ? (error?.name === 'AbortError' ? 'aborted' : 'failed') : 'success',
    usageStatus,
    usage,
    estimatedCost,
    durationMs: Date.now() - span.startedAt,
    errorCode: error ? stableAgentErrorCode(error) : null,
  });
}

export const aiExecutionInternals = { resolveExecutionIdentity, createExecution, normalizeTaskType };
