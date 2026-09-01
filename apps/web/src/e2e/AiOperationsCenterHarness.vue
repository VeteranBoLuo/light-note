<template>
  <AiOperationsCenter />
</template>

<script setup lang="ts">
  import AiOperationsCenter from '@/view/admin/components/aiOperations/AiOperationsCenter.vue';
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

  #app {
    padding: 18px;
  }

  @media (max-width: 600px) {
    #app {
      padding: 0;
    }
  }
</style>
