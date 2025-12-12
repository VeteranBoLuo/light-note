<template>
  <PAdmin v-if="bookmark.isMobileDevice" />
  <Admin v-else />
</template>

<script lang="ts" setup>
  import PAdmin from '@/view/admin/admin/PAdmin.vue';
  import Admin from '@/view/admin/admin/Admin.vue';
  import { bookmarkStore } from '@/store';
  const bookmark = bookmarkStore();
</script>

<style lang="less"></style>
