import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { executeInfraAction, getInfraDashboard, type InfraActionPayload, type InfraAgentStatus } from '@/api/infraApi';
import type { HostAgentAction, HostAgentDashboard, HostAgentServiceId } from '@lightnote/shared/host-agent-protocol';

const POLL_INTERVAL_MS = 10_000;
const STALE_AFTER_MS = 15_000;
const ACTION_KEY_STORAGE_PREFIX = 'lightnote:infra-action:';
const ACTION_KEY_PATTERN = /^[a-zA-Z0-9-]{16,64}$/u;

function createIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `infra-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

function errorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) return String(error.message || '');
  return '';
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

export function useServerManagement() {
  const dashboard = shallowRef<HostAgentDashboard | null>(null);
  const agentStatus = ref<InfraAgentStatus | 'loading'>('loading');
  const agentCode = ref('');
  const initialLoading = ref(true);
  const refreshing = ref(false);
  const refreshError = ref('');
  const lastLoadedAt = ref(0);
  const actionKeys = new Map<string, string>();
  let refreshTask: Promise<void> | null = null;
  let timer: number | null = null;

  async function refresh() {
    if (refreshTask) return refreshTask;
    refreshing.value = true;
    refreshTask = (async () => {
      try {
        const response = await getInfraDashboard();
        const payload = response.data;
        agentStatus.value = payload.agentStatus;
        agentCode.value = payload.code;
        dashboard.value = payload.dashboard;
        refreshError.value = '';
        lastLoadedAt.value = Date.now();
      } catch (error) {
        agentStatus.value = 'offline';
        agentCode.value = error && typeof error === 'object' && 'code' in error ? String(error.code || '') : '';
        refreshError.value = errorMessage(error);
      } finally {
        initialLoading.value = false;
        refreshing.value = false;
        refreshTask = null;
      }
    })();
    return refreshTask;
  }

  function onVisibilityChange() {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - lastLoadedAt.value >= STALE_AFTER_MS) void refresh();
  }

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
      await refresh();
      return response;
    } catch (error) {
      const receiptState =
        error && typeof error === 'object' && 'data' in error
          ? String((error.data as { receipt?: { state?: string } } | null)?.receipt?.state || '')
          : '';
      // 已收到权威失败终态时，下次由用户确认的尝试应创建新 job；
      // 网络失败或 unknown 回执则必须保留原键，避免重复执行结果不确定的动作。
      if (receiptState === 'failed') {
        actionKeys.delete(actionKey);
        clearStoredActionKey(actionKey);
      }
      throw error;
    }
  }

  onMounted(() => {
    void refresh();
    timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisibilityChange);
  });

  onBeforeUnmount(() => {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
    document.removeEventListener('visibilitychange', onVisibilityChange);
  });

  return {
    dashboard,
    agentStatus,
    agentCode,
    initialLoading,
    refreshing,
    refreshError,
    isOnline: computed(() => agentStatus.value === 'online' && Boolean(dashboard.value)),
    refresh,
    runAction,
  };
}

export const serverManagementRuntime = { POLL_INTERVAL_MS, STALE_AFTER_MS, ACTION_KEY_STORAGE_PREFIX };
