<template>
  <div
    id="tag-container"
    :style="{
      backgroundImage: bgVisible,
    }"
  >
    <Navigation v-if="!bookmark.isMobile || route.path.includes('home')" />
    <router-view style="position: fixed; top: 60px; height: calc(100% - 60px); width: 100%; box-sizing: border-box" />
  </div>
</template>

<script lang="ts" setup>
  import Navigation from '@/components/home/navigation/Navigation.vue';
  import { bookmarkStore } from '@/store';
  import { useRoute } from 'vue-router';
  import { computed, onMounted, onBeforeUnmount } from 'vue';

  const route = useRoute();
  const bookmark = bookmarkStore();

  // 初始化屏幕尺寸
  bookmark.screenWidth = window.innerWidth;
  bookmark.screenHeight = window.innerHeight;

  // 窗口尺寸变化处理函数
  function handleResize() {
    bookmark.screenWidth = window.innerWidth;
    bookmark.screenHeight = window.innerHeight;
  }

  // 组件挂载时添加监听，卸载时移除，防止内存泄漏
  onMounted(() => {
    window.addEventListener('resize', handleResize);
  });
  onBeforeUnmount(() => {
    window.removeEventListener('resize', handleResize);
  });

  // 背景图显示逻辑
  const bgVisible = computed(() =>
    bookmark.isMobile || route.name === 'NoteDetail' ? 'unset' : ''
  );
</script>

<style lang="less" scoped>
  #tag-container {
    height: 100%;
    width: 100%;
    overflow: hidden;
    background-image: var(--bg-image);
  }
</style>
