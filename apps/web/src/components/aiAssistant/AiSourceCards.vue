<template>
  <div v-if="uniqueSources.length" :class="['ai-sources', { 'is-pending': !revealed }]" :aria-hidden="!revealed">
    <div class="ai-sources__rail">
      <span class="ai-sources__label">{{ t('ai.sources') }} · {{ uniqueSources.length }}</span>

      <BButton
        v-for="source in previewSources"
        :key="`${source.type}:${source.id}`"
        :class="['ai-sources__compact', `is-${source.type}`, { 'is-static': !isNavigableSource(source) }]"
        :role="isNavigableSource(source) ? 'link' : undefined"
        :tabindex="isNavigableSource(source) ? 0 : -1"
        :aria-disabled="!isNavigableSource(source)"
        @click="openSource(source)"
        @keydown.enter.prevent="openSource(source)"
        @keydown.space.prevent="openSource(source)"
      >
        <span class="ai-sources__compact-icon" aria-hidden="true">
          <SvgIcon :src="sourceIcon(source.type)" size="15" />
        </span>
        <span class="ai-sources__compact-title">{{ source.title || typeLabel(source.type) }}</span>
        <SvgIcon
          v-if="isNavigableSource(source)"
          class="ai-sources__compact-action"
          :src="isExternalSource(source) ? icon.ai.sourceExternal : icon.ai.sourceArrow"
          size="13"
          aria-hidden="true"
        />
      </BButton>

      <BPopover
        v-if="hasOverflow && !isMobile"
        v-model:open="sourcePanelOpen"
        trigger="click"
        placement="top-right"
        overlay-class-name="ai-sources-popover"
      >
        <BButton
          class="ai-sources__more"
          role="button"
          tabindex="0"
          aria-haspopup="dialog"
          :aria-expanded="sourcePanelOpen"
          :aria-label="`${t('ai.sources')}，${t('ai.viewAllSources', { count: uniqueSources.length })}`"
          v-click-log="{ module: 'AI助手', operation: '查看全部参考来源' }"
          @keydown.enter.prevent="sourcePanelOpen = !sourcePanelOpen"
          @keydown.space.prevent="sourcePanelOpen = !sourcePanelOpen"
        >
          {{ t('ai.viewAllSources', { count: uniqueSources.length }) }}
          <SvgIcon :src="icon.ai.sourceArrow" size="13" aria-hidden="true" />
        </BButton>
        <template #content>
          <div class="ai-sources__panel" role="dialog" :aria-label="t('ai.sources')">
            <div class="ai-sources__panel-title">{{ t('ai.sources') }} · {{ uniqueSources.length }}</div>
            <AiSourceList :sources="uniqueSources" @select="openSource" />
          </div>
        </template>
      </BPopover>

      <BButton
        v-else-if="hasOverflow"
        class="ai-sources__more"
        role="button"
        tabindex="0"
        aria-haspopup="dialog"
        :aria-label="`${t('ai.sources')}，${t('ai.viewAllSources', { count: uniqueSources.length })}`"
        v-click-log="{ module: 'AI助手', operation: '查看全部参考来源' }"
        @click="mobileSourceVisible = true"
        @keydown.enter.prevent="mobileSourceVisible = true"
        @keydown.space.prevent="mobileSourceVisible = true"
      >
        {{ t('ai.viewAllSources', { count: uniqueSources.length }) }}
        <SvgIcon :src="icon.ai.sourceArrow" size="13" aria-hidden="true" />
      </BButton>
    </div>

    <BModal
      v-if="isMobile"
      v-model:visible="mobileSourceVisible"
      :title="`${t('ai.sources')} · ${uniqueSources.length}`"
      :show-footer="false"
      width="min(440px, 92vw)"
    >
      <div class="ai-sources__mobile-list">
        <AiSourceList :sources="uniqueSources" @select="openSource" />
      </div>
    </BModal>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import AiSourceList from './AiSourceList.vue';
  import { resolveAiSourceNavigation, type AiSource, type AiSourceNavigation } from './aiSourceNavigation';
  import { getAiSourceCompactPreviewCount, shouldCollapseAiSources } from './aiSourcePresentation';

  export type { AiSource } from './aiSourceNavigation';

  const props = withDefaults(
    defineProps<{
      sources: AiSource[];
      isMobile?: boolean;
      revealed?: boolean;
    }>(),
    {
      isMobile: false,
      revealed: true,
    },
  );
  const emit = defineEmits<{
    (event: 'source-navigate', source: AiSource): void;
  }>();
  const { t } = useI18n();
  const router = useRouter();
  const sourcePanelOpen = ref(false);
  const mobileSourceVisible = ref(false);

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
  const previewSources = computed(() =>
    uniqueSources.value.slice(0, getAiSourceCompactPreviewCount(uniqueSources.value.length)),
  );
  const hasOverflow = computed(() => shouldCollapseAiSources(uniqueSources.value.length));
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
  const sourceNavigation = (source: AiSource) => resolveAiSourceNavigation(source);
  const isNavigableSource = (source: AiSource) => sourceNavigation(source).kind !== 'none';
  const isExternalSource = (source: AiSource) => sourceNavigation(source).kind === 'external';

  watch(
    () => [props.isMobile, uniqueSources.value.map(sourceIdentity).join('|')],
    () => {
      sourcePanelOpen.value = false;
      mobileSourceVisible.value = false;
    },
  );

  function closeSourcePanels() {
    sourcePanelOpen.value = false;
    mobileSourceVisible.value = false;
  }

  function navigateInsideApp(source: AiSource, target: string | { path: string; query?: Record<string, string> }) {
    emit('source-navigate', source);
    void router.push(target);
  }

  function openSource(source: AiSource) {
    const navigation: AiSourceNavigation = sourceNavigation(source);
    if (navigation.kind === 'none') return;
    closeSourcePanels();
    if (navigation.kind === 'external') {
      window.open(navigation.url, '_blank', 'noopener,noreferrer');
      return;
    }
    navigateInsideApp(source, navigation.target);
  }
</script>

<style scoped lang="less">
  .ai-sources {
    min-height: 40px;
    margin: -6px 0 16px 44px;
  }

  .ai-sources__rail {
    display: flex;
    align-items: center;
    width: 100%;
    height: 40px;
    gap: 6px;
    overflow: hidden;
    opacity: 1;
    transition: opacity 0.16s ease;
  }

  .ai-sources.is-pending .ai-sources__rail {
    visibility: hidden;
    opacity: 0;
    pointer-events: none;
  }

  .ai-sources__label {
    flex: 0 0 auto;
    color: var(--desc-color);
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
  }

  .ai-sources__compact {
    --source-color: var(--resource-bookmark-color);
    min-width: 0;
    width: auto;
    height: 36px;
    flex: 1 1 0;
    justify-content: flex-start;
    gap: 6px;
    padding: 0 8px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    background: var(--card-background);
    color: var(--text-color);
    transition:
      border-color 0.15s ease,
      background-color 0.15s ease;
  }

  .ai-sources__compact:not(.is-static):hover {
    border-color: color-mix(in srgb, var(--source-color) 38%, var(--surface-border-color));
    background: color-mix(in srgb, var(--source-color) 5%, var(--card-background));
  }

  .ai-sources__compact.is-static {
    cursor: default;
  }

  .ai-sources__compact.is-note {
    --source-color: var(--resource-note-color);
  }

  .ai-sources__compact.is-file,
  .ai-sources__compact.is-document,
  .ai-sources__compact.is-folder {
    --source-color: var(--resource-file-color);
  }

  .ai-sources__compact.is-tag {
    --source-color: var(--resource-tag-color);
  }

  .ai-sources__compact.is-knowledge {
    --source-color: var(--primary-color);
  }

  .ai-sources__compact-icon {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 7px;
    background: color-mix(in srgb, var(--source-color) 10%, var(--card-background));
    color: var(--source-color);
  }

  .ai-sources__compact-title {
    min-width: 0;
    overflow: hidden;
    flex: 1;
    font-size: 12px;
    font-weight: 500;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ai-sources__compact-action {
    flex: 0 0 auto;
    color: var(--desc-color);
  }

  .ai-sources__more {
    width: auto;
    height: 36px;
    flex: 0 0 auto;
    gap: 4px;
    padding: 0 9px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    background: color-mix(in srgb, var(--primary-color) 5%, var(--card-background));
    color: var(--primary-color);
    font-size: 12px;
    font-weight: 500;
  }

  .ai-sources__panel {
    width: 396px;
    max-height: 360px;
    padding: 12px;
    overflow-y: auto;
  }

  .ai-sources__panel-title {
    margin-bottom: 8px;
    color: var(--desc-color);
    font-size: 12px;
    font-weight: 600;
  }

  .ai-sources__mobile-list {
    width: min(392px, 80vw);
    max-height: 65vh;
    overflow-y: auto;
  }

  :deep(.b-popover-trigger) {
    min-width: 0;
    flex: 0 0 auto;
  }

  :global(.ai-sources-popover) {
    border: 1px solid var(--surface-border-color);
    background: var(--card-background);
  }

  @media (max-width: 768px) {
    .ai-sources {
      min-height: 44px;
      margin-left: 0;
    }

    .ai-sources__rail {
      height: 44px;
    }

    .ai-sources__compact,
    .ai-sources__more {
      height: 40px;
    }

    .ai-sources__label {
      font-size: 11px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ai-sources__rail {
      transition: none;
    }
  }
</style>
