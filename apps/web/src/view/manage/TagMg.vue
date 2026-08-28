<template>
  <div class="tag-management-route">
    <template v-if="manageMode">
      <TagTableMobile v-if="bookmark.isMobile" />
      <TagTable v-else />
    </template>
    <TagSpaceIndex v-else />
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue';
  import { useRoute } from 'vue-router';
  import TagTable from '@/components/manage/tagMg/TagTable.vue';
  import { bookmarkStore, useUserStore } from '@/store';
  import TagTableMobile from '@/components/manage/tagMg/TagTableMobile.vue';
  import TagSpaceIndex from '@/components/tagSpace/TagSpaceIndex.vue';

  const bookmark = bookmarkStore();
  const user = useUserStore();
  const route = useRoute();
  const manageMode = computed(() => route.query.mode === 'manage' && user.adminContext?.mode !== 'readonly');
</script>

<style scoped>
  .tag-management-route {
    width: 100%;
    height: 100%;
  }
</style>
