import type { AiActionContinuation, AiToolConfirmationResolution } from '@/types/aiAgent';

/**
 * v1 只自动执行“最终自然语言续答”。其余策略先保持显式/终止语义，避免卡片点击
 * 意外触发 Planner 或第二次写操作；后续协议版本可在独立入口扩展 resume_plan。
 */
export function resolveAutomaticActionContinuation(
  resolution: AiToolConfirmationResolution,
): AiActionContinuation | null {
  const continuation = resolution.continuation;
  if (!continuation?.token || continuation.schemaVersion !== 1 || continuation.policy !== 'final_reply') {
    return null;
  }
  return continuation;
}

/**
 * 卡片成功后的续答是内部协议事件，不是用户又发了一条问题。
 * message 必须保持为空，服务端只凭 owner/session 绑定的令牌恢复原问题和权威回执。
 */
export function createInternalActionContinuationRequest(continuation: AiActionContinuation) {
  return {
    message: '',
    trigger: 'card_continuation' as const,
    continuationToken: continuation.token,
  };
}
