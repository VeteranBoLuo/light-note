import { describe, expect, it, vi } from 'vitest';
import {
  captureContinuousAnimationHandoff,
  hasPrerenderedApplicationContent,
  waitForApplicationMountReadiness,
} from './appMountReadiness';

function createAnimation(name: string, currentTime: number | null, iterations: number = Infinity) {
  return {
    animationName: name,
    currentTime,
    effect: {
      getTiming: () => ({ iterations }),
    },
  } as unknown as Animation;
}

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

  it('客户端接管后延续预渲染首屏的持续动画相位', () => {
    const oldOrb = createAnimation('orbFloat', 2_400);
    const oldShimmer = createAnimation('shimmer', 1_200);
    const completedAnimation = createAnimation('oneShot', 500, 1);
    const newOrb = createAnimation('orbFloat', 0);
    const newShimmer = createAnimation('shimmer', 0);
    const newCompletedAnimation = createAnimation('oneShot', 0, 1);
    const appRoot = {
      getAnimations: vi
        .fn()
        .mockReturnValueOnce([oldOrb, oldShimmer, completedAnimation])
        .mockReturnValueOnce([newOrb, newShimmer, newCompletedAnimation]),
    } as unknown as Element;
    const now = vi.fn().mockReturnValueOnce(3_000).mockReturnValueOnce(3_025);

    const restore = captureContinuousAnimationHandoff(appRoot, now);
    restore();

    expect(newOrb.currentTime).toBe(2_425);
    expect(newShimmer.currentTime).toBe(1_225);
    expect(newCompletedAnimation.currentTime).toBe(0);
  });

  it('浏览器不支持动画枚举时安全跳过', () => {
    const appRoot = document.createElement('div');

    expect(() => captureContinuousAnimationHandoff(appRoot)()).not.toThrow();
  });
});
