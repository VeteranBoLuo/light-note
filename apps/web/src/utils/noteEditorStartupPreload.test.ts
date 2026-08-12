import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scheduleNoteEditorStartupPreload, shouldPreloadNoteEditors } from './noteEditorStartupPreload';

describe('笔记编辑器启动预热策略', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('受支持的平台在正常网络下可预热，策略不依赖登录状态', () => {
    const baseContext = {
      applicationRoute: true,
      online: true,
      visibilityState: 'visible',
      connection: { effectiveType: '4g' },
    };

    expect(shouldPreloadNoteEditors({ ...baseContext, supportedPlatform: true })).toBe(true);
    // 上下文没有用户或角色字段，游客与登录用户统一走同一条性能链路。
    expect(Object.keys(baseContext)).not.toContain('authenticated');

    const blocked = [
      { supportedPlatform: false },
      { applicationRoute: false },
      { online: false },
      { visibilityState: 'hidden' },
      { webdriver: true },
      { prerender: true },
      { connection: { effectiveType: '2g' } },
      { connection: { effectiveType: '3g' } },
      { connection: { saveData: true } },
    ];

    blocked.forEach((override) => {
      expect(
        shouldPreloadNoteEditors({
          supportedPlatform: true,
          ...baseContext,
          ...override,
        }),
      ).toBe(false);
    });
  });

  it('首屏延迟和空闲门禁后，先预热详情路由，再同时预热 HTML 与 Markdown', async () => {
    let idleCallback: IdleRequestCallback | null = null;
    const preloadRoute = vi.fn().mockResolvedValue(undefined);
    const preloadEditor = vi.fn().mockResolvedValue(undefined);
    const windowRef = {
      setTimeout: window.setTimeout.bind(window),
      clearTimeout: window.clearTimeout.bind(window),
      requestIdleCallback: vi.fn((callback: IdleRequestCallback) => {
        idleCallback = callback;
        return 7;
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
    const navigatorRef = {
      onLine: true,
      webdriver: false,
      connection: { effectiveType: '4g', addEventListener: vi.fn(), removeEventListener: vi.fn() },
    };

    const dispose = scheduleNoteEditorStartupPreload({
      supportedPlatform: true,
      applicationRoute: true,
      preloadRoute,
      preloadEditor,
      windowRef,
      documentRef,
      navigatorRef,
    });

    await vi.advanceTimersByTimeAsync(1_999);
    expect(windowRef.requestIdleCallback).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(windowRef.requestIdleCallback).toHaveBeenCalledTimes(1);
    expect(preloadRoute).not.toHaveBeenCalled();

    idleCallback?.({ didTimeout: false, timeRemaining: () => 20 });
    await Promise.resolve();
    await Promise.resolve();

    expect(preloadRoute).toHaveBeenCalledTimes(1);
    expect(preloadEditor.mock.calls).toEqual([['html'], ['markdown']]);
    expect(preloadRoute.mock.invocationCallOrder[0]).toBeLessThan(preloadEditor.mock.invocationCallOrder[0]);
    dispose();
  });

  it('省流、慢速网络或纯展示页面下两套编辑器都不启动', async () => {
    const preloadRoute = vi.fn().mockResolvedValue(undefined);
    const preloadEditor = vi.fn().mockResolvedValue(undefined);
    const dispose = scheduleNoteEditorStartupPreload({
      supportedPlatform: true,
      applicationRoute: false,
      preloadRoute,
      preloadEditor,
      delayMs: 10,
      windowRef: {
        setTimeout: window.setTimeout.bind(window),
        clearTimeout: window.clearTimeout.bind(window),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
      documentRef: {
        visibilityState: 'visible',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
      navigatorRef: {
        onLine: true,
        connection: { effectiveType: '4g' },
      },
    });

    await vi.runAllTimersAsync();
    expect(preloadRoute).not.toHaveBeenCalled();
    expect(preloadEditor).not.toHaveBeenCalled();
    dispose();
  });

  it('销毁时取消尚未开始的延迟任务并解绑监听', async () => {
    const preloadRoute = vi.fn().mockResolvedValue(undefined);
    const preloadEditor = vi.fn().mockResolvedValue(undefined);
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
    const dispose = scheduleNoteEditorStartupPreload({
      supportedPlatform: true,
      applicationRoute: true,
      preloadRoute,
      preloadEditor,
      windowRef,
      documentRef,
      navigatorRef: { onLine: true, connection },
    });

    dispose();
    await vi.runAllTimersAsync();
    expect(preloadRoute).not.toHaveBeenCalled();
    expect(preloadEditor).not.toHaveBeenCalled();
    expect(documentRef.removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(windowRef.removeEventListener).toHaveBeenCalledWith('online', expect.any(Function));
    expect(windowRef.removeEventListener).toHaveBeenCalledWith('offline', expect.any(Function));
    expect(connection.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
