<template>
  <div
    id="tag-container"
    :style="{
      backgroundImage: bgVisible,
    }"
  >
    <!-- 导航栏：仅在非移动端或指定页面显示，笔记详情使用自己的顶栏 -->
    <Navigation v-if="showNavigation" />
    <router-view :style="viewStyle" style="z-index: 100000" />
  </div>
</template>

<script lang="ts" setup>
  import Navigation from '@/components/home/navigation/Navigation.vue';
  import { bookmarkStore } from '@/store';
  import { useRoute } from 'vue-router';
  import { computed } from 'vue';

  const route = useRoute();
  const bookmark = bookmarkStore();

  const mobileNavigationRoutes = ['home', 'workbenches', 'noteLibrary', 'cloudSpace', 'search'];
  const isNoteDetailRoute = computed(() => route.name === 'noteDetail');

  // 导航栏显示逻辑
  const showNavigation = computed(
    () =>
      !isNoteDetailRoute.value &&
      (!bookmark.isMobile || mobileNavigationRoutes.some((item) => route.path.includes(item))),
  );

  // 背景图显示逻辑
  const bgVisible = computed(() => (bookmark.isMobile || route.name === 'noteDetail' ? 'unset' : ''));

  const viewStyle = computed(() => ({
    position: 'fixed',
    top: showNavigation.value ? '60px' : '0',
    height: showNavigation.value ? 'calc(100% - 60px)' : '100%',
    width: '100%',
    boxSizing: 'border-box',
  }));
</script>

<style lang="less" scoped>
  #tag-container {
    height: 100%;
    width: 100%;
    overflow: hidden;
    background-image: var(--bg-image);
  }
</style>
