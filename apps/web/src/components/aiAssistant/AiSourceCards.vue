<template>
  <div v-if="uniqueSources.length" class="ai-sources">
    <div class="ai-sources__title">{{ t('ai.sources') }} · {{ uniqueSources.length }}</div>
    <div class="ai-sources__list">
      <BButton
        v-for="source in uniqueSources"
        :key="`${source.type}:${source.id}`"
        :class="['ai-source', `is-${source.type}`]"
        role="link"
        tabindex="0"
        @click="openSource(source)"
        @keydown.enter.prevent="openSource(source)"
        @keydown.space.prevent="openSource(source)"
      >
        <span class="ai-source__icon" aria-hidden="true">
          <SvgIcon :src="sourceIcon(source.type)" size="18" />
        </span>
        <span class="ai-source__copy">
          <strong>{{ source.title }}</strong>
          <small>{{ sourceSubtitle(source) }}</small>
        </span>
        <span class="ai-source__action" aria-hidden="true">
          <SvgIcon :src="isExternalSource(source) ? icon.ai.sourceExternal : icon.ai.sourceArrow" size="15" />
        </span>
      </BButton>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';

  export interface AiSource {
    type: 'note' | 'bookmark' | 'file' | 'knowledge' | 'document';
    id: string;
    title: string;
    url?: string;
    excerpt?: string;
    documentId?: string;
    fileId?: string;
    sourceType?: 'temporary' | 'cloud';
    locatorType?: 'page' | 'section' | 'row' | 'paragraph';
    locatorValue?: string;
  }

  const props = defineProps<{ sources: AiSource[] }>();
  const emit = defineEmits<{
    (event: 'source-navigate', source: AiSource): void;
  }>();
  const { t } = useI18n();
  const router = useRouter();
  const sourceIdentity = (source: AiSource) => {
    if (source.type === 'document') {
      return `document:${source.documentId || source.fileId || source.id.split(':')[0] || source.title}`;
    }
    return `${source.type}:${source.id}`;
  };
  const uniqueSources = computed(() => {
    const seen = new Set<string>();
    return props.sources.filter((source) => {
      const key = sourceIdentity(source);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });
  const typeLabel = (type: AiSource['type']) => t(`ai.sourceTypes.${type}`);
  const sourceIcon = (type: AiSource['type']) => {
    if (type === 'note') return icon.resource.note;
    if (type === 'file' || type === 'document') return icon.resource.file;
    if (type === 'knowledge') return icon.noteTemplate.knowledge;
    return icon.resource.bookmark;
  };
  const sourceSubtitle = (source: AiSource) => {
    const parts = [source.locatorValue, source.excerpt].filter(Boolean);
    return parts.length ? parts.join(' · ') : typeLabel(source.type);
  };
  const isExternalSource = (source: AiSource) => {
    if (!source.url || source.type === 'note' || source.type === 'file' || source.type === 'knowledge') return false;
    if (source.type === 'document' && source.fileId) return false;
    return true;
  };
  function navigateInsideApp(source: AiSource, target: string | { path: string; query?: Record<string, string> }) {
    emit('source-navigate', source);
    void router.push(target);
  }

  function openSource(source: AiSource) {
    if (source.type === 'note') navigateInsideApp(source, `/noteLibrary/${source.id}`);
    else if (source.type === 'file' || (source.type === 'document' && source.fileId))
      navigateInsideApp(source, { path: '/cloudSpace', query: { fileName: source.title } });
    else if (source.type === 'knowledge') navigateInsideApp(source, { path: '/help', query: { article: source.id } });
    else if (source.url) window.open(source.url, '_blank', 'noopener,noreferrer');
    else navigateInsideApp(source, `/manage/editBookmark/${source.id}`);
  }
</script>

<style scoped lang="less">
  .ai-sources {
    margin: -8px 0 20px 44px;
  }
  .ai-sources__title {
    margin-bottom: 8px;
    color: var(--desc-color);
    font-size: 12px;
    font-weight: 600;
  }
  .ai-sources__list {
    display: grid;
    gap: 6px;
  }
  .ai-source {
    --source-color: var(--resource-bookmark-color);
    width: 100%;
    height: 60px;
    min-height: 60px;
    justify-content: flex-start;
    text-align: left;
    gap: 10px;
    padding: 8px 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    background: var(--card-background);
    color: var(--text-color);
    line-height: 1.3;
    white-space: normal;
    transition:
      border-color 0.15s ease,
      background-color 0.15s ease;
  }

  .ai-source:hover {
    border-color: color-mix(in srgb, var(--source-color) 38%, var(--surface-border-color));
    background: color-mix(in srgb, var(--source-color) 5%, var(--card-background));
  }

  .ai-source.is-note {
    --source-color: var(--resource-note-color);
  }

  .ai-source.is-file,
  .ai-source.is-document {
    --source-color: var(--resource-file-color);
  }

  .ai-source.is-knowledge {
    --source-color: var(--primary-color);
  }

  .ai-source__icon {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 9px;
    background: color-mix(in srgb, var(--source-color) 10%, var(--card-background));
    color: var(--source-color);
  }

  .ai-source__copy {
    min-width: 0;
    display: grid;
    gap: 3px;
    flex: 1;
  }
  .ai-source__copy strong,
  .ai-source__copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ai-source__copy small {
    color: var(--desc-color);
    font-size: 11px;
    font-weight: 400;
  }

  .ai-source__copy strong {
    font-size: 13px;
    font-weight: 600;
  }

  .ai-source__action {
    display: inline-flex;
    flex: 0 0 auto;
    color: var(--desc-color);
  }

  @media (max-width: 768px) {
    .ai-sources {
      margin-left: 0;
    }

    .ai-source {
      height: 58px;
      min-height: 58px;
    }
  }
</style>
