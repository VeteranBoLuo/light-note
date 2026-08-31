<template>
  <div
    ref="scrollerRef"
    v-auto-scrollbar
    class="b-virtual-list"
    :class="{ 'is-ancestor-scroll': props.scrollMode === 'ancestor' }"
    :aria-busy="props.loading"
    @scroll.passive="handleScroll"
  >
    <div class="b-virtual-list__sizer" :style="sizerStyle">
      <div class="b-virtual-list__window" :style="windowStyle">
        <div
          v-for="entry in visibleItems"
          :key="entry.loaded ? (entry.item?.[props.itemKey] ?? entry.index) : `placeholder:${entry.index}`"
          class="b-virtual-list__item"
          :class="{ 'is-placeholder': !entry.loaded }"
          :style="itemStyle"
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
    gap: { type: Number, default: 0 },
    overscan: { type: Number, default: 6 },
    loading: { type: Boolean, default: false },
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
  const start = computed(() => Math.max(0, Math.floor(scrollTop.value / pitch.value) - props.overscan));
  const end = computed(() =>
    Math.min(logicalItemCount.value, start.value + Math.ceil(viewportHeight.value / pitch.value) + props.overscan * 2),
  );
  const visibleItems = computed(() =>
    Array.from({ length: Math.max(0, end.value - start.value) }, (_, offset) => {
      const index = start.value + offset;
      return { item: props.items[index], index, loaded: index < props.items.length };
    }),
  );
  const sizerStyle = computed(() => {
    const itemCount = logicalItemCount.value;
    const totalHeight = itemCount
      ? itemCount * Math.max(1, props.itemHeight) + Math.max(0, itemCount - 1) * Math.max(0, props.gap)
      : 0;
    return { height: `${totalHeight}px` };
  });
  const windowStyle = computed(() => ({
    gap: `${Math.max(0, props.gap)}px`,
    transform: `translateY(${start.value * pitch.value}px)`,
  }));
  const itemStyle = computed(() => ({ height: `${Math.max(1, props.itemHeight)}px` }));
  const showLoadingFooter = computed(() => props.loading && logicalItemCount.value <= props.items.length);

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
    const top = Math.max(0, ancestorRect.top - listRect.top);
    const bottom = Math.max(0, Math.min(listRect.height, ancestorRect.bottom - listRect.top));
    return {
      ancestor,
      listOffset: listRect.top - ancestorRect.top + ancestor.scrollTop,
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
    if (!scroller || props.loading || !props.hasMore || loadQueued) return;
    const loadedCount = props.items.length;
    const loadedHeight = loadedCount
      ? loadedCount * Math.max(1, props.itemHeight) + Math.max(0, loadedCount - 1) * Math.max(0, props.gap)
      : 0;
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
    return captureResourceListScrollAnchor({
      items: props.items,
      itemKey: props.itemKey,
      scrollTop: scrollTop.value,
      pitch: pitch.value,
    });
  }

  function restoreScrollAnchor(anchor: ResourceListScrollAnchor) {
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
    const itemTop = normalizedIndex * pitch.value;
    const itemBottom = itemTop + Math.max(1, props.itemHeight);
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
    () => [props.items.length, props.hasMore, props.loading],
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

  onMounted(() => {
    bindScrollAncestor();
    updateViewport();
    if (typeof ResizeObserver !== 'undefined' && scrollerRef.value) {
      resizeObserver = new ResizeObserver(updateViewport);
      resizeObserver.observe(scrollerRef.value);
      if (scrollAncestor) resizeObserver.observe(scrollAncestor);
    }
    maybeLoadMore();
  });

  onBeforeUnmount(() => {
    unbindScrollAncestor();
    resizeObserver?.disconnect();
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
