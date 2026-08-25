<template>
  <main class="ai-organize-tags-harness" aria-hidden="true">
    <section>
      <span>智能打标签</span>
      <h1>高相关标签复审状态</h1>
      <p>本地隔离视觉夹具，不调用模型，也不会创建或关联真实标签。</p>
    </section>
    <AiOrganizeModal v-model:visible="visible" :init-type="resourceType" />
  </main>
</template>

<script setup lang="ts">
  import { ref } from 'vue';
  import AiOrganizeModal from '@/components/manage/bookmarkMg/AiOrganizeModal.vue';

  defineProps<{ resourceType: 'bookmark' | 'note' }>();
  const visible = ref(true);
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
    min-height: 100%;
    margin: 0;
  }

  body {
    background: var(--background-color);
    color: var(--text-color);
    font-family: var(--app-font-family);
  }

  .ai-organize-tags-harness {
    min-height: 100vh;
    padding: clamp(24px, 8vw, 96px);
    background: var(--background-color);
  }

  .ai-organize-tags-harness section {
    max-width: 720px;
    padding: 28px;
    border: 1px solid var(--surface-border-color);
    border-radius: 16px;
    background: var(--surface-page-bg, var(--card-background));
  }

  .ai-organize-tags-harness h1 {
    margin: 10px 0;
  }

  .ai-organize-tags-harness p,
  .ai-organize-tags-harness span {
    color: var(--desc-color);
  }
</style>
