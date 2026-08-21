import { executeInfraAction, type InfraActionPayload } from '@/api/infraApi';
import type { HostAgentAction, HostAgentServiceId } from '@lightnote/shared/host-agent-protocol';

const ACTION_KEY_STORAGE_PREFIX = 'lightnote:infra-action:';
const ACTION_KEY_PATTERN = /^[a-zA-Z0-9-]{16,64}$/u;

function createIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `infra-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

function readStoredActionKey(actionKey: string) {
  try {
    const value = window.sessionStorage.getItem(`${ACTION_KEY_STORAGE_PREFIX}${actionKey}`) || '';
    return ACTION_KEY_PATTERN.test(value) ? value : '';
  } catch {
    return '';
  }
}

function storeActionKey(actionKey: string, idempotencyKey: string) {
  try {
    window.sessionStorage.setItem(`${ACTION_KEY_STORAGE_PREFIX}${actionKey}`, idempotencyKey);
  } catch {
    // 隐私模式或存储被禁用时，仍由当前页面内存 Map 保护重试。
  }
}

function clearStoredActionKey(actionKey: string) {
  try {
    window.sessionStorage.removeItem(`${ACTION_KEY_STORAGE_PREFIX}${actionKey}`);
  } catch {
    // 与写入失败保持同样的降级边界。
  }
}

/** 服务页是固定运维动作的唯一入口；这里单独保留跨刷新幂等语义，不附带任何仪表盘轮询。 */
export function useInfraActions(onSucceeded: () => void | Promise<unknown>) {
  const actionKeys = new Map<string, string>();

  async function runAction(
    action: HostAgentAction,
    targetId: HostAgentServiceId,
    confirmation: Pick<InfraActionPayload, 'reason' | 'confirmed' | 'confirmText'>,
  ) {
    const actionKey = `${action}:${targetId}`;
    const idempotencyKey = actionKeys.get(actionKey) || readStoredActionKey(actionKey) || createIdempotencyKey();
    actionKeys.set(actionKey, idempotencyKey);
    storeActionKey(actionKey, idempotencyKey);
    try {
      const response = await executeInfraAction({ action, targetId, idempotencyKey, ...confirmation });
      actionKeys.delete(actionKey);
      clearStoredActionKey(actionKey);
      await onSucceeded();
      return response;
    } catch (error) {
      const receiptState =
        error && typeof error === 'object' && 'data' in error
          ? String((error.data as { receipt?: { state?: string } } | null)?.receipt?.state || '')
          : '';
      // 权威失败可创建新任务；网络中断或 unknown 必须复用旧键，避免重复执行结果不确定的动作。
      if (receiptState === 'failed') {
        actionKeys.delete(actionKey);
        clearStoredActionKey(actionKey);
      }
      throw error;
    }
  }

  return { runAction };
}

export const infraActionRuntime = { ACTION_KEY_STORAGE_PREFIX };
