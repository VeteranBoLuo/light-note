import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { getInfraDashboard, type InfraAgentStatus } from '@/api/infraApi';
import type { HostAgentDashboard } from '@lightnote/shared/host-agent-protocol';

const DEFAULT_REFRESH_INTERVAL_MS = 3_000;
const REFRESH_INTERVAL_VALUES = [0, 3_000, 10_000, 30_000, 60_000, 300_000] as const;
const REFRESH_INTERVAL_STORAGE_KEY = 'lightnote:infra-refresh-interval-ms';

export type ServerRefreshIntervalMs = (typeof REFRESH_INTERVAL_VALUES)[number];

function normalizeRefreshInterval(value: unknown): ServerRefreshIntervalMs {
  const interval = Number(value);
  return REFRESH_INTERVAL_VALUES.includes(interval as ServerRefreshIntervalMs)
    ? (interval as ServerRefreshIntervalMs)
    : DEFAULT_REFRESH_INTERVAL_MS;
}

function readStoredRefreshInterval() {
  try {
    const value = window.localStorage.getItem(REFRESH_INTERVAL_STORAGE_KEY);
    return value === null ? DEFAULT_REFRESH_INTERVAL_MS : normalizeRefreshInterval(value);
  } catch {
    return DEFAULT_REFRESH_INTERVAL_MS;
  }
}

function storeRefreshInterval(value: ServerRefreshIntervalMs) {
  try {
    window.localStorage.setItem(REFRESH_INTERVAL_STORAGE_KEY, String(value));
  } catch {
    // 隐私模式或存储被禁用时，本次页面会话仍可正常使用所选间隔。
  }
}

function errorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) return String(error.message || '');
  return '';
}

export function useServerManagement() {
  const dashboard = shallowRef<HostAgentDashboard | null>(null);
  const agentStatus = ref<InfraAgentStatus | 'loading'>('loading');
  const agentCode = ref('');
  const initialLoading = ref(true);
  const refreshing = ref(false);
  const refreshError = ref('');
  const lastLoadedAt = ref(0);
  const refreshIntervalMs = ref<ServerRefreshIntervalMs>(readStoredRefreshInterval());
  const nextRefreshAt = ref<number | null>(null);
  const now = ref(Date.now());
  let refreshTask: Promise<void> | null = null;
  let refreshTimer: number | null = null;
  let clockTimer: number | null = null;
  let mounted = false;

  function clearRefreshSchedule() {
    if (refreshTimer !== null) window.clearTimeout(refreshTimer);
    refreshTimer = null;
    nextRefreshAt.value = null;
  }

  function scheduleNextRefresh(delayMs: number = refreshIntervalMs.value) {
    clearRefreshSchedule();
    if (!mounted || refreshIntervalMs.value === 0 || document.visibilityState !== 'visible') return;
    const safeDelay = Math.max(0, Number(delayMs) || 0);
    now.value = Date.now();
    nextRefreshAt.value = now.value + safeDelay;
    refreshTimer = window.setTimeout(() => {
      refreshTimer = null;
      nextRefreshAt.value = null;
      void refresh();
    }, safeDelay);
  }

  async function refresh() {
    if (refreshTask) return refreshTask;
    clearRefreshSchedule();
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
        // 已经有可用仪表盘时，网络或登录态的瞬时失败只标记刷新异常；
        // 保留上一次权威数据，避免后台轮询把整个页面闪成离线空态。
        if (!dashboard.value) {
          agentStatus.value = 'offline';
          agentCode.value = error && typeof error === 'object' && 'code' in error ? String(error.code || '') : '';
        }
        refreshError.value = errorMessage(error);
      } finally {
        initialLoading.value = false;
        refreshing.value = false;
        refreshTask = null;
        scheduleNextRefresh();
      }
    })();
    return refreshTask;
  }

  function onVisibilityChange() {
    now.value = Date.now();
    if (document.visibilityState !== 'visible') {
      clearRefreshSchedule();
      return;
    }
    if (refreshIntervalMs.value === 0) return;
    const elapsed = Math.max(0, Date.now() - lastLoadedAt.value);
    if (!lastLoadedAt.value || elapsed >= refreshIntervalMs.value) {
      void refresh();
      return;
    }
    scheduleNextRefresh(refreshIntervalMs.value - elapsed);
  }

  function setRefreshInterval(value: unknown) {
    const interval = normalizeRefreshInterval(value);
    refreshIntervalMs.value = interval;
    storeRefreshInterval(interval);
    if (!mounted) return;
    if (interval === 0 || document.visibilityState !== 'visible') {
      clearRefreshSchedule();
      return;
    }
    const elapsed = Math.max(0, Date.now() - lastLoadedAt.value);
    if (!lastLoadedAt.value || elapsed >= interval) {
      void refresh();
      return;
    }
    scheduleNextRefresh(interval - elapsed);
  }

  onMounted(() => {
    mounted = true;
    now.value = Date.now();
    clockTimer = window.setInterval(() => {
      now.value = Date.now();
    }, 1_000);
    void refresh();
    document.addEventListener('visibilitychange', onVisibilityChange);
  });

  onBeforeUnmount(() => {
    mounted = false;
    clearRefreshSchedule();
    if (clockTimer !== null) window.clearInterval(clockTimer);
    clockTimer = null;
    document.removeEventListener('visibilitychange', onVisibilityChange);
  });

  return {
    dashboard,
    agentStatus,
    agentCode,
    initialLoading,
    refreshing,
    refreshError,
    lastLoadedAt,
    refreshIntervalMs,
    nextRefreshAt,
    nextRefreshInSeconds: computed(() =>
      nextRefreshAt.value === null ? null : Math.max(0, Math.ceil((nextRefreshAt.value - now.value) / 1_000)),
    ),
    now,
    isOnline: computed(() => agentStatus.value === 'online' && Boolean(dashboard.value)),
    isAutoRefreshPaused: computed(() => refreshIntervalMs.value === 0),
    refresh,
    setRefreshInterval,
  };
}

export const serverManagementRuntime = {
  DEFAULT_REFRESH_INTERVAL_MS,
  REFRESH_INTERVAL_VALUES,
  REFRESH_INTERVAL_STORAGE_KEY,
};
