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
  }>();

  const { t, te } = useI18n();

  const latestItems = computed(() => {
    const latestByName = new Map<string, AiToolStatusItem>();
    props.items.forEach((item) => {
      latestByName.set(item.name, item);
    });
    return [...latestByName.values()];
  });

  const displayItems = computed(() =>
    props.hasContent ? latestItems.value.filter((item) => !AI_WRITE_TOOL_NAMES.has(item.name)) : latestItems.value,
  );

  const runningItem = computed(() => [...displayItems.value].reverse().find((item) => item.status === 'running'));
  const hasRunning = computed(() => Boolean(runningItem.value));
  const showProgress = computed(() => !props.hasContent || hasRunning.value);
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
    if (displayItems.value.some((item) => item.status === 'confirmation_required')) {
      return t('ai.toolProgress.awaitingConfirmation');
    }
    if (displayItems.value.some((item) => item.status === 'interaction_required')) {
      return t('ai.toolProgress.awaitingChoice');
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
