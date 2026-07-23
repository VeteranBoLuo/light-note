<template>
  <div v-if="displayItems.length && showProgress" class="ai-tool-progress">
    <ReplyLoading :label="progressLabel" />
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import ReplyLoading from './ReplyLoading.vue';
  import { AI_WRITE_TOOL_NAMES } from '@/config/aiTools';

  export interface AiToolStatusItem {
    name: string;
    status: 'running' | 'success' | 'error' | 'confirmation_required' | 'interaction_required';
    round?: number;
  }

  const props = defineProps<{
    items: AiToolStatusItem[];
    hasContent?: boolean;
    hasPendingAction?: boolean;
  }>();

  const { t, te } = useI18n();

  const latestItems = computed(() => {
    const latestByName = new Map<string, AiToolStatusItem>();
    props.items.forEach((item) => {
      latestByName.set(item.name, item);
    });
    return [...latestByName.values()];
  });

  // 确认与选择状态有独立、可直接操作的卡片；不能再额外渲染“等待确认”的过程提示。
  // 否则用户会看到状态条、活动摘要与确认卡三次表达同一件事。
  const displayItems = computed(() =>
    latestItems.value.filter((item) => {
      if (item.status === 'confirmation_required' || item.status === 'interaction_required') return false;
      return !props.hasContent || !AI_WRITE_TOOL_NAMES.has(item.name);
    }),
  );

  const runningItem = computed(() => [...displayItems.value].reverse().find((item) => item.status === 'running'));
  const hasRunning = computed(() => Boolean(runningItem.value));
  const showProgress = computed(
    () => !props.hasPendingAction && Boolean(displayItems.value.length) && (!props.hasContent || hasRunning.value),
  );
  const errorCount = computed(() => displayItems.value.filter((item) => item.status === 'error').length);

  function toolLabel(name: string) {
    const key = `ai.tools.${name}`;
    return te(key) ? t(key) : t('ai.tools.generic');
  }

  const progressLabel = computed(() => {
    if (runningItem.value) {
      const key = AI_WRITE_TOOL_NAMES.has(runningItem.value.name)
        ? 'ai.toolProgress.preparingAction'
        : 'ai.toolProgress.reading';
      return t(key, { target: toolLabel(runningItem.value.name) });
    }
    if (errorCount.value) {
      return t(
        displayItems.value.every((item) => AI_WRITE_TOOL_NAMES.has(item.name))
          ? 'ai.toolProgress.actionFailed'
          : 'ai.toolProgress.partialFailure',
      );
    }
    return t('ai.toolProgress.preparingAnswer');
  });
</script>

<style scoped lang="less">
  .ai-tool-progress {
    width: 100%;
    margin-top: 6px;
  }
</style>
