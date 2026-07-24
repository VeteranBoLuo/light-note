<template>
  <div class="bookmark-mg-route">
    <PBookmarkTable v-if="bookmark.isMobile" />
    <BookmarkTable v-else />
    <BookmarkSnapshotModal v-model:visible="snapshotVisible" :bookmark-id="snapshotBookmarkId" />
  </div>
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

<style scoped lang="less">
  // 该路由必须保留单一根节点：外层 view/index.vue 会把固定定位和可用高度通过 attrs 传入 router-view。
  // 多根节点时这些样式无法继承，书签页便会从顶部开始渲染并被固定导航栏覆盖，缩放后尤为明显。
  .bookmark-mg-route {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }
</style>
