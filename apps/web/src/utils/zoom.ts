/**
 * 当前「界面缩放」倍数 —— utils/savePreference.ts 的 applyDisplaySettings 给 <html> 设的 zoom(0.9 / 1 / 1.1),
 * 无缩放返回 1。
 *
 * 为什么浮层定位要用它:CSS zoom 会缩放整棵子树(含其中 fixed/absolute 后代的坐标系),
 * 而 getBoundingClientRect()/MouseEvent.clientX 返回的是"视觉视口坐标"(已含 zoom)。若把读到的视觉坐标
 * 直接写进 teleport 到 body 的 fixed/absolute 面板 top/left,面板会被 zoom 再缩放一次 → 双重缩放、错位
 * (偏移量随距视口左上角的距离线性增大)。
 *
 * 修法:写入 fixed/absolute 定位前,把 getBoundingClientRect/clientX 得到的视觉坐标 ÷ getRootZoom(),
 * 换算回 html 局部(布局)坐标。offsetWidth/offsetHeight/clientWidth/clientHeight 本就是布局像素、无需换算。
 */
/**
 * 把浏览器返回的 CSS zoom 值统一换成倍率。
 *
 * Chromium 通常返回 "1"，部分 Android WebView 会返回 "100%"。直接 parseFloat("100%")
 * 会得到 100，导致所有依赖 zoom 的浮层坐标被缩小 100 倍并挤到视口左上角。
 */
export function parseCssZoom(value?: string | null): number {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === 'normal') return 1;

  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return normalized.endsWith('%') ? parsed / 100 : parsed;
}

export function getRootZoom(): number {
  // 只认轻笺设置在 <html style="zoom:…"> 上的显式值。部分鸿蒙 Android 兼容层会把
  // getComputedStyle(html).zoom 错误返回为设备像素密度（真机为 3.5），它不是 CSS zoom，
  // 若参与坐标换算会把所有浮层挤到视口左上角。
  return parseCssZoom(document.documentElement.style.zoom);
}

export interface RootZoomRect {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

/** 把 getBoundingClientRect() 的视觉坐标统一换算成 html zoom 子树中的布局坐标。 */
export function normalizeRectForRootZoom(
  rect: Pick<DOMRect, 'top' | 'right' | 'bottom' | 'left' | 'width' | 'height'>,
  rootZoom = getRootZoom(),
): RootZoomRect {
  const zoom = Number.isFinite(rootZoom) && rootZoom > 0 ? rootZoom : 1;
  return {
    top: rect.top / zoom,
    right: rect.right / zoom,
    bottom: rect.bottom / zoom,
    left: rect.left / zoom,
    width: rect.width / zoom,
    height: rect.height / zoom,
  };
}

/**
 * 在滚动容器内滚动到目标元素,内部已换算界面缩放(<html> zoom)。
 * 「滚动到某元素」一律用它,不要再裸写 getBoundingClientRect + scrollTo——否则 zoom≠1 时
 * 视觉坐标(rect)与布局坐标(scrollTop)混用会定位偏移(参见本文件顶部说明)。
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
  const top =
    (el.getBoundingClientRect().top - container.getBoundingClientRect().top) / getRootZoom() +
    container.scrollTop -
    offset;
  container.scrollTo({ top, behavior });
}

/**
 * 仅当目标元素越出滚动容器可视区时，把它移动到最近边缘。
 *
 * 与原生 `scrollIntoView({ block: 'nearest' })` 相比，这里只滚动调用方明确传入的容器，
 * 不会连带推动浮层外面的页面；同时统一换算根节点 CSS zoom，避免设置界面缩放后滚动不足或过量。
 * 键盘高亮这类连续操作建议使用 `auto`，防止平滑动画在快速连按时排队。
 */
export function scrollNearestIntoContainer(
  container: HTMLElement,
  el: HTMLElement,
  behavior: ScrollBehavior = 'auto',
): void {
  const containerRect = container.getBoundingClientRect();
  const elementRect = el.getBoundingClientRect();
  const zoom = getRootZoom();
  let delta = 0;

  if (elementRect.top < containerRect.top) delta = elementRect.top - containerRect.top;
  else if (elementRect.bottom > containerRect.bottom) delta = elementRect.bottom - containerRect.bottom;
  else return;

  container.scrollTo({
    top: container.scrollTop + delta / zoom,
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
