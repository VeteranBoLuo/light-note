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
  import { computed } from 'vue';

  const route = useRoute();
  const bookmark = bookmarkStore();

  // 导航栏显示逻辑
  const showNavigation = computed(() => !bookmark.isMobile || route.path.includes('home'));

  // 背景图显示逻辑
  const bgVisible = computed(() => (bookmark.isMobile || route.name === 'NoteDetail' ? 'unset' : ''));
</script>

<style lang="less" scoped>
  #tag-container {
    height: 100%;
    width: 100%;
    overflow: hidden;
    background-image: var(--bg-image);
  }
</style>
