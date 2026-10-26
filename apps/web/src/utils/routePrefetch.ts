import type { RouteLocationNormalized, RouteLocationRaw, Router } from 'vue-router';
import { holdForegroundActivity, withForegroundActivity } from '@/http/requestActivity';
import { scheduleStaticPrewarm } from './staticPrewarm';
import { publicArtworkUrl } from './publicArtwork';
import { isMobileViewport } from '@/config/responsive';

const warmedLoaders = new WeakSet<Function>();
const inFlightLoaders = new WeakMap<Function, Promise<unknown>>();

/** Keep background traffic paused through async guards, redirects and route imports. */
export function trackNavigationActivity(router: Router) {
  let current: { target: RouteLocationNormalized; release: () => void } | undefined;
  const clear = () => {
    current?.release();
    current = undefined;
  };
  const settle = (to: RouteLocationNormalized) => {
    // A redirect can terminate in an earlier guard, before our beforeEach runs again.
    for (let target: RouteLocationNormalized | undefined = to; target; target = target.redirectedFrom) {
      if (target === current?.target) {
        clear();
        return;
      }
    }
  };
  const before = router.beforeEach((to) => {
    clear();
    current = { target: to, release: holdForegroundActivity() };
  });
  const after = router.afterEach(settle);
  const error = router.onError((_error, to) => settle(to));
  return () => {
    clear();
    before();
    after();
    error();
  };
}

let stopArtworkIntent: (() => void) | undefined;
export function stopRouteArtworkPrewarm() {
  stopArtworkIntent?.();
  stopArtworkIntent = undefined;
}

/**
 * 在 pointerdown/focus 阶段预热目标路由分包。只触发用户已经表达意图的单个目标，
 * 不做全站无差别预取，避免弱网和省流量模式下反而抢占当前页面带宽。
 */
export function prefetchResolvedRoute(router: Router, target: RouteLocationRaw): Promise<void> {
  stopRouteArtworkPrewarm();
  const routeName = String(router.resolve(target).name || '');
  const scene = ({ support: 'support', entitlementStore: 'store', campaign: 'campaign' } as Record<string, string>)[
    routeName
  ];
  if (scene) {
    const asset = isMobileViewport(window.innerWidth)
      ? `${scene}-mobile`
      : scene === 'campaign'
        ? 'campaign-hd-top'
        : `${scene}-strip-top`;
    stopArtworkIntent = scheduleStaticPrewarm({ priority: 1, urls: [publicArtworkUrl(`/brand-scenes/${asset}.webp`)] });
  }
  const loaders = router
    .resolve(target)
    .matched.flatMap((record) => Object.values(record.components || {}))
    .filter((component): component is () => Promise<unknown> => typeof component === 'function');

  return withForegroundActivity(() =>
    Promise.all(
      loaders.map((loader) => {
        if (warmedLoaders.has(loader)) return Promise.resolve();
        const existing = inFlightLoaders.get(loader);
        if (existing) return existing;
        const request = Promise.resolve()
          .then(() => loader())
          .then((result) => {
            warmedLoaders.add(loader);
            inFlightLoaders.delete(loader);
            return result;
          })
          .catch((error) => {
            inFlightLoaders.delete(loader);
            throw error;
          });
        inFlightLoaders.set(loader, request);
        return request;
      }),
    ).then(() => undefined),
  );
}
