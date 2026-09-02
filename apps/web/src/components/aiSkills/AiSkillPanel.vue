<template>
  <section
    class="ai-skill-panel"
    :class="[`is-${presentation}`, { 'has-reserved-result-space': reserveResultSpace }]"
    :aria-label="title"
  >
    <header v-if="showHeader" class="ai-skill-panel__header">
      <span class="ai-skill-panel__icon" aria-hidden="true">
        <SvgIcon :src="panelIcon" size="20" />
      </span>
      <span>
        <strong>{{ title }}</strong>
        <small v-if="description">{{ description }}</small>
      </span>
    </header>

    <div v-if="resourceRefs.length && scopeLabel" class="ai-skill-panel__scope" role="status">
      {{ scopeLabel }}
    </div>

    <div v-if="skillAvailable && visibleActions.length" class="ai-skill-panel__actions">
      <BTooltip
        v-for="action in visibleActions"
        :key="action.id"
        :title="action.reason || ''"
        :disabled="!action.reason"
      >
        <BButton size="small" :disabled="interactionDisabled || action.disabled" @click="runAction(action)">
          {{ action.label }}
        </BButton>
      </BTooltip>
    </div>

    <div
      v-if="skillAvailable && showPrompt"
      class="ai-skill-panel__composer"
      :class="{ 'is-chat': composerVariant === 'chat' }"
    >
      <BInput
        v-model:value="prompt"
        type="textarea"
        :rows="promptRows"
        :maxlength="promptMaxLength"
        :disabled="interactionDisabled"
        :placeholder="placeholder"
        submit-on-enter
        @enter="runPrompt"
      />
      <BButton v-if="loading" class="ai-skill-panel__composer-action" @click="cancel">
        {{ t('aiSkills.stop') }}
      </BButton>
      <BButton
        v-else
        class="ai-skill-panel__composer-action"
        type="primary"
        :disabled="interactionDisabled || !prompt.trim()"
        @click="runPrompt"
      >
        {{ submitLabel }}
      </BButton>
    </div>

    <div v-if="!feature.loading.value && !skillAvailable" class="ai-skill-panel__state is-unavailable" role="status">
      <strong>{{ t('aiSkills.unavailableTitle') }}</strong>
      <span>{{ t('aiSkills.unavailableDescription') }}</span>
    </div>
    <div v-else-if="loading" class="ai-skill-panel__state is-loading" role="status" aria-live="polite">
      <BLoading inline loading :title="t('aiSkills.processing')" />
    </div>
    <div v-else-if="error" class="ai-skill-panel__state is-error" role="alert">
      <strong>{{ errorTitle }}</strong>
      <span>{{ error.message }}</span>
      <BButton
        v-if="autoRunAction && error.retryable"
        size="small"
        class="ai-skill-panel__retry"
        @click="runAction(autoRunAction)"
      >
        {{ t('aiSkills.retry') }}
      </BButton>
    </div>
    <div v-else-if="response?.result" class="ai-skill-panel__result" aria-live="polite">
      <slot name="result" :response="response" :result="response.result">
        <AiSkillResultContent :result="response.result" :show-grounding="showGrounding" />
      </slot>
      <div v-if="showGrounding && response.sources.length" class="ai-skill-panel__sources">
        <span>{{ t('aiSkills.sources', { count: response.sources.length }) }}</span>
        <span
          v-for="(source, index) in response.sources"
          :key="sourceKey(source, index)"
          class="ai-skill-panel__source"
        >
          {{ sourceTitle(source, index) }}
        </span>
      </div>
      <div
        v-if="coverageSummary || coverageWarnings.length"
        class="ai-skill-panel__coverage"
        :class="{ 'is-complete': response.coverage?.complete === true }"
        role="status"
      >
        <strong v-if="coverageSummary">{{ coverageSummary }}</strong>
        <span v-for="detail in coverageDetails" :key="detail">{{ detail }}</span>
        <span v-for="warning in coverageWarnings" :key="warning">{{ warning }}</span>
      </div>
      <div v-if="response.availableActions.length || $slots['result-actions']" class="ai-skill-panel__result-actions">
        <slot
          name="result-actions"
          :response="response"
          :result="response.result"
          :disabled="interactionDisabled"
        ></slot>
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
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { formatAiSkillCoverageWarnings } from '@/utils/aiSkillPresentation';
  import { getAiQuotaErrorPresentation } from '@/utils/aiQuotaErrorPresentation';
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
      scopeResourceCount?: number;
      scopeLabel?: string;
      actions?: readonly AiSkillPanelAction[];
      showPrompt?: boolean;
      promptKey?: string;
      placeholder?: string;
      submitLabel?: string;
      promptMaxLength?: number;
      promptRows?: number;
      presentation?: 'default' | 'sidebar';
      composerVariant?: 'default' | 'chat';
      showHeader?: boolean;
      emptyText?: string;
      initialInput?: Record<string, unknown>;
      initialPrompt?: string;
      autoRunActionId?: string;
      iconSrc?: string;
      showGrounding?: boolean;
      clearPromptOnSuccess?: boolean;
      reserveResultSpace?: boolean;
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
      promptMaxLength: 500,
      promptRows: 2,
      presentation: 'default',
      composerVariant: 'default',
      showHeader: true,
      emptyText: '',
      initialInput: () => ({}),
      initialPrompt: '',
      autoRunActionId: '',
      iconSrc: '',
      showGrounding: true,
      clearPromptOnSuccess: false,
      reserveResultSpace: false,
    },
  );

  const emit = defineEmits<{
    result: [response: AiSkillResponse];
    error: [error: { code: string; message: string }];
    'result-action': [action: Record<string, unknown>, response: AiSkillResponse];
  }>();
  const { t } = useI18n();
  const prompt = ref(props.initialPrompt);
  const loading = ref(false);
  const response = ref<AiSkillResponse | null>(null);
  const error = ref<{ code: string; message: string; title?: string; retryable: boolean } | null>(null);
  const feature = useAiSkillAvailability(() => props.skillId);
  const threads = new Map<string, string>();
  let sequence = 0;
  let controller: AbortController | null = null;

  const placeholder = computed(() => props.placeholder || t('aiSkills.promptPlaceholder'));
  const panelIcon = computed(() => props.iconSrc || icon.common.magicWand);
  const submitLabel = computed(() => props.submitLabel || t('aiSkills.send'));
  const coverageWarnings = computed(() =>
    formatAiSkillCoverageWarnings(response.value?.coverage?.warnings, (key) => t(key)),
  );
  const effectiveResourceCount = computed(() => {
    const declared = Number(props.scopeResourceCount);
    return Number.isFinite(declared) && declared >= 0 ? Math.floor(declared) : props.resourceRefs.length;
  });
  const coverageSummary = computed(() => {
    const total = Number(response.value?.coverage?.requestedResources);
    const analyzed = Number(response.value?.coverage?.analyzedResources);
    if (!Number.isSafeInteger(total) || total < 0 || !Number.isSafeInteger(analyzed) || analyzed < 0) return '';
    return t('aiSkills.coverageSummary', { analyzed, total });
  });
  const coverageDetails = computed(() => {
    const coverage = response.value?.coverage;
    if (!coverageSummary.value || !coverage) return [];
    const details: string[] = [];
    const unreadable = Number(coverage.unreadableResources || 0);
    const metadataOnly = Number(coverage.metadataOnlyResources || 0);
    const truncated = Number(coverage.truncatedResources || 0);
    if (unreadable > 0) details.push(t('aiSkills.coverageUnreadable', { count: unreadable }));
    if (metadataOnly > 0) details.push(t('aiSkills.coverageMetadataOnly', { count: metadataOnly }));
    if (truncated > 0) details.push(t('aiSkills.coverageTruncated', { count: truncated }));
    return details;
  });
  const errorTitle = computed(() => error.value?.title || t('aiSkills.errorTitle'));
  const scopeKey = computed(() =>
    props.resourceRefs.map((item) => `${item.type}:${item.id}:${item.version || ''}`).join('|'),
  );
  const initialInputKey = computed(() => JSON.stringify(props.initialInput));
  const autoRunAction = computed(() =>
    props.autoRunActionId ? props.actions.find((action) => action.id === props.autoRunActionId) || null : null,
  );
  const visibleActions = computed(() => {
    const autoRunId = autoRunAction.value?.id;
    return autoRunId ? props.actions.filter((action) => action.id !== autoRunId) : props.actions;
  });
  const autoRunKey = computed(() => {
    const action = autoRunAction.value;
    if (!action) return '';
    return JSON.stringify({
      actionId: action.id,
      skillId: action.skillId || props.skillId,
      scope: scopeKey.value,
      initialInput: props.initialInput,
      actionInput: action.input || {},
      promptKey: action.promptKey || '',
      promptValue: action.promptValue || '',
    });
  });
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
      resourceCountBucket: aiResourceCountBucket(effectiveResourceCount.value),
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
      const quotaFailure = getAiQuotaErrorPresentation(cause, (key, params) => t(key, params));
      const failure = quotaFailure || {
        code: String(cause?.code || 'AI_SKILL_FAILED'),
        message: String(cause?.message || t('aiSkills.retryLater')),
        retryable: true,
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
    if (action.disabled || loading.value) return null;
    const input: Record<string, unknown> = { ...props.initialInput, ...(action.input || {}) };
    if (action.promptKey) input[action.promptKey] = action.promptValue ?? prompt.value.trim();
    return execute(action.skillId || props.skillId, input);
  }

  async function runPrompt() {
    const value = prompt.value.trim();
    if (!value || loading.value) return;
    const result = await execute(props.skillId, { ...props.initialInput, [props.promptKey]: value });
    if (result?.status === 'completed' && props.clearPromptOnSuccess && prompt.value.trim() === value) {
      prompt.value = '';
    }
  }

  function handleResultAction(action: Record<string, unknown>, result: AiSkillResponse) {
    emit('result-action', action, result);
    void recordAiProductEvent('ai_skill_applied', { ...telemetryDimensions.value, outcome: 'success' });
  }

  watch([() => props.skillId, scopeKey, initialInputKey, () => props.initialPrompt], () => {
    cancel();
    response.value = null;
    error.value = null;
    prompt.value = props.initialPrompt;
  });

  let handledAutoRunKey = '';
  watch(
    [() => feature.loading.value, skillAvailable, autoRunKey],
    ([featureLoading, available, key]) => {
      if (featureLoading || !available || !key || key === handledAutoRunKey) return;
      const action = autoRunAction.value;
      if (!action) return;
      handledAutoRunKey = key;
      void runAction(action);
    },
    { immediate: true },
  );

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
    flex: 0 0 auto;
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

  .ai-skill-panel.is-sidebar {
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .ai-skill-panel.is-sidebar .ai-skill-panel__composer {
    order: 3;
    margin-top: auto;
    grid-template-columns: 1fr;
  }

  .ai-skill-panel.is-sidebar .ai-skill-panel__composer :deep(.b-textarea) {
    min-height: 80px;
    max-height: 160px;
  }

  .ai-skill-panel.is-sidebar .ai-skill-panel__composer :deep(.b_btn) {
    width: 100%;
  }

  .ai-skill-panel.is-sidebar .ai-skill-panel__state,
  .ai-skill-panel.is-sidebar .ai-skill-panel__result {
    order: 2;
    min-height: 0;
    flex: 1 1 auto;
    overflow: auto;
  }

  .ai-skill-panel.is-sidebar .ai-skill-panel__state.is-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
  }

  .ai-skill-panel__icon {
    display: inline-flex;
    width: 36px;
    height: 36px;
    flex: 0 0 36px;
    align-items: center;
    justify-content: center;
    border: 1px solid #8b84ff;
    border-radius: 11px;
    color: #fff;
    background: linear-gradient(145deg, #8078ff 0%, #615ced 52%, #4d47cf 100%);
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 28%),
      0 5px 14px rgb(80 72 211 / 20%);
  }

  .ai-skill-panel__scope {
    max-width: 100%;
    min-height: 27px;
    flex: 0 0 auto;
    align-self: flex-start;
    padding: 4px 9px;
    box-sizing: border-box;
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 999px;
    color: var(--desc-color);
    font-size: 12px;
    background: var(--workspace-panel-bg-color);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ai-skill-panel__actions,
  .ai-skill-panel__sources {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }

  .ai-skill-panel__actions {
    flex: 0 0 auto;
  }

  .ai-skill-panel__composer {
    display: grid;
    flex: 0 0 auto;
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

  .ai-skill-panel__composer.is-chat {
    position: relative;
    display: block;
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 15px;
    background: var(--workspace-panel-bg-color);
    transition:
      border-color 0.16s ease,
      box-shadow 0.16s ease;
  }

  .ai-skill-panel__composer.is-chat:focus-within {
    border-color: var(--resource-bookmark-color);
    box-shadow: 0 0 0 2px var(--primary-btn-bg-color);
  }

  .ai-skill-panel__composer.is-chat :deep(.input-container) {
    min-width: 0;
  }

  .ai-skill-panel__composer.is-chat :deep(.b-textarea) {
    min-height: 112px;
    max-height: 180px;
    padding: 13px 14px 50px !important;
    resize: none;
    border: 0 !important;
    border-radius: 15px;
    background: transparent !important;
    box-shadow: none !important;
    line-height: 1.6;
  }

  .ai-skill-panel__composer.is-chat :deep(.b_btn) {
    position: absolute;
    right: 10px;
    bottom: 10px;
    width: auto;
    height: 32px;
    padding: 0 14px;
    border-radius: 9px;
    font-size: 12px;
    line-height: 32px;
  }

  .ai-skill-panel.is-sidebar .ai-skill-panel__composer.is-chat :deep(.b-textarea) {
    min-height: 112px;
    max-height: 180px;
  }

  .ai-skill-panel.is-sidebar .ai-skill-panel__composer.is-chat :deep(.b_btn) {
    width: auto;
  }

  .ai-skill-panel__state,
  .ai-skill-panel__result {
    min-width: 0;
    max-width: 100%;
    padding: 12px;
    box-sizing: border-box;
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

  .ai-skill-panel.has-reserved-result-space .ai-skill-panel__state,
  .ai-skill-panel.has-reserved-result-space .ai-skill-panel__result {
    min-height: min(370px, 50vh);
  }

  .ai-skill-panel.has-reserved-result-space .ai-skill-panel__state.is-loading {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .ai-skill-panel__retry {
    align-self: flex-start;
    margin-top: 4px;
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

  .ai-skill-panel__result-actions:empty {
    display: none;
  }

  .ai-skill-panel__sources {
    align-items: center;
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

  .ai-skill-panel__coverage.is-complete {
    border-left-color: var(--primary-color);
    color: var(--desc-color);
  }

  .ai-skill-panel__coverage.is-complete strong {
    color: var(--primary-color);
  }

  .ai-skill-panel__coverage {
    display: flex;
    margin-top: 8px;
    padding: 8px 10px;
    flex-direction: column;
    gap: 3px;
    border: 1px solid var(--surface-border-color);
    border-left: 3px solid var(--warning-color);
    border-radius: 8px;
    color: var(--warning-color);
    background: var(--card-background);
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

    .ai-skill-panel__composer:not(.is-chat) {
      grid-template-columns: 1fr;
    }

    .ai-skill-panel__composer:not(.is-chat) :deep(.b_btn) {
      width: 100%;
    }

    .ai-skill-panel__composer.is-chat :deep(.b_btn) {
      width: auto;
    }
  }
</style>
