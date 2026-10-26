import { holdRequestActivity } from '@/http/requestActivity';

/** Observe only while prewarming has work. Visible images are incremental work, not user input. */
export function observePrewarmImages() {
  const images = new Map<HTMLImageElement, { source: string; visible: boolean; release?: () => void }>();
  let disposed = false;
  let timer: number | undefined;
  const sourceOf = (image: HTMLImageElement) => [image.src, image.srcset, image.sizes, image.currentSrc].join('\n');
  function sync(image: HTMLImageElement, settled = false) {
    const state = images.get(image);
    if (!state) return;
    const source = sourceOf(image);
    if (source !== state.source) {
      state.release?.();
      state.release = undefined;
      state.source = source;
    }
    const loading =
      !settled &&
      image.isConnected &&
      state.visible &&
      !image.complete &&
      Boolean(image.getAttribute('src') || image.srcset) &&
      getComputedStyle(image).visibility !== 'hidden';
    if (loading && !state.release) state.release = holdRequestActivity('incremental');
    else if (!loading) {
      state.release?.();
      state.release = undefined;
    }
  }
  const intersection =
    typeof IntersectionObserver === 'undefined'
      ? undefined
      : new IntersectionObserver((entries) => {
          if (disposed) return;
          for (const entry of entries) {
            const image = entry.target as HTMLImageElement;
            const state = images.get(image);
            if (state) {
              state.visible = entry.isIntersecting;
              sync(image);
            }
          }
        });
  const changed = new Set<HTMLImageElement>();
  function collect(node: Node) {
    if (node instanceof HTMLImageElement) changed.add(node);
    if (node instanceof Element) node.querySelectorAll('img').forEach((image) => changed.add(image));
  }
  function scan() {
    timer = undefined;
    if (disposed) return;
    const batch = [...changed];
    changed.clear();
    for (const image of batch) {
      const state = images.get(image);
      if (!image.isConnected) {
        images.delete(image);
        intersection?.unobserve(image);
        state?.release?.();
        continue;
      }
      if (!state) {
        images.set(image, { source: sourceOf(image), visible: false });
        intersection?.observe(image);
      }
      if (!intersection) {
        const rect = image.getBoundingClientRect();
        images.get(image)!.visible = Boolean(
          rect.width &&
          rect.height &&
          rect.bottom > 0 &&
          rect.top < innerHeight &&
          rect.right > 0 &&
          rect.left < innerWidth,
        );
      }
      sync(image);
    }
  }
  function schedule() {
    if (!disposed && changed.size && timer === undefined) timer = window.setTimeout(scan, 50);
  }
  function refreshLayout() {
    for (const image of images.keys()) changed.add(image);
    schedule();
  }
  const mutations =
    typeof MutationObserver === 'undefined'
      ? undefined
      : new MutationObserver((records) => {
          for (const record of records) {
            if (record.type === 'attributes') collect(record.target);
            else {
              record.addedNodes.forEach(collect);
              record.removedNodes.forEach(collect);
            }
          }
          schedule();
        });
  mutations?.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['src', 'srcset', 'sizes', 'loading', 'class', 'style', 'hidden'],
  });
  const settled = (event: Event) => {
    if (event.target instanceof HTMLImageElement) sync(event.target, true);
  };
  document.addEventListener('load', settled, true);
  document.addEventListener('error', settled, true);
  window.addEventListener('resize', refreshLayout);
  if (!intersection) window.addEventListener('scroll', refreshLayout, { passive: true, capture: true });
  document.querySelectorAll('img').forEach((image) => changed.add(image));
  scan();
  return () => {
    disposed = true;
    clearTimeout(timer);
    intersection?.disconnect();
    mutations?.disconnect();
    document.removeEventListener('load', settled, true);
    document.removeEventListener('error', settled, true);
    window.removeEventListener('resize', refreshLayout);
    if (!intersection) window.removeEventListener('scroll', refreshLayout, true);
    for (const state of images.values()) state.release?.();
    images.clear();
    changed.clear();
  };
}
