<template>
  <section class="note-editor-warmup" role="status" :aria-label="t('noteDetail.editorPreparing')">
    <pre v-if="isMarkdown" class="note-editor-warmup__content note-editor-warmup__markdown">{{ content }}</pre>
    <article v-else class="note-editor-warmup__content" v-html="safeContent"></article>
  </section>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import DOMPurify from 'dompurify';

  const props = defineProps<{ content?: string; noteType?: string }>();
  const { t } = useI18n();
  const isMarkdown = computed(() => props.noteType === 'markdown' || props.noteType === 'md');
  const safeContent = computed(() =>
    DOMPurify.sanitize(String(props.content || ''), {
      USE_PROFILES: { html: true },
      ADD_ATTR: ['data-ln-size', 'data-ln-media-position', 'data-ln-media-width'],
    }),
  );
</script>

<style scoped lang="less">
  .note-editor-warmup {
    position: absolute;
    z-index: 3;
    inset: 0;
    min-height: 0;
    overflow: auto;
    color: var(--text-color);
    background: var(--surface-page-bg, var(--background-color));
  }

  .note-editor-warmup__content {
    margin: 0;
    padding: 12px 20px clamp(180px, 35vh, 380px);
    overflow-wrap: anywhere;
    line-height: 1.7;
  }

  .note-editor-warmup__markdown {
    margin: 0;
    box-sizing: border-box;
    white-space: pre-wrap;
    word-break: break-word;
    font: inherit;
  }

  .note-editor-warmup__content :deep(img) {
    display: block;
    max-width: 100%;
    height: auto;
    margin-inline: auto;
    object-fit: contain;
  }

  .note-editor-warmup__content :deep(table) {
    width: 100%;
    border-collapse: collapse;
  }

  .note-editor-warmup__content :deep(td),
  .note-editor-warmup__content :deep(th) {
    padding: 6px 10px;
    border: 1px solid var(--surface-border-color);
  }

</style>
