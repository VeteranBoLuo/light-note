<template>
  <section class="note-editor-warmup" role="status" :aria-label="t('noteDetail.editorPreparing')">
    <pre v-if="isMarkdown" class="note-editor-warmup__content note-editor-warmup__markdown">{{ content }}</pre>
    <article
      v-else
      class="note-editor-warmup__content note-editor-rich-content note-rich-content"
      v-html="safeContent"
    ></article>
  </section>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import DOMPurify from 'dompurify';
  import type { ResolvedResourceReference } from '@/api/noteReferences';
  import { presentResourceReferenceChips } from '@/utils/noteResourceRefs';
  import { normalizeRichMediaTextHtml } from '@/utils/richMediaText';

  const props = withDefaults(
    defineProps<{
      content?: string;
      noteType?: string;
      resourceRefs?: ResolvedResourceReference[];
    }>(),
    {
      content: '',
      noteType: 'html',
      resourceRefs: () => [],
    },
  );
  const { t } = useI18n();
  const isMarkdown = computed(() => props.noteType === 'markdown' || props.noteType === 'md');
  const safeContent = computed(() => {
    const sanitized = DOMPurify.sanitize(normalizeRichMediaTextHtml(String(props.content || '')), {
      USE_PROFILES: { html: true },
      ADD_ATTR: ['data-ln-size', 'data-ln-media-position', 'data-ln-media-width'],
    });
    return presentResourceReferenceChips(sanitized, props.resourceRefs, {
      unavailableLabel: (snapshotTitle) => t('note.resourceRefUnavailable', { title: snapshotTitle }),
      linkTitle: (title, state) => {
        if (state === 'available') return t('note.resourceMention.openResource', { title });
        if (state === 'unavailable') return t('note.resourceMention.resourceUnavailable');
        return t('note.resourceMention.checkingResource');
      },
    });
  });
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
    pointer-events: none;
  }

  .note-editor-warmup__content {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .note-editor-warmup__markdown {
    box-sizing: border-box;
    min-height: 100%;
    padding: 14px 16px clamp(160px, 35vh, 360px);
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--text-color);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace;
    font-size: 13px;
    font-weight: 400;
    line-height: 22px;
    tab-size: 4;
  }
</style>
