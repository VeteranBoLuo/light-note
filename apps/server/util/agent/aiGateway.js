import crypto from 'node:crypto';
import { requestDeepSeek, requestDeepSeekStream } from './deepseekClient.js';
import { stableAgentErrorCode } from './logSafety.js';

const DEFAULT_COMPLETE_TIMEOUT_MS = 90_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 180_000;
let governanceAdapterPromise;

function loadGovernanceAdapter() {
  governanceAdapterPromise ||= import('./aiGatewayGovernance.js');
  return governanceAdapterPromise;
}

function traceEvent(callback, event) {
  try {
    callback?.(event);
  } catch {
    /* 观测回调不得影响 AI 主流程 */
  }
}

function normalizeTimeoutMs(value, kind) {
  if (value === false || value === 0 || value === null) return 0;
  const fallback = kind === 'complete' ? DEFAULT_COMPLETE_TIMEOUT_MS : 0;
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.trunc(parsed)));
}

function createDeadlineSignal(parentSignal, timeoutMs) {
  if (!timeoutMs) return { signal: parentSignal, dispose() {} };
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener('abort', abortFromParent, { once: true });
  const timer = setTimeout(() => {
    const error = new Error('AI Gateway 请求超时');
    error.name = 'TimeoutError';
    error.code = 'AI_GATEWAY_TIMEOUT';
    controller.abort(error);
  }, timeoutMs);
  timer.unref?.();
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
      parentSignal?.removeEventListener?.('abort', abortFromParent);
    },
  };
}

export function createAiGateway({
  completeClient = requestDeepSeek,
  streamClient = requestDeepSeekStream,
  governanceAdapter,
} = {}) {
  async function run(kind, client, messages, options = {}) {
    const startedAt = Date.now();
    const traceId = String(options.trace?.traceId || crypto.randomUUID());
    const spanId = crypto.randomUUID();
    const stage = String(options.trace?.stage || kind);
    const taskType = String(options.trace?.taskType || stage);
    const onTrace = options.trace?.onTrace;
    const timeoutMs = normalizeTimeoutMs(options.timeoutMs, kind);
    const deadline = createDeadlineSignal(options.signal, timeoutMs);
    const { trace: _trace, timeoutMs: _timeoutMs, governance, ...clientOptions } = options;
    clientOptions.signal = deadline.signal;
    // 非工具调用显式关闭 tool choice；即使未来 Provider 默认策略变化，也不会让历史功能绕开 Tool Policy。
    if (!clientOptions.tools?.length && clientOptions.toolChoice === undefined) clientOptions.toolChoice = 'none';
    traceEvent(onTrace, { event: 'ai.span.started', traceId, spanId, stage, taskType, kind, startedAt });
    let activeGovernanceAdapter = governanceAdapter;
    let governanceState = null;
    let result = null;
    let caughtError = null;
    try {
      if (governance) {
        activeGovernanceAdapter ||= await loadGovernanceAdapter();
        governanceState = await activeGovernanceAdapter.beginAiGatewayGovernance({
          governance,
          traceId,
          taskType,
          startedAt,
        });
      }
      result = await client(messages, clientOptions);
      const gatewayTrace = {
        traceId,
        spanId,
        stage,
        taskType,
        kind,
        provider: result?.provider || null,
        model: result?.model || null,
        durationMs: Date.now() - startedAt,
        usageStatus: result?.usageStatus || 'missing',
      };
      traceEvent(onTrace, { event: 'ai.span.completed', ...gatewayTrace });
      return { ...result, gatewayTrace };
    } catch (error) {
      caughtError = error;
      const gatewayTrace = {
        traceId,
        spanId,
        stage,
        taskType,
        kind,
        durationMs: Date.now() - startedAt,
        error: stableAgentErrorCode(error),
      };
      if (error && (typeof error === 'object' || typeof error === 'function')) {
        try {
          Object.defineProperty(error, 'gatewayTrace', { value: gatewayTrace, configurable: true });
        } catch {
          /* 冻结的第三方 Error 也必须保留原异常，不能被追踪字段覆盖。 */
        }
      }
      traceEvent(onTrace, { event: 'ai.span.failed', ...gatewayTrace });
      throw error;
    } finally {
      if (governanceState) {
        try {
          await activeGovernanceAdapter.finishAiGatewayGovernance({
            state: governanceState,
            result,
            error: caughtError,
            signal: deadline.signal,
          });
        } catch (error) {
          // 治理适配器自身必须 fail-open；最后一道防线避免日志/额度故障覆盖业务结果。
          traceEvent(onTrace, {
            event: 'ai.governance.failed',
            traceId,
            spanId,
            stage,
            taskType,
            error: stableAgentErrorCode(error),
          });
        }
      }
      deadline.dispose();
    }
  }

  return {
    complete(messages, options) {
      return run('complete', completeClient, messages, options);
    },
    stream(messages, options) {
      return run('stream', streamClient, messages, options);
    },
  };
}

const defaultGateway = createAiGateway();

export const requestAi = (messages, options) => defaultGateway.complete(messages, options);
export const requestAiStream = (messages, options) => defaultGateway.stream(messages, options);
