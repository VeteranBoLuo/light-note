<template>
  <div
    ref="scrollerRef"
    class="b-virtual-list"
    :class="{ 'is-ancestor-scroll': props.scrollMode === 'ancestor' }"
    @scroll.passive="handleScroll"
  >
    <div class="b-virtual-list__sizer" :style="sizerStyle">
      <div class="b-virtual-list__window" :style="windowStyle">
        <div
          v-for="entry in visibleItems"
          :key="entry.item?.[props.itemKey] ?? entry.index"
          class="b-virtual-list__item"
          :style="itemStyle"
        >
          <slot :item="entry.item" :index="entry.index" />
        </div>
      </div>
    </div>
    <div v-if="props.loading" class="b-virtual-list__loading">
      <BLoading inline :loading="true" :title="props.loadingText" />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, nextTick, onBeforeUnmount, onMounted, PropType, ref, watch } from 'vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';

  const props = defineProps({
    items: { type: Array as PropType<any[]>, default: () => [] },
    itemKey: { type: String, default: 'id' },
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

  const emit = defineEmits(['loadMore']);
  const scrollerRef = ref<HTMLElement | null>(null);
  const scrollTop = ref(0);
  const viewportHeight = ref(0);
  const pitch = computed(() => Math.max(1, props.itemHeight) + Math.max(0, props.gap));
  const start = computed(() => Math.max(0, Math.floor(scrollTop.value / pitch.value) - props.overscan));
  const end = computed(() =>
    Math.min(props.items.length, start.value + Math.ceil(viewportHeight.value / pitch.value) + props.overscan * 2),
  );
  const visibleItems = computed(() =>
    props.items.slice(start.value, end.value).map((item, offset) => ({ item, index: start.value + offset })),
  );
  const sizerStyle = computed(() => {
    const itemCount = props.items.length;
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

  let resizeObserver: ResizeObserver | null = null;
  let scrollAncestor: HTMLElement | null = null;
  let loadQueued = false;

  function findScrollAncestor(element: HTMLElement) {
    let current = element.parentElement;
    while (current && current !== document.body) {
      const overflowY = window.getComputedStyle(current).overflowY;
      if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') return current;
      current = current.parentElement;
    }
    return (document.scrollingElement || document.documentElement) as HTMLElement;
  }

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
      return;
    }
    scrollTop.value = scrollerRef.value?.scrollTop || 0;
    viewportHeight.value = scrollerRef.value?.clientHeight || 0;
  }

  function maybeLoadMore() {
    const scroller = scrollerRef.value;
    if (!scroller || props.loading || !props.hasMore || loadQueued) return;
    const remaining =
      props.scrollMode === 'ancestor'
        ? scroller.scrollHeight - scrollTop.value - viewportHeight.value
        : scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
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

  function scrollToTop() {
    if (props.scrollMode === 'ancestor') {
      const viewport = ancestorViewport();
      if (viewport) viewport.ancestor.scrollTop = Math.max(0, viewport.listOffset);
      updateViewport();
      return;
    }
    if (scrollerRef.value) scrollerRef.value.scrollTop = 0;
    scrollTop.value = 0;
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
    scrollAncestor = findScrollAncestor(scrollerRef.value);
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
  defineExpose({ scrollToTop, scrollToIndex });
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

  .b-virtual-list__loading {
    min-height: 32px;
    margin-top: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
  }
</style>
