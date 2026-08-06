<template>
  <!-- 移动端 /trash 重映射到顶层 /ptrash,吃不到 view/index.vue 的全屏壳;
       这里补一层固定壳,让回收站和笔记库/云空间一样铺满、居中。 -->
  <div class="ptrash-shell">
    <MobileTopBar />
    <div class="ptrash-shell__body"><Trash /></div>
  </div>
</template>

<script setup lang="ts">
  import Trash from './Trash.vue';
  import MobileTopBar from '@/components/mobile/MobileTopBar.vue';
</script>

<style scoped>
  .ptrash-shell {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    background: var(--surface-page-bg);
  }

  .ptrash-shell__body {
    min-height: 0;
    flex: 1 1 auto;
  }
</style>
