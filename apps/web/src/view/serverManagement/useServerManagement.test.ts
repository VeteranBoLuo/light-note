import { createApp, h, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getInfraDashboard = vi.fn();
vi.mock('@/api/infraApi', () => ({ getInfraDashboard }));

const { useServerManagement, serverManagementRuntime } = await import('./useServerManagement');

const onlineDashboardResponse = {
  status: 200,
  msg: 'ok',
  data: {
    agentStatus: 'online',
    code: '',
    dashboard: {
      protocolVersion: '1',
      agentVersion: '1.0.0',
      startedAt: '2026-08-20T00:00:00.000Z',
      sampledAt: '2026-08-20T00:00:10.000Z',
      host: { hostname: 'light-note', platform: 'linux', release: 'test', arch: 'x64' },
      metrics: {},
      history: [],
      services: [],
      capabilities: [],
      collectionErrors: [],
    },
  },
};

function mountComposable() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  let runtime: ReturnType<typeof useServerManagement> | null = null;
  const app = createApp({
    setup() {
      runtime = useServerManagement();
      return () => h('div');
    },
  });
  app.mount(host);
  return {
    runtime: runtime as unknown as ReturnType<typeof useServerManagement>,
    cleanup: () => {
      app.unmount();
      host.remove();
    },
  };
}

describe('服务器管理概览轮询', () => {
  const cleanups: Array<() => void> = [];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T00:00:20.000Z'));
    vi.clearAllMocks();
    localStorage.clear();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  afterEach(() => {
    cleanups.splice(0).forEach((cleanup) => cleanup());
    vi.useRealTimers();
  });

  it('请求未结束时复用同一轮刷新，避免定时轮询叠加', async () => {
    let resolveDashboard!: (value: typeof onlineDashboardResponse) => void;
    getInfraDashboard.mockReturnValueOnce(
      new Promise<typeof onlineDashboardResponse>((resolve) => {
        resolveDashboard = resolve;
      }),
    );
    const { runtime, cleanup } = mountComposable();
    cleanups.push(cleanup);

    const manualRefresh = runtime.refresh();
    expect(getInfraDashboard).toHaveBeenCalledTimes(1);

    resolveDashboard(onlineDashboardResponse);
    await manualRefresh;
    await nextTick();

    expect(runtime.agentStatus.value).toBe('online');
    expect(runtime.initialLoading.value).toBe(false);
  });

  it('默认每 3 秒刷新并显示下一次刷新倒计时', async () => {
    getInfraDashboard.mockResolvedValue(onlineDashboardResponse);
    const { runtime, cleanup } = mountComposable();
    cleanups.push(cleanup);

    await runtime.refresh();
    expect(runtime.refreshIntervalMs.value).toBe(serverManagementRuntime.DEFAULT_REFRESH_INTERVAL_MS);
    expect(runtime.nextRefreshInSeconds.value).toBe(3);
    expect(getInfraDashboard).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(getInfraDashboard).toHaveBeenCalledTimes(1);
    expect(runtime.nextRefreshInSeconds.value).toBe(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(getInfraDashboard).toHaveBeenCalledTimes(2);
    expect(runtime.nextRefreshInSeconds.value).toBe(3);
  });

  it('切换刷新间隔后按最后成功时间重排，并在当前浏览器持久化', async () => {
    getInfraDashboard.mockResolvedValue(onlineDashboardResponse);
    const { runtime, cleanup } = mountComposable();
    cleanups.push(cleanup);
    await runtime.refresh();

    runtime.setRefreshInterval(30_000);
    expect(runtime.refreshIntervalMs.value).toBe(30_000);
    expect(runtime.nextRefreshInSeconds.value).toBe(30);
    expect(localStorage.getItem(serverManagementRuntime.REFRESH_INTERVAL_STORAGE_KEY)).toBe('30000');

    await vi.advanceTimersByTimeAsync(29_999);
    expect(getInfraDashboard).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(getInfraDashboard).toHaveBeenCalledTimes(2);
  });

  it('暂停后不再自动请求，手动刷新仍可用', async () => {
    getInfraDashboard.mockResolvedValue(onlineDashboardResponse);
    const { runtime, cleanup } = mountComposable();
    cleanups.push(cleanup);
    await runtime.refresh();

    runtime.setRefreshInterval(0);
    expect(runtime.isAutoRefreshPaused.value).toBe(true);
    expect(runtime.nextRefreshInSeconds.value).toBeNull();

    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(getInfraDashboard).toHaveBeenCalledTimes(1);
    await runtime.refresh();
    expect(getInfraDashboard).toHaveBeenCalledTimes(2);
    expect(runtime.nextRefreshInSeconds.value).toBeNull();
  });

  it('页面切到后台时停止轮询，回到前台且已到期才立即刷新', async () => {
    getInfraDashboard.mockResolvedValue(onlineDashboardResponse);
    const { runtime, cleanup } = mountComposable();
    cleanups.push(cleanup);
    await runtime.refresh();
    await vi.advanceTimersByTimeAsync(2_000);

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(runtime.nextRefreshInSeconds.value).toBeNull();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(getInfraDashboard).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    await nextTick();
    expect(getInfraDashboard).toHaveBeenCalledTimes(2);
  });

  it('后台刷新失败时保留最后一次可用仪表盘并继续自动重试', async () => {
    getInfraDashboard.mockResolvedValueOnce(onlineDashboardResponse).mockRejectedValueOnce(new Error('network down'));
    const { runtime, cleanup } = mountComposable();
    cleanups.push(cleanup);
    await runtime.refresh();
    const previousDashboard = runtime.dashboard.value;

    await runtime.refresh();

    expect(runtime.dashboard.value).toBe(previousDashboard);
    expect(runtime.agentStatus.value).toBe('online');
    expect(runtime.isOnline.value).toBe(true);
    expect(runtime.refreshError.value).toBe('network down');
    expect(runtime.nextRefreshInSeconds.value).toBe(3);
  });
});
