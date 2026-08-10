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
