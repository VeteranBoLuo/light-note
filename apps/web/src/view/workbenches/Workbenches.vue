<template>
  <!--
    /workbenches 路由入口。

    桌面端是完整工作台（统计、趋势、图表、最近更新），移动端是「今日」——
    只保留今天需要处理的少量事项。两端是不同的产品概念而不是同一页面的两种布局，
    因此按 MobileTodayView / DesktopWorkbenchView 命名，而不是 XxxMobile / XxxDesktop。
  -->
  <MobileTodayView v-if="bookmark.isMobile" />
  <DesktopWorkbenchView v-else />
</template>

<script setup lang="ts">
  import { defineAsyncComponent } from 'vue';
  import { bookmarkStore } from '@/store';
  import MobileTodayView from '@/view/workbenches/MobileTodayView.vue';

  // 桌面工作台带图表和大量统计，移动端不应为它付出下载成本
  const DesktopWorkbenchView = defineAsyncComponent(() => import('@/view/workbenches/DesktopWorkbenchView.vue'));

  const bookmark = bookmarkStore();
</script>
