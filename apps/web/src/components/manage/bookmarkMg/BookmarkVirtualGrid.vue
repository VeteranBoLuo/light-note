<template>
  <div ref="gridRef" class="bookmark-virtual-grid">
    <BVirtualList
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
  import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
  import BVirtualList from '@/components/base/BasicComponents/BVirtualList.vue';
  import type { BookmarkInterface } from '@/config/bookmarkCfg';

  const props = defineProps<{
    items: BookmarkInterface[];
    loading?: boolean;
    hasMore?: boolean;
    paused?: boolean;
    loadingText?: string;
  }>();
  defineEmits<{ 'load-more': [] }>();
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
  function measureColumns() {
    const grid = gridRef.value;
    if (!grid?.clientWidth) return;
    const minimum = Number.parseFloat(getComputedStyle(grid).getPropertyValue('--bookmark-card-min-width')) || 270;
    columns.value = Math.max(1, Math.floor((grid.clientWidth + 12) / (minimum + 12)));
  }
  onMounted(() => {
    measureColumns();
    observer = new ResizeObserver(measureColumns);
    if (gridRef.value) observer.observe(gridRef.value);
  });
  onBeforeUnmount(() => observer?.disconnect());
</script>

<style scoped>
  .bookmark-virtual-grid {
    min-width: 0;
  }
  .bookmark-virtual-grid__row {
    display: grid;
    gap: 12px;
  }
</style>
