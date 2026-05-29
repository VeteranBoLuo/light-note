<template>
  <PBookmarkTable v-if="bookmark.isMobile" />
  <BookmarkTable v-else />
</template>

<script lang="ts" setup>
  import { defineAsyncComponent } from 'vue';
  import { bookmarkStore } from '@/store';

  const BookmarkTable = defineAsyncComponent(() => import('@/components/manage/bookmarkMg/BookmarkTable.vue'));
  const PBookmarkTable = defineAsyncComponent(() => import('@/components/manage/bookmarkMg/PBookmarkTable.vue'));

  const bookmark = bookmarkStore();
</script>

<style lang="less"></style>
