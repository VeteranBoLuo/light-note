<template>
  <SecurityCenterMobile v-if="bookmark.isMobile" />
  <SecurityCenter v-else />
</template>

<script lang="ts" setup>
import { defineAsyncComponent } from 'vue';
import { bookmarkStore } from '@/store';

const SecurityCenterMobile = defineAsyncComponent(() => import('./SecurityCenterMobile.vue'));
const SecurityCenter = defineAsyncComponent(() => import('./SecurityCenter.vue'));

const bookmark = bookmarkStore();
</script>
