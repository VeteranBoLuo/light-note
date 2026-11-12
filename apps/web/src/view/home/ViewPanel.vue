<template>
  <div class="view-panel" id="view-panel" :data-mobile-resource-scroll="bookmark.isMobile ? null : ''">
    <TagInfo />
    <CardPanel
      :range-selection="rangeSelection"
      :batch-mode="batchMode"
      :selected-ids="selectedIds"
      :sort-saving="sortSaving"
      @load-more="emit('load-more')"
      @toggle-selection="emit('toggle-selection', $event)"
      @sort-bookmarks="(move, items) => emit('sort-bookmarks', move, items)"
    />
  </div>
</template>

<script lang="ts" setup>
  import type { RangeSelectionController } from '@/composables/useRangeSelection';
  import TagInfo from '@/components/home/TagInfo.vue';
  import CardPanel from '@/components/home/CardPanel.vue';
  import { bookmarkStore } from '@/store';
  import type { BookmarkSortMove } from '@/utils/resourcePagination';

  const bookmark = bookmarkStore();
  defineProps<{
    rangeSelection?: RangeSelectionController;
    batchMode?: boolean;
    selectedIds?: string[];
    sortSaving?: boolean;
  }>();
  const emit = defineEmits<{
    'load-more': [];
    'toggle-selection': [id: string];
    'sort-bookmarks': [move: BookmarkSortMove, items: typeof bookmark.bookmarkList];
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
