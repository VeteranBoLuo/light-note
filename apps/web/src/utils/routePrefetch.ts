import type { RouteLocationRaw, Router } from 'vue-router';

const warmedLoaders = new WeakSet<Function>();
const inFlightLoaders = new WeakMap<Function, Promise<unknown>>();

/**
 * 在 pointerdown/focus 阶段预热目标路由分包。只触发用户已经表达意图的单个目标，
 * 不做全站无差别预取，避免弱网和省流量模式下反而抢占当前页面带宽。
 */
export function prefetchResolvedRoute(router: Router, target: RouteLocationRaw): Promise<void> {
  const loaders = router
    .resolve(target)
    .matched.flatMap((record) => Object.values(record.components || {}))
    .filter((component): component is () => Promise<unknown> => typeof component === 'function');

  return Promise.all(
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
  ).then(() => undefined);
}
