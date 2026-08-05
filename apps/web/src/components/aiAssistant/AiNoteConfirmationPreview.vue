<template>
  <section v-if="contentPreview" class="confirmation-note-preview">
    <header class="confirmation-note-preview__header">
      <strong>{{ t('ai.confirmationContentPreview.title') }}</strong>
      <BButton
        class="confirmation-note-preview__toggle"
        size="small"
        :aria-pressed="showSource"
        @click="showSource = !showSource"
      >
        {{ t(showSource ? 'ai.confirmationContentPreview.showRendered' : 'ai.confirmationContentPreview.showSource') }}
      </BButton>
    </header>
    <div
      v-if="!showSource"
      class="confirmation-note-preview__body confirmation-note-preview__rendered"
      @click.prevent
      @keydown.enter.prevent
      v-html="renderedContent"
      v-mermaid
    ></div>
    <pre v-else class="confirmation-note-preview__body confirmation-note-preview__source">{{
      contentPreview.source
    }}</pre>
    <small v-if="contentPreview.truncated" class="confirmation-note-preview__notice">
      {{
        t('ai.confirmationContentPreview.truncated', {
          count: MAX_RENDERED_NOTE_CONFIRMATION_LENGTH,
        })
      }}
    </small>
  </section>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import type { AiToolConfirmation } from '@/types/aiAgent';
  import { renderAssistantMarkdown } from '@/utils/aiMessageRender';
  import {
    buildNoteConfirmationContentPreview,
    MAX_RENDERED_NOTE_CONFIRMATION_LENGTH,
  } from './noteConfirmationPreview';

  const props = defineProps<{ confirmation: AiToolConfirmation }>();
  const { t } = useI18n();
  const showSource = ref(false);
  const contentPreview = computed(() => buildNoteConfirmationContentPreview(props.confirmation));
  const renderedContent = computed(() =>
    contentPreview.value ? renderAssistantMarkdown(contentPreview.value.renderedSource) : '',
  );
</script>

<style scoped lang="less">
  .confirmation-note-preview {
    display: grid;
    gap: 8px;
    margin: 4px 0;
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    background: var(--workspace-panel-bg-color, var(--card-background));
  }

  .confirmation-note-preview__header {
    min-width: 0;
    min-height: 38px;
    padding: 6px 8px 0 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .confirmation-note-preview__header > strong {
    min-width: 0;
    overflow: hidden;
    color: var(--text-color);
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .confirmation-note-preview__toggle {
    flex: 0 0 auto;
    height: 28px;
    padding: 0 8px;
    color: var(--primary-color);
    background: transparent !important;

    &:hover {
      background: color-mix(in srgb, var(--primary-color) 8%, transparent) !important;
    }
  }

  .confirmation-note-preview__body {
    max-height: 260px;
    margin: 0 8px 8px;
    padding: 12px;
    overflow: auto;
    box-sizing: border-box;
    border-radius: 8px;
    color: var(--text-color);
    font-size: 13px;
    line-height: 1.65;
    overscroll-behavior: contain;
  }

  .confirmation-note-preview__source {
    white-space: pre-wrap;
    word-break: break-word;
  }

  .confirmation-note-preview__rendered {
    :deep(:first-child) {
      margin-top: 0;
    }

    :deep(:last-child) {
      margin-bottom: 0;
    }

    :deep(h1),
    :deep(h2),
    :deep(h3),
    :deep(h4),
    :deep(h5),
    :deep(h6) {
      margin: 14px 0 8px;
      line-height: 1.4;
    }

    :deep(h1) {
      font-size: 19px;
    }

    :deep(h2) {
      font-size: 17px;
    }

    :deep(h3) {
      font-size: 15px;
    }

    :deep(p) {
      margin: 8px 0;
    }

    :deep(ul),
    :deep(ol) {
      margin: 8px 0;
      padding-left: 22px;
    }

    :deep(blockquote) {
      margin: 10px 0;
      padding: 6px 10px;
      border-left: 3px solid var(--primary-color);
      color: var(--desc-color);
      background: color-mix(in srgb, var(--primary-color) 7%, transparent);
    }

    :deep(code) {
      padding: 1px 4px;
      border-radius: 4px;
      background: var(--surface-panel-bg);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }

    :deep(pre) {
      margin: 10px 0;
      padding: 10px;
      overflow: auto;
      border-radius: 7px;
      background: var(--surface-panel-bg);
      white-space: pre;
    }

    :deep(pre code) {
      padding: 0;
      background: transparent;
    }

    :deep(a) {
      color: var(--primary-color);
      text-decoration: underline;
      pointer-events: none;
    }

    :deep(img) {
      max-width: 100%;
      height: auto;
      border-radius: 6px;
    }

    :deep(table) {
      width: 100%;
      border-collapse: collapse;
    }

    :deep(th),
    :deep(td) {
      padding: 6px 8px;
      border: 1px solid var(--surface-border-color);
      text-align: left;
    }
  }

  .confirmation-note-preview__notice {
    margin: -2px 12px 10px;
    color: var(--desc-color);
    font-size: 11px;
    line-height: 1.45;
  }

  @media (max-width: 768px) {
    .confirmation-note-preview__body {
      max-height: 220px;
    }

    .confirmation-note-preview__toggle {
      min-height: 36px;
    }
  }
</style>
