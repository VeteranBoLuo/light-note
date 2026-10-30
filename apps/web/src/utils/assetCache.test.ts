import { afterEach, describe, expect, it, vi } from 'vitest';
import { syncServiceWorkerAssets } from './assetCache';

function installServiceWorker(controller: Partial<ServiceWorker> | null) {
  const target = new EventTarget() as EventTarget & { controller: Partial<ServiceWorker> | null };
  target.controller = controller;
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: target });
  return target;
}

function replyingWorker(reply: unknown) {
  return {
    postMessage: vi.fn((_message: unknown, transfer: MessagePort[]) => {
      transfer[0].postMessage(reply);
    }),
  } as unknown as ServiceWorker;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

describe('syncServiceWorkerAssets', () => {
  it('开发环境不与 Service Worker 交互', async () => {
    const worker = replyingWorker({ enabled: true, synced: true });
    installServiceWorker(worker);
    expect(await syncServiceWorkerAssets()).toBe(false);
    expect(worker.postMessage).not.toHaveBeenCalled();
  });

  it('生产环境请求按发布清单同步，资源缓存开启时返回已接管', async () => {
    vi.stubEnv('PROD', true);
    const worker = replyingWorker({ enabled: true, synced: true, pruned: 0 });
    installServiceWorker(worker);
    expect(await syncServiceWorkerAssets()).toBe(true);
    expect(vi.mocked(worker.postMessage).mock.calls[0][0]).toEqual({ type: 'assets.sync' });
  });

  it('总开关关闭或同步失败时不视为可持久缓存', async () => {
    vi.stubEnv('PROD', true);
    installServiceWorker(replyingWorker({ enabled: false }));
    expect(await syncServiceWorkerAssets()).toBe(false);
    installServiceWorker(replyingWorker({ error: 'ASSET_SYNC_FAILED' }));
    expect(await syncServiceWorkerAssets()).toBe(false);
  });

  it('首次访问等待新注册的 Service Worker 接管后再同步，超时则放弃', async () => {
    vi.stubEnv('PROD', true);
    const container = installServiceWorker(null);
    const pending = syncServiceWorkerAssets();
    container.controller = replyingWorker({ enabled: true, synced: true });
    container.dispatchEvent(new Event('controllerchange'));
    expect(await pending).toBe(true);

    vi.useFakeTimers();
    installServiceWorker(null);
    const timedOut = syncServiceWorkerAssets();
    await vi.advanceTimersByTimeAsync(15000);
    expect(await timedOut).toBe(false);
  });
});
