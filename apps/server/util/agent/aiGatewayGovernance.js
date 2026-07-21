import crypto from 'node:crypto';
import pool from '../../db/index.js';
import * as aiQuota from '../aiQuota.js';
import { getActiveProviderInfo } from './deepseekClient.js';
import { stableAgentErrorCode } from './logSafety.js';

const VALID_QUOTA_POLICIES = new Set(['user', 'system', 'none']);

function normalizeTaskType(value) {
  return (
    String(value || 'ai_gateway')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_.-]+/g, '_')
      .slice(0, 32) || 'ai_gateway'
  );
}

function normalizeSystemId(value, taskType) {
  const suffix = String(value || taskType)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '_')
    .slice(0, 96);
  return `system:${suffix || 'ai_gateway'}`;
}

function resolveIdentity(governance, taskType) {
  const quotaPolicy = String(governance?.quotaPolicy || (governance?.request ? 'user' : ''));
  if (!VALID_QUOTA_POLICIES.has(quotaPolicy)) {
    const error = new Error('AI Gateway 缺少明确的身份/额度策略');
    error.code = 'AI_GOVERNANCE_POLICY_REQUIRED';
    throw error;
  }
  if (quotaPolicy === 'none' && !String(governance?.quotaReason || '').trim()) {
    const error = new Error('AI Gateway 跳过额度时必须声明原因');
    error.code = 'AI_GOVERNANCE_QUOTA_REASON_REQUIRED';
    throw error;
  }
  if (quotaPolicy === 'system') {
    const userId = normalizeSystemId(governance?.systemId, taskType);
    return {
      quotaPolicy,
      userId,
      userRole: 'user',
      userAlias: 'AI System',
      request: governance?.request || {
        headers: { fingerprint: userId },
        body: {},
        ip: 'ai-gateway-system',
      },
    };
  }
  const request = governance?.request;
  const actor = governance?.identity || request?.billingUser || request?.user || {};
  return {
    quotaPolicy,
    userId: String(actor.id || 'visitor'),
    userRole: String(actor.role || (actor.id ? 'user' : 'visitor')),
    userAlias: String(actor.alias || ''),
    request: request || { headers: {}, body: {}, ip: 'ai-gateway-unknown' },
  };
}

function normalizeUsage(result) {
  const usage = result?.usage || {};
  return {
    promptTokens: Math.max(0, Number(usage.promptTokens || 0)),
    completionTokens: Math.max(0, Number(usage.completionTokens || 0)),
    totalTokens: Math.max(0, Number(usage.totalTokens || 0)),
  };
}

async function insertAgentLog({ state, result, error, status, durationMs }) {
  const usage = normalizeUsage(result);
  let providerInfo;
  try {
    providerInfo = getActiveProviderInfo();
  } catch {
    providerInfo = { provider: null, model: null, price: { input: 0, output: 0 } };
  }
  const provider = result?.provider || providerInfo.provider || null;
  const model = result?.model || providerInfo.model || null;
  const price = providerInfo.price || { input: 0, output: 0 };
  const cost = (usage.promptTokens / 1_000_000) * price.input + (usage.completionTokens / 1_000_000) * price.output;
  const question = `[${state.taskType} AI 请求，正文不写入日志]`;
  const data = {
    id: crypto.randomUUID(),
    requestId: state.requestId,
    provider,
    model,
    taskType: state.taskType,
    finishReason: result?.finishReason || null,
    usageStatus: result?.usageStatus || 'missing',
    userId: state.identity.userId,
    userAlias: state.identity.userAlias,
    question,
    usage,
    cost: Number(cost.toFixed(6)),
    status,
    errorMsg: error ? stableAgentErrorCode(error) : null,
    durationMs,
  };
  try {
    await pool.query(
      `INSERT INTO agent_logs
        (id,request_id,provider,model,task_type,toolset_version,selected_tools,finish_reason,first_token_ms,planner_ms,tool_ms,final_ms,usage_status,aborted_stage,user_id,user_alias,question,tools_used,iterations,prompt_tokens,completion_tokens,total_tokens,cost,status,error_msg,duration_ms)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        data.id,
        data.requestId,
        data.provider,
        data.model,
        data.taskType,
        'gateway-v1',
        '[]',
        data.finishReason,
        null,
        null,
        null,
        data.durationMs,
        data.usageStatus,
        status === 'aborted' ? data.taskType.slice(0, 32) : null,
        data.userId,
        data.userAlias,
        data.question,
        null,
        1,
        data.usage.promptTokens,
        data.usage.completionTokens,
        data.usage.totalTokens,
        data.cost,
        data.status,
        data.errorMsg,
        data.durationMs,
      ],
    );
  } catch (error) {
    if (error?.code !== 'ER_BAD_FIELD_ERROR') throw error;
    await pool.query(
      `INSERT INTO agent_logs (id,user_id,user_alias,question,tools_used,iterations,prompt_tokens,completion_tokens,total_tokens,cost,status,error_msg,duration_ms)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        data.id,
        data.userId,
        data.userAlias,
        data.question,
        null,
        1,
        data.usage.promptTokens,
        data.usage.completionTokens,
        data.usage.totalTokens,
        data.cost,
        data.status,
        data.errorMsg,
        data.durationMs,
      ],
    );
  }
}

async function safeInsertAgentLog(payload) {
  try {
    await insertAgentLog(payload);
  } catch (error) {
    console.error('[ai-gateway] trace persistence failed code=%s', stableAgentErrorCode(error));
  }
}

export async function beginAiGatewayGovernance({ governance, traceId, taskType, startedAt }) {
  const normalizedTaskType = normalizeTaskType(governance?.taskType || taskType);
  const identity = resolveIdentity(governance, normalizedTaskType);
  const state = {
    requestId: String(governance?.requestId || traceId).slice(0, 64),
    taskType: normalizedTaskType,
    identity,
    startedAt,
    quotaHandle: null,
  };
  if (identity.quotaPolicy !== 'none') {
    state.quotaHandle = await aiQuota.reserve(identity.request, {
      userId: identity.userId,
      userRole: identity.userRole,
      requestId: state.requestId,
    });
    if (state.quotaHandle?.blocked) {
      const error = new Error('今日 AI 额度已用完');
      error.code = 'AI_QUOTA_EXCEEDED';
      error.status = 429;
      await safeInsertAgentLog({
        state,
        result: null,
        error,
        status: 'quota_blocked',
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
  }
  return state;
}

export async function finishAiGatewayGovernance({ state, result, error, signal }) {
  if (!state) return;
  const usage = normalizeUsage(result);
  const usageMissing = result?.usageStatus !== 'reported';
  // Provider 已成功返回后即使 deadline 在最终日志阶段刚好触发，也不能把成功结果误记为 aborted。
  const aborted = Boolean(error && (signal?.aborted || error?.name === 'AbortError'));
  const reconciledTokens = usageMissing
    ? Math.max(usage.totalTokens, Number(state.quotaHandle?.reserved || 0))
    : usage.totalTokens;
  await aiQuota.reconcile(state.quotaHandle, reconciledTokens, { aborted });
  await safeInsertAgentLog({
    state,
    result,
    error,
    status: aborted ? 'aborted' : error ? 'error' : 'success',
    durationMs: Date.now() - state.startedAt,
  });
}
