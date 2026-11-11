import type { RouteLocationRaw, Router } from 'vue-router';

type ReturnTarget = RouteLocationRaw | (() => RouteLocationRaw);

function internalPath(router: Router, value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f]/u.test(value))
    return '';
  try {
    const route = router.resolve(value);
    return route.matched.length && route.name !== 'not-found' ? route.fullPath : '';
  } catch {
    return '';
  }
}

function targetValue(target: ReturnTarget): RouteLocationRaw {
  return typeof target === 'function' ? target() : target;
}

/** 返回已有站内记录；深链接用 replace 兜底，不能把“返回”变成新的访问。 */
export function returnToPreviousPage(router: Router, fallback: ReturnTarget, expectedSource?: string) {
  const previous = internalPath(router, router.options.history.state.back);
  if (previous && (!expectedSource || previous === internalPath(router, expectedSource))) router.back();
  else void router.replace(targetValue(fallback));
}

/** 在模块外壳挂载时固定入口，退出时跨过本模块的页签／文章记录，保留来源页与滚动历史。 */
export function createPageReturn(router: Router, fallback: ReturnTarget): () => void {
  const { back, position } = router.options.history.state;
  const source = internalPath(router, back);
  let pending = false;
  return () => {
    if (pending) return;
    const current = router.options.history.state.position;
    if (typeof position === 'number' && typeof current === 'number' && current >= position) {
      const delta = position - current - (source ? 1 : 0);
      if (delta < 0) {
        pending = true;
        const stop = router.afterEach((_to, _from, failure) => {
          stop();
          pending = false;
          // 直接打开模块后也可能积累内部历史：先退回入口再替换，避免父页再次退进本模块。
          if (!source && !failure && router.options.history.state.position === position)
            void router.replace(targetValue(fallback));
        });
        router.go(delta);
        return;
      }
      void router.replace(source || targetValue(fallback));
      return;
    }
    returnToPreviousPage(router, source || targetValue(fallback));
  };
}
