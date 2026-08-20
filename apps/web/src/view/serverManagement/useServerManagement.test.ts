import { createApp, h, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getInfraDashboard = vi.fn();
const executeInfraAction = vi.fn();

vi.mock('@/api/infraApi', () => ({ getInfraDashboard, executeInfraAction }));

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

describe('服务器管理轮询与高风险动作', () => {
  const cleanups: Array<() => void> = [];

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  afterEach(() => {
    cleanups.splice(0).forEach((cleanup) => cleanup());
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

  it('结果不确定时重试沿用幂等键，成功后才清除并刷新', async () => {
    getInfraDashboard.mockResolvedValue(onlineDashboardResponse);
    executeInfraAction.mockRejectedValueOnce(new Error('temporary failure')).mockResolvedValueOnce({
      status: 200,
      msg: 'ok',
      data: { state: 'succeeded' },
    });
    const { runtime, cleanup } = mountComposable();
    cleanups.push(cleanup);
    await runtime.refresh();

    const confirmation = { reason: '发布后重载配置', confirmed: true as const, confirmText: '确认执行' };
    await expect(runtime.runAction('nginx.reload', 'nginx', confirmation)).rejects.toThrow('temporary failure');
    await expect(runtime.runAction('nginx.reload', 'nginx', confirmation)).resolves.toMatchObject({ status: 200 });

    expect(executeInfraAction).toHaveBeenCalledTimes(2);
    const firstPayload = executeInfraAction.mock.calls[0][0];
    const secondPayload = executeInfraAction.mock.calls[1][0];
    expect(firstPayload.idempotencyKey).toBeTruthy();
    expect(secondPayload.idempotencyKey).toBe(firstPayload.idempotencyKey);
    expect(getInfraDashboard).toHaveBeenCalledTimes(2);
  });

  it('收到权威失败终态后为新尝试更换幂等键', async () => {
    getInfraDashboard.mockResolvedValue(onlineDashboardResponse);
    executeInfraAction
      .mockRejectedValueOnce(
        Object.assign(new Error('command completed with failure'), {
          data: { receipt: { state: 'failed', exitCode: 1 } },
        }),
      )
      .mockResolvedValueOnce({ status: 200, msg: 'ok', data: { receipt: { state: 'succeeded' } } });
    const { runtime, cleanup } = mountComposable();
    cleanups.push(cleanup);
    await runtime.refresh();

    const confirmation = { reason: '修复配置后再次重载', confirmed: true as const, confirmText: '' };
    await expect(runtime.runAction('nginx.reload', 'nginx', confirmation)).rejects.toThrow(
      'command completed with failure',
    );
    await expect(runtime.runAction('nginx.reload', 'nginx', confirmation)).resolves.toMatchObject({ status: 200 });

    expect(executeInfraAction.mock.calls[1][0].idempotencyKey).not.toBe(
      executeInfraAction.mock.calls[0][0].idempotencyKey,
    );
  });

  it('页面刷新后仍复用未决动作的幂等键', async () => {
    getInfraDashboard.mockResolvedValue(onlineDashboardResponse);
    executeInfraAction.mockRejectedValueOnce(new Error('network interrupted')).mockResolvedValueOnce({
      status: 200,
      msg: 'ok',
      data: { receipt: { state: 'succeeded' } },
    });
    const confirmation = { reason: '重载配置后检查连接', confirmed: true as const, confirmText: '' };
    const firstMount = mountComposable();
    cleanups.push(firstMount.cleanup);
    await firstMount.runtime.refresh();
    await expect(firstMount.runtime.runAction('nginx.reload', 'nginx', confirmation)).rejects.toThrow(
      'network interrupted',
    );
    const firstKey = executeInfraAction.mock.calls[0][0].idempotencyKey;
    expect(sessionStorage.getItem(`${serverManagementRuntime.ACTION_KEY_STORAGE_PREFIX}nginx.reload:nginx`)).toBe(
      firstKey,
    );

    firstMount.cleanup();
    cleanups.splice(cleanups.indexOf(firstMount.cleanup), 1);
    const remounted = mountComposable();
    cleanups.push(remounted.cleanup);
    await remounted.runtime.refresh();
    await remounted.runtime.runAction('nginx.reload', 'nginx', confirmation);

    expect(executeInfraAction.mock.calls[1][0].idempotencyKey).toBe(firstKey);
    expect(sessionStorage.getItem(`${serverManagementRuntime.ACTION_KEY_STORAGE_PREFIX}nginx.reload:nginx`)).toBeNull();
  });
});
