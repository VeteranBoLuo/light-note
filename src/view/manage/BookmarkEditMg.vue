<template>
  <PBookmarkEdit v-if="bookmark.isMobile" />
  <BookmarkEdit v-else />
</template>

<script lang="ts" setup>
  import { bookmarkStore } from '@/store';
  import BookmarkEdit from '@/components/manage/bookmarkEditMg/BookmarkEdit.vue';
  import PBookmarkEdit from '@/components/manage/bookmarkEditMg/PBookmarkEdit.vue';
  const bookmark = bookmarkStore();
</script>

<style lang="less"></style>
