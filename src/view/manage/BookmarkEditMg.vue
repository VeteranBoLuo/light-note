<template>
  <PBookmarkEdit v-if="bookmark.isMobile" />
  <BookmarkEdit v-else />
</template>

<script lang="ts" setup>
  import { defineAsyncComponent } from 'vue';
  import { bookmarkStore } from '@/store';

  const BookmarkEdit = defineAsyncComponent(() => import('@/components/manage/bookmarkEditMg/BookmarkEdit.vue'));
  const PBookmarkEdit = defineAsyncComponent(() => import('@/components/manage/bookmarkEditMg/PBookmarkEdit.vue'));

  const bookmark = bookmarkStore();
</script>

<style lang="less"></style>
