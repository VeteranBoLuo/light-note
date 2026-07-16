<template>
  <article class="result-item" :class="[`result-item--${view}`, { 'result-item--selected': selected }]">
    <!-- 列表视图:横向紧凑行(信息密度高,适合快速检索定位) -->
    <template v-if="view === 'list'">
      <label v-if="selectable" class="row-checkbox-wrap">
        <input
          type="checkbox"
          class="result-checkbox"
          :checked="selected"
          @click.stop
          @change="emit('toggle-select')"
        />
      </label>
      <button class="result-row" @click="emit('open')">
        <span class="type-pill" :class="`type-pill--${item.type}`">{{ typeLabel }}</span>
        <span class="row-title">
          <template v-for="(segment, index) in titleSegments" :key="`lt-${index}`">
            <mark v-if="segment.highlight">{{ segment.text }}</mark>
            <span v-else>{{ segment.text }}</span>
          </template>
        </span>
        <span class="row-desc">
          <template v-for="(segment, index) in descSegments" :key="`ld-${index}`">
            <mark v-if="segment.highlight">{{ segment.text }}</mark>
            <span v-else>{{ segment.text }}</span>
          </template>
        </span>
        <span class="row-tags" :class="{ 'row-meta--empty': !tagMetaText }">{{ tagMetaText || '—' }}</span>
        <span class="row-time" :class="{ 'row-meta--empty': !updateMetaText }">{{ updateMetaText || '—' }}</span>
      </button>
    </template>

    <!-- 卡片视图:竖排卡片(舒适浏览) -->
    <template v-else>
      <label v-if="selectable" class="result-checkbox-wrap">
        <input
          type="checkbox"
          class="result-checkbox"
          :checked="selected"
          @click.stop
          @change="emit('toggle-select')"
        />
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
            <span class="meta-line-value" :class="{ 'meta-line-value--empty': !tagMetaText }">{{
              tagMetaText || '-'
            }}</span>
          </span>
          <span class="meta-line">
            <strong>{{ t('tagGraph.panel.updateTime') }}:</strong>
            <span class="meta-line-value" :class="{ 'meta-line-value--empty': !updateMetaText }">
              {{ updateMetaText || '-' }}
            </span>
          </span>
        </div>
      </button>
    </template>
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
    border: 1px solid var(--surface-border-color, var(--card-border-color));
    border-radius: 14px;
    background: var(--card-background, var(--background-color));
    box-shadow: var(--surface-card-shadow, none);
    transition:
      border-color 0.2s,
      box-shadow 0.2s;
    display: flex;
    min-width: 0;
  }

  .result-item:hover {
    border-color: var(--primary-h-color);
    box-shadow: var(--surface-hover-shadow, 0 12px 24px color-mix(in srgb, var(--primary-color) 18%, transparent));
  }

  .result-item--selected {
    border-color: var(--primary-color);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary-color) 45%, transparent);
  }

  .result-item--card {
    min-height: 186px;
  }

  /* 列表视图:横向紧凑行——覆盖卡片的最小高度与位移 hover,一行内横排:类型 / 标题 / 描述 / 标签 / 时间 */
  .result-item--list {
    min-height: 0;
    align-items: stretch;
  }
  .result-item--list:hover {
    transform: none;
  }
  .row-checkbox-wrap {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    padding-left: 12px;
  }
  .result-row {
    flex: 1 1 auto;
    min-width: 0;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 9px 14px;
    box-sizing: border-box;
  }
  .result-item--list .type-pill {
    flex: 0 0 auto;
  }
  .row-title {
    flex: 0 1 auto;
    min-width: 96px;
    max-width: 42%;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-color);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row-desc {
    flex: 1 1 auto;
    min-width: 0;
    color: var(--desc-color);
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row-tags {
    flex: 0 0 auto;
    max-width: 22%;
    color: var(--desc-color);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row-time {
    flex: 0 0 auto;
    width: 112px;
    text-align: right;
    color: var(--desc-color);
    font-size: 12px;
    white-space: nowrap;
  }
  .row-meta--empty {
    opacity: 0.5;
  }
  /* 中等宽度(如平板 list)优先牺牲描述,保住 类型/标题/标签/时间 */
  @media (max-width: 820px) {
    .row-desc {
      display: none;
    }
  }

  .result-checkbox-wrap {
    position: absolute;
    top: 14px;
    right: 14px;
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
    flex: 1;
    min-width: 0;
    text-align: right;
    color: var(--desc-color);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
