<template>
  <section class="ai-interaction-card" :class="`status-${status}`" :aria-labelledby="titleId">
    <header class="interaction-header">
      <span class="interaction-icon" aria-hidden="true">
        <SvgIcon :src="icon.message.info" size="18" />
      </span>
      <div class="interaction-heading">
        <strong :id="titleId">{{ title }}</strong>
        <p v-if="description">{{ description }}</p>
      </div>
    </header>

    <template v-if="status === 'pending'">
      <div
        class="interaction-options"
        :class="{ 'is-multiple': interaction.type === 'multi_choice', 'is-long': interaction.options.length > 6 }"
        :role="interaction.type === 'multi_choice' ? 'group' : 'radiogroup'"
        :aria-label="title"
      >
        <BCheckbox
          v-for="option in multipleOptions"
          :key="option.id"
          class="interaction-option interaction-option-multiple"
          :checked="selectedIds.includes(option.id)"
          :disabled="selectionLocked || option.disabled"
          role="checkbox"
          :tabindex="selectionLocked || option.disabled ? -1 : 0"
          :aria-checked="selectedIds.includes(option.id)"
          :aria-disabled="selectionLocked || option.disabled"
          @change="() => chooseOption(option.id)"
          @keydown.enter.prevent="chooseOption(option.id)"
          @keydown.space.prevent="chooseOption(option.id)"
        >
          <span class="option-copy">
            <span class="option-title-row">
              <span class="option-title">{{ optionLabel(option) }}</span>
              <span v-if="option.recommended" class="recommended-badge">
                {{ t('ai.interaction.recommended') }}
              </span>
            </span>
            <small v-if="optionDescription(option)">{{ optionDescription(option) }}</small>
          </span>
        </BCheckbox>

        <BButton
          v-for="option in singleOptions"
          :key="option.id"
          class="interaction-option interaction-option-single"
          :class="{ 'is-selected': selectedIds.includes(option.id) }"
          :disabled="selectionLocked || option.disabled"
          role="radio"
          :tabindex="selectionLocked || option.disabled ? -1 : 0"
          :aria-checked="selectedIds.includes(option.id)"
          :aria-disabled="selectionLocked || option.disabled"
          @click="chooseOption(option.id)"
          @keydown.enter.prevent="chooseOption(option.id)"
          @keydown.space.prevent="chooseOption(option.id)"
        >
          <span class="single-option-indicator" aria-hidden="true">
            <SvgIcon v-if="selectedIds.includes(option.id)" :src="icon.filterPanel.check" size="15" />
          </span>
          <span class="option-copy">
            <span class="option-title-row">
              <span class="option-title">{{ optionLabel(option) }}</span>
              <span v-if="option.recommended" class="recommended-badge">
                {{ t('ai.interaction.recommended') }}
              </span>
            </span>
            <small v-if="optionDescription(option)">{{ optionDescription(option) }}</small>
          </span>
        </BButton>
      </div>

      <div v-if="interaction.allowCustom" class="interaction-custom">
        <label :for="customInputId">{{ customLabel }}</label>
        <BInput
          :id="customInputId"
          :value="customValue"
          :placeholder="customPlaceholder"
          :disabled="selectionLocked"
          :maxlength="1000"
          @input="setCustomValue"
          @enter="submit"
        />
      </div>

      <div class="interaction-meta">
        <span>{{ selectionHint }}</span>
        <span>{{ t('ai.interaction.remaining', { seconds: remainingSeconds }) }}</span>
      </div>
      <p v-if="retryNotice" class="interaction-notice" aria-live="polite">{{ retryNotice }}</p>

      <footer class="interaction-actions">
        <BButton
          size="small"
          :disabled="loading || selectionLocked"
          role="button"
          :tabindex="loading || selectionLocked ? -1 : 0"
          :aria-disabled="loading || selectionLocked"
          @click="cancel"
          @keydown.enter.prevent="cancel"
          @keydown.space.prevent="cancel"
        >
          {{ cancelLabel }}
        </BButton>
        <BButton
          type="primary"
          size="small"
          :loading="loading"
          :disabled="!canSubmit && !selectionLocked"
          role="button"
          :tabindex="!canSubmit && !selectionLocked ? -1 : 0"
          :aria-disabled="!canSubmit && !selectionLocked"
          @click="submit"
          @keydown.enter.prevent="submit"
          @keydown.space.prevent="submit"
        >
          {{ selectionLocked ? t('ai.interaction.retry') : submitLabel }}
        </BButton>
      </footer>
    </template>

    <p v-else class="interaction-result" aria-live="polite">{{ resultText }}</p>
  </section>
</template>

<script setup lang="ts">
  import { computed, onMounted, onUnmounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import bMessage from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import icon from '@/config/icon';
  import { respondAiInteraction } from '@/api/aiAttachmentApi';
  import type {
    AiAgentInteraction,
    AiAgentInteractionOption,
    AiAgentInteractionResolution,
    AiAgentInteractionResponse,
    AiAgentInteractionSettlement,
    AiAgentInteractionSettlementStatus,
  } from '@/types/aiAgent';
  import {
    canSubmitInteraction,
    createInteractionSelection,
    freezeInteractionResponse,
    isRetryableInteractionError,
    toggleInteractionOption,
    updateInteractionCustomValue,
  } from './interactionSelection';

  const props = defineProps<{ interaction: AiAgentInteraction }>();
  const emit = defineEmits<{
    resolved: [resolution: AiAgentInteractionResolution];
    settled: [settlement: AiAgentInteractionSettlement];
  }>();
  const { t, te } = useI18n();

  const titleId = `ai-interaction-title-${props.interaction.id}`;
  const customInputId = `ai-interaction-custom-${props.interaction.id}`;
  const status = ref<'pending' | 'resolved' | 'cancelled' | 'failed' | 'expired'>('pending');
  const selection = ref(createInteractionSelection());
  const loading = ref(false);
  const retryNotice = ref('');
  const resultText = ref('');
  const frozenResponse = ref<Readonly<AiAgentInteractionResponse> | null>(null);
  let expiresAt = Date.now() + Math.max(0, Number(props.interaction.expiresIn || 0)) * 1000;
  const retryWindowMs = 5 * 60 * 1000;
  const remainingSeconds = ref(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
  let countdownTimer: number | null = null;
  let settlementEmitted = false;

  const selectedIds = computed(() => selection.value.selectedIds);
  const customValue = computed(() => selection.value.customValue);
  const singleOptions = computed(() => (props.interaction.type === 'multi_choice' ? [] : props.interaction.options));
  const multipleOptions = computed(() => (props.interaction.type === 'multi_choice' ? props.interaction.options : []));
  const canSubmit = computed(() => canSubmitInteraction(props.interaction, selection.value));
  const selectionLocked = computed(() => Boolean(frozenResponse.value));

  function translatedText(key: string | undefined, fallback: string, params?: Record<string, unknown>) {
    return key && te(key) ? t(key, params || {}) : fallback;
  }

  const title = computed(() =>
    translatedText(
      props.interaction.i18nKey ? `${props.interaction.i18nKey}.title` : '',
      props.interaction.title,
      props.interaction.i18nParams,
    ),
  );
  const description = computed(() =>
    translatedText(
      props.interaction.i18nKey ? `${props.interaction.i18nKey}.description` : '',
      props.interaction.description || '',
      props.interaction.i18nParams,
    ),
  );
  const customLabel = computed(() => props.interaction.customLabel || t('ai.interaction.customLabel'));
  const customPlaceholder = computed(
    () => props.interaction.customPlaceholder || t('ai.interaction.customPlaceholder'),
  );
  const submitLabel = computed(() =>
    translatedText(
      props.interaction.i18nKey ? `${props.interaction.i18nKey}.submitLabel` : '',
      props.interaction.i18nKey
        ? t('ai.interaction.submit')
        : props.interaction.submitLabel || t('ai.interaction.submit'),
      props.interaction.i18nParams,
    ),
  );
  const cancelLabel = computed(() =>
    translatedText(
      props.interaction.i18nKey ? `${props.interaction.i18nKey}.cancelLabel` : '',
      props.interaction.i18nKey ? t('common.cancel') : props.interaction.cancelLabel || t('common.cancel'),
      props.interaction.i18nParams,
    ),
  );
  const selectionHint = computed(() => {
    if (props.interaction.minSelections === props.interaction.maxSelections) {
      return t('ai.interaction.selectExact', { count: props.interaction.minSelections });
    }
    return t('ai.interaction.selectRange', {
      min: props.interaction.minSelections,
      max: props.interaction.maxSelections,
    });
  });

  function optionLabel(option: AiAgentInteractionOption) {
    return translatedText(option.i18nKey ? `${option.i18nKey}.label` : '', option.label, option.i18nParams);
  }

  function optionDescription(option: AiAgentInteractionOption) {
    return translatedText(
      option.i18nKey ? `${option.i18nKey}.description` : '',
      option.description || '',
      option.i18nParams,
    );
  }

  function chooseOption(optionId: string) {
    if (loading.value || selectionLocked.value || status.value !== 'pending') return;
    selection.value = toggleInteractionOption(props.interaction, selection.value, optionId);
  }

  function setCustomValue(value: string) {
    if (selectionLocked.value) return;
    selection.value = updateInteractionCustomValue(props.interaction, selection.value, value);
  }

  function settle(settlementStatus: AiAgentInteractionSettlementStatus, summary: string) {
    if (settlementEmitted) return;
    settlementEmitted = true;
    emit('settled', {
      interactionId: props.interaction.id,
      status: settlementStatus,
      summary,
    });
  }

  function stopCountdown() {
    if (countdownTimer) window.clearInterval(countdownTimer);
    countdownTimer = null;
  }

  function refreshCountdown() {
    remainingSeconds.value = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
    if (remainingSeconds.value || status.value !== 'pending' || loading.value) return;
    status.value = 'expired';
    resultText.value = t('ai.interaction.expired');
    stopCountdown();
    settle('expired', resultText.value);
  }

  onMounted(() => {
    refreshCountdown();
    if (status.value === 'pending') countdownTimer = window.setInterval(refreshCountdown, 1000);
  });
  onUnmounted(stopCountdown);

  function requestError(error: any) {
    return error?.response?.data?.msg || error?.message || t('ai.interaction.failed');
  }

  function completeResolution(resolution: AiAgentInteractionResolution) {
    emit('resolved', resolution);
    retryNotice.value = '';
    stopCountdown();
    if (resolution.state === 'confirmation_required') {
      status.value = 'resolved';
      resultText.value = t('ai.interaction.confirmationReady');
      settle('advanced', resultText.value);
      return;
    }
    if (resolution.state === 'edit_required') {
      status.value = 'resolved';
      resultText.value = t('ai.interaction.editing');
      settle('editing', resultText.value);
      return;
    }
    if (resolution.state === 'cancelled') {
      status.value = 'cancelled';
      resultText.value = t('ai.interaction.cancelled');
      settle('cancelled', resultText.value);
      return;
    }
    status.value = 'resolved';
    resultText.value = resolution.summary || t('ai.interaction.completed');
    settle('resolved', resultText.value);
  }

  async function sendResponse(response: Readonly<AiAgentInteractionResponse>) {
    if (loading.value || status.value !== 'pending' || remainingSeconds.value <= 0) return;
    loading.value = true;
    try {
      const resolution = await respondAiInteraction({
        interaction: props.interaction,
        response: {
          selectedIds: [...response.selectedIds],
          customValue: response.customValue,
          cancelled: response.cancelled,
        },
      });
      completeResolution(resolution);
    } catch (error: any) {
      if (isRetryableInteractionError(error)) {
        expiresAt = Math.max(expiresAt, Date.now() + retryWindowMs);
        refreshCountdown();
        retryNotice.value = t('ai.interaction.retryHint');
        bMessage.warning(retryNotice.value);
        return;
      }
      frozenResponse.value = null;
      const summary = requestError(error);
      if (Number(error?.status || error?.response?.status) === 410) {
        status.value = 'expired';
        resultText.value = t('ai.interaction.expired');
        settle('expired', resultText.value);
      } else {
        status.value = 'failed';
        resultText.value = summary;
        settle('failed', summary);
      }
      stopCountdown();
      bMessage.error(resultText.value);
    } finally {
      loading.value = false;
    }
  }

  function submit() {
    if (!frozenResponse.value && !canSubmit.value) return;
    if (!frozenResponse.value) frozenResponse.value = freezeInteractionResponse(selection.value);
    void sendResponse(frozenResponse.value);
  }

  function cancel() {
    if (selectionLocked.value || loading.value) return;
    frozenResponse.value = freezeInteractionResponse(createInteractionSelection(), true);
    void sendResponse(frozenResponse.value);
  }
</script>

<style scoped lang="less">
  .ai-interaction-card {
    width: 100%;
    margin: 0;
    padding: 16px;
    box-sizing: border-box;
    border: 1px solid color-mix(in srgb, var(--primary-color) 34%, var(--card-border-color));
    border-radius: 14px;
    background: color-mix(in srgb, var(--card-background) 94%, var(--primary-color) 6%);
    color: var(--text-color);
    box-shadow: var(--surface-card-shadow);
  }

  .interaction-header {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }

  .interaction-icon {
    width: 30px;
    height: 30px;
    flex: 0 0 30px;
    display: grid;
    place-items: center;
    border-radius: 9px;
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 14%, transparent);
  }

  .interaction-heading {
    min-width: 0;
  }

  .interaction-heading strong {
    display: block;
    line-height: 1.5;
  }

  .interaction-heading p {
    margin: 3px 0 0;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.55;
  }

  .interaction-options {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 9px;
    margin-top: 14px;
  }

  .interaction-options.is-long {
    max-height: 420px;
    padding-right: 3px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .interaction-option {
    min-width: 0;
    box-sizing: border-box;
    border: 1px solid var(--card-border-color);
    border-radius: 10px;
    background: var(--card-background);
    transition:
      border-color 0.18s ease,
      background 0.18s ease,
      box-shadow 0.18s ease;
  }

  .interaction-option:hover,
  .interaction-option:focus-visible,
  .interaction-option.is-selected {
    border-color: var(--primary-color);
    background: color-mix(in srgb, var(--card-background) 93%, var(--primary-color) 7%);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary-color) 12%, transparent);
    outline: none;
  }

  .interaction-option-single {
    width: 100%;
    height: auto;
    min-height: 58px;
    padding: 10px 11px;
    justify-content: flex-start;
    align-items: flex-start;
    text-align: left;
    white-space: normal;
    line-height: normal;
  }

  .interaction-option-multiple {
    width: 100%;
    padding: 10px 11px;
    align-items: flex-start;
  }

  .single-option-indicator {
    width: 18px;
    height: 18px;
    flex: 0 0 18px;
    display: grid;
    place-items: center;
    margin-top: 1px;
    border: 1.5px solid var(--card-border-color);
    border-radius: 50%;
    color: #fff;
  }

  .is-selected .single-option-indicator {
    border-color: var(--primary-color);
    background: var(--primary-color);
  }

  .option-copy {
    min-width: 0;
    display: grid;
    gap: 3px;
    flex: 1;
  }

  .option-title-row {
    min-width: 0;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }

  .option-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-color);
    word-break: break-word;
  }

  .option-copy small {
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.45;
    word-break: break-word;
  }

  .recommended-badge {
    padding: 1px 6px;
    border-radius: 999px;
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 12%, transparent);
    font-size: 11px;
    line-height: 18px;
  }

  .interaction-custom {
    display: grid;
    gap: 6px;
    margin-top: 12px;
  }

  .interaction-custom label {
    color: var(--desc-color);
    font-size: 13px;
  }

  .interaction-meta {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-top: 10px;
    color: var(--desc-color);
    font-size: 12px;
  }

  .interaction-notice {
    margin: 8px 0 0;
    color: #d97706;
    font-size: 12px;
    line-height: 1.45;
  }

  .interaction-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 14px;
  }

  .interaction-actions :deep(.b_btn) {
    min-height: 38px;
  }

  .interaction-result {
    margin: 12px 0 0 40px;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.5;
  }

  .status-failed,
  .status-expired {
    border-color: color-mix(in srgb, #ef4444 38%, var(--card-border-color));
  }

  @container ai-chat (max-width: 520px) {
    .ai-interaction-card {
      width: 100%;
      margin: 0;
      padding: 13px;
      border-radius: 12px;
    }

    .interaction-options {
      grid-template-columns: minmax(0, 1fr);
    }

    .interaction-meta {
      flex-direction: column;
      gap: 3px;
    }

    .interaction-actions > * {
      flex: 1;
      width: auto;
    }

    .interaction-actions :deep(.b_btn) {
      min-height: 44px;
    }

    .interaction-options.is-long {
      max-height: 360px;
    }

    .interaction-result {
      margin-left: 40px;
    }
  }
</style>
