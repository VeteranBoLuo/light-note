<template>
  <article class="result-item" :class="[`result-item--${view}`, { 'result-item--selected': selected }]">
    <label v-if="selectable" class="result-checkbox-wrap">
      <input type="checkbox" class="result-checkbox" :checked="selected" @click.stop @change="emit('toggle-select')" />
    </label>

    <button class="result-click-area" :class="{ 'result-click-area--selectable': selectable }" @click="emit('open')">
      <header class="item-head">
        <span class="type-pill" :class="`type-pill--${item.type}`">{{ typeLabel }}</span>
        <span class="item-extra">{{ headerExtra }}</span>
      </header>

      <h3 class="item-title">
        <template v-for="(segment, index) in titleSegments" :key="`title-${index}`">
          <mark v-if="segment.highlight">{{ segment.text }}</mark>
          <span v-else>{{ segment.text }}</span>
        </template>
      </h3>

      <p class="item-desc">
        <template v-for="(segment, index) in descSegments" :key="`desc-${index}`">
          <mark v-if="segment.highlight">{{ segment.text }}</mark>
          <span v-else>{{ segment.text }}</span>
        </template>
      </p>

      <div class="item-meta">
        <span class="meta-line">
          <strong>{{ t('tagManage.relatedTag') }}:</strong>
          <span class="meta-line-value" :class="{ 'meta-line-value--empty': !tagMetaText }">{{ tagMetaText || '-' }}</span>
        </span>
        <span class="meta-line">
          <strong>{{ t('tagGraph.panel.updateTime') }}:</strong>
          <span class="meta-line-value" :class="{ 'meta-line-value--empty': !updateMetaText }">
            {{ updateMetaText || '-' }}
          </span>
        </span>
      </div>
    </button>
  </article>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { DisplaySearchItem, ResourceView } from './searchUtils.ts';

  const props = defineProps<{
    item: DisplaySearchItem;
    typeLabel: string;
    keyword: string;
    selected?: boolean;
    selectable?: boolean;
    view: ResourceView;
  }>();

  const emit = defineEmits<{
    (e: 'open'): void;
    (e: 'toggle-select'): void;
  }>();

  const { t } = useI18n();

  interface TextSegment {
    text: string;
    highlight: boolean;
  }

  function escapeRegExp(text: string) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function buildSegments(source: string, keyword: string): TextSegment[] {
    if (!source) return [{ text: '', highlight: false }];
    const normalized = keyword.trim();
    if (!normalized) return [{ text: source, highlight: false }];
    const regex = new RegExp(`(${escapeRegExp(normalized)})`, 'ig');
    return source.split(regex).map((text) => ({
      text,
      highlight: text.toLowerCase() === normalized.toLowerCase(),
    }));
  }

  const titleSegments = computed(() => buildSegments(props.item.title, props.keyword));
  const descSegments = computed(() => buildSegments(props.item.description || props.item.extra || '', props.keyword));
  const tagMetaText = computed(() => props.item.tagNames.slice(0, 3).join(' / '));
  const updateMetaText = computed(() => props.item.updatedAtText || '');
  const headerExtra = computed(() => {
    if (props.item.type === 'bookmark') return props.item.domain || props.item.extra || '';
    if (props.item.type === 'file') return props.item.fileMeta || props.item.extra || '';
    return props.item.extra || '';
  });
</script>

<style scoped lang="less">
  .result-item {
    position: relative;
    border: 1px solid var(--card-border-color);
    border-radius: 14px;
    background: var(--background-color);
    transition:
      border-color 0.2s,
      box-shadow 0.2s,
      transform 0.2s;
    display: flex;
    min-width: 0;
  }

  .result-item:hover {
    border-color: var(--primary-h-color);
    box-shadow: 0 12px 24px color-mix(in srgb, var(--primary-color) 18%, transparent);
    transform: translateY(-2px);
  }

  .result-item--selected {
    border-color: var(--primary-color);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary-color) 45%, transparent);
  }

  .result-item--card {
    min-height: 186px;
  }

  .result-item--list {
    min-height: 136px;
  }

  .result-checkbox-wrap {
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 3;
  }

  .result-checkbox {
    width: 15px;
    height: 15px;
    cursor: pointer;
  }

  .result-click-area {
    width: 100%;
    min-width: 0;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    box-sizing: border-box;
  }

  .result-click-area--selectable {
    padding-right: 40px;
  }

  .item-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 24px;
  }

  .type-pill {
    min-width: max-content;
    padding: 3px 8px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
    background: color-mix(in srgb, var(--resource-bookmark-color) 14%, transparent);
    color: var(--resource-bookmark-color);
  }

  .type-pill--note {
    background: color-mix(in srgb, var(--resource-note-color) 14%, transparent);
    color: var(--resource-note-color);
  }

  .type-pill--file {
    background: color-mix(in srgb, var(--resource-file-color) 14%, transparent);
    color: var(--resource-file-color);
  }

  .type-pill--tag {
    background: color-mix(in srgb, var(--resource-tag-color) 14%, transparent);
    color: var(--resource-tag-color);
  }

  .item-extra {
    color: var(--desc-color);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 58%;
  }

  .item-title {
    margin: 0;
    font-size: 16px;
    line-height: 1.35;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-height: 22px;
  }

  .item-desc {
    margin: 0;
    color: var(--desc-color);
    line-height: 1.55;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    min-height: calc(1.55em * 2);
  }

  .item-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-height: 40px;
    margin-top: auto;
  }

  .meta-line {
    font-size: 12px;
    color: var(--desc-color);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 18px;
  }

  .meta-line-value {
    margin-left: 4px;
  }

  .meta-line-value--empty {
    opacity: 0.58;
  }

  .meta-line strong {
    color: var(--text-color);
    font-weight: 600;
  }

  mark {
    background: color-mix(in srgb, #facc15 72%, transparent);
    color: #171717;
    border-radius: 3px;
    padding: 0 2px;
    font-weight: 700;
  }
</style>
