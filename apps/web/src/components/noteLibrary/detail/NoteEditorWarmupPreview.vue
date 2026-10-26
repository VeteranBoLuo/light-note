<template>
  <section
    ref="root"
    class="note-editor-warmup"
    :class="{ 'note-editor-warmup--in-flow': inFlow }"
    role="status"
    :aria-label="t('noteDetail.editorPreparing')"
    @load.capture="refreshImagePlaceholders"
    @error.capture="refreshImagePlaceholders"
  >
    <pre v-if="isMarkdown" class="note-editor-warmup__content note-editor-warmup__markdown">{{ content }}</pre>
    <article
      v-else
      class="note-editor-warmup__content note-editor-rich-content note-rich-content note-editor-warmup__html"
      v-html="safeContent"
    ></article>
  </section>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import DOMPurify from 'dompurify';
  import type { ResolvedResourceReference } from '@/api/noteReferences';
  import { presentResourceReferenceChips } from '@/utils/noteResourceRefs';
  import { normalizeRichMediaTextHtml, updateRichMediaTextImageLoading } from '@/utils/richMediaText';

  const props = withDefaults(
    defineProps<{
      content?: string;
      noteType?: string;
      resourceRefs?: ResolvedResourceReference[];
      inFlow?: boolean;
    }>(),
    {
      content: '',
      noteType: 'html',
      resourceRefs: () => [],
      inFlow: false,
    },
  );
  const { t } = useI18n();
  const root = ref<HTMLElement | null>(null);
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
  function refreshImagePlaceholders() {
    if (root.value) updateRichMediaTextImageLoading(root.value);
  }
  watch([root, () => isMarkdown.value ? '' : safeContent.value], refreshImagePlaceholders, { flush: 'post' });
</script>

<style scoped lang="less">
  @import (reference) "@/assets/css/workspace-surfaces.less";
  .note-editor-warmup {
    position: absolute;
    z-index: 3;
    inset: 0;
    min-height: 0;
    overflow: auto;
    color: var(--text-color);
    background: var(--surface-page-bg, var(--background-color));
    pointer-events: none;

    &--in-flow {
      position: relative;
      inset: auto;
      min-height: 100%;
      overflow: visible;
    }
  }

  .note-editor-warmup__content {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .note-editor-warmup__html {
    box-sizing: border-box;
    min-height: 100%;
    /* ui-density-fixed: Match the inline editor's document geometry, independent of UI density. */
    padding: var(--note-editor-content-padding-top, 12px) 20px clamp(180px, 35vh, 380px);
    font-family: inherit;
    line-height: var(--note-editor-content-line-height, 1.65);

    > :first-child {
      margin-top: 0;
    }
  }

  // 与 Markdown 编辑正文保持相同内容几何，不参与界面密度缩放。
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

  // 共享工作区表面：仅改变颜色，布局与滚动由原组件负责。
  .note-editor-warmup {
    .workspace-content-surface();
  }
</style>
