import { computed, onScopeDispose, ref, toValue, watch, type MaybeRefOrGetter } from 'vue';

/**
 * 驱动 App.vue 里那条全局顶部进度条（`BLoading bar`）的静默刷新汇总状态。
 *
 * 为什么复用 BLoading 而不是每页挂一条：各页的滚动结构完全不同 —— 今日页根节点
 * 本身就是滚动容器（绝对定位的条会随内容滚走），收集箱的滚动容器套在圆角面板里，
 * 资源中心是 20px 圆角卡片且父级不能 overflow: hidden（会裁掉筛选浮层）。
 * 逐页挂条不只是重复，还会让「刷新提示」在每个模块出现在不同位置。
 * BLoading bar 是视口级 fixed 定位，与容器无关，PC 和移动端天然同一个位置。
 *
 * 它只负责静默刷新。下拉刷新有自己跟手的胶囊指示器，注册进来的状态要先排除
 * 下拉引起的那部分（写成 `() => refreshing.value && !pullRefresh.refreshing.value`），
 * 否则同一次刷新会被说两遍。
 */

/**
 * 用计数而不是布尔：同一页可能注册多个来源（前台恢复刷新 + 页面自身的软刷新），
 * 页面切换时新页面挂载常早于旧页面卸载，布尔值会被后卸载的那个错误地关掉。
 */
const activeSources = ref(0);

/** 当前是否有任何静默刷新在进行。 */
export const globalRefreshing = computed(() => activeSources.value > 0);

/**
 * 把一个静默刷新状态注册到全局提示条。
 *
 * 必须在 setup（或其他有 effect scope 的地方）内调用：作用域销毁时自动注销，
 * 页面在刷新途中被卸载也不会把计数永久留在大于 0。
 */
export function registerGlobalRefreshSource(source: MaybeRefOrGetter<boolean>) {
  let counted = false;

  const release = () => {
    if (!counted) return;
    counted = false;
    activeSources.value = Math.max(0, activeSources.value - 1);
  };

  watch(
    () => Boolean(toValue(source)),
    (active) => {
      if (active === counted) return;
      if (active) {
        counted = true;
        activeSources.value += 1;
      } else {
        release();
      }
    },
    { immediate: true },
  );

  onScopeDispose(release);
}

/** 仅供测试重置模块级计数。 */
export function resetGlobalRefreshSourcesForTest() {
  activeSources.value = 0;
}
