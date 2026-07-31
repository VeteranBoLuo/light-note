/**
 * 横向筛选条(chips)的选中项自动滚动:点击部分可见/贴边的条目时,把它平滑滚到容器中间,
 * 首尾条目经夹取后自然贴边。与搜索中心移动端类型筛选的交互一致。
 *
 * 说明:使用 offsetLeft(布局坐标)而非 getBoundingClientRect(视觉坐标),
 * 以免界面缩放(html zoom)下产生偏差;调用方需保证容器是目标的 offsetParent
 * (容器设置 position: relative)。
 */
export function resolveChipScrollLeft(metrics: {
  maxScroll: number;
  viewportWidth: number;
  targetOffsetLeft: number;
  targetWidth: number;
}): number {
  const maxScroll = Math.max(0, metrics.maxScroll);
  const centeredLeft = metrics.targetOffsetLeft - (metrics.viewportWidth - metrics.targetWidth) / 2;
  return Math.min(maxScroll, Math.max(0, centeredLeft));
}

export function scrollChipIntoCenter(container: HTMLElement | null | undefined, target: unknown): void {
  if (!(container instanceof HTMLElement) || !(target instanceof HTMLElement)) return;
  const left = resolveChipScrollLeft({
    maxScroll: container.scrollWidth - container.clientWidth,
    viewportWidth: container.clientWidth,
    targetOffsetLeft: target.offsetLeft,
    targetWidth: target.offsetWidth,
  });
  container.scrollTo({ left, behavior: 'smooth' });
}
