<template>
  <main class="tag-analysis-harness">
    <AiSkillDialog
      v-model:visible="visible"
      title="标签分析"
      description="服务端会读取当前标签下的全部关联资料；内容较多时自动分批分析并汇总，不会静默截取前 20 项。"
      skill-id="tag.analyze"
      prompt-key="instruction"
      surface="tag_detail"
      :resource-refs="[{ type: 'tag', id: 'visual-tag' }]"
      :scope-resource-count="46"
      scope-label="完整分析当前标签下的 46 项资料"
      :actions="actions"
      :show-prompt="false"
      :show-grounding="false"
      reserve-result-space
      auto-run-action-id="summarize"
    >
      <template #result-actions="{ response, result }">
        <BButton v-if="result?.kind === 'grounded_markdown' && response.sources.length" type="primary">
          保存为笔记
        </BButton>
      </template>
    </AiSkillDialog>
  </main>
</template>

<script setup lang="ts">
  import { ref } from 'vue';
  import AiSkillDialog from '@/components/aiSkills/AiSkillDialog.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import type { AiSkillPanelAction } from '@/components/aiSkills/types';

  const visible = ref(true);
  const actions: AiSkillPanelAction[] = [
    {
      id: 'summarize',
      label: '分析关联资料',
      input: { instruction: '完整分析当前标签下的全部资源，归纳主题、重要发现、信息缺口和下一步建议。' },
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
    color: var(--text-color);
    background: var(--background-color);
    font-family: var(--app-font-family);
  }

  .tag-analysis-harness {
    min-height: 100vh;
    background:
      radial-gradient(
        circle at 18% 12%,
        color-mix(in srgb, var(--resource-tag-color) 10%, transparent),
        transparent 35%
      ),
      var(--background-color);
  }

  html.light-note-mobile-rendering .tag-analysis-harness {
    background: var(--background-color);
  }
</style>
