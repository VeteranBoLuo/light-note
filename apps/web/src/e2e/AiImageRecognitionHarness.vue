<template>
  <main class="image-recognition-harness">
    <section class="image-recognition-harness__frame">
      <AiSkillPanel
        title="文件分析"
        description="只读取当前明确选中的文件；切换文件后不会沿用上一组材料。"
        skill-id="file.summarize"
        surface="file.preview"
        :resource-refs="[{ type: 'file', id: 'visual-image' }]"
        scope-label="文件 · 行驶证主页.jpg"
        :actions="actions"
        auto-run-action-id="extract"
      />
    </section>
  </main>
</template>

<script setup lang="ts">
  import AiSkillPanel from '@/components/aiSkills/AiSkillPanel.vue';
  import type { AiSkillPanelAction } from '@/components/aiSkills/types';

  const actions: AiSkillPanelAction[] = [
    {
      id: 'extract',
      label: '提取并总结图片文字',
      input: { instruction: '提取图片中的文字并总结关键字段。' },
    },
  ];
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

  .image-recognition-harness {
    display: flex;
    min-height: 100vh;
    align-items: flex-start;
    justify-content: center;
    padding: 40px 24px;
  }

  .image-recognition-harness__frame {
    width: min(760px, 100%);
  }

  @media (max-width: 600px) {
    .image-recognition-harness {
      min-height: 100vh;
      padding: 16px 12px;
    }
  }
</style>
