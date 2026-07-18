<template>
  <div class="ai-source-list">
    <BButton
      v-for="source in sources"
      :key="`${source.type}:${source.id}`"
      :class="['ai-source-list__item', `is-${source.type}`, { 'is-static': !isNavigableSource(source) }]"
      :role="isNavigableSource(source) ? 'link' : undefined"
      :tabindex="isNavigableSource(source) ? 0 : -1"
      :aria-disabled="!isNavigableSource(source)"
      @click="selectSource(source)"
      @keydown.enter.prevent="selectSource(source)"
      @keydown.space.prevent="selectSource(source)"
    >
      <span class="ai-source-list__icon" aria-hidden="true">
        <SvgIcon :src="sourceIcon(source.type)" size="18" />
      </span>
      <span class="ai-source-list__copy">
        <strong>{{ source.title }}</strong>
        <small>{{ sourceSubtitle(source) }}</small>
      </span>
      <span v-if="isNavigableSource(source)" class="ai-source-list__action" aria-hidden="true">
        <SvgIcon :src="isExternalSource(source) ? icon.ai.sourceExternal : icon.ai.sourceArrow" size="15" />
      </span>
    </BButton>
  </div>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import { resolveAiSourceNavigation, type AiSource } from './aiSourceNavigation';

  defineProps<{ sources: AiSource[] }>();
  const emit = defineEmits<{ select: [source: AiSource] }>();
  const { t } = useI18n();

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
  const isNavigableSource = (source: AiSource) => resolveAiSourceNavigation(source).kind !== 'none';
  const isExternalSource = (source: AiSource) => resolveAiSourceNavigation(source).kind === 'external';

  function selectSource(source: AiSource) {
    if (!isNavigableSource(source)) return;
    emit('select', source);
  }
</script>

<style scoped lang="less">
  .ai-source-list {
    display: grid;
    gap: 6px;
  }

  .ai-source-list__item {
    --source-color: var(--resource-bookmark-color);
    width: 100%;
    height: 54px;
    min-height: 54px;
    justify-content: flex-start;
    gap: 8px;
    padding: 6px 9px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    background: var(--card-background);
    color: var(--text-color);
    line-height: 1.3;
    text-align: left;
    white-space: normal;
    transition:
      border-color 0.15s ease,
      background-color 0.15s ease;
  }

  .ai-source-list__item:not(.is-static):hover {
    border-color: color-mix(in srgb, var(--source-color) 38%, var(--surface-border-color));
    background: color-mix(in srgb, var(--source-color) 5%, var(--card-background));
  }

  .ai-source-list__item.is-static {
    cursor: default;
  }

  .ai-source-list__item.is-note {
    --source-color: var(--resource-note-color);
  }

  .ai-source-list__item.is-file,
  .ai-source-list__item.is-document,
  .ai-source-list__item.is-folder {
    --source-color: var(--resource-file-color);
  }

  .ai-source-list__item.is-tag {
    --source-color: var(--resource-tag-color);
  }

  .ai-source-list__item.is-knowledge {
    --source-color: var(--primary-color);
  }

  .ai-source-list__icon {
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

  .ai-source-list__copy {
    min-width: 0;
    display: grid;
    flex: 1;
    gap: 2px;
  }

  .ai-source-list__copy strong,
  .ai-source-list__copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ai-source-list__copy strong {
    font-size: 13px;
    font-weight: 600;
  }

  .ai-source-list__copy small {
    color: var(--desc-color);
    font-size: 11px;
    font-weight: 400;
  }

  .ai-source-list__action {
    display: inline-flex;
    flex: 0 0 auto;
    color: var(--desc-color);
  }

  @media (max-width: 768px) {
    .ai-source-list__item {
      height: 52px;
      min-height: 52px;
    }
  }
</style>
