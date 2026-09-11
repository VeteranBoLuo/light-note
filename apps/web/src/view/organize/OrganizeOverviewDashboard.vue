<template>
  <div class="governance-summary">
    <header class="governance-summary__heading">
      <div
        ><h2>{{ t('organize.overview.resourceGovernance') }}</h2
        ><p>{{ t('organize.summaryView.description') }}</p></div
      >
      <div class="governance-summary__updated"
        ><small v-if="summary">{{ t('organize.overview.updatedAt', { time: updatedAt }) }}</small
        ><BButton size="small" @click="emit('refresh')">{{ t('organize.refresh') }}</BButton></div
      >
    </header>

    <div class="governance-summary__metrics">
      <BCard class="governance-summary__ai-entry" padding="20px" radius="12px">
        <div class="governance-summary__ai-icon" aria-hidden="true">
          <SvgIcon :src="icon.common.magicWand" size="22" />
        </div>
        <div class="governance-summary__ai-copy">
          <span>{{ t('organize.summaryView.aiEyebrow') }}</span>
          <h3>{{ t('organize.views.aiSuggestions') }}</h3>
          <p>{{ t('organize.summaryView.aiDescription') }}</p>
        </div>
        <BButton type="primary" class="governance-summary__ai-action" @click="emit('select', 'ai_suggestions')">
          {{ t('organize.summaryView.aiAction') }} <span aria-hidden="true">→</span>
        </BButton>
      </BCard>
      <BCard
        v-for="metric in metrics"
        :key="metric.key"
        class="governance-summary__metric"
        padding="20px"
        radius="12px"
      >
        <div class="governance-summary__metric-title"
          ><SvgIcon :src="metric.icon" size="17" /><h3>{{ metric.label }}</h3></div
        >
        <div class="governance-summary__value"
          ><strong>{{ metric.display }}</strong
          ><span>{{ t(metric.unit) }}</span></div
        >
        <p>{{
          metric.display === '—'
            ? t('organize.summaryView.unavailable')
            : metric.value === 0
              ? t('organize.summaryView.clear')
              : metric.description
        }}</p>
        <BButton class="governance-summary__link" size="small" @click="emit('select', metric.key)"
          >{{ t('organize.summaryView.details') }} <span aria-hidden="true">→</span></BButton
        >
      </BCard>
    </div>
    <p class="governance-summary__scope">{{ t('organize.overview.governanceOverlapHint') }}</p>

    <div class="governance-summary__charts">
      <BCard class="governance-summary__panel" padding="24px" radius="12px">
        <header
          ><div
            ><h3>{{ t('organize.summaryView.untaggedComposition') }}</h3
            ><p>{{ t('organize.summaryView.untaggedDescription') }}</p></div
          ><SvgIcon :src="icon.resource.tag" size="20"
        /></header>
        <OrganizeDonutChart
          v-if="untaggedTypes"
          :items="untaggedTypes"
          :total="untaggedTotal"
          :center-value="untaggedTotal"
          :aria-label="t('organize.summaryView.untaggedComposition')"
        />
        <div v-else class="governance-summary__empty" role="status">{{
          t('organize.summaryView.compositionUnavailable')
        }}</div>
        <footer>{{
          untaggedTotal === 0 && untaggedTypes
            ? t('organize.overview.untaggedEmpty')
            : t('organize.summaryView.typeScope')
        }}</footer>
      </BCard>
      <BCard class="governance-summary__panel" padding="24px" radius="12px">
        <header
          ><div
            ><h3>{{ t('organize.overview.healthStatus') }}</h3
            ><p>{{ t('organize.overview.healthCoverageDescription') }}</p></div
          ><SvgIcon :src="icon.bookmarkManage.healthCheck" size="20"
        /></header>
        <template v-if="coverage">
          <div class="governance-summary__coverage"
            ><span>{{ t('organize.overview.healthCoverage') }}</span
            ><strong>{{
              t('organize.overview.healthCoverageValue', { checked: coverage.checked, total: coverage.total })
            }}</strong></div
          >
          <BProgress
            size="small"
            :percent="coveragePercent"
            :aria-label="
              t('organize.overview.healthCoverageAria', { checked: coverage.checked, total: coverage.total })
            "
          />
          <ul class="governance-summary__health"
            ><li v-for="status in healthStatuses" :key="status.key"
              ><span :style="{ background: status.color }" aria-hidden="true"></span><span>{{ status.label }}</span
              ><strong>{{ status.value }}</strong></li
            ></ul
          >
        </template>
        <div v-else class="governance-summary__empty" role="status">{{ t('organize.summaryView.unavailable') }}</div>
        <footer>{{ t('organize.summaryView.healthScope') }}</footer>
      </BCard>
      <BCard class="governance-summary__panel" padding="24px" radius="12px">
        <header
          ><div
            ><h3>{{ t('organize.overview.pendingComposition') }}</h3
            ><p>{{ t('organize.summaryView.pendingDescription') }}</p></div
          ><SvgIcon :src="icon.contextMenu.inbox" size="20"
        /></header>
        <OrganizeDonutChart
          v-if="pendingTypes && pendingTotal > 0"
          :items="pendingTypes"
          :total="pendingTotal"
          :center-value="pendingTotal"
          :center-label="t('organize.views.pending')"
          :aria-label="t('organize.overview.pendingComposition')"
        />
        <div
          v-else-if="summary?.pendingShortcut.state === 'ready' && pendingTotal === 0"
          class="governance-summary__empty governance-summary__empty--clear"
          ><strong>0</strong><span>{{ t('organize.overview.pendingEmpty') }}</span></div
        >
        <div v-else class="governance-summary__empty" role="status">{{ t('organize.summaryView.unavailable') }}</div>
        <footer
          ><BButton size="small" class="governance-summary__link" @click="emit('select', 'pending')"
            >{{ t('organize.summaryView.pendingDetails') }} <span aria-hidden="true">→</span></BButton
          ></footer
        >
      </BCard>
    </div>
    <p v-if="error" class="governance-summary__warning" role="status">{{ t('organize.staleSummaryHint') }}</p>
  </div>
</template>
<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BProgress from '@/components/base/BasicComponents/BProgress.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import OrganizeDonutChart from './OrganizeDonutChart.vue';
  import icon from '@/config/icon';
  import type { OrganizeIssueType, OrganizeResourceType, OrganizeSummary } from '@/api/organizeApi';
  const props = defineProps<{
    summary: OrganizeSummary | null;
    error?: boolean;
  }>();
  const emit = defineEmits<{ select: [view: 'pending' | 'ai_suggestions' | OrganizeIssueType]; refresh: [] }>();
  const { t, locale } = useI18n();
  const count = (value: unknown) => Math.max(0, Number(value) || 0);
  const display = (value: number | null | undefined, more = false) =>
    value == null ? '—' : `${count(value).toLocaleString(locale.value)}${more ? '+' : ''}`;
  const updatedAt = computed(() => {
    const date = new Date(props.summary?.generatedAt || '');
    return Number.isNaN(date.getTime())
      ? '—'
      : date.toLocaleString(locale.value, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  });
  const metrics = computed(() =>
    [
      {
        key: 'untagged' as const,
        label: t('organize.views.untagged'),
        icon: icon.resource.tag,
        value: props.summary?.issues.untagged.findingCount,
        more: props.summary?.issues.untagged.hasMore,
        unit: 'organize.summaryView.resources',
        description: t('organize.summaryView.untaggedMetric'),
      },
      {
        key: 'duplicate_bookmark' as const,
        label: t('organize.views.duplicateBookmark'),
        icon: icon.resource.bookmark,
        value:
          props.summary?.issues.duplicateBookmark.groupCount ?? props.summary?.issues.duplicateBookmark.findingCount,
        more: props.summary?.issues.duplicateBookmark.hasMore,
        unit: 'organize.summaryView.groups',
        description: t('organize.summaryView.duplicateMetric'),
      },
      {
        key: 'bookmark_health' as const,
        label: t('organize.views.bookmarkHealth'),
        icon: icon.bookmarkManage.healthCheck,
        value: props.summary?.issues.bookmarkHealth.findingCount,
        more: props.summary?.issues.bookmarkHealth.hasMore,
        unit: 'organize.summaryView.bookmarks',
        description: t('organize.summaryView.healthMetric'),
      },
    ].map((metric) => ({ ...metric, display: display(metric.value, metric.more) })),
  );
  function typeChart(totals?: Record<OrganizeResourceType, number> | null) {
    if (!totals) return null;
    return (['bookmark', 'note', 'file'] as const).map((type) => ({
      key: type,
      label: t(`resourceCenter.types.${type}`),
      value: count(totals[type]),
      color:
        type === 'bookmark'
          ? 'var(--primary-color)'
          : type === 'note'
            ? 'var(--resource-note-color)'
            : 'var(--resource-file-color)',
    }));
  }
  const untaggedTypes = computed(() =>
    typeChart(props.summary?.issues.untagged.state === 'ready' ? props.summary.issues.untagged.typeTotals : null),
  );
  const untaggedTotal = computed(() => untaggedTypes.value?.reduce((sum, item) => sum + item.value, 0) ?? 0);
  const pendingTypes = computed(() =>
    typeChart(props.summary?.pendingShortcut.state === 'ready' ? props.summary.pendingShortcut.typeTotals : null),
  );
  const pendingTotal = computed(() => count(props.summary?.pendingShortcut.count));
  const coverage = computed(() =>
    props.summary?.issues.bookmarkHealth.state === 'ready' ? props.summary.issues.bookmarkHealth.coverage : null,
  );
  const coveragePercent = computed(() =>
    coverage.value?.total ? Math.min(100, (100 * coverage.value.checked) / coverage.value.total) : 0,
  );
  const healthStatuses = computed(() => {
    const health = props.summary?.issues.bookmarkHealth;
    return [
      {
        key: 'normal',
        label: t('organize.overview.healthNormal'),
        value: count(health?.alive),
        color: 'var(--success-color)',
      },
      {
        key: 'user',
        label: t('organize.overview.healthUserNormal'),
        value: count(health?.userNormalCount),
        color: 'var(--primary-color)',
      },
      {
        key: 'suspect',
        label: t('organize.views.bookmarkHealth'),
        value: count(health?.findingCount),
        color: 'var(--danger-color)',
      },
      {
        key: 'unknown',
        label: t('organize.overview.healthUnknown'),
        value: count(health?.unknownCount),
        color: 'var(--warning-color)',
      },
      {
        key: 'unchecked',
        label: t('organize.overview.healthUnchecked'),
        value: count(health?.unchecked),
        color: 'var(--desc-color)',
      },
    ];
  });
</script>
<style scoped lang="less">
  @import (reference) '@/assets/css/workspace-surfaces.less';
  .governance-summary {
    --summary-surface: var(--workspace-content);
    display: grid;
    gap: 20px;
    min-width: 0;
    padding: 20px;
    box-sizing: border-box;
    color: var(--text-color);
  }
  :global([data-theme='night'] .governance-summary) {
    --summary-surface: var(--workspace-content);
  }
  .governance-summary h2,
  .governance-summary h3,
  .governance-summary p {
    margin: 0;
  }
  .governance-summary h2 {
    font-size: 22px;
    line-height: 1.4;
  }
  .governance-summary h3 {
    font-size: 15px;
    line-height: 1.4;
  }
  .governance-summary p,
  .governance-summary footer,
  .governance-summary small {
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.6;
  }
  .governance-summary__heading,
  .governance-summary__updated {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .governance-summary__heading p {
    margin-top: 6px;
  }
  .governance-summary__metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
  }
  .governance-summary__metric,
  .governance-summary__ai-entry,
  .governance-summary__panel {
    --b-card-background: var(--summary-surface);
    --b-card-shadow: none;
    min-width: 0;
  }
  .governance-summary__ai-entry {
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr);
    align-items: center;
    gap: 12px;
    border-color: var(--primary-color);
    background: var(--mobile-selected-bg, var(--summary-surface));
  }
  .governance-summary__ai-icon {
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    border: 1px solid var(--primary-color);
    border-radius: 12px;
    color: var(--primary-color);
    background: var(--card-background);
  }
  .governance-summary__ai-copy {
    min-width: 0;
  }
  .governance-summary__ai-copy > span {
    display: block;
    margin-bottom: 2px;
    color: var(--primary-color);
    font-size: 10px;
    font-weight: 750;
    letter-spacing: 0.06em;
  }
  .governance-summary__ai-copy p {
    margin-top: 5px;
  }
  .governance-summary__ai-action.b_btn {
    grid-column: 1 / -1;
    width: 100%;
    min-height: 36px;
  }
  .governance-summary__metric-title {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .governance-summary__metric-title > :first-child,
  .governance-summary__panel header > :last-child {
    color: var(--primary-color);
    flex-shrink: 0;
  }
  .governance-summary__value {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin: 18px 0 6px;
  }
  .governance-summary__value strong {
    font-size: 32px;
    font-weight: 600;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }
  .governance-summary__value span {
    font-size: 12px;
    color: var(--desc-color);
  }
  .governance-summary__link.b_btn {
    padding: 0;
    background: transparent;
    border: 0;
    color: var(--desc-color);
    height: 32px;
    gap: 8px;
    font-size: 12px;
  }
  .governance-summary__metric .governance-summary__link {
    margin-top: 12px;
  }
  .governance-summary__link.b_btn:hover {
    color: var(--primary-color);
  }
  .governance-summary__link.b_btn:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 4px;
    border-radius: 4px;
  }
  .governance-summary__scope {
    margin-top: -10px !important;
  }
  .governance-summary__charts {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 20px;
    align-items: start;
  }
  .governance-summary__panel {
    display: flex;
    flex-direction: column;
    min-height: 330px;
  }
  .governance-summary__panel header {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 14px;
    margin-bottom: 22px;
  }
  .governance-summary__panel header p {
    margin-top: 6px;
  }
  .governance-summary__panel footer {
    border-top: 1px solid var(--surface-divider-color);
    padding-top: 14px;
    margin-top: auto;
  }
  .governance-summary__panel :deep(.organize-donut-chart) {
    margin: 0 0 24px;
    grid-template-columns: 140px minmax(0, 1fr);
    gap: 24px;
  }
  .governance-summary__panel :deep(.organize-donut-chart__visual) {
    width: 140px;
  }
  .governance-summary__panel :deep(.organize-donut-chart__legend-item) {
    font-size: 12px;
  }
  .governance-summary__coverage {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    font-size: 12px;
    margin-bottom: 10px;
    color: var(--desc-color);
  }
  .governance-summary__coverage strong {
    color: var(--text-color);
  }
  .governance-summary__health {
    list-style: none;
    padding: 0;
    margin: 18px 0 20px;
    display: grid;
    gap: 12px;
  }
  .governance-summary__health li {
    display: grid;
    grid-template-columns: 8px 1fr auto;
    gap: 10px;
    align-items: center;
    font-size: 12px;
    color: var(--desc-color);
  }
  .governance-summary__health li > span:first-child {
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }
  .governance-summary__health strong {
    color: var(--text-color);
    font-variant-numeric: tabular-nums;
  }
  .governance-summary__empty {
    min-height: 160px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.7;
    padding: 16px;
    gap: 12px;
    flex: 1;
  }
  .governance-summary__empty--clear strong {
    font-size: 42px;
    font-weight: 600;
    color: var(--text-color);
  }
  .governance-summary__warning {
    color: var(--danger-color) !important;
  }
  @media (max-width: 1200px) {
    .governance-summary__metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .governance-summary__panel :deep(.organize-donut-chart) {
      grid-template-columns: 110px minmax(0, 1fr);
      gap: 14px;
    }
    .governance-summary__panel :deep(.organize-donut-chart__visual) {
      width: 110px;
    }
  }
  @media (max-width: 950px) {
    .governance-summary__charts {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 767px) {
    .governance-summary {
      gap: 16px;
      padding: 12px;
    }
    .governance-summary__metrics {
      gap: 10px;
    }
    .governance-summary__metric {
      --b-card-padding: 16px !important;
    }
    .governance-summary__ai-entry {
      --b-card-padding: 16px !important;
      grid-column: 1 / -1;
    }
    .governance-summary__metric:last-child {
      grid-column: 1 / -1;
    }
    .governance-summary__panel {
      --b-card-padding: 20px !important;
      min-height: 0;
    }
    .governance-summary__value strong {
      font-size: 28px;
    }
    .governance-summary__link.b_btn {
      min-height: 44px;
    }
    .governance-summary__metric-title {
      gap: 6px;
    }
    .governance-summary__metric-title h3 {
      font-size: 13px;
    }
    .governance-summary__updated {
      width: 100%;
    }
    .governance-summary__panel footer {
      margin-top: 8px;
    }
  }

  // 共享工作区表面：仅改变颜色，布局与滚动由原组件负责。
  .governance-summary__panel {
    .workspace-content-surface();
  }
</style>
