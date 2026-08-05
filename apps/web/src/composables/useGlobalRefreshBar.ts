import { computed, onScopeDispose, ref, toValue, watch, type MaybeRefOrGetter } from 'vue';

/**
 * 移动端顶栏下沿那条统一的静默刷新提示。
 *
 * 为什么要收成全局一条，而不是每页各挂一条：
 * 各页的滚动结构完全不同 —— 今日页根节点本身就是滚动容器，收集箱的滚动容器套在
 * 圆角面板里，资源中心是 20px 圆角卡片且父级不能 overflow: hidden（会裁掉筛选浮层）。
 * 逐页找一个「不随内容滚走又不溢出圆角」的位置，每页都是一次单独的取舍。
 * 顶栏下沿只有一处，位置固定，所有页面共享同一个视觉语言。
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
