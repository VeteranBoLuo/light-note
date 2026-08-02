<template>
  <div class="view-panel" id="view-panel" :data-mobile-resource-scroll="bookmark.isMobile ? null : ''">
    <TagInfo />
    <CardPanel
      :batch-mode="batchMode"
      :selected-ids="selectedIds"
      @load-more="emit('load-more')"
      @toggle-selection="emit('toggle-selection', $event)"
    />
  </div>
</template>

<script lang="ts" setup>
  import TagInfo from '@/components/home/TagInfo.vue';
  import CardPanel from '@/components/home/CardPanel.vue';
  import { bookmarkStore } from '@/store';

  const bookmark = bookmarkStore();
  defineProps<{
    batchMode?: boolean;
    selectedIds?: string[];
  }>();
  const emit = defineEmits<{
    'load-more': [];
    'toggle-selection': [id: string];
  }>();
</script>

<style lang="less">
  .view-panel {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: auto;
    display: flex;
    flex-direction: column;
  }
</style>
