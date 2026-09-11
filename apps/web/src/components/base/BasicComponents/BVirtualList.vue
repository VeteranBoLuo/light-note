<template>
  <div
    ref="scrollerRef"
    v-auto-scrollbar
    class="b-virtual-list"
    :class="{ 'is-ancestor-scroll': props.scrollMode === 'ancestor' }"
    :aria-busy="props.loading"
    @focusin="rememberFocus"
    @focusout="releaseFocus"
    @scroll.passive="handleScroll"
  >
    <div class="b-virtual-list__sizer" :style="sizerStyle">
      <div class="b-virtual-list__window" :style="windowStyle">
        <div
          v-for="entry in visibleItems"
          :key="entry.loaded ? (entry.item?.[props.itemKey] ?? entry.index) : `placeholder:${entry.index}`"
          class="b-virtual-list__item"
          :class="{ 'is-placeholder': !entry.loaded }"
          :style="entryStyle(entry.index)"
          :ref="(element) => measureRow(element, entry.index)"
          :data-virtual-index="entry.index"
        >
          <slot v-if="entry.loaded" :item="entry.item" :index="entry.index" />
          <span v-else class="b-virtual-list__placeholder" aria-hidden="true" />
        </div>
      </div>
    </div>
    <div v-if="showLoadingFooter" class="b-virtual-list__loading">
      <BLoading inline :loading="true" :title="props.loadingText" />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, nextTick, onBeforeUnmount, onMounted, PropType, ref, watch } from 'vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import {
    captureResourceListScrollAnchor,
    resolveResourceListScrollAnchor,
    type ResourceListScrollAnchor,
    type ResourceListScrollPosition,
  } from '@/utils/resourceListScroll';
  import { getRootZoom } from '@/utils/zoom';
  import { findScrollContainer } from '@/utils/scrollContainer';

  const props = defineProps({
    items: { type: Array as PropType<any[]>, default: () => [] },
    itemKey: { type: String, default: 'id' },
    /**
     * 服务端游标列表已知的完整条数。大于当前 items.length 时先预留稳定高度，
     * 避免每次加载下一页都改变页面级滚动范围。
     */
    totalCount: { type: Number, default: 0 },
    itemHeight: { type: Number, default: 80 },
    dynamicHeight: { type: Boolean, default: false },
    paused: { type: Boolean, default: false },
    gap: { type: Number, default: 0 },
    overscan: { type: Number, default: 6 },
    loading: { type: Boolean, default: false },
    /** 调用方已提供加载行时，仅保留请求锁与 aria-busy，不重复绘制底部提示。 */
    showLoadingIndicator: { type: Boolean, default: true },
    loadingText: { type: String, default: '' },
    hasMore: { type: Boolean, default: false },
    scrollMode: {
      type: String as PropType<'self' | 'ancestor'>,
      default: 'self',
    },
  });

  const emit = defineEmits<{
    loadMore: [];
    'scroll-position': [position: ResourceListScrollPosition];
  }>();
  const scrollerRef = ref<HTMLElement | null>(null);
  const scrollTop = ref(0);
  const viewportHeight = ref(0);
  const pitch = computed(() => Math.max(1, props.itemHeight) + Math.max(0, props.gap));
  const logicalItemCount = computed(() =>
    Math.max(props.items.length, Math.max(0, Math.trunc(Number(props.totalCount) || 0))),
  );
  const measuredHeights = ref(new Map<string | number, number>());
  const focusedKey = ref<string | number | null>(null);
  const rowKey = (index: number) => props.items[index]?.[props.itemKey] ?? index;
  const offsets = computed(() => {
    const values = [0];
    for (let i = 0; i < logicalItemCount.value; i++)
      values.push(
        values[i] +
          (props.dynamicHeight ? measuredHeights.value.get(rowKey(i)) || props.itemHeight : props.itemHeight) +
          Math.max(0, props.gap),
      );
    return values;
  });
  function indexAt(top: number) {
    let low = 0,
      high = logicalItemCount.value;
    while (low < high) {
      const mid = Math.floor((low + high + 1) / 2);
      if (offsets.value[mid] <= top) low = mid;
      else high = mid - 1;
    }
    return Math.min(low, Math.max(0, logicalItemCount.value - 1));
  }
  const start = computed(() =>
    Math.max(
      0,
      (props.dynamicHeight ? indexAt(scrollTop.value) : Math.floor(scrollTop.value / pitch.value)) - props.overscan,
    ),
  );
  const end = computed(() =>
    Math.min(
      logicalItemCount.value,
      props.dynamicHeight
        ? indexAt(scrollTop.value + viewportHeight.value) + props.overscan + 1
        : start.value + Math.ceil(viewportHeight.value / pitch.value) + props.overscan * 2,
    ),
  );
  const visibleItems = computed(() => {
    const indices = Array.from({ length: Math.max(0, end.value - start.value) }, (_, offset) => start.value + offset);
    if (props.dynamicHeight && focusedKey.value !== null) {
      const index = props.items.findIndex((item) => item[props.itemKey] === focusedKey.value);
      if (index >= 0 && !indices.includes(index)) indices.push(index);
    }
    return indices.map((index) => ({ item: props.items[index], index, loaded: index < props.items.length }));
  });
  const sizerStyle = computed(() => ({
    height: `${Math.max(0, offsets.value[logicalItemCount.value] - (logicalItemCount.value ? props.gap : 0))}px`,
  }));
  const windowStyle = computed(() => ({
    gap: `${Math.max(0, props.gap)}px`,
    transform: `translateY(${offsets.value[start.value] || 0}px)`,
  }));
  function entryStyle(index: number) {
    return props.dynamicHeight
      ? {
          position: 'absolute' as const,
          width: '100%',
          top: `${offsets.value[index] - (offsets.value[start.value] || 0)}px`,
          overflow: 'visible',
        }
      : { height: `${Math.max(1, props.itemHeight)}px` };
  }
  const rowElements = new Map<HTMLElement, number>();
  let rowObserver: ResizeObserver | null = null;
  function measureRow(element: unknown, index: number) {
    if (!props.dynamicHeight || !(element instanceof HTMLElement)) return;
    rowElements.set(element, index);
    rowObserver?.observe(element);
  }
  function rememberFocus(event: FocusEvent) {
    const row = (event.target as HTMLElement)?.closest<HTMLElement>('[data-virtual-index]');
    if (row) focusedKey.value = rowKey(Number(row.dataset.virtualIndex));
  }
  function releaseFocus() {
    nextTick(() => {
      if (!scrollerRef.value?.contains(document.activeElement)) focusedKey.value = null;
    });
  }
  function measureEntries(entries: ResizeObserverEntry[]) {
    const anchor = props.dynamicHeight ? captureScrollAnchor() : null;
    let changed = false;
    const heights = new Map(measuredHeights.value);
    for (const entry of entries) {
      const element = entry.target as HTMLElement;
      if (!element.isConnected) {
        rowObserver?.unobserve(element);
        rowElements.delete(element);
        continue;
      }
      const index = Number(element.dataset.virtualIndex);
      const height = entry.borderBoxSize?.[0]?.blockSize || element.offsetHeight;
      if (height > 0 && Math.abs((heights.get(rowKey(index)) || 0) - height) > 0.5) {
        heights.set(rowKey(index), height);
        changed = true;
      }
    }
    if (changed) {
      measuredHeights.value = heights;
      nextTick(() => {
        if (anchor) restoreScrollAnchor(anchor);
        updateViewport();
      });
    }
  }
  const showLoadingFooter = computed(
    () => props.showLoadingIndicator && props.loading && logicalItemCount.value <= props.items.length,
  );

  let resizeObserver: ResizeObserver | null = null;
  let scrollAncestor: HTMLElement | null = null;
  let loadQueued = false;

  function ancestorViewport() {
    const list = scrollerRef.value;
    const ancestor = scrollAncestor;
    if (!list || !ancestor) return null;
    const listRect = list.getBoundingClientRect();
    const documentScroller = ancestor === document.documentElement || ancestor === document.body;
    const ancestorRect = documentScroller ? { top: 0, bottom: window.innerHeight } : ancestor.getBoundingClientRect();
    const zoom = props.dynamicHeight ? getRootZoom() : 1;
    const top = Math.max(0, ancestorRect.top - listRect.top) / zoom;
    const bottom = Math.max(0, Math.min(listRect.height, ancestorRect.bottom - listRect.top)) / zoom;
    return {
      ancestor,
      listOffset: (listRect.top - ancestorRect.top) / zoom + ancestor.scrollTop,
      top,
      height: Math.max(0, bottom - top),
    };
  }

  function updateViewport() {
    if (props.scrollMode === 'ancestor') {
      const viewport = ancestorViewport();
      scrollTop.value = viewport?.top || 0;
      viewportHeight.value = viewport?.height || 0;
      emit('scroll-position', { top: scrollTop.value, viewportHeight: viewportHeight.value });
      return;
    }
    scrollTop.value = scrollerRef.value?.scrollTop || 0;
    viewportHeight.value = scrollerRef.value?.clientHeight || 0;
    emit('scroll-position', { top: scrollTop.value, viewportHeight: viewportHeight.value });
  }

  function maybeLoadMore() {
    const scroller = scrollerRef.value;
    if (!scroller || props.paused || props.loading || !props.hasMore || loadQueued) return;
    if (props.scrollMode === 'ancestor' && !ancestorViewport()?.height) return;
    const loadedCount = props.items.length;
    const loadedHeight = Math.max(0, (offsets.value[loadedCount] || 0) - (loadedCount ? props.gap : 0));
    const remaining =
      loadedHeight -
      (props.scrollMode === 'ancestor'
        ? scrollTop.value + viewportHeight.value
        : scroller.scrollTop + scroller.clientHeight);
    if (remaining > pitch.value * 4) return;
    loadQueued = true;
    emit('loadMore');
    nextTick(() => {
      loadQueued = false;
    });
  }

  function handleScroll() {
    updateViewport();
    maybeLoadMore();
  }

  function setRelativeScrollTop(top: number, behavior: ScrollBehavior = 'auto') {
    const target = Math.max(0, Number(top) || 0);
    if (props.scrollMode === 'ancestor') {
      const viewport = ancestorViewport();
      if (viewport) {
        const ancestorTarget = Math.max(0, viewport.listOffset + target);
        if (behavior === 'smooth' && typeof viewport.ancestor.scrollTo === 'function') {
          viewport.ancestor.scrollTo({ top: ancestorTarget, left: 0, behavior });
        } else viewport.ancestor.scrollTop = ancestorTarget;
      }
      updateViewport();
      return;
    }
    const scroller = scrollerRef.value;
    if (!scroller) return;
    if (behavior === 'smooth' && typeof scroller.scrollTo === 'function') {
      scroller.scrollTo({ top: target, left: 0, behavior });
      scrollTop.value = target;
    } else {
      scroller.scrollTop = target;
      scrollTop.value = scroller.scrollTop;
    }
    emit('scroll-position', { top: scrollTop.value, viewportHeight: viewportHeight.value });
  }

  function scrollToTop(behavior: ScrollBehavior = 'auto') {
    setRelativeScrollTop(0, behavior);
  }

  function captureScrollAnchor(): ResourceListScrollAnchor | null {
    updateViewport();
    if (props.dynamicHeight) {
      if (!props.items.length) return null;
      const viewport = props.scrollMode === 'ancestor' ? ancestorViewport() : null;
      if (props.scrollMode === 'ancestor' && (!viewport?.height || viewport.listOffset > viewport.ancestor.scrollTop))
        return null;
      const index = indexAt(scrollTop.value);
      return {
        key: String(rowKey(index)),
        index,
        offset: scrollTop.value - offsets.value[index],
      } as ResourceListScrollAnchor;
    }
    return captureResourceListScrollAnchor({
      items: props.items,
      itemKey: props.itemKey,
      scrollTop: scrollTop.value,
      pitch: pitch.value,
    });
  }

  function restoreScrollAnchor(anchor: ResourceListScrollAnchor) {
    if (props.dynamicHeight) {
      const found = props.items.findIndex((item) => String(item[props.itemKey]) === anchor.key);
      const index = found >= 0 ? found : Math.min(anchor.index, Math.max(0, props.items.length - 1));
      setRelativeScrollTop((offsets.value[index] || 0) + anchor.offset);
      return found >= 0;
    }
    const resolved = resolveResourceListScrollAnchor({
      items: props.items,
      itemKey: props.itemKey,
      anchor,
      pitch: pitch.value,
      logicalCount: logicalItemCount.value,
    });
    setRelativeScrollTop(resolved.top);
    maybeLoadMore();
    return resolved.keyMatched;
  }

  function scrollToIndex(index: number, align: 'nearest' | 'start' | 'center' = 'nearest') {
    const scroller = scrollerRef.value;
    if (!scroller || !props.items.length) return;
    const normalizedIndex = Math.min(props.items.length - 1, Math.max(0, Math.trunc(Number(index) || 0)));
    const itemTop = offsets.value[normalizedIndex];
    const itemBottom = offsets.value[normalizedIndex + 1] - props.gap;
    const ancestor = props.scrollMode === 'ancestor' ? ancestorViewport() : null;
    const viewportTop = ancestor?.top ?? scroller.scrollTop;
    const currentViewportHeight = ancestor?.height ?? scroller.clientHeight;
    const viewportBottom = viewportTop + currentViewportHeight;
    let target = viewportTop;
    if (align === 'start') target = itemTop;
    else if (align === 'center') target = itemTop - (currentViewportHeight - Math.max(1, props.itemHeight)) / 2;
    else if (itemTop < viewportTop) target = itemTop;
    else if (itemBottom > viewportBottom) target = itemBottom - currentViewportHeight;
    else return;
    if (ancestor) {
      ancestor.ancestor.scrollTop = Math.max(0, ancestor.listOffset + target);
      updateViewport();
      maybeLoadMore();
      return;
    }
    scroller.scrollTop = Math.max(0, target);
    scrollTop.value = scroller.scrollTop;
    maybeLoadMore();
  }

  function unbindScrollAncestor() {
    if (scrollAncestor) resizeObserver?.unobserve(scrollAncestor);
    scrollAncestor?.removeEventListener('scroll', handleScroll);
    scrollAncestor = null;
  }

  function bindScrollAncestor() {
    unbindScrollAncestor();
    if (props.scrollMode !== 'ancestor' || !scrollerRef.value) return;
    scrollAncestor = findScrollContainer(scrollerRef.value);
    scrollAncestor.addEventListener('scroll', handleScroll, { passive: true });
    resizeObserver?.observe(scrollAncestor);
  }

  watch(
    () => [props.items.length, props.hasMore, props.loading, props.paused],
    () =>
      nextTick(() => {
        updateViewport();
        maybeLoadMore();
      }),
  );

  watch(
    () => props.scrollMode,
    () =>
      nextTick(() => {
        bindScrollAncestor();
        updateViewport();
        maybeLoadMore();
      }),
  );

  watch(
    () => props.items,
    (items, previous) => {
      if (!props.dynamicHeight) return;
      const viewport = props.scrollMode === 'ancestor' ? ancestorViewport() : null;
      const shouldAnchor =
        props.scrollMode === 'self' || Boolean(viewport?.height && viewport.listOffset <= viewport.ancestor.scrollTop);
      let offset = 0,
        index = 0;
      while (index < previous.length - 1) {
        const height = (measuredHeights.value.get(previous[index][props.itemKey]) || props.itemHeight) + props.gap;
        if (offset + height > scrollTop.value) break;
        offset += height;
        index++;
      }
      const anchor =
        shouldAnchor && previous.length
          ? { key: String(previous[index][props.itemKey]), index, offset: scrollTop.value - offset }
          : null;
      const live = new Set(items.map((item) => item[props.itemKey]));
      measuredHeights.value = new Map([...measuredHeights.value].filter(([key]) => live.has(key)));
      nextTick(() => {
        for (const element of rowElements.keys())
          if (!element.isConnected) {
            rowObserver?.unobserve(element);
            rowElements.delete(element);
          }
        if (anchor) restoreScrollAnchor(anchor);
      });
    },
    { flush: 'pre' },
  );

  onMounted(() => {
    if (props.dynamicHeight && typeof ResizeObserver !== 'undefined') {
      rowObserver = new ResizeObserver(measureEntries);
      for (const element of rowElements.keys()) rowObserver.observe(element);
    }
    bindScrollAncestor();
    updateViewport();
    if (typeof ResizeObserver !== 'undefined' && scrollerRef.value) {
      let lastWidth = scrollerRef.value.clientWidth;
      resizeObserver = new ResizeObserver(() => {
        const width = scrollerRef.value?.clientWidth || 0;
        if (props.dynamicHeight && width && width !== lastWidth) {
          const anchor = captureScrollAnchor();
          lastWidth = width;
          // Width changes invalidate offscreen measurements. Visible rows must be
          // measured immediately: their height may stay unchanged, so ResizeObserver
          // will not necessarily deliver another row entry after this cache reset.
          const visibleHeights = new Map<string | number, number>();
          for (const element of rowElements.keys()) {
            if (!element.isConnected) {
              rowObserver?.unobserve(element);
              rowElements.delete(element);
              continue;
            }
            const height = element.offsetHeight;
            if (height > 0) visibleHeights.set(rowKey(Number(element.dataset.virtualIndex)), height);
          }
          measuredHeights.value = visibleHeights;
          nextTick(() => {
            if (anchor) restoreScrollAnchor(anchor);
          });
        }
        updateViewport();
        maybeLoadMore();
      });
      resizeObserver.observe(scrollerRef.value);
      if (scrollAncestor) resizeObserver.observe(scrollAncestor);
    }
    maybeLoadMore();
  });

  onBeforeUnmount(() => {
    unbindScrollAncestor();
    resizeObserver?.disconnect();
    rowObserver?.disconnect();
    rowElements.clear();
  });
  defineExpose({ captureScrollAnchor, restoreScrollAnchor, scrollToTop, scrollToIndex });
</script>

<style lang="less" scoped>
  .b-virtual-list {
    min-height: 0;
    overflow-y: auto;
    overflow-anchor: none;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
  }

  .b-virtual-list.is-ancestor-scroll {
    overflow: visible;
  }

  .b-virtual-list__sizer {
    position: relative;
    width: 100%;
    min-width: 0;
    flex: 0 0 auto;
  }

  .b-virtual-list__window {
    position: absolute;
    top: 0;
    right: 0;
    left: 0;
    display: flex;
    flex-direction: column;
    will-change: transform;
  }

  .b-virtual-list__item {
    flex: 0 0 auto;
    min-width: 0;
    box-sizing: border-box;
    overflow: hidden;
  }

  .b-virtual-list__item.is-placeholder {
    padding: 8px 6px;
  }

  .b-virtual-list__placeholder {
    width: 100%;
    height: 100%;
    display: block;
    border-radius: 8px;
    background: var(--surface-subtle-bg, var(--hover-background));
    opacity: 0.58;
  }

  .b-virtual-list__loading {
    min-height: 32px;
    margin-top: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
  }
</style>
