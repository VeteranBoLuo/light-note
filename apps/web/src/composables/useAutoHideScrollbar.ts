import { onBeforeUnmount, ref } from 'vue';

/**
 * 滚动条自动隐藏:默认不可见,滚动中显示,停止一段时间后淡出。
 * 配合 `.auto-hide-scrollbar` 样式使用(见 styles/scrollbar.less)。
 *
 * 只负责「是否正在滚动」这一个状态,hover 显示交给纯 CSS,
 * 免得给每个滚动容器都挂 mouseenter/leave。
 */
export function useAutoHideScrollbar(idleMs = 900) {
  const scrolling = ref(false);
  let timer = 0;

  function onScroll() {
    scrolling.value = true;
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      scrolling.value = false;
      timer = 0;
    }, idleMs);
  }

  onBeforeUnmount(() => {
    if (timer) window.clearTimeout(timer);
  });

  return { scrolling, onScroll };
}
