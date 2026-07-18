<template>
  <PBookmarkTable v-if="bookmark.isMobile" />
  <BookmarkTable v-else />
  <BookmarkSnapshotModal v-model:visible="snapshotVisible" :bookmark-id="snapshotBookmarkId" />
</template>

<script lang="ts" setup>
  import { defineAsyncComponent, ref, watch } from 'vue';
  import { useRoute, useRouter } from 'vue-router';
  import { bookmarkStore } from '@/store';

  const BookmarkTable = defineAsyncComponent(() => import('@/components/manage/bookmarkMg/BookmarkTable.vue'));
  const PBookmarkTable = defineAsyncComponent(() => import('@/components/manage/bookmarkMg/PBookmarkTable.vue'));
  const BookmarkSnapshotModal = defineAsyncComponent(
    () => import('@/components/manage/bookmarkEditMg/BookmarkSnapshotModal.vue'),
  );

  const bookmark = bookmarkStore();
  const route = useRoute();
  const router = useRouter();
  const snapshotVisible = ref(false);
  const snapshotBookmarkId = ref('');

  function routeSnapshotId() {
    const value = route.query.snapshot;
    return Array.isArray(value) ? String(value[0] || '') : String(value || '');
  }

  function closeSnapshotRoute() {
    if (!routeSnapshotId()) return;
    const query = { ...route.query };
    delete query.snapshot;
    void router.replace({ name: 'bookmarkMg', query });
  }

  watch(
    () => route.query.snapshot,
    () => {
      const bookmarkId = routeSnapshotId();
      snapshotBookmarkId.value = bookmarkId;
      snapshotVisible.value = Boolean(bookmarkId);
    },
    { immediate: true },
  );

  watch(snapshotVisible, (visible) => {
    if (!visible) closeSnapshotRoute();
  });
</script>

<style lang="less"></style>
