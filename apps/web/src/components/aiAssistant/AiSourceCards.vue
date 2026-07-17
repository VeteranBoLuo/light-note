<template>
  <div v-if="uniqueSources.length" class="ai-sources">
    <div class="ai-sources__title">{{ t('ai.sources') }}</div>
    <div class="ai-sources__list">
      <BButton
        v-for="source in uniqueSources"
        :key="`${source.type}:${source.id}`"
        class="ai-source"
        @click="openSource(source)"
      >
        <span :class="['ai-source__type', `is-${source.type}`]">{{ typeLabel(source.type) }}</span>
        <span class="ai-source__copy">
          <strong>{{ source.title }}</strong>
          <small v-if="source.locatorValue" class="ai-source__locator">{{ source.locatorValue }}</small>
          <small v-if="source.excerpt">{{ source.excerpt }}</small>
        </span>
        <span v-if="source.type === 'bookmark'" aria-hidden="true">↗</span>
      </BButton>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';

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
  function openSource(source: AiSource) {
    if (source.type === 'note') router.push(`/noteLibrary/${source.id}`);
    else if (source.type === 'file' || (source.type === 'document' && source.fileId))
      router.push({ path: '/cloudSpace', query: { fileName: source.title } });
    else if (source.type === 'knowledge') router.push({ path: '/help', query: { article: source.id } });
    else if (source.url) window.open(source.url, '_blank', 'noopener,noreferrer');
    else router.push(`/manage/editBookmark/${source.id}`);
  }
</script>

<style scoped lang="less">
  .ai-sources {
    margin: -10px 0 20px 44px;
  }
  .ai-sources__title {
    margin-bottom: 7px;
    color: var(--desc-color);
    font-size: 12px;
  }
  .ai-sources__list {
    display: grid;
    gap: 7px;
  }
  .ai-source {
    width: 100%;
    height: auto;
    min-height: 42px;
    justify-content: flex-start;
    text-align: left;
    gap: 9px;
    padding: 8px 10px;
  }
  .ai-source__type {
    flex: 0 0 auto;
    color: #615ced;
    font-size: 11px;
  }
  .ai-source__type.is-note {
    color: #2eae67;
  }
  .ai-source__type.is-file {
    color: #d97706;
  }
  .ai-source__type.is-document {
    color: #615ced;
  }
  .ai-source__copy {
    min-width: 0;
    display: grid;
    gap: 2px;
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
    font-weight: 400;
  }
  .ai-source__copy .ai-source__locator {
    color: var(--primary-color);
  }
  @media (max-width: 768px) {
    .ai-sources {
      margin-left: 0;
    }
  }
</style>
