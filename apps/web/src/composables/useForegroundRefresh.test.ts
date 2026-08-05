import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from 'vue';
import { useForegroundRefresh, type UseForegroundRefreshOptions } from './useForegroundRefresh';

/** 项目未安装 @vue/test-utils，按既有约定用 createApp + 游离节点承载 composable。 */
function mountComposable(options: UseForegroundRefreshOptions) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  let api!: ReturnType<typeof useForegroundRefresh>;
  const app = createApp({
    setup() {
      api = useForegroundRefresh(options);
      return () => null;
    },
  });
  app.mount(host);
  return {
    api,
    unmount() {
      app.unmount();
      host.remove();
    },
  };
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
}

function wake() {
  document.dispatchEvent(new Event('visibilitychange'));
}

/** 每次唤醒之间要跨过去抖动窗口，否则第二次会被当成同一次唤醒。 */
function advancePastDedupe() {
  vi.setSystemTime(Date.now() + 2000);
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-08-05T10:00:00Z'));
  setVisibility('visible');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('回到前台时的静默刷新', () => {
  it('数据还新鲜时不发请求', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { unmount } = mountComposable({ refresh, staleMs: 5 * 60 * 1000 });

    advancePastDedupe();
    wake();
    await Promise.resolve();

    expect(refresh).not.toHaveBeenCalled();
    unmount();
  });

  it('超过陈旧阈值后回到前台会静默刷新一次', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { api, unmount } = mountComposable({ refresh, staleMs: 60 * 1000 });

    vi.setSystemTime(Date.now() + 5 * 60 * 1000);
    wake();
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(api.refreshing.value).toBe(false);
    unmount();
  });

  it('刷新过后时间戳重置，紧接着再唤醒不会重复请求', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { unmount } = mountComposable({ refresh, staleMs: 60 * 1000 });

    vi.setSystemTime(Date.now() + 5 * 60 * 1000);
    wake();
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    advancePastDedupe();
    wake();
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('页面不可见时的事件不触发刷新', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { unmount } = mountComposable({ refresh, staleMs: 0 });

    setVisibility('hidden');
    advancePastDedupe();
    wake();
    await Promise.resolve();

    expect(refresh).not.toHaveBeenCalled();
    unmount();
  });

  it('canRefresh 为 false 时跳过，且不更新时间戳，下次回到前台仍会重试', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    let allowed = false;
    const { unmount } = mountComposable({ refresh, staleMs: 60 * 1000, canRefresh: () => allowed });

    vi.setSystemTime(Date.now() + 5 * 60 * 1000);
    wake();
    await Promise.resolve();
    expect(refresh).not.toHaveBeenCalled();

    allowed = true;
    advancePastDedupe();
    wake();
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    unmount();
  });

  it('enabled 为 false 时整页停用', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { unmount } = mountComposable({ refresh, staleMs: 0, enabled: () => false });

    advancePastDedupe();
    wake();
    await Promise.resolve();

    expect(refresh).not.toHaveBeenCalled();
    unmount();
  });

  it('刷新失败时吞掉异常，并且下次回到前台会重试', async () => {
    const refresh = vi.fn().mockRejectedValue(new Error('network'));
    const { api, unmount } = mountComposable({ refresh, staleMs: 60 * 1000 });

    vi.setSystemTime(Date.now() + 5 * 60 * 1000);
    wake();
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(api.refreshing.value).toBe(false);

    advancePastDedupe();
    wake();
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    unmount();
  });

  it('去抖窗口内的连续唤醒只算一次', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { unmount } = mountComposable({ refresh, staleMs: 0 });

    advancePastDedupe();
    wake();
    window.dispatchEvent(new Event('focus'));
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    expect(refresh).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('markLoaded 会重置陈旧计时', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { api, unmount } = mountComposable({ refresh, staleMs: 60 * 1000 });

    vi.setSystemTime(Date.now() + 5 * 60 * 1000);
    api.markLoaded();
    wake();
    await Promise.resolve();

    expect(refresh).not.toHaveBeenCalled();
    unmount();
  });

  it('卸载后不再响应唤醒事件', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { unmount } = mountComposable({ refresh, staleMs: 0 });
    unmount();

    advancePastDedupe();
    wake();
    window.dispatchEvent(new Event('focus'));
    await Promise.resolve();

    expect(refresh).not.toHaveBeenCalled();
  });
});
