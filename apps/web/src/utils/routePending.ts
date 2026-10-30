import { computed, shallowRef } from 'vue';
import type { RouteLocationNormalized, Router } from 'vue-router';

/** 已缓存的模块通常几十毫秒内切换完成，延迟出现避免每次首次切换都闪一下等待页。 */
export const ROUTE_PENDING_SHOW_DELAY = 150;
export const ROUTE_PENDING_SLOW_DELAY = 3000;

interface RoutePendingState {
  to: RouteLocationNormalized;
  visible: boolean;
  slow: boolean;
}

const state = shallowRef<RoutePendingState | null>(null);
let timers: ReturnType<typeof setTimeout>[] = [];

function clear() {
  timers.forEach(clearTimeout);
  timers = [];
  state.value = null;
}

function update(to: RouteLocationNormalized, patch: Partial<RoutePendingState>) {
  if (state.value?.to === to) state.value = { ...state.value, ...patch };
}

/** Vue Router 解析懒加载组件后会把记录里的加载函数替换成组件对象。 */
function hasUnresolvedComponent(to: RouteLocationNormalized) {
  return to.matched.some((record) =>
    Object.values(record.components || {}).some((component) => typeof component === 'function'),
  );
}

/**
 * 记录“目标模块代码还没到”的导航，供布局立即切换导航高亮并在内容区显示等待态。
 * 路由解析方式、守卫与分包失败自愈都保持不变；导航完成、取消、重定向或出错都会清除状态。
 */
export function installRoutePending(router: Router) {
  router.beforeEach((to, from) => {
    clear();
    // 首次进入由应用启动加载态负责。
    if (!from.matched.length || !hasUnresolvedComponent(to)) return;
    state.value = { to, visible: false, slow: false };
    timers = [
      setTimeout(() => update(to, { visible: true }), ROUTE_PENDING_SHOW_DELAY),
      setTimeout(() => update(to, { slow: true }), ROUTE_PENDING_SLOW_DELAY),
    ];
  });
  router.afterEach((to) => {
    if (state.value?.to === to) clear();
  });
  router.onError((_error, to) => {
    if (state.value?.to === to) clear();
  });
}

export function useRoutePending() {
  return {
    /** 正在等待代码的目标路由，用于立即切换导航高亮。 */
    target: computed(() => state.value?.to ?? null),
    visible: computed(() => Boolean(state.value?.visible)),
    slow: computed(() => Boolean(state.value?.slow)),
  };
}
