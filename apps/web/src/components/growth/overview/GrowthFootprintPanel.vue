<template>
  <section id="growth-heatmap" class="footprint-panel" :class="{ 'footprint-panel--stacked': stacked }">
    <ActivityHeatmap ref="heatmapRef" class="footprint-panel__heatmap" />

    <aside id="growth-recap" class="footprint-recent" :aria-label="t('growth.overview.recentTitle')">
      <header class="footprint-recent__head">
        <h3>{{ t('growth.overview.recentTitle') }}</h3>
        <BButton
          v-if="entries.length > collapsedLimit"
          type="text"
          size="small"
          class="footprint-recent__toggle"
          :aria-expanded="expanded"
          @click="expanded = !expanded"
        >
          {{ expanded ? t('common.collapse') : t('growth.overview.recentExpand', { n: entries.length }) }}
        </BButton>
      </header>
      <p v-if="!entries.length" class="footprint-recent__empty">{{ t('growth.footprintEmpty') }}</p>
      <ol v-else class="footprint-recent__list">
        <li v-for="(entry, index) in visibleEntries" :key="`${entry.source}-${entry.time}-${index}`">
          <GrowthTaskIcon :task-key="iconKey(entry.source)" compact />
          <span class="footprint-recent__text">
            <span :class="{ 'is-aggregate': entry.count > 1 }">{{ entryLabel(entry) }}</span>
            <b v-if="entry.name">{{
              entry.count > 1 ? t('growth.overview.recentAndMore', { name: entry.name }) : entry.name
            }}</b>
          </span>
          <time :datetime="String(entry.time)">{{ relativeTime(entry.time) }}</time>
        </li>
      </ol>
    </aside>
  </section>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import ActivityHeatmap from '@/components/growth/ActivityHeatmap.vue';
  import GrowthTaskIcon from '@/components/growth/GrowthTaskIcon.vue';
  import { aggregateTimeline, type FootprintEntry } from '@/utils/growthOverview';
  import type { TimelineItem } from '@/composables/useGrowth.ts';

  const props = withDefaults(defineProps<{ timeline: TimelineItem[]; stacked?: boolean }>(), { stacked: false });
  const { t, te, locale } = useI18n();
  const heatmapRef = ref<{ reload: () => void | Promise<void> } | null>(null);
  const expanded = ref(false);

  const entries = computed(() => aggregateTimeline(props.timeline));
  const collapsedLimit = computed(() => (props.stacked ? 3 : 5));
  const visibleEntries = computed(() =>
    expanded.value ? entries.value : entries.value.slice(0, collapsedLimit.value),
  );

  const ICON_KEYS: Record<string, string> = { bookmark: 'first_bookmark', note: 'first_note', file: 'first_file' };
  function iconKey(source: string) {
    return ICON_KEYS[source] || 'level';
  }
  function entryLabel(entry: FootprintEntry) {
    if (entry.source === 'milestone') {
      const level = entry.meta?.to ?? entry.meta?.level;
      const name = level ? t(`growth.ranks.${level}`) : (entry.meta?.rank ?? entry.meta?.name ?? '');
      return t('growth.timelineLevelUp', { level, name });
    }
    if (entry.count > 1) {
      const key = `growth.overview.recentAggregate.${entry.source}`;
      if (te(key)) return t(key, { n: entry.count });
    }
    const key = `growth.timelineSrc.${entry.source}`;
    return te(key) ? t(key) : t('growth.timelineSrc.default');
  }
  function relativeTime(value: string) {
    const date = new Date(String(value || '').replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return String(value || '');
    const seconds = Math.round((date.getTime() - Date.now()) / 1000);
    const abs = Math.abs(seconds);
    try {
      const format = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' });
      if (abs < 60) return format.format(seconds, 'second');
      if (abs < 3600) return format.format(Math.round(seconds / 60), 'minute');
      if (abs < 86400) return format.format(Math.round(seconds / 3600), 'hour');
      if (abs < 2592000) return format.format(Math.round(seconds / 86400), 'day');
    } catch {
      /* 旧浏览器不支持相对时间时回退为日期 */
    }
    return date.toLocaleDateString(locale.value);
  }

  defineExpose({ reload: () => heatmapRef.value?.reload() });
</script>

<style scoped lang="less">
  @import (reference) '@/assets/css/ui-density.less';

  .footprint-panel {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(var(--ui-layout-240, 240px), var(--ui-layout-280, 280px));
    gap: .ui-space(24px) [];
    align-items: start;
    min-width: 0;
  }
  .footprint-panel__heatmap {
    min-width: 0;
  }
  @media (min-width: 1281px) {
    .footprint-panel:not(.footprint-panel--stacked) .footprint-panel__heatmap {
      /* ui-density-fixed: 热力图格子是数据可视化几何，沿用组件自身的固定像素；与最近动态并排时缩小一档以完整显示全年 */
      --heatmap-cell-size: 12px;
    }
  }
  .footprint-recent {
    min-width: 0;
    padding-left: .ui-space(24px) [];
    border-left: 1px solid var(--surface-divider-color);
  }
  .footprint-recent__head {
    display: flex;
    align-items: center;
    gap: .ui-space(8px) [];
    margin-bottom: .ui-space(4px) [];
  }
  .footprint-recent__head h3 {
    margin: 0;
    color: var(--text-color);
    font-size: .ui-font(15px) [];
    font-weight: 700;
  }
  .footprint-recent__toggle.b_btn {
    height: auto;
    margin-left: auto;
    padding: 0;
    color: var(--primary-color);
    font-weight: 600;
  }
  .footprint-recent__empty {
    margin: .ui-space(8px) [] 0 0;
    color: var(--desc-color);
    font-size: .ui-font(13px) [];
    line-height: 1.6;
  }
  .footprint-recent__list {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .footprint-recent__list li {
    display: flex;
    align-items: center;
    gap: .ui-space(10px) [];
    padding: .ui-space(9px) [] 0;
    border-bottom: 1px dashed var(--surface-divider-color);
    font-size: .ui-font(13px) [];
  }
  .footprint-recent__list li:last-child {
    border-bottom: 0;
  }
  .footprint-recent__text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    color: var(--desc-color);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .footprint-recent__text .is-aggregate {
    color: var(--primary-color);
    font-weight: 600;
  }
  .footprint-recent__text b {
    margin-left: .ui-space(6px) [];
    color: var(--text-color);
    font-weight: 500;
  }
  .footprint-recent__list time {
    flex: 0 0 auto;
    color: var(--desc-color);
    font-size: .ui-font(12px) [];
  }

  @media (max-width: 1280px) {
    .footprint-panel {
      grid-template-columns: minmax(0, 1fr);
    }
    .footprint-recent {
      padding: .ui-space(16px) [] 0 0;
      border-top: 1px solid var(--surface-divider-color);
      border-left: 0;
    }
  }
  .footprint-panel--stacked {
    grid-template-columns: minmax(0, 1fr);
    gap: .ui-space(16px) [];
  }
  .footprint-panel--stacked .footprint-recent {
    padding: .ui-space(14px) [] 0 0;
    border-top: 1px solid var(--surface-divider-color);
    border-left: 0;
  }
</style>
