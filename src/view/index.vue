<template>
  <div
    id="tag-container"
    :style="{
      backgroundImage: bgVisible,
    }"
  >
    <!-- 导航栏：仅在非移动端或包含 'home' 的路径时显示 -->
    <Navigation v-if="showNavigation" />
    <router-view style="position: fixed; top: 60px; height: calc(100% - 60px); width: 100%; box-sizing: border-box" />
  </div>
</template>

<script lang="ts" setup>
  import Navigation from '@/components/home/navigation/Navigation.vue';
  import { bookmarkStore } from '@/store';
  import { useRoute } from 'vue-router';
  import { computed, onMounted, onBeforeUnmount } from 'vue';
  import { throttle } from '@/utils/common';

  const route = useRoute();
  const bookmark = bookmarkStore();

  // 初始化屏幕尺寸
  bookmark.screenWidth = window.innerWidth;
  bookmark.screenHeight = window.innerHeight;

  // 窗口尺寸变化处理函数（节流优化）
  const handleResize = throttle(() => {
    bookmark.screenWidth = window.innerWidth;
    bookmark.screenHeight = window.innerHeight;
  }, 100); // 100ms 节流

  // 组件挂载时添加监听，卸载时移除，防止内存泄漏
  onMounted(() => {
    window.addEventListener('resize', handleResize);
  });
  onBeforeUnmount(() => {
    window.removeEventListener('resize', handleResize);
  });

  // 导航栏显示逻辑
  const showNavigation = computed(() => !bookmark.isMobileDevice || route.path.includes('home'));

  // 背景图显示逻辑
  const bgVisible = computed(() => (bookmark.isMobileDevice || route.name === 'NoteDetail' ? 'unset' : ''));
</script>

<style lang="less" scoped>
  #tag-container {
    height: 100%;
    width: 100%;
    overflow: hidden;
    background-image: var(--bg-image);
  }
</style>
