<template>
  <TagEditMobile v-if="bookmark.isMobile" />
  <TagEdit v-else />
</template>

<script lang="ts" setup>
  import { bookmarkStore } from '@/store';
  import TagEditMobile from '@/components/manage/tagEditMg/TagEditMobile.vue';
  import TagEdit from '@/components/manage/tagEditMg/TagEdit.vue';
  const bookmark = bookmarkStore();
</script>

<style lang="less"></style>
