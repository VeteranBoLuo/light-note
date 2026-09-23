<template>
  <div ref="gridRef" class="bookmark-virtual-grid">
    <BVirtualList
      ref="listRef"
      :items="rows"
      item-key="id"
      :item-height="240"
      :gap="12"
      :overscan="2"
      dynamic-height
      scroll-mode="ancestor"
      :loading="loading"
      :has-more="hasMore"
      :paused="paused"
      :loading-text="loadingText"
      @load-more="$emit('load-more')"
    >
      <template #default="{ item: row }">
        <div class="bookmark-virtual-grid__row" :style="{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }">
          <slot v-for="item in row.items" :key="item.id" :item="item" />
        </div>
      </template>
    </BVirtualList>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, onBeforeUnmount, ref, watch, nextTick } from 'vue';
  import BVirtualList from '@/components/base/BasicComponents/BVirtualList.vue';
  import { useUiDensity } from '@/composables/useUiDensity';
  import type { BookmarkInterface } from '@/config/bookmarkCfg';

  const props = defineProps<{
    items: BookmarkInterface[];
    loading?: boolean;
    hasMore?: boolean;
    paused?: boolean;
    loadingText?: string;
  }>();
  defineEmits<{ 'load-more': [] }>();
  const { density, dimension } = useUiDensity();
  const listRef = ref<InstanceType<typeof BVirtualList> | null>(null);
  const gridRef = ref<HTMLElement | null>(null);
  const columns = ref(1);
  const rows = computed(() => {
    const result = [];
    for (let index = 0; index < props.items.length; index += columns.value) {
      result.push({ id: props.items[index].id, items: props.items.slice(index, index + columns.value) });
    }
    return result;
  });
  let observer: ResizeObserver | null = null;
  let pendingAnchor: ReturnType<InstanceType<typeof BVirtualList>['captureScrollAnchor']> = null;
  let layoutRevision = 0;
  async function measureColumns() {
    const grid = gridRef.value;
    if (!grid?.clientWidth) return;
    const minimum =
      Number.parseFloat(getComputedStyle(grid).getPropertyValue('--bookmark-card-min-width')) || dimension(270, 'layout');
    const gap = dimension(12);
    const nextColumns = Math.max(1, Math.floor((grid.clientWidth + gap) / (minimum + gap)));
    const anchor = pendingAnchor || listRef.value?.captureScrollAnchor();
    pendingAnchor = null;
    if (nextColumns === columns.value) return;
    const revision = ++layoutRevision;
    columns.value = nextColumns;
    // A row's first card may move into the middle of a new row when columns change.
    // Restore that card's containing row through the shared virtual-list anchor API.
    await nextTick();
    await nextTick();
    if (!anchor || revision !== layoutRevision) return;
    const index = rows.value.findIndex(row => row.items.some(item => String(item.id) === anchor.key));
    if (index >= 0) listRef.value?.restoreScrollAnchor({ ...anchor, key: String(rows.value[index].id), index });
  }
  watch(
    density,
    () => { pendingAnchor = listRef.value?.captureScrollAnchor() || null; },
    { flush: 'sync' },
  );
  watch(density, measureColumns, { flush: 'post' });
  onMounted(() => {
    measureColumns();
    observer = new ResizeObserver(measureColumns);
    if (gridRef.value) observer.observe(gridRef.value);
  });
  onBeforeUnmount(() => {
    layoutRevision++;
    observer?.disconnect();
  });
</script>

<style scoped>
  .bookmark-virtual-grid {
    min-width: 0;
  }
  .bookmark-virtual-grid__row {
    display: grid;
    gap: var(--ui-space-12, 12px);
  }
</style>
