import { createApp, h, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useInfraSnapshot } from './useInfraSnapshot';

function mountSnapshot<T>(loader: () => Promise<{ data: T }>, intervalMs = 0) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  let runtime: ReturnType<typeof useInfraSnapshot<T>> | null = null;
  const app = createApp({
    setup() {
      runtime = useInfraSnapshot(loader, intervalMs);
      return () => h('div');
    },
  });
  app.mount(host);
  return {
    runtime: runtime as unknown as ReturnType<typeof useInfraSnapshot<T>>,
    cleanup: () => {
      app.unmount();
      host.remove();
    },
  };
}

describe('服务器分域快照轮询', () => {
  const cleanups: Array<() => void> = [];
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });
  afterEach(() => {
    cleanups.splice(0).forEach((cleanup) => cleanup());
    vi.useRealTimers();
  });

  it('上一轮请求未结束时合并自动与手动刷新，不产生重叠采集', async () => {
    let resolve!: (value: { data: { value: number } }) => void;
    const loader = vi.fn(
      () =>
        new Promise<{ data: { value: number } }>((done) => {
          resolve = done;
        }),
    );
    const { runtime, cleanup } = mountSnapshot(loader, 3_000);
    cleanups.push(cleanup);
    const manual = runtime.refresh();
    expect(loader).toHaveBeenCalledTimes(1);
    resolve({ data: { value: 1 } });
    await manual;
    await nextTick();
    expect(runtime.data.value).toEqual({ value: 1 });
  });

  it('刷新失败时保留上次成功快照并继续按领域周期重试', async () => {
    const loader = vi
      .fn()
      .mockResolvedValueOnce({ data: { value: 1 } })
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce({ data: { value: 2 } });
    const { runtime, cleanup } = mountSnapshot(loader, 10_000);
    cleanups.push(cleanup);
    await runtime.refresh();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(runtime.data.value).toEqual({ value: 1 });
    expect(runtime.error.value).toBe('temporary');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(runtime.data.value).toEqual({ value: 2 });
    expect(runtime.error.value).toBe('');
  });
});
