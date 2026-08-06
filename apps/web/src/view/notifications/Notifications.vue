<template>
  <div class="notifications-view">
    <NotificationBell page />
  </div>
</template>

<script setup lang="ts">
  import NotificationBell from '@/components/notification/NotificationBell.vue';
</script>

<style scoped lang="less">
  .notifications-view {
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }
</style>
