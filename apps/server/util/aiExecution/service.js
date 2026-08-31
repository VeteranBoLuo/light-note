import crypto from 'node:crypto';
import * as aiQuota from '../aiQuota.js';
import { getActiveProviderInfo } from '../agent/deepseekClient.js';
import { stableAgentErrorCode } from '../agent/logSafety.js';
import { getActiveAiExecution, runWithAiExecutionContext } from './context.js';
import { defaultAiExecutionPersistence } from './persistence.js';
import {
  AI_EXECUTION_BILLING_RULE_VERSION,
  AI_EXECUTION_LEASE_MS,
  AI_EXECUTION_LEASE_RENEW_WINDOW_MS,
  AI_EXECUTION_VALIDATION_RULE_VERSION,
  aiExecutionLeaseExpiry,
} from './policy.js';
import { normalizeAiProviderPlan, resolveAiProviderPlanRule } from './providerPlan.js';
import { addAiUsage, calculateChargedTokens, normalizeAiUsage } from './usage.js';

const VALID_BILLING_POLICIES = new Set(['user', 'system', 'none']);
const VALID_RESULT_OUTCOME_STATUSES = new Set(['success', 'partial', 'failed', 'quota_blocked', 'aborted']);

function shouldWaiveFailedExecutionCharge(execution) {
  // 根执行的 failed 终态只用于“没有可交付结果”的失败。部分结果、额度中断和用户主动取消
  // 分别使用 partial / quota_blocked / aborted，继续按已经发生的用户主调用结算。
  return execution.billingPolicy === 'user' && execution.status === 'failed';
}

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
    const subject = config.subjectIdentity || request?.resourceUser || request?.user || {};
    return {
      billingPolicy,
      actorUserId: userId,
      // 平台额度的承担方是 system，但审计仍保留任务实际处理的数据主体；这不会改变
      // system 配额分桶，也不会让产物内容或用户 ID进入 Provider 日志。
      subjectUserId: normalizeIdentifier(subject.id, userId),
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
  const providerPlan = normalizeAiProviderPlan(config.providerPlan);
  const startedAt = Date.now();
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
    startedAt,
    billingRuleVersion: Math.max(1, Math.floor(Number(config.billingRuleVersion || AI_EXECUTION_BILLING_RULE_VERSION))),
    validationRuleVersion: Math.max(
      1,
      Math.floor(Number(config.validationRuleVersion || AI_EXECUTION_VALIDATION_RULE_VERSION)),
    ),
    leaseMs: Math.max(60_000, Math.floor(Number(config.leaseMs || AI_EXECUTION_LEASE_MS))),
    leaseExpiresAt: aiExecutionLeaseExpiry(startedAt, config.leaseMs),
    status: 'running',
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    billableUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    missingUsageSpans: 0,
    missingBillableUsageSpans: 0,
    missingBillableUsageTokens: 0,
    providerCallCount: 0,
    userProviderCallCount: 0,
    platformProviderCallCount: 0,
    providerPlan,
    providerStageCallCounts: Object.create(null),
    estimatedBillableTokensCommitted: 0,
    reservationTokens: Math.max(1, Math.floor(Number(config.reservationTokens || 5_000))),
    maxUserProviderCalls: providerPlan
      ? providerPlan.maxUserProviderCalls
      : Math.max(1, Math.floor(Number(config.maxUserProviderCalls || 32))),
    maxPlatformProviderCalls: providerPlan
      ? providerPlan.maxPlatformProviderCalls
      : Math.max(0, Math.floor(Number(config.maxPlatformProviderCalls ?? 1))),
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

async function ensureAiExecutionLease(execution) {
  if (execution.leaseExpiresAt.getTime() - Date.now() > AI_EXECUTION_LEASE_RENEW_WINDOW_MS) return;
  execution.leaseExpiresAt = aiExecutionLeaseExpiry(Date.now(), execution.leaseMs);
  const renewed = await persistSafely(execution, 'renewAiExecutionLease', execution);
  if (renewed) return;
  const error = new Error('AI Execution 租约续期失败');
  error.code = 'AI_EXECUTION_LEASE_RENEW_FAILED';
  error.status = 503;
  throw error;
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
    const resultOutcome =
      typeof config?.resolveResultOutcome === 'function' ? config.resolveResultOutcome(result) : null;
    if (resultOutcome) {
      const outcomeStatus = String(resultOutcome.status || '');
      if (!VALID_RESULT_OUTCOME_STATUSES.has(outcomeStatus)) {
        const error = new Error('AI Execution 返回了无效的业务结果状态');
        error.code = 'AI_EXECUTION_RESULT_OUTCOME_INVALID';
        throw error;
      }
      execution.status = outcomeStatus;
      execution.errorCode =
        outcomeStatus === 'success'
          ? null
          : normalizeIdentifier(resultOutcome.errorCode, 'AI_EXECUTION_RESULT_FAILED', 64);
    } else {
      execution.status = 'success';
    }
    return result;
  } catch (error) {
    caughtError = error;
    execution.errorCode = stableAgentErrorCode(error);
    execution.status =
      error?.code === 'AI_QUOTA_EXCEEDED' ? 'quota_blocked' : error?.name === 'AbortError' ? 'aborted' : 'failed';
    throw error;
  } finally {
    execution.durationMs = Date.now() - execution.startedAt;
    const calculatedChargedTokens = calculateChargedTokens({
      usage: execution.billableUsage,
      missingUsageSpans: execution.missingBillableUsageSpans,
      missingUsageTokens: execution.missingBillableUsageTokens,
      reservedTokens: execution.quotaHandle?.reserved || 0,
    });
    // 用户已经发起了有效请求，但最终没有形成可交付结果时，不消耗用户额度。
    // Provider 真实用量仍完整保留在 Execution/Span 账本，独立调用上限与全局频控也不会放宽。
    execution.chargedTokens = shouldWaiveFailedExecutionCharge(execution) ? 0 : calculatedChargedTokens;
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
export async function ensureAiExecutionQuotaReservation(execution = getActiveAiExecution(), options = {}) {
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
        reserveTokens: Math.max(
          execution.reservationTokens,
          Math.max(1, Math.floor(Number(options.estimatedTokens || 0))),
        ),
      });
      const reservationLinked = await persistSafely(execution, 'updateAiExecutionReservation', execution);
      if (!reservationLinked && !execution.quotaHandle?.blocked) {
        // reservation 与根账本没有建立关联时禁止访问 Provider。finally 会立即按 0 尝试释放，
        // 终态写入也会再次携带 reservation key，供 deferred 回收器在瞬时故障恢复后接管。
        const error = new Error('AI Execution 额度占位关联失败');
        error.code = 'AI_EXECUTION_RESERVATION_LINK_FAILED';
        error.status = 503;
        throw error;
      }
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

function quotaExceededError(message = '今日 AI 额度不足以开始下一次模型调用') {
  const error = new Error(message);
  error.code = 'AI_QUOTA_EXCEEDED';
  error.status = 429;
  return error;
}

function abortedRequestError(signal) {
  const reason = signal?.reason;
  if (reason?.name === 'TimeoutError' || reason?.code === 'AI_GATEWAY_TIMEOUT') return reason;
  const error = new Error('AI 请求已取消');
  error.name = 'AbortError';
  error.code = 'AI_REQUEST_ABORTED';
  return error;
}

/**
 * Provider 请求前的同步预算认领。预占只做一次，但批量任务的每个子调用都必须在这里
 * 消耗自己的保守预算；余额不足时在下一项发出前停止，已经完成的结果仍可由业务层返回。
 */
export async function authorizeAiProviderCall({
  execution = getActiveAiExecution(),
  estimatedTokens = 1,
  billingScope = 'user',
  stage,
  signal,
} = {}) {
  if (!execution) {
    const error = new Error('模型调用缺少 AI Execution 上下文');
    error.code = 'AI_EXECUTION_REQUIRED';
    error.status = 500;
    throw error;
  }
  if (signal?.aborted) throw abortedRequestError(signal);
  await ensureAiExecutionLease(execution);
  const estimate = Math.max(1, Math.floor(Number(estimatedTokens || 1)));
  const plannedStage = execution.providerPlan ? resolveAiProviderPlanRule(execution.providerPlan, stage) : null;
  const assertPlannedStageAvailable = () => {
    if (!plannedStage) return;
    if (!plannedStage.rule) {
      const error = new Error('当前 AI 能力不允许该 Provider 阶段');
      error.code = 'AI_EXECUTION_PROVIDER_STAGE_NOT_ALLOWED';
      error.status = 500;
      throw error;
    }
    if (plannedStage.rule.billingScope !== billingScope) {
      const error = new Error('AI Provider 阶段计费归属与执行计划不一致');
      error.code = 'AI_EXECUTION_PROVIDER_STAGE_BILLING_INVALID';
      error.status = 500;
      throw error;
    }
    const used = Number(execution.providerStageCallCounts[plannedStage.stageType] || 0);
    if (used >= plannedStage.rule.maxCalls) {
      const error = new Error('AI Provider 阶段调用次数超过计划上限');
      error.code = 'AI_EXECUTION_PROVIDER_CALL_LIMIT';
      error.status = 500;
      throw error;
    }
  };
  const commitPlannedStage = () => {
    if (!plannedStage) return;
    execution.providerStageCallCounts[plannedStage.stageType] =
      Number(execution.providerStageCallCounts[plannedStage.stageType] || 0) + 1;
  };
  assertPlannedStageAvailable();
  if (billingScope === 'platform') {
    const generationCalls = Number(execution.providerStageCallCounts.model_generation || 0);
    if (execution.providerPlan ? generationCalls < 1 : execution.userProviderCallCount < 1) {
      const error = new Error('平台修复调用必须跟随已计量的用户主调用');
      error.code = 'AI_EXECUTION_PLATFORM_REPAIR_INVALID';
      error.status = 500;
      throw error;
    }
    if (execution.platformProviderCallCount >= execution.maxPlatformProviderCalls) {
      const error = new Error('AI 内部修复次数超过目录上限');
      error.code = 'AI_EXECUTION_PROVIDER_CALL_LIMIT';
      error.status = 500;
      throw error;
    }
    commitPlannedStage();
    execution.platformProviderCallCount += 1;
    execution.providerCallCount += 1;
    return { estimatedTokens: estimate, billingScope };
  }
  if (billingScope !== 'user') {
    const error = new Error('AI Provider 调用缺少有效计费范围');
    error.code = 'AI_EXECUTION_BILLING_SCOPE_INVALID';
    error.status = 500;
    throw error;
  }
  if (execution.userProviderCallCount >= execution.maxUserProviderCalls) {
    const error = new Error('AI 主调用次数超过计费目录上限');
    error.code = 'AI_EXECUTION_PROVIDER_CALL_LIMIT';
    error.status = 500;
    throw error;
  }
  const handle = await ensureAiExecutionQuotaReservation(execution, { estimatedTokens: estimate });
  if (signal?.aborted) throw abortedRequestError(signal);
  // 多个子调用可能同时等待第一次额度占位。await 返回后必须重新校验目录上限，
  // 否则它们都可能在占位前读到相同的旧计数并一起越界。
  if (execution.userProviderCallCount >= execution.maxUserProviderCalls) {
    const error = new Error('AI 主调用次数超过计费目录上限');
    error.code = 'AI_EXECUTION_PROVIDER_CALL_LIMIT';
    error.status = 500;
    throw error;
  }
  assertPlannedStageAvailable();
  const nextCommitted = execution.estimatedBillableTokensCommitted + estimate;
  if (nextCommitted > Math.max(0, Number(handle?.reserved || 0))) throw quotaExceededError();
  // await 之后到递增之间没有异步切换；并发 Promise 也会串行完成这段认领，不能超卖预占。
  execution.estimatedBillableTokensCommitted = nextCommitted;
  commitPlannedStage();
  execution.userProviderCallCount += 1;
  execution.providerCallCount += 1;
  return { estimatedTokens: estimate, billingScope };
}

/**
 * 成熟业务 Service 可同时被 HTTP、批处理和 Skill Adapter 复用。外层已有根执行时必须复用，
 * 独立调用时才创建根执行，确保批量动作只占位/结算一次且不会形成嵌套账本。
 */
export async function runOrReuseAiExecution(config, operation, dependencies = {}) {
  if (getActiveAiExecution()) return operation();
  return runAiExecution(config, operation, dependencies);
}

export function beginAiProviderSpan({
  id,
  traceId,
  stage,
  taskType,
  kind,
  billingScope,
  triggerCode,
  estimatedTokens,
  waiveMissingUsageOnFailure = false,
} = {}) {
  const execution = getActiveAiExecution();
  if (!execution) return null;
  return {
    id: normalizeIdentifier(id, crypto.randomUUID(), 64),
    executionId: execution.id,
    traceId: normalizeIdentifier(traceId, execution.requestId, 64),
    stage: normalizeTaskType(stage || kind || 'provider'),
    taskType: normalizeTaskType(taskType || execution.taskType),
    kind: normalizeIdentifier(kind, 'complete', 16),
    billingScope: billingScope === 'platform' ? 'platform' : 'user',
    sequenceNo: Math.max(1, Math.floor(Number(execution.providerCallCount || 1))),
    triggerCode: normalizeIdentifier(triggerCode, '', 64) || null,
    estimatedTokens: Math.max(1, Math.floor(Number(estimatedTokens || 1))),
    waiveMissingUsageOnFailure: waiveMissingUsageOnFailure === true,
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
  if (span.billingScope === 'user') addAiUsage(execution.billableUsage, usage);
  const usageStatus = result?.usageStatus === 'reported' ? 'reported' : 'missing';
  if (usageStatus === 'missing') execution.missingUsageSpans += 1;
  const waivedMissingFailure = Boolean(
    error && usageStatus === 'missing' && span.billingScope === 'user' && span.waiveMissingUsageOnFailure,
  );
  if (waivedMissingFailure) {
    // 图片识别具有不访问 Provider 的本地降级。技术失败没有 usage 时释放请求前预算，
    // 让同一根执行仍能使用本地文字继续总结，也避免按保守上界向用户结算失败调用。
    execution.estimatedBillableTokensCommitted = Math.max(
      0,
      execution.estimatedBillableTokensCommitted - span.estimatedTokens,
    );
  } else if (usageStatus === 'missing' && span.billingScope === 'user') {
    execution.missingBillableUsageSpans += 1;
    execution.missingBillableUsageTokens += span.estimatedTokens;
  }
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

export const aiExecutionInternals = {
  resolveExecutionIdentity,
  createExecution,
  normalizeTaskType,
  shouldWaiveFailedExecutionCharge,
};
