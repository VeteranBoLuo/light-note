<template>
  <BModal
    :visible="visible"
    :title="title"
    :width="width"
    :show-footer="false"
    :mask-closable="true"
    @update:visible="emit('update:visible', $event)"
    @close="emit('update:visible', false)"
  >
    <AiSkillPanel
      v-if="visible"
      :title="title"
      :description="description"
      :skill-id="skillId"
      :surface="surface"
      :resource-refs="resourceRefs"
      :scope-resource-count="scopeResourceCount"
      :scope-label="scopeLabel"
      :actions="actions"
      :show-prompt="showPrompt"
      :prompt-key="promptKey"
      :placeholder="resolvedPlaceholder"
      :submit-label="resolvedSubmitLabel"
      :initial-input="initialInput"
      :empty-text="emptyText"
      :auto-run-action-id="autoRunActionId"
      :icon-src="iconSrc"
      :show-grounding="showGrounding"
      :reserve-result-space="reserveResultSpace"
      @result="emit('result', $event)"
      @error="emit('error', $event)"
      @result-action="forwardResultAction"
    >
      <template v-if="$slots.result" #result="slotProps">
        <slot name="result" v-bind="slotProps"></slot>
      </template>
      <template v-if="$slots['result-actions']" #result-actions="slotProps">
        <slot name="result-actions" v-bind="slotProps"></slot>
      </template>
    </AiSkillPanel>
  </BModal>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { AiSkillResourceRef, AiSkillResponse } from '@lightnote/shared/ai-skill-protocol';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import AiSkillPanel from './AiSkillPanel.vue';
  import type { AiSkillPanelAction } from './types';

  const props = withDefaults(
    defineProps<{
      visible: boolean;
      title: string;
      description?: string;
      skillId: string;
      surface: string;
      resourceRefs?: readonly AiSkillResourceRef[];
      scopeResourceCount?: number;
      scopeLabel?: string;
      actions?: readonly AiSkillPanelAction[];
      showPrompt?: boolean;
      promptKey?: string;
      placeholder?: string;
      submitLabel?: string;
      initialInput?: Record<string, unknown>;
      emptyText?: string;
      autoRunActionId?: string;
      iconSrc?: string;
      showGrounding?: boolean;
      reserveResultSpace?: boolean;
      width?: string;
    }>(),
    {
      description: '',
      resourceRefs: () => [],
      scopeLabel: '',
      actions: () => [],
      showPrompt: false,
      promptKey: 'question',
      placeholder: '',
      submitLabel: '',
      initialInput: () => ({}),
      emptyText: '',
      autoRunActionId: '',
      iconSrc: '',
      showGrounding: true,
      reserveResultSpace: false,
      width: 'min(720px, calc(100vw - 24px))',
    },
  );
  const { t } = useI18n();
  const resolvedPlaceholder = computed(() => props.placeholder || t('aiSkills.promptPlaceholder'));
  const resolvedSubmitLabel = computed(() => props.submitLabel || t('aiSkills.send'));

  const emit = defineEmits<{
    'update:visible': [visible: boolean];
    result: [response: AiSkillResponse];
    error: [error: { code: string; message: string }];
    'result-action': [action: Record<string, unknown>, response: AiSkillResponse];
  }>();

  function forwardResultAction(action: Record<string, unknown>, response: AiSkillResponse) {
    emit('result-action', action, response);
  }
</script>
