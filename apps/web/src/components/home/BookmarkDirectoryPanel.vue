<template>
  <aside class="bookmark-browse-directory">
    <FilterPanel />
  </aside>
</template>

<script setup lang="ts">
  import FilterPanel from '@/view/home/FilterPanel.vue';
</script>

<style scoped lang="less">
  .bookmark-browse-directory {
    min-width: 0;
    min-height: 0;
    padding: 12px;
    box-sizing: border-box;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 72%, transparent);
    border-radius: 14px;
    background: var(--workspace-panel-bg-color, var(--menu-body-bg-color));
    box-shadow: 0 12px 30px -28px color-mix(in srgb, var(--text-color) 38%, transparent);
  }

  :deep(.filter-panel),
  :deep(.header-input) {
    width: 100%;
    min-width: 0;
  }
</style>
