<template>
  <section class="ai-skill-panel" :aria-label="title">
    <header class="ai-skill-panel__header">
      <span class="ai-skill-panel__icon" aria-hidden="true">
        <SvgIcon :src="icon.common.magicWand" size="18" />
      </span>
      <span>
        <strong>{{ title }}</strong>
        <small v-if="description">{{ description }}</small>
      </span>
    </header>

    <div v-if="resourceRefs.length && scopeLabel" class="ai-skill-panel__scope" role="status">
      {{ scopeLabel }}
    </div>

    <div v-if="skillAvailable && actions.length" class="ai-skill-panel__actions">
      <BButton
        v-for="action in actions"
        :key="action.id"
        size="small"
        :disabled="interactionDisabled"
        @click="runAction(action)"
      >
        {{ action.label }}
      </BButton>
    </div>

    <div v-if="skillAvailable && showPrompt" class="ai-skill-panel__composer">
      <BInput
        v-model:value="prompt"
        type="textarea"
        :rows="2"
        :maxlength="promptMaxLength"
        :disabled="interactionDisabled"
        :placeholder="placeholder"
        submit-on-enter
        @enter="runPrompt"
      />
      <BButton v-if="loading" @click="cancel">{{ t('aiSkills.stop') }}</BButton>
      <BButton v-else type="primary" :disabled="interactionDisabled || !prompt.trim()" @click="runPrompt">{{
        submitLabel
      }}</BButton>
    </div>

    <div v-if="!feature.loading.value && !skillAvailable" class="ai-skill-panel__state is-unavailable" role="status">
      <strong>{{ t('aiSkills.unavailableTitle') }}</strong>
      <span>{{ t('aiSkills.unavailableDescription') }}</span>
    </div>
    <div v-else-if="loading" class="ai-skill-panel__state" role="status" aria-live="polite">
      <BLoading inline loading :title="t('aiSkills.processing')" />
    </div>
    <div v-else-if="error" class="ai-skill-panel__state is-error" role="alert">
      <strong>{{ errorTitle }}</strong>
      <span>{{ error.message }}</span>
    </div>
    <div v-else-if="response?.result" class="ai-skill-panel__result" aria-live="polite">
      <slot name="result" :response="response" :result="response.result">
        <AiSkillResultContent :result="response.result" />
      </slot>
      <div v-if="response.sources.length" class="ai-skill-panel__sources">
        <span>{{ t('aiSkills.sources', { count: response.sources.length }) }}</span>
        <span
          v-for="(source, index) in response.sources"
          :key="sourceKey(source, index)"
          class="ai-skill-panel__source"
        >
          {{ sourceTitle(source, index) }}
        </span>
      </div>
      <div v-if="coverageWarnings.length" class="ai-skill-panel__coverage" role="status">
        <span v-for="warning in coverageWarnings" :key="warning">{{ warning }}</span>
      </div>
      <div v-if="response.availableActions.length" class="ai-skill-panel__result-actions">
        <BButton
          v-for="action in response.availableActions"
          :key="String(action.id)"
          type="primary"
          @click="handleResultAction(action, response)"
        >
          {{ String(action.label || t('aiSkills.continue')) }}
        </BButton>
      </div>
    </div>
    <div v-else-if="emptyText" class="ai-skill-panel__state is-empty">
      {{ emptyText }}
    </div>
  </section>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { AiSkillResourceRef, AiSkillResponse } from '@lightnote/shared/ai-skill-protocol';
  import { createAiSkillRequest, executeAiSkill } from '@/api/aiSkillApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { formatAiSkillCoverageWarnings } from '@/utils/aiSkillPresentation';
  import { aiResourceCountBucket, recordAiProductEvent } from '@/api/aiTelemetry';
  import { useAiSkillAvailability } from '@/composables/useAiSkillAvailability';
  import AiSkillResultContent from './AiSkillResultContent.vue';
  import type { AiSkillPanelAction } from './types';

  const props = withDefaults(
    defineProps<{
      title: string;
      description?: string;
      skillId: string;
      surface: string;
      resourceRefs?: readonly AiSkillResourceRef[];
      scopeLabel?: string;
      actions?: readonly AiSkillPanelAction[];
      showPrompt?: boolean;
      promptKey?: string;
      placeholder?: string;
      submitLabel?: string;
      promptMaxLength?: number;
      emptyText?: string;
      initialInput?: Record<string, unknown>;
    }>(),
    {
      description: '',
      resourceRefs: () => [],
      scopeLabel: '',
      actions: () => [],
      showPrompt: true,
      promptKey: 'question',
      placeholder: '',
      submitLabel: '',
      promptMaxLength: 500,
      emptyText: '',
      initialInput: () => ({}),
    },
  );

  const emit = defineEmits<{
    result: [response: AiSkillResponse];
    error: [error: { code: string; message: string }];
    'result-action': [action: Record<string, unknown>, response: AiSkillResponse];
  }>();
  const { t } = useI18n();
  const prompt = ref('');
  const loading = ref(false);
  const response = ref<AiSkillResponse | null>(null);
  const error = ref<{ code: string; message: string } | null>(null);
  const feature = useAiSkillAvailability(() => props.skillId);
  const threads = new Map<string, string>();
  let sequence = 0;
  let controller: AbortController | null = null;

  const placeholder = computed(() => props.placeholder || t('aiSkills.promptPlaceholder'));
  const submitLabel = computed(() => props.submitLabel || t('aiSkills.send'));
  const coverageWarnings = computed(() =>
    formatAiSkillCoverageWarnings(response.value?.coverage?.warnings, (key) => t(key)),
  );
  const errorTitle = computed(() =>
    error.value?.code === 'AI_QUOTA_EXCEEDED' ? t('aiSkills.quotaErrorTitle') : t('aiSkills.errorTitle'),
  );
  const scopeKey = computed(() =>
    props.resourceRefs.map((item) => `${item.type}:${item.id}:${item.version || ''}`).join('|'),
  );
  const skillAvailable = computed(() => feature.available.value);
  const interactionDisabled = computed(() => loading.value || feature.loading.value || !skillAvailable.value);
  const telemetryDimensions = computed(() => {
    const types = [...new Set(props.resourceRefs.map((item) => item.type))];
    return {
      skillId: props.skillId,
      surface: props.surface as any,
      resourceType: (types.length > 1
        ? 'mixed'
        : types[0] ||
          (props.skillId.startsWith('help.')
            ? 'help'
            : props.skillId.startsWith('search.')
              ? 'search'
              : 'none')) as any,
      resourceCountBucket: aiResourceCountBucket(props.resourceRefs.length),
    };
  });

  function sourceKey(source: Record<string, unknown>, index: number) {
    return String(source.sourceId || source.id || `${index}`);
  }

  function sourceTitle(source: Record<string, unknown>, index: number) {
    return String(source.title || source.name || t('aiSkills.sourceFallback', { index: index + 1 }));
  }

  function cancel() {
    const wasLoading = loading.value;
    sequence += 1;
    controller?.abort();
    controller = null;
    loading.value = false;
    if (wasLoading)
      void recordAiProductEvent('ai_skill_cancelled', { ...telemetryDimensions.value, outcome: 'cancelled' });
  }

  async function execute(skillId: string, input: Record<string, unknown>) {
    const current = ++sequence;
    controller?.abort();
    controller = new AbortController();
    const requestController = controller;
    loading.value = true;
    error.value = null;
    const threadKey = `${skillId}@${scopeKey.value}`;
    try {
      const result = await executeAiSkill(
        createAiSkillRequest({
          skillId,
          threadId: threads.get(threadKey) || null,
          input,
          resourceRefs: props.resourceRefs,
          surface: props.surface,
        }),
        { signal: requestController.signal },
      );
      if (current !== sequence || requestController.signal.aborted) return null;
      response.value = result;
      if (result.threadId) threads.set(threadKey, result.threadId);
      emit('result', result);
      return result;
    } catch (cause: any) {
      if (current !== sequence || requestController.signal.aborted) return null;
      const failure = {
        code: String(cause?.code || 'AI_SKILL_FAILED'),
        message: String(cause?.message || t('aiSkills.retryLater')),
      };
      error.value = failure;
      emit('error', failure);
      return null;
    } finally {
      if (current === sequence) loading.value = false;
      if (controller === requestController) controller = null;
    }
  }

  function runAction(action: AiSkillPanelAction) {
    const input: Record<string, unknown> = { ...props.initialInput, ...(action.input || {}) };
    if (action.promptKey) input[action.promptKey] = action.promptValue ?? prompt.value.trim();
    void execute(action.skillId || props.skillId, input);
  }

  function runPrompt() {
    const value = prompt.value.trim();
    if (!value || loading.value) return;
    void execute(props.skillId, { ...props.initialInput, [props.promptKey]: value });
  }

  function handleResultAction(action: Record<string, unknown>, result: AiSkillResponse) {
    emit('result-action', action, result);
    void recordAiProductEvent('ai_skill_applied', { ...telemetryDimensions.value, outcome: 'success' });
  }

  watch([() => props.skillId, scopeKey], () => {
    cancel();
    response.value = null;
    error.value = null;
    prompt.value = '';
  });

  onMounted(() => void recordAiProductEvent('ai_skill_opened', telemetryDimensions.value));
  onBeforeUnmount(cancel);
  defineExpose({ execute, cancel, response });
</script>

<style scoped lang="less">
  .ai-skill-panel {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 12px;
    padding: 15px;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    color: var(--text-color);
    background: var(--card-background);
  }

  .ai-skill-panel__header {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }

  .ai-skill-panel__header > span:last-child {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 3px;
  }

  .ai-skill-panel__header strong {
    font-size: 15px;
  }

  .ai-skill-panel__header small,
  .ai-skill-panel__state,
  .ai-skill-panel__coverage {
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.55;
  }

  .ai-skill-panel__icon {
    display: inline-flex;
    width: 30px;
    height: 30px;
    flex: 0 0 30px;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--primary-color);
    border-radius: 9px;
    color: var(--primary-color);
    background: var(--workspace-panel-bg-color);
  }

  .ai-skill-panel__scope {
    align-self: flex-start;
    padding: 4px 9px;
    border: 1px solid var(--surface-border-color);
    border-radius: 999px;
    color: var(--desc-color);
    font-size: 12px;
    background: var(--workspace-panel-bg-color);
  }

  .ai-skill-panel__actions,
  .ai-skill-panel__sources {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }

  .ai-skill-panel__composer {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
    gap: 8px;
  }

  .ai-skill-panel__composer :deep(.b-textarea) {
    min-height: 68px;
    border-color: var(--surface-border-color);
    color: var(--text-color);
    background: var(--bl-input-noBorder-bg-color);
  }

  .ai-skill-panel__state,
  .ai-skill-panel__result {
    padding: 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    background: var(--workspace-panel-bg-color);
  }

  .ai-skill-panel__state.is-error {
    display: flex;
    flex-direction: column;
    gap: 4px;
    border-color: var(--danger-color);
    color: var(--danger-color);
  }

  .ai-skill-panel__state.is-unavailable {
    display: grid;
    gap: 4px;
  }

  .ai-skill-panel__result-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 12px;
  }

  .ai-skill-panel__sources {
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid var(--surface-divider-color);
    color: var(--desc-color);
    font-size: 12px;
  }

  .ai-skill-panel__source {
    padding: 3px 7px;
    border: 1px solid var(--surface-border-color);
    border-radius: 999px;
    color: var(--text-color);
    background: var(--card-background);
  }

  .ai-skill-panel__coverage {
    display: flex;
    margin-top: 8px;
    flex-direction: column;
    gap: 3px;
  }

  html.light-note-mobile-rendering .ai-skill-panel__icon,
  html.light-note-mobile-rendering .ai-skill-panel__state.is-error {
    box-shadow: none;
  }

  @media (max-width: 720px) {
    .ai-skill-panel {
      padding: 12px;
      border-radius: 12px;
    }

    .ai-skill-panel__composer {
      grid-template-columns: 1fr;
    }

    .ai-skill-panel__composer :deep(.b_btn) {
      width: 100%;
    }
  }
</style>
