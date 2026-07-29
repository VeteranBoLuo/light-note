<template>
  <AdminMobile v-if="bookmark.isMobile" />
  <Admin v-else />
</template>

<script lang="ts" setup>
  import { defineAsyncComponent } from 'vue';
  import { bookmarkStore } from '@/store';

  const AdminMobile = defineAsyncComponent(() => import('@/view/admin/admin/AdminMobile.vue'));
  const Admin = defineAsyncComponent(() => import('@/view/admin/admin/Admin.vue'));

  const bookmark = bookmarkStore();
</script>

<style lang="less"></style>
