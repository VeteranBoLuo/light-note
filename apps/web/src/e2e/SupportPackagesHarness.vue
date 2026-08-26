<template>
  <EntitlementStore :data-visual-state="visualState" />
</template>

<script setup lang="ts">
  import EntitlementStore from '@/view/entitlementStore/EntitlementStore.vue';

  defineProps<{ visualState: string }>();
</script>

<style lang="less">
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  html,
  body,
  #app {
    width: 100%;
    min-width: 0;
    height: 100%;
    min-height: 100%;
    margin: 0;
  }

  body {
    display: block;
    overflow: hidden;
    background: var(--background-color);
    color: var(--text-color);
    font-family: var(--app-font-family);
  }
</style>
