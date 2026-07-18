<template>
  <div v-if="uniqueSources.length" class="ai-sources">
    <BButton
      v-if="isCollapsible"
      :class="['ai-sources__summary', { 'is-expanded': isExpanded }]"
      role="button"
      tabindex="0"
      :aria-expanded="isExpanded"
      :aria-label="t(isExpanded ? 'ai.collapseSources' : 'ai.expandSources')"
      v-click-log="{ module: 'AI助手', operation: isExpanded ? '收起参考来源' : '展开参考来源' }"
      @click="toggleSources"
      @keydown.enter.prevent="toggleSources"
      @keydown.space.prevent="toggleSources"
    >
      <span class="ai-sources__summary-title">{{ t('ai.sources') }} · {{ uniqueSources.length }}</span>
      <span class="ai-sources__summary-action">
        {{ t(isExpanded ? 'ai.collapseSources' : 'ai.expandSources') }}
        <SvgIcon class="ai-sources__summary-icon" :src="icon.ai.sourceArrow" size="14" />
      </span>
    </BButton>
    <div v-else class="ai-sources__title">{{ t('ai.sources') }} · {{ uniqueSources.length }}</div>
    <Transition name="ai-sources-list">
      <div v-if="showSourceList" :class="['ai-sources__list', { 'is-after-summary': isCollapsible }]">
        <BButton
          v-for="source in uniqueSources"
          :key="`${source.type}:${source.id}`"
          :class="['ai-source', `is-${source.type}`, { 'is-static': !isNavigableSource(source) }]"
          :role="isNavigableSource(source) ? 'link' : undefined"
          :tabindex="isNavigableSource(source) ? 0 : -1"
          :aria-disabled="!isNavigableSource(source)"
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
          <span v-if="isNavigableSource(source)" class="ai-source__action" aria-hidden="true">
            <SvgIcon :src="isExternalSource(source) ? icon.ai.sourceExternal : icon.ai.sourceArrow" size="15" />
          </span>
        </BButton>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import { resolveAiSourceNavigation, type AiSource, type AiSourceNavigation } from './aiSourceNavigation';
  import { shouldCollapseAiSources } from './aiSourcePresentation';

  export type { AiSource } from './aiSourceNavigation';

  const props = defineProps<{ sources: AiSource[] }>();
  const emit = defineEmits<{
    (event: 'source-navigate', source: AiSource): void;
  }>();
  const { t } = useI18n();
  const router = useRouter();
  const isExpanded = ref(false);
  const sourceIdentity = (source: AiSource) => {
    if (source.type === 'document') {
      return `document:${source.documentId || source.fileId || source.id.split(':')[0] || source.title}`;
    }
    if (source.type === 'web') return `web:${source.url || source.id}`;
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
  const isCollapsible = computed(() => shouldCollapseAiSources(uniqueSources.value.length));
  const showSourceList = computed(() => !isCollapsible.value || isExpanded.value);
  const toggleSources = () => {
    if (!isCollapsible.value) return;
    isExpanded.value = !isExpanded.value;
  };
  const typeLabel = (type: AiSource['type']) => t(`ai.sourceTypes.${type}`);
  const sourceIcon = (type: AiSource['type']) => {
    if (type === 'note') return icon.resource.note;
    if (type === 'file' || type === 'document') return icon.resource.file;
    if (type === 'folder') return icon.common.folder;
    if (type === 'tag') return icon.resource.tag;
    if (type === 'knowledge') return icon.noteTemplate.knowledge;
    if (type === 'web') return icon.ai.internet;
    return icon.resource.bookmark;
  };
  const sourceSubtitle = (source: AiSource) => {
    const parts = [source.locatorValue, source.excerpt].filter(Boolean);
    return parts.length ? parts.join(' · ') : typeLabel(source.type);
  };
  const sourceNavigation = (source: AiSource) => resolveAiSourceNavigation(source);
  const isNavigableSource = (source: AiSource) => sourceNavigation(source).kind !== 'none';
  const isExternalSource = (source: AiSource) => sourceNavigation(source).kind === 'external';
  function navigateInsideApp(source: AiSource, target: string | { path: string; query?: Record<string, string> }) {
    emit('source-navigate', source);
    void router.push(target);
  }

  function openSource(source: AiSource) {
    const navigation: AiSourceNavigation = sourceNavigation(source);
    if (navigation.kind === 'none') return;
    if (navigation.kind === 'external') {
      window.open(navigation.url, '_blank', 'noopener,noreferrer');
      return;
    }
    navigateInsideApp(source, navigation.target);
  }
</script>

<style scoped lang="less">
  .ai-sources {
    margin: -6px 0 16px 44px;
  }
  .ai-sources__title {
    margin-bottom: 6px;
    color: var(--desc-color);
    font-size: 12px;
    font-weight: 600;
  }
  .ai-sources__summary {
    width: 100%;
    height: 40px;
    justify-content: space-between;
    gap: 12px;
    padding: 0 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    background: var(--card-background);
    color: var(--desc-color);
    transition:
      border-color 0.15s ease,
      background-color 0.15s ease;
  }

  .ai-sources__summary:hover {
    border-color: color-mix(in srgb, var(--primary-color) 28%, var(--surface-border-color));
    background: color-mix(in srgb, var(--primary-color) 4%, var(--card-background));
  }

  .ai-sources__summary:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--primary-color) 55%, transparent);
    outline-offset: 2px;
  }

  .ai-sources__summary-title {
    min-width: 0;
    overflow: hidden;
    color: var(--desc-color);
    font-size: 12px;
    font-weight: 600;
    text-overflow: ellipsis;
  }

  .ai-sources__summary-action {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 4px;
    color: var(--primary-color);
    font-size: 12px;
    font-weight: 500;
  }

  .ai-sources__summary-icon {
    transform: rotate(90deg);
    transition: transform 0.16s ease;
  }

  .ai-sources__summary.is-expanded .ai-sources__summary-icon {
    transform: rotate(-90deg);
  }

  .ai-sources__list {
    display: grid;
    gap: 5px;
  }

  .ai-sources__list.is-after-summary {
    margin-top: 6px;
  }

  .ai-sources-list-enter-active,
  .ai-sources-list-leave-active {
    transition:
      opacity 0.16s ease,
      transform 0.16s ease;
  }

  .ai-sources-list-enter-from,
  .ai-sources-list-leave-to {
    opacity: 0;
    transform: translateY(-4px);
  }

  .ai-source {
    --source-color: var(--resource-bookmark-color);
    width: 100%;
    height: 54px;
    min-height: 54px;
    justify-content: flex-start;
    text-align: left;
    gap: 8px;
    padding: 6px 9px;
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

  .ai-source:not(.is-static):hover {
    border-color: color-mix(in srgb, var(--source-color) 38%, var(--surface-border-color));
    background: color-mix(in srgb, var(--source-color) 5%, var(--card-background));
  }

  .ai-source.is-static {
    cursor: default;
  }

  .ai-source.is-note {
    --source-color: var(--resource-note-color);
  }

  .ai-source.is-file,
  .ai-source.is-document,
  .ai-source.is-folder {
    --source-color: var(--resource-file-color);
  }

  .ai-source.is-tag {
    --source-color: var(--resource-tag-color);
  }

  .ai-source.is-knowledge {
    --source-color: var(--primary-color);
  }

  .ai-source__icon {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--source-color) 10%, var(--card-background));
    color: var(--source-color);
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
      height: 52px;
      min-height: 52px;
    }

    .ai-sources__summary {
      height: 44px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ai-sources__summary-icon,
    .ai-sources-list-enter-active,
    .ai-sources-list-leave-active {
      transition: none;
    }
  }
</style>
