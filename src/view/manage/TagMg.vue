<template>
  <PTagTable v-if="bookmark.isMobile" />
  <TagTable v-else />
</template>

<script lang="ts" setup>
  import TagTable from '@/components/manage/tagMg/TagTable.vue';
  import { bookmarkStore } from '@/store';
  import PTagTable from '@/components/manage/tagMg/PTagTable.vue';
  const bookmark = bookmarkStore();
</script>

<style lang="less"></style>
