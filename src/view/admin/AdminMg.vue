<template>
  <PAdmin v-if="bookmark.isMobile" />
  <Admin v-else />
</template>

<script lang="ts" setup>
  import { defineAsyncComponent } from 'vue';
  import { bookmarkStore } from '@/store';

  const PAdmin = defineAsyncComponent(() => import('@/view/admin/admin/PAdmin.vue'));
  const Admin = defineAsyncComponent(() => import('@/view/admin/admin/Admin.vue'));

  const bookmark = bookmarkStore();
</script>

<style lang="less"></style>
