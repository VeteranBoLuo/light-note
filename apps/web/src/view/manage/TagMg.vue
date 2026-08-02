<template>
  <TagTableMobile v-if="bookmark.isMobile" />
  <TagTable v-else />
</template>

<script lang="ts" setup>
  import TagTable from '@/components/manage/tagMg/TagTable.vue';
  import { bookmarkStore } from '@/store';
  import TagTableMobile from '@/components/manage/tagMg/TagTableMobile.vue';

  const bookmark = bookmarkStore();
</script>
