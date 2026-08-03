<template>
  <div ref="scrollerRef" class="b-virtual-list" @scroll.passive="handleScroll">
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
  let loadQueued = false;

  function updateViewport() {
    viewportHeight.value = scrollerRef.value?.clientHeight || 0;
  }

  function maybeLoadMore() {
    const scroller = scrollerRef.value;
    if (!scroller || props.loading || !props.hasMore || loadQueued) return;
    if (scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight > pitch.value * 4) return;
    loadQueued = true;
    emit('loadMore');
    nextTick(() => {
      loadQueued = false;
    });
  }

  function handleScroll() {
    scrollTop.value = scrollerRef.value?.scrollTop || 0;
    maybeLoadMore();
  }

  function scrollToTop() {
    if (scrollerRef.value) scrollerRef.value.scrollTop = 0;
    scrollTop.value = 0;
  }

  watch(
    () => [props.items.length, props.hasMore, props.loading],
    () =>
      nextTick(() => {
        updateViewport();
        maybeLoadMore();
      }),
  );

  onMounted(() => {
    updateViewport();
    if (typeof ResizeObserver !== 'undefined' && scrollerRef.value) {
      resizeObserver = new ResizeObserver(updateViewport);
      resizeObserver.observe(scrollerRef.value);
    }
    maybeLoadMore();
  });

  onBeforeUnmount(() => resizeObserver?.disconnect());
  defineExpose({ scrollToTop });
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
