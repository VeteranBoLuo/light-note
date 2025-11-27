<template>
  <PBookmarkTable v-if="bookmark.isMobileDevice" />
  <BookmarkTable v-else />
</template>

<script lang="ts" setup>
  import { bookmarkStore } from '@/store';
  import BookmarkTable from '@/components/manage/bookmarkMg/BookmarkTable.vue';
  import PBookmarkTable from '@/components/manage/bookmarkMg/PBookmarkTable.vue';
  const bookmark = bookmarkStore();
</script>

<style lang="less"></style>
