import { describe, expect, it, vi } from 'vitest';
import { hasPrerenderedApplicationContent, waitForApplicationMountReadiness } from './appMountReadiness';

describe('application mount readiness', () => {
  it('普通 SPA 空壳不额外等待首路由', async () => {
    const appRoot = document.createElement('div');
    const prepareLocale = vi.fn(() => Promise.resolve());
    const waitForInitialRoute = vi.fn(() => Promise.resolve());

    expect(hasPrerenderedApplicationContent(appRoot)).toBe(false);
    await waitForApplicationMountReadiness({ appRoot, prepareLocale, waitForInitialRoute });

    expect(prepareLocale).toHaveBeenCalledTimes(1);
    expect(waitForInitialRoute).not.toHaveBeenCalled();
  });

  it('已有预渲染首屏时同时等待语言和初始路由后再接管', async () => {
    const appRoot = document.createElement('div');
    appRoot.append(document.createElement('main'));
    let resolveLocale!: () => void;
    let resolveRoute!: () => void;
    const prepareLocale = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveLocale = resolve;
        }),
    );
    const waitForInitialRoute = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRoute = resolve;
        }),
    );

    expect(hasPrerenderedApplicationContent(appRoot)).toBe(true);
    let settled = false;
    const readiness = waitForApplicationMountReadiness({ appRoot, prepareLocale, waitForInitialRoute }).then(() => {
      settled = true;
    });

    expect(prepareLocale).toHaveBeenCalledTimes(1);
    expect(waitForInitialRoute).toHaveBeenCalledTimes(1);
    resolveLocale();
    await Promise.resolve();
    expect(settled).toBe(false);
    resolveRoute();
    await readiness;
    expect(settled).toBe(true);
  });
});
