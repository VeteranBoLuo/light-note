/**
 * 在指定滚动容器内定位目标，避免连带滚动外部页面。
 * @param container overflow 滚动的容器
 * @param el 目标元素(container 的后代)
 * @param offset 目标顶部距容器顶的留白(px,布局坐标)
 * @param behavior 滚动行为；锚点导航默认平滑，聊天等必须一次到位的长距离定位可传 auto
 */
export function scrollIntoContainer(
  container: HTMLElement,
  el: HTMLElement,
  offset = 0,
  behavior: ScrollBehavior = 'smooth',
): void {
  const top = el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - offset;
  container.scrollTo({ top, behavior });
}

/**
 * 把目标元素中心对齐到指定滚动容器的可视中心；用于画纸、海报等整体内容的首次落点。
 * 只滚动调用方传入的容器，并限制到合法滚动范围，避免目标较短或靠近边缘时产生过量位移。
 */
export function scrollCenterIntoContainer(
  container: HTMLElement,
  el: HTMLElement,
  behavior: ScrollBehavior = 'auto',
): void {
  const containerRect = container.getBoundingClientRect();
  const elementRect = el.getBoundingClientRect();
  const centerDelta = elementRect.top + elementRect.height / 2 - (containerRect.top + containerRect.height / 2);
  const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
  const top = Math.max(0, Math.min(maxScrollTop, container.scrollTop + centerDelta));
  container.scrollTo({ top, behavior });
}

/**
 * 仅当目标元素越出滚动容器可视区时，把它移动到最近边缘。
 *
 * 与原生 `scrollIntoView({ block: 'nearest' })` 相比，这里只滚动调用方明确传入的容器，
 * 不会连带推动浮层外面的页面。
 * 键盘高亮这类连续操作建议使用 `auto`，防止平滑动画在快速连按时排队。
 */
export function scrollNearestIntoContainer(
  container: HTMLElement,
  el: HTMLElement,
  behavior: ScrollBehavior = 'auto',
): void {
  const containerRect = container.getBoundingClientRect();
  const elementRect = el.getBoundingClientRect();
  let delta = 0;

  if (elementRect.top < containerRect.top) delta = elementRect.top - containerRect.top;
  else if (elementRect.bottom > containerRect.bottom) delta = elementRect.bottom - containerRect.bottom;
  else return;

  container.scrollTo({
    top: container.scrollTop + delta,
    behavior,
  });
}

/**
 * 从目标元素向上查找当前真正承担纵向滚动的祖先。
 *
 * 响应式页面可能在不同断点切换滚动层级：桌面端由内容区滚动，移动端则由页面外壳滚动。
 * 只按固定 class 取容器会让其中一端对不可滚动元素调用 scrollTo，筛选等状态已经变化，
 * 但页面没有任何位移，最终表现为“点击无反应”。
 *
 * `fallback` 用于内容高度不足、当前没有任何祖先真正溢出时保留调用方的稳定容器。
 */
export function findVerticalScrollContainer(
  element: HTMLElement,
  fallback: HTMLElement | null = null,
): HTMLElement | null {
  let current = element.parentElement;
  while (current) {
    const overflowY = window.getComputedStyle(current).overflowY;
    const allowsVerticalScroll = /^(auto|scroll|overlay)$/u.test(overflowY);
    if (allowsVerticalScroll && current.scrollHeight > current.clientHeight + 1) return current;
    current = current.parentElement;
  }
  return fallback;
}
