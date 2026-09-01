/**
 * 返回真正承接滚轮的最近祖先。页面级虚拟列表与异步内容切换必须共用这个判断，
 * 否则一个组件会监听外层，另一个组件却恢复到不同的滚动节点。
 */
export function findScrollContainer(element: HTMLElement): HTMLElement {
  let current = element.parentElement;
  while (current && current !== document.body) {
    const overflowY = window.getComputedStyle(current).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') return current;
    current = current.parentElement;
  }
  return (document.scrollingElement || document.documentElement) as HTMLElement;
}

export function restoreScrollTop(container: HTMLElement, scrollTop: number) {
  if (!container.isConnected) return;
  const maximum = Math.max(0, container.scrollHeight - container.clientHeight);
  container.scrollTop = Math.min(maximum, Math.max(0, scrollTop));
}
