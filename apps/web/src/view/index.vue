<template>
  <div id="tag-container">
    <!-- 导航栏默认显示，少数页面通过配置隐藏 -->
    <Navigation v-if="showNavigation" />
    <router-view :key="routeViewKey" :style="viewStyle" @manor-immersive-change="manorImmersive = $event" />
    <RoutePendingIndicator
      v-if="pendingTarget && pendingVisible && !mobileShellRoute"
      class="route-pending-layer"
      :style="pendingStyle"
      :target="pendingTarget"
      :slow="pendingSlow"
    />
  </div>
</template>

<script lang="ts" setup>
  import Navigation from '@/components/home/navigation/Navigation.vue';
  import RoutePendingIndicator from '@/components/home/navigation/RoutePendingIndicator.vue';
  import { useRoutePending } from '@/utils/routePending';
  import { bookmarkStore } from '@/store';
  import { useRoute } from 'vue-router';
  import { computed, ref, watch } from 'vue';
  import { NAVIGATION_HIDDEN_ROUTE_NAMES } from '@/config/navigation.ts';
  import { isMobileShellRoute } from '@/config/mobileNavigation';
  import { getMainRouteViewKey } from '@/utils/routeViewKey.ts';

  const route = useRoute();
  const { target: pendingTarget, visible: pendingVisible, slow: pendingSlow } = useRoutePending();
  const bookmark = bookmarkStore();

  const routeName = computed(() => String(route.name || ''));
  const routeViewKey = computed(() => getMainRouteViewKey(route));
  const manorImmersive = ref(false);
  watch(() => route.name, () => { manorImmersive.value = false; }, { flush: 'sync' });

  // 导航栏显示逻辑
  const showNavigation = computed(() => {
    if (bookmark.isMobile) return false;
    if (routeName.value === 'knowledgeManor' && manorImmersive.value) return false;
    return !NAVIGATION_HIDDEN_ROUTE_NAMES.includes(routeName.value);
  });

  const viewStyle = computed(() =>
    bookmark.isMobile
      ? {
          position: 'relative',
          height: '100%',
          width: '100%',
          boxSizing: 'border-box',
        }
      : {
          position: 'fixed',
          top: showNavigation.value ? 'var(--ui-layout-60, 60px)' : '0',
          height: showNavigation.value ? 'calc(100% - var(--ui-layout-60, 60px))' : '100%',
          width: '100%',
          boxSizing: 'border-box',
        },
  );
  // 当前页由手机外壳承载时，等待态改由外壳内容区显示，这样不在本布局下的“我的”页进出也有反馈。
  const mobileShellRoute = computed(() => isMobileShellRoute(bookmark.isMobile, route.meta));
  // 模块代码下载期间覆盖在当前页面上：PC 位于顶部导航之下，无外壳的手机页覆盖整页。
  const pendingStyle = computed(() =>
    bookmark.isMobile
      ? { position: 'absolute', inset: '0' }
      : {
          position: 'fixed',
          left: '0',
          width: '100%',
          top: showNavigation.value ? 'var(--ui-layout-60, 60px)' : '0',
          height: showNavigation.value ? 'calc(100% - var(--ui-layout-60, 60px))' : '100%',
        },
  );
</script>

<style lang="less" scoped>
  #tag-container {
    position: relative;
    height: 100%;
    width: 100%;
    overflow: hidden;
    background: var(--background-color);
  }

  // 高于页面内的吸顶头部，低于全局弹窗与手机外壳的顶栏、底栏。
  .route-pending-layer {
    z-index: 20;
  }
</style>
