import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scheduleLandingStartupPreload, shouldPreloadLandingTarget } from './landingPreload';

describe('官网应用入口预热策略', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('只在前台、正常网络和真实浏览环境中预热', () => {
    const base = { online: true, visibilityState: 'visible', connection: { effectiveType: '4g' } };
    expect(shouldPreloadLandingTarget(base)).toBe(true);

    [
      { online: false },
      { visibilityState: 'hidden' },
      { webdriver: true },
      { prerender: true },
      { connection: { effectiveType: '2g' } },
      { connection: { effectiveType: '3g' } },
      { connection: { saveData: true } },
    ].forEach((override) => expect(shouldPreloadLandingTarget({ ...base, ...override })).toBe(false));
  });

  it('首屏空闲后按主入口、次入口顺序预热', async () => {
    let idleCallback: IdleRequestCallback | null = null;
    const primary = vi.fn().mockResolvedValue(undefined);
    const secondary = vi.fn().mockResolvedValue(undefined);
    const windowRef = {
      setTimeout: window.setTimeout.bind(window),
      clearTimeout: window.clearTimeout.bind(window),
      requestIdleCallback: vi.fn((callback: IdleRequestCallback) => {
        idleCallback = callback;
        return 9;
      }),
      cancelIdleCallback: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const documentRef = {
      visibilityState: 'visible',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const connection = { effectiveType: '4g', addEventListener: vi.fn(), removeEventListener: vi.fn() };

    const dispose = scheduleLandingStartupPreload({
      preloadPrimary: primary,
      preloadSecondary: secondary,
      windowRef,
      documentRef,
      navigatorRef: { onLine: true, connection },
    });

    await vi.advanceTimersByTimeAsync(899);
    expect(windowRef.requestIdleCallback).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    idleCallback?.({ didTimeout: false, timeRemaining: () => 20 });
    await Promise.resolve();
    await Promise.resolve();
    expect(primary).toHaveBeenCalledTimes(1);
    expect(secondary).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_800);
    idleCallback?.({ didTimeout: false, timeRemaining: () => 20 });
    await Promise.resolve();
    expect(secondary).toHaveBeenCalledTimes(1);
    expect(primary.mock.invocationCallOrder[0]).toBeLessThan(secondary.mock.invocationCallOrder[0]);
    dispose();
  });

  it('销毁后取消任务并解绑可用性监听', async () => {
    const primary = vi.fn().mockResolvedValue(undefined);
    const windowRef = {
      setTimeout: window.setTimeout.bind(window),
      clearTimeout: window.clearTimeout.bind(window),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const documentRef = {
      visibilityState: 'visible',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const connection = { effectiveType: '4g', addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const dispose = scheduleLandingStartupPreload({
      preloadPrimary: primary,
      windowRef,
      documentRef,
      navigatorRef: { onLine: true, connection },
    });

    dispose();
    await vi.runAllTimersAsync();
    expect(primary).not.toHaveBeenCalled();
    expect(documentRef.removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(windowRef.removeEventListener).toHaveBeenCalledWith('online', expect.any(Function));
    expect(connection.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
