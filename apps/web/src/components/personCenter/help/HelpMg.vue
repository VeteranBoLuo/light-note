<template>
  <Help />
</template>

<script lang="ts" setup>
  import { defineAsyncComponent } from 'vue';

  const Help = defineAsyncComponent(() => import('@/components/personCenter/help/Help.vue'));
</script>
