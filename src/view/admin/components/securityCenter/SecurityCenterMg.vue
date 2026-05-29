<template>
  <PSecurityCenter v-if="bookmark.isMobile" />
  <SecurityCenter v-else />
</template>

<script lang="ts" setup>
import { defineAsyncComponent } from 'vue';
import { bookmarkStore } from '@/store';

const PSecurityCenter = defineAsyncComponent(() => import('./PSecurityCenter.vue'));
const SecurityCenter = defineAsyncComponent(() => import('./SecurityCenter.vue'));

const bookmark = bookmarkStore();
</script>
