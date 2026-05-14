<template>
  <PSecurityCenter v-if="bookmark.isMobile" />
  <SecurityCenter v-else />
</template>

<script lang="ts" setup>
import PSecurityCenter from './PSecurityCenter.vue';
import SecurityCenter from './SecurityCenter.vue';
import { bookmarkStore } from '@/store';
const bookmark = bookmarkStore();
</script>
