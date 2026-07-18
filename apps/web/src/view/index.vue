<template>
  <div id="tag-container">
    <!-- 导航栏默认显示，少数页面通过配置隐藏 -->
    <Navigation v-if="showNavigation" />
    <router-view :key="routeViewKey" :style="viewStyle" />
  </div>
</template>

<script lang="ts" setup>
  import Navigation from '@/components/home/navigation/Navigation.vue';
  import { bookmarkStore } from '@/store';
  import { useRoute } from 'vue-router';
  import { computed } from 'vue';
  import { NAVIGATION_HIDDEN_ROUTE_NAMES } from '@/config/navigation.ts';
  import { getMainRouteViewKey } from '@/utils/routeViewKey.ts';

  const route = useRoute();
  const bookmark = bookmarkStore();

  const routeName = computed(() => String(route.name || ''));
  const routeViewKey = computed(() => getMainRouteViewKey(route));

  // 导航栏显示逻辑
  const showNavigation = computed(() => {
    if (bookmark.isMobile) {
      return route.path === '/home';
    }
    return !NAVIGATION_HIDDEN_ROUTE_NAMES.includes(routeName.value);
  });

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
    background: var(--background-color);
  }
</style>
