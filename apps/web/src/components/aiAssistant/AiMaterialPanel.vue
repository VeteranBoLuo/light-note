<template>
  <section class="ai-material-panel" :aria-label="t('ai.material.title')">
    <header class="ai-material-panel__header">
      <div>
        <strong v-if="showTitle">{{ t('ai.material.title') }}</strong>
        <span>{{ t('ai.material.panelDescription') }}</span>
      </div>
      <BButton
        v-if="materialCount > 1"
        size="small"
        class="ai-material-panel__clear"
        :title="t('ai.material.clearAllHint')"
        @click="emit('clear')"
      >
        {{ t('ai.material.clearAll') }}
      </BButton>
    </header>

    <BButton
      class="ai-material-panel__upload"
      :class="{ 'is-disabled': hasAttachment }"
      :disabled="hasAttachment"
      :loading="attachmentBusy"
      :title="hasAttachment ? t('ai.removeCurrentAttachmentFirst') : t('ai.material.attachmentOnceHint')"
      @click="emit('upload')"
    >
      <span class="ai-material-panel__action-icon ai-material-panel__action-icon--file">
        <SvgIcon :src="icon.file_upload" size="19" aria-hidden="true" />
      </span>
      <span class="ai-material-panel__action-copy">
        <strong>{{ t('ai.material.uploadLocal') }}</strong>
        <small>{{ hasAttachment ? t('ai.removeCurrentAttachmentFirst') : t('ai.material.fileDescription') }}</small>
      </span>
      <SvgIcon :src="icon.arrow_right" size="14" aria-hidden="true" />
    </BButton>

    <div class="ai-material-panel__resource-section">
      <div class="ai-material-panel__section-heading">
        <span class="ai-material-panel__action-icon">
          <SvgIcon :src="icon.ai.materials" size="18" aria-hidden="true" />
        </span>
        <span>
          <strong>{{ t('ai.material.chooseLightNote') }}</strong>
          <small>{{ t('ai.material.contextDescription') }}</small>
        </span>
      </div>
      <AiContextPicker
        inline
        :show-selection="false"
        :model-value="modelValue"
        :scope-model-value="scopeModelValue"
        @update:model-value="emit('update:modelValue', $event)"
        @update:scope-model-value="emit('update:scopeModelValue', $event)"
        @file-selected="emit('fileSelected', $event)"
        @close="emit('close')"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import AiContextPicker from './AiContextPicker.vue';
  import icon from '@/config/icon';
  import type { AiResourceContext, AiScopeRef } from '@/types/aiScope';

  withDefaults(
    defineProps<{
      modelValue: AiResourceContext[];
      scopeModelValue?: AiScopeRef[];
      materialCount: number;
      hasAttachment: boolean;
      attachmentBusy?: boolean;
      showTitle?: boolean;
    }>(),
    { scopeModelValue: () => [], attachmentBusy: false, showTitle: true },
  );
  const emit = defineEmits<{
    'update:modelValue': [value: AiResourceContext[]];
    'update:scopeModelValue': [value: AiScopeRef[]];
    fileSelected: [value: AiResourceContext];
    upload: [];
    clear: [];
    close: [];
  }>();
  const { t } = useI18n();
</script>

<style scoped lang="less">
  .ai-material-panel {
    display: grid;
    gap: 12px;
    width: 100%;
    min-width: 0;
    color: var(--text-color);
  }

  .ai-material-panel__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .ai-material-panel__header > div {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .ai-material-panel__header strong,
  .ai-material-panel__section-heading strong,
  .ai-material-panel__action-copy strong {
    color: var(--text-color);
    font-size: 13px;
    line-height: 19px;
  }

  .ai-material-panel__header span,
  .ai-material-panel__section-heading small,
  .ai-material-panel__action-copy small {
    color: var(--desc-color);
    font-size: 11px;
    font-weight: 400;
    line-height: 16px;
  }

  .ai-material-panel__clear {
    flex: 0 0 auto;
    min-height: 28px;
    border: 1px solid var(--surface-border-color);
    background: transparent;
    color: var(--desc-color);
    font-size: 11px;
  }

  .ai-material-panel__upload {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) 14px;
    gap: 9px;
    width: 100%;
    height: auto;
    min-height: 54px;
    padding: 7px 9px;
    border: 1px solid var(--resource-file-color);
    border-color: color-mix(in srgb, var(--resource-file-color) 28%, var(--surface-border-color));
    border-radius: 11px;
    background: var(--card-background);
    background: color-mix(in srgb, var(--resource-file-color) 6%, var(--card-background));
    color: var(--resource-file-color);
    text-align: left;
  }

  .ai-material-panel__upload.is-disabled {
    border-color: var(--surface-border-color);
    background: var(--card-background);
    color: var(--desc-color);
  }

  .ai-material-panel__action-icon {
    display: grid;
    width: 32px;
    height: 32px;
    place-items: center;
    border-radius: 9px;
    background: var(--card-background);
    background: color-mix(in srgb, var(--primary-color) 12%, var(--card-background));
    color: var(--primary-color);
  }

  .ai-material-panel__action-icon--file {
    background: color-mix(in srgb, var(--resource-file-color) 12%, var(--card-background));
    color: var(--resource-file-color);
  }

  .ai-material-panel__action-copy {
    display: grid;
    min-width: 0;
    align-content: center;
  }

  .ai-material-panel__action-copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ai-material-panel__resource-section {
    display: grid;
    gap: 8px;
    min-width: 0;
    padding-top: 2px;
  }

  .ai-material-panel__section-heading {
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 0;
  }

  .ai-material-panel__section-heading > span:last-child {
    display: grid;
    min-width: 0;
  }

  @media (hover: hover) and (pointer: fine) {
    .ai-material-panel__clear:hover {
      border-color: var(--message-error-color);
      color: var(--message-error-color);
    }

    .ai-material-panel__upload:not(.is-disabled):hover {
      border-color: var(--resource-file-color);
      background: color-mix(in srgb, var(--resource-file-color) 10%, var(--card-background));
    }
  }

  html.light-note-mobile-rendering .ai-material-panel__upload {
    border-color: var(--resource-file-color);
    background: var(--card-background);
  }
</style>
