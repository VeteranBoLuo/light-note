<template>
  <section class="note-template-preview" aria-live="polite">
    <BLoading v-if="loading" inline loading :title="t('note.templateManager.detailLoading')" />
    <div v-else-if="error" class="note-template-preview__status is-error">
      <strong>{{ t('note.templateManager.detailFailed') }}</strong>
      <BButton size="small" @click="emit('retry')">{{ t('common.retry') }}</BButton>
    </div>
    <article v-else-if="template" v-auto-scrollbar class="note-template-preview__scroll">
      <header class="note-template-preview__header">
        <span class="note-template-preview__format-icon">
          <SvgIcon :src="formatIcon" size="21" aria-hidden="true" />
        </span>
        <div class="note-template-preview__summary">
          <div class="note-template-preview__title-row">
            <h2>{{ template.name }}</h2>
            <BChip tone="note" size="medium">{{ typeLabel }}</BChip>
          </div>
          <p>{{ template.description || t('note.templateManager.noDescription') }}</p>

          <dl class="note-template-preview__meta">
            <div>
              <dt>{{ t('note.templateManager.defaultTitle') }}</dt>
              <dd>{{ template.titleTemplate || t('note.untitled') }}</dd>
            </div>
            <div>
              <dt>{{ t('note.templateManager.revision') }}</dt>
              <dd>v{{ template.revision || 1 }}</dd>
            </div>
            <div>
              <dt>{{ t('note.templateManager.updatedAt') }}</dt>
              <dd>{{ formattedTime }}</dd>
            </div>
          </dl>
        </div>
      </header>

      <div class="note-template-preview__content-card">
        <div class="note-template-preview__section-title">{{ t('note.templateManager.preview') }}</div>
        <div v-if="html" class="note-template-preview__content" v-html="html" v-mermaid></div>
        <p v-else class="note-template-preview__empty">{{ t('note.templateManager.emptyPreview') }}</p>
      </div>
    </article>
  </section>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import type { NoteTemplateDetail } from '@/types/noteTemplate';
  import { normalizeNoteContentResourceUrls, noteContentToHtml } from '@/utils/common';

  const props = withDefaults(
    defineProps<{ template?: NoteTemplateDetail | null; loading?: boolean; error?: boolean }>(),
    { template: null, loading: false, error: false },
  );
  const emit = defineEmits<{ retry: [] }>();
  const { t, locale } = useI18n();
  const html = ref('');
  let renderSequence = 0;

  const formatIcon = computed(() =>
    props.template?.type === 'markdown' ? icon.resource.noteMarkdown : icon.resource.noteHtml,
  );
  const typeLabel = computed(() => (props.template?.type === 'markdown' ? t('note.tplTypeMd') : t('note.tplTypeHtml')));
  const formattedTime = computed(() => {
    const value = props.template?.updateTime;
    if (!value) return t('note.templateManager.neverUpdated');
    const date = new Date(String(value).replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
    return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  });

  watch(
    () => [props.template?.id, props.template?.revision, props.template?.content, props.template?.type] as const,
    async () => {
      const sequence = ++renderSequence;
      const template = props.template;
      html.value = '';
      if (!template) return;
      const source =
        template.type === 'markdown'
          ? String(template.content || '')
          : normalizeNoteContentResourceUrls(String(template.content || ''));
      const rendered = await noteContentToHtml(source, template.type);
      if (sequence === renderSequence) html.value = rendered;
    },
    { immediate: true },
  );
</script>

<style scoped lang="less">
  .note-template-preview {
    min-width: 0;
    min-height: 0;
    height: 100%;
    color: var(--text-color);
  }
  .note-template-preview > .b-loading {
    min-height: 240px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .note-template-preview__scroll {
    height: 100%;
    box-sizing: border-box;
    overflow: auto;
    padding: 20px clamp(20px, 3vw, 40px) 40px;
  }
  .note-template-preview__header {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }
  .note-template-preview__summary {
    min-width: 0;
    flex: 1 1 auto;
  }
  .note-template-preview__title-row {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .note-template-preview__title-row h2 {
    min-width: 0;
    margin: 0;
    overflow: hidden;
    font-size: clamp(22px, 2.4vw, 30px);
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .note-template-preview__header p {
    margin: 5px 0 0;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.6;
  }
  .note-template-preview__format-icon {
    width: 36px;
    height: 36px;
    display: inline-flex;
    flex: 0 0 36px;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--resource-note-color);
    border-radius: 10px;
    color: var(--resource-note-color);
    background: var(--card-background);
  }
  .note-template-preview__meta {
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 0;
    margin: 10px 0 0;
  }
  .note-template-preview__meta > div {
    min-width: 0;
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    padding: 0 12px;
    border-left: 1px solid var(--surface-border-color);
  }
  .note-template-preview__meta > div:first-child {
    max-width: min(48%, 480px);
    padding-left: 0;
    border-left: 0;
  }
  .note-template-preview__meta dt {
    color: var(--desc-color);
    font-size: 11px;
    font-weight: 650;
  }
  .note-template-preview__meta dd {
    margin: 0;
    overflow: hidden;
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .note-template-preview__content-card {
    min-height: 260px;
    margin-top: 18px;
    padding: 18px clamp(18px, 3vw, 34px) 44px;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--card-background);
  }
  .note-template-preview__section-title {
    padding-bottom: 12px;
    border-bottom: 1px solid var(--surface-divider-color);
    color: var(--desc-color);
    font-size: 12px;
    font-weight: 650;
  }
  .note-template-preview__content {
    padding-top: 18px;
    color: var(--text-color);
    line-height: 1.75;
    overflow-wrap: anywhere;
  }
  .note-template-preview__content :deep(img) {
    max-width: 100%;
    height: auto;
  }
  .note-template-preview__content :deep(pre) {
    overflow: auto;
  }
  .note-template-preview__empty {
    margin: 72px 0;
    color: var(--desc-color);
    text-align: center;
  }
  .note-template-preview__status {
    height: 100%;
    min-height: 240px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 12px;
    color: var(--desc-color);
  }
  .note-template-preview__status.is-error strong {
    color: var(--text-color);
  }
  @media (max-width: 767px) {
    .note-template-preview__scroll {
      padding: 16px var(--mobile-page-gutter, 14px) 104px;
    }
    .note-template-preview__header p {
      margin-left: 0;
    }
    .note-template-preview__meta {
      align-items: flex-start;
    }
    .note-template-preview__meta > div {
      padding: 0 9px;
    }
    .note-template-preview__meta > div:first-child {
      width: 100%;
      max-width: 100%;
      padding: 0 0 6px;
      border: 0;
    }
    .note-template-preview__meta > div:nth-child(2) {
      padding-left: 0;
      border-left: 0;
    }
    .note-template-preview__content-card {
      min-height: 220px;
      padding-inline: 16px;
    }
  }
</style>
