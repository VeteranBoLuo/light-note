<template>
  <div class="organize-dashboard">
    <nav class="organize-dashboard__metrics" :aria-label="t('organize.overview.metricNavigation')">
      <BButton
        v-for="metric in metricTabs"
        :key="metric.key"
        class="organize-dashboard-metric"
        :class="`is-${metric.key}`"
        @click="emit('select', metric.key)"
      >
        <span class="organize-dashboard-metric__icon">
          <SvgIcon :src="metric.icon" size="16" aria-hidden="true" />
        </span>
        <span>{{ metric.label }}</span>
        <strong>{{ metric.count }}</strong>
      </BButton>
    </nav>

    <div class="organize-dashboard__grid">
      <div class="organize-dashboard__main">
        <BCard class="organize-dashboard-card organize-dashboard-pending" variant="raised" padding="0" radius="14px">
          <header class="organize-dashboard-card__header">
            <div>
              <div class="organize-dashboard-card__title-line">
                <h2>{{ t('organize.views.pending') }}</h2>
                <span class="organize-dashboard-card__count">{{ pendingCount }}</span>
              </div>
              <p>{{ t('organize.overview.pendingPreviewDescription') }}</p>
            </div>
            <BButton size="small" class="organize-dashboard-card__more" @click="emit('select', 'pending')">
              {{ t('organize.overview.viewAll') }}
            </BButton>
          </header>

          <div v-if="pendingPreview?.state === 'error'" class="organize-dashboard-state is-error" role="status">
            {{ t('organize.overview.previewUnavailable') }}
          </div>
          <div v-else-if="!pendingItems.length" class="organize-dashboard-state">
            {{ t('organize.overview.pendingEmpty') }}
          </div>
          <div v-else>
            <div class="organize-dashboard-table">
              <BTable
                :data="pendingRows"
                :columns="pendingColumns"
                row-key="overviewKey"
                role="region"
                :aria-label="t('organize.overview.pendingPreviewLabel')"
              >
                <template #bodyCell="{ column, record }">
                  <span v-if="column.key === 'title'" class="organize-dashboard-resource">
                    <span class="organize-dashboard-resource__icon" :class="`is-${record.resourceType}`">
                      <SvgIcon :src="resourceIcon(record.resourceType)" size="17" aria-hidden="true" />
                    </span>
                    <span :title="record.title">{{ record.title }}</span>
                  </span>
                  <span v-else-if="column.key === 'resourceType'" class="organize-dashboard-table__type">
                    {{ resourceTypeLabel(record.resourceType) }}
                  </span>
                  <span v-else-if="column.key === 'collectedAt'" class="organize-dashboard-table__time">
                    {{ formatDate(record.collectedAt) }}
                  </span>
                  <BButton
                    v-else-if="column.key === 'action'"
                    size="small"
                    class="organize-dashboard-row-action"
                    @click="openResource(record)"
                  >
                    {{ t('organize.open') }}
                  </BButton>
                </template>
              </BTable>
            </div>

            <ul class="organize-dashboard-pending-mobile">
              <li v-for="item in pendingItems" :key="`${item.resourceType}:${item.resourceId}`">
                <BButton class="organize-dashboard-pending-mobile__row" @click="openResource(item)">
                  <span class="organize-dashboard-resource__icon" :class="`is-${item.resourceType}`">
                    <SvgIcon :src="resourceIcon(item.resourceType)" size="17" aria-hidden="true" />
                  </span>
                  <span>
                    <strong :title="item.title">{{ item.title }}</strong>
                    <small>{{ resourceTypeLabel(item.resourceType) }} · {{ formatShortDate(item.collectedAt) }}</small>
                  </span>
                  <span>{{ t('organize.open') }}</span>
                </BButton>
              </li>
            </ul>
          </div>
        </BCard>

        <div class="organize-dashboard__preview-grid">
          <BCard class="organize-dashboard-card organize-dashboard-preview" variant="card" padding="0" radius="14px">
            <header class="organize-dashboard-card__header is-compact">
              <div>
                <div class="organize-dashboard-card__title-line">
                  <span class="organize-dashboard-title-icon is-untagged">
                    <SvgIcon :src="icon.resource.tag" size="17" aria-hidden="true" />
                  </span>
                  <h3>{{ t('organize.views.untagged') }}</h3>
                  <span class="organize-dashboard-card__count">{{ untaggedCount }}</span>
                </div>
                <p>{{ t('organize.overview.untaggedPreviewDescription') }}</p>
              </div>
              <BButton size="small" class="organize-dashboard-card__more" @click="emit('select', 'untagged')">
                {{ t('organize.overview.viewAll') }}
              </BButton>
            </header>
            <OverviewPreviewState
              :state="untaggedPreview?.state"
              :empty="untaggedItems.length === 0"
              :empty-label="t('organize.overview.untaggedEmpty')"
            >
              <ul class="organize-dashboard-compact-list">
                <li v-for="item in untaggedItems" :key="`${item.resourceType}:${item.resourceId}`">
                  <BButton class="organize-dashboard-compact-row" @click="openResource(item)">
                    <span class="organize-dashboard-resource__icon" :class="`is-${item.resourceType}`">
                      <SvgIcon :src="resourceIcon(item.resourceType)" size="15" aria-hidden="true" />
                    </span>
                    <span class="organize-dashboard-compact-row__copy">
                      <strong :title="item.title">{{ item.title || t('organize.overview.untitled') }}</strong>
                      <small>{{ resourceTypeLabel(item.resourceType) }}</small>
                    </span>
                    <span class="organize-dashboard-compact-row__meta">{{ formatShortDate(item.updatedAt) }}</span>
                  </BButton>
                </li>
              </ul>
            </OverviewPreviewState>
          </BCard>

          <BCard class="organize-dashboard-card organize-dashboard-preview" variant="card" padding="0" radius="14px">
            <header class="organize-dashboard-card__header is-compact">
              <div>
                <div class="organize-dashboard-card__title-line">
                  <span class="organize-dashboard-title-icon is-duplicate">
                    <SvgIcon :src="icon.resource.bookmark" size="17" aria-hidden="true" />
                  </span>
                  <h3>{{ t('organize.views.duplicateBookmark') }}</h3>
                  <span class="organize-dashboard-card__count">{{ duplicateCount }}</span>
                </div>
                <p>{{ t('organize.overview.duplicatePreviewDescription') }}</p>
              </div>
              <BButton size="small" class="organize-dashboard-card__more" @click="emit('select', 'duplicate_bookmark')">
                {{ t('organize.overview.viewAll') }}
              </BButton>
            </header>
            <OverviewPreviewState
              :state="duplicatePreview?.state"
              :empty="duplicateItems.length === 0"
              :empty-label="t('organize.overview.duplicateEmpty')"
            >
              <ul class="organize-dashboard-compact-list">
                <li v-for="item in duplicateItems" :key="item.groupKey">
                  <BButton class="organize-dashboard-compact-row" @click="emit('select', 'duplicate_bookmark')">
                    <span class="organize-dashboard-resource__icon is-bookmark">
                      <SvgIcon :src="icon.resource.bookmark" size="15" aria-hidden="true" />
                    </span>
                    <span class="organize-dashboard-compact-row__copy">
                      <strong :title="item.url">{{ displayUrl(item.url) }}</strong>
                      <small>{{ t('organize.duplicate.groupTitle', { count: item.memberCount }) }}</small>
                    </span>
                    <span class="organize-dashboard-compact-row__badge">{{ item.memberCount }}</span>
                  </BButton>
                </li>
              </ul>
            </OverviewPreviewState>
          </BCard>

          <BCard
            class="organize-dashboard-card organize-dashboard-preview organize-dashboard-preview--health"
            variant="card"
            padding="0"
            radius="14px"
          >
            <header class="organize-dashboard-card__header is-compact">
              <div>
                <div class="organize-dashboard-card__title-line">
                  <span class="organize-dashboard-title-icon is-health">
                    <SvgIcon :src="icon.bookmarkManage.healthCheck" size="17" aria-hidden="true" />
                  </span>
                  <h3>{{ t('organize.views.bookmarkHealth') }}</h3>
                  <span class="organize-dashboard-card__count">{{ healthCount }}</span>
                </div>
                <p>{{ t('organize.overview.healthPreviewDescription') }}</p>
              </div>
              <BButton size="small" class="organize-dashboard-card__more" @click="emit('select', 'bookmark_health')">
                {{ t('organize.overview.viewAll') }}
              </BButton>
            </header>
            <OverviewPreviewState
              :state="healthPreview?.state"
              :empty="healthItems.length === 0"
              :empty-label="t('organize.overview.healthEmpty')"
            >
              <ul class="organize-dashboard-health-list is-main-preview">
                <li v-for="item in healthItems" :key="item.id">
                  <BButton class="organize-dashboard-health-row" @click="openHealthResource(item)">
                    <span class="organize-dashboard-health-row__copy">
                      <strong :title="item.name">{{ item.name || t('organize.overview.untitled') }}</strong>
                      <small>{{ t('organize.health.httpCode', { code: item.observedCode || '404/410' }) }}</small>
                    </span>
                    <BChip tone="danger" size="small">{{
                      item.observedCode || t('organize.views.bookmarkHealth')
                    }}</BChip>
                  </BButton>
                </li>
              </ul>
            </OverviewPreviewState>
          </BCard>
        </div>
      </div>

      <aside class="organize-dashboard__aside" :aria-label="t('organize.overview.insightsLabel')">
        <BCard class="organize-dashboard-card organize-dashboard-chart" variant="panel" padding="16px" radius="14px">
          <header class="organize-dashboard-aside-title">
            <SvgIcon :src="icon.contextMenu.inbox" size="17" aria-hidden="true" />
            <div>
              <h3>{{ t('organize.overview.pendingComposition') }}</h3>
              <p>{{ t('organize.overview.pendingCompositionDescription') }}</p>
            </div>
          </header>
          <OrganizeDonutChart
            :total="pendingTotalNumber"
            :items="pendingChartItems"
            :center-label="t('organize.views.pending')"
            :center-value="pendingCount"
            :empty-label="t('organize.overview.noChartData')"
            :aria-label="t('organize.overview.pendingCompositionAria', { count: pendingTotalNumber })"
          />
        </BCard>

        <BCard class="organize-dashboard-card organize-dashboard-health" variant="card" padding="16px" radius="14px">
          <header class="organize-dashboard-aside-title">
            <SvgIcon :src="icon.bookmarkManage.healthCheck" size="17" aria-hidden="true" />
            <div>
              <h3>{{ t('organize.overview.healthStatus') }}</h3>
              <p>{{ t('organize.overview.healthCoverageDescription') }}</p>
            </div>
          </header>

          <div v-if="healthCoverage" class="organize-dashboard-health__coverage">
            <div>
              <span>{{ t('organize.overview.healthCoverage') }}</span>
              <strong>
                {{
                  t('organize.overview.healthCoverageValue', {
                    checked: healthCoverage.checked,
                    total: healthCoverage.total,
                  })
                }}
              </strong>
            </div>
            <BProgress
              size="small"
              :percent="healthCoveragePercent"
              :aria-label="
                t('organize.overview.healthCoverageAria', {
                  checked: healthCoverage.checked,
                  total: healthCoverage.total,
                })
              "
            />
          </div>
          <div v-else class="organize-dashboard-state">{{ t('organize.overview.noChartData') }}</div>

          <div v-if="healthCoverage" class="organize-dashboard-health__stack" aria-hidden="true">
            <span
              v-for="item in healthStatusItems"
              :key="item.key"
              :class="`is-${item.key}`"
              :style="{ width: `${item.percent}%` }"
            ></span>
          </div>
          <ul v-if="healthCoverage" class="organize-dashboard-legend is-health">
            <li v-for="item in healthStatusItems" :key="item.key">
              <span class="organize-dashboard-legend__dot" :class="`is-${item.key}`"></span>
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
            </li>
          </ul>
        </BCard>

        <BCard
          class="organize-dashboard-card organize-dashboard-governance"
          variant="card"
          padding="16px"
          radius="14px"
        >
          <header class="organize-dashboard-aside-title">
            <SvgIcon :src="icon.ai.organize" size="17" aria-hidden="true" />
            <div>
              <h3>{{ t('organize.overview.governanceComparison') }}</h3>
              <p>{{ t('organize.overview.governanceOverlapHint') }}</p>
            </div>
          </header>
          <ul class="organize-dashboard-bars">
            <li v-for="item in governanceBars" :key="item.key">
              <div>
                <span>{{ item.label }}</span>
                <strong>{{ item.display }}</strong>
              </div>
              <span class="organize-dashboard-bars__track" aria-hidden="true">
                <span :class="`is-${item.key}`" :style="{ width: `${item.percent}%` }"></span>
              </span>
            </li>
          </ul>
          <small v-if="summary" class="organize-dashboard-updated">
            {{ t('organize.overview.updatedAt', { time: formatDate(summary.generatedAt) }) }}
          </small>
        </BCard>
      </aside>
    </div>

    <div v-if="error" class="organize-dashboard-warning" role="status">
      {{ t('organize.staleSummaryHint') }}
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BProgress from '@/components/base/BasicComponents/BProgress.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import OrganizeDonutChart from '@/view/organize/OrganizeDonutChart.vue';
  import OverviewPreviewState from '@/view/organize/OverviewPreviewState.vue';
  import type {
    BookmarkHealthOverviewItem,
    DuplicateBookmarkOverviewItem,
    OrganizeIssueType,
    OrganizeResourceType,
    OrganizeSummary,
    PendingOverviewItem,
    UntaggedOverviewItem,
  } from '@/api/organizeApi';
  import { resolveResourceRoute } from '@/utils/resourceNavigation';
  import icon from '@/config/icon';

  type DashboardView = 'pending' | OrganizeIssueType;

  const props = defineProps<{
    summary: OrganizeSummary | null;
    error?: boolean;
  }>();

  const emit = defineEmits<{
    select: [view: DashboardView];
  }>();

  const { t, locale } = useI18n();
  const router = useRouter();

  function safeCount(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
  }

  function displayCount(value: number | null | undefined, hasMore = false) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
    return `${safeCount(value)}${hasMore ? '+' : ''}`;
  }

  const pendingPreview = computed(() => props.summary?.previews?.pending);
  const untaggedPreview = computed(() => props.summary?.previews?.untagged);
  const duplicatePreview = computed(() => props.summary?.previews?.duplicateBookmark);
  const healthPreview = computed(() => props.summary?.previews?.bookmarkHealth);
  const pendingItems = computed<PendingOverviewItem[]>(() => pendingPreview.value?.items?.slice(0, 5) || []);
  const pendingRows = computed(() =>
    pendingItems.value.map((item) => ({ ...item, overviewKey: `${item.resourceType}:${item.resourceId}` })),
  );
  const pendingColumns = computed(() => [
    { key: 'title', title: t('organize.overview.resourceName'), width: 'minmax(220px, 1fr)', ellipsis: false },
    { key: 'resourceType', title: t('organize.overview.resourceType'), width: '82px', ellipsis: false },
    { key: 'collectedAt', title: t('organize.overview.collectedAt'), width: '136px', ellipsis: false },
    { key: 'action', title: t('organize.overview.action'), width: '58px', ellipsis: false },
  ]);
  const untaggedItems = computed<UntaggedOverviewItem[]>(() => untaggedPreview.value?.items?.slice(0, 3) || []);
  const duplicateItems = computed<DuplicateBookmarkOverviewItem[]>(
    () => duplicatePreview.value?.items?.slice(0, 3) || [],
  );
  const healthItems = computed<BookmarkHealthOverviewItem[]>(() => healthPreview.value?.items?.slice(0, 3) || []);

  const pendingTotalNumber = computed(() => safeCount(props.summary?.pendingShortcut.count));
  const pendingCount = computed(() => displayCount(props.summary?.pendingShortcut.count));
  const untaggedCount = computed(() =>
    displayCount(props.summary?.issues.untagged.findingCount, props.summary?.issues.untagged.hasMore),
  );
  const duplicateCount = computed(() =>
    displayCount(
      props.summary?.issues.duplicateBookmark.groupCount ?? props.summary?.issues.duplicateBookmark.findingCount,
      props.summary?.issues.duplicateBookmark.hasMore,
    ),
  );
  const healthCount = computed(() =>
    displayCount(props.summary?.issues.bookmarkHealth.findingCount, props.summary?.issues.bookmarkHealth.hasMore),
  );

  const metricTabs = computed(() => [
    {
      key: 'pending' as const,
      label: t('organize.views.pending'),
      icon: icon.contextMenu.inbox,
      count: pendingCount.value,
    },
    {
      key: 'untagged' as const,
      label: t('organize.views.untagged'),
      icon: icon.resource.tag,
      count: untaggedCount.value,
    },
    {
      key: 'duplicate_bookmark' as const,
      label: t('organize.views.duplicateBookmark'),
      icon: icon.resource.bookmark,
      count: duplicateCount.value,
    },
    {
      key: 'bookmark_health' as const,
      label: t('organize.views.bookmarkHealth'),
      icon: icon.bookmarkManage.healthCheck,
      count: healthCount.value,
    },
  ]);

  const pendingChartItems = computed(() => {
    const totals = props.summary?.pendingShortcut.typeTotals;
    return [
      {
        key: 'bookmark',
        label: t('resourceCenter.types.bookmark'),
        value: safeCount(totals?.bookmark),
        color: 'var(--primary-color)',
      },
      {
        key: 'note',
        label: t('resourceCenter.types.note'),
        value: safeCount(totals?.note),
        color: 'var(--resource-note-color, #00a884)',
      },
      {
        key: 'file',
        label: t('resourceCenter.types.file'),
        value: safeCount(totals?.file),
        color: 'var(--resource-file-color, #ff8a00)',
      },
    ];
  });

  const healthCoverage = computed(() => props.summary?.issues.bookmarkHealth.coverage || null);
  const healthCoveragePercent = computed(() => {
    const coverage = healthCoverage.value;
    if (!coverage || safeCount(coverage.total) === 0) return 0;
    return (Math.min(safeCount(coverage.checked), safeCount(coverage.total)) / safeCount(coverage.total)) * 100;
  });
  const healthStatusItems = computed(() => {
    const total = safeCount(healthCoverage.value?.total);
    const issue = props.summary?.issues.bookmarkHealth;
    const normal = safeCount(issue?.alive);
    const userNormal = safeCount(issue?.userNormalCount);
    const suspect = safeCount(issue?.findingCount);
    const unknown = safeCount(issue?.unknownCount);
    const unchecked = safeCount(issue?.unchecked ?? Math.max(total - safeCount(healthCoverage.value?.checked), 0));
    return [
      { key: 'normal', label: t('organize.overview.healthNormal'), value: normal },
      { key: 'user_normal', label: t('organize.overview.healthUserNormal'), value: userNormal },
      { key: 'suspect', label: t('organize.views.bookmarkHealth'), value: suspect },
      { key: 'unknown', label: t('organize.overview.healthUnknown'), value: unknown },
      { key: 'unchecked', label: t('organize.overview.healthUnchecked'), value: unchecked },
    ].map((item) => ({ ...item, percent: total > 0 ? (Math.min(item.value, total) / total) * 100 : 0 }));
  });

  const governanceBars = computed(() => {
    const candidates = [
      {
        key: 'untagged',
        label: t('organize.views.untagged'),
        value: props.summary?.issues.untagged.affectedResourceCount,
        hasMore: props.summary?.issues.untagged.hasMore,
      },
      {
        key: 'duplicate',
        label: t('organize.views.duplicateBookmark'),
        value: props.summary?.issues.duplicateBookmark.affectedResourceCount,
        hasMore: props.summary?.issues.duplicateBookmark.hasMore,
      },
      {
        key: 'health',
        label: t('organize.views.bookmarkHealth'),
        value: props.summary?.issues.bookmarkHealth.affectedResourceCount,
        hasMore: props.summary?.issues.bookmarkHealth.hasMore,
      },
    ];
    const max = Math.max(1, ...candidates.map((item) => safeCount(item.value)));
    return candidates.map((item) => ({
      ...item,
      display: displayCount(item.value, item.hasMore),
      percent:
        item.value === null || item.value === undefined || safeCount(item.value) === 0
          ? 0
          : Math.max(4, (safeCount(item.value) / max) * 100),
    }));
  });

  function resourceIcon(type: OrganizeResourceType) {
    return icon.resource[type];
  }

  function resourceTypeLabel(type: OrganizeResourceType) {
    return t(`resourceCenter.types.${type}`);
  }

  function formatDate(value?: string | null) {
    if (!value) return t('organize.unknownTime');
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return t('organize.unknownTime');
    return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  function formatShortDate(value?: string | null) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(locale.value, { month: 'short', day: 'numeric' }).format(date);
  }

  function displayUrl(value: string) {
    try {
      return new URL(value).hostname.replace(/^www\./, '') || value;
    } catch {
      return value || t('organize.overview.untitled');
    }
  }

  function openResource(item: PendingOverviewItem | UntaggedOverviewItem) {
    const target = resolveResourceRoute({ type: item.resourceType, id: item.resourceId, title: item.title });
    if (target) void router.push(target);
  }

  function openHealthResource(item: BookmarkHealthOverviewItem) {
    const target = resolveResourceRoute({ type: 'bookmark', id: item.id, title: item.name });
    if (target) void router.push(target);
  }
</script>

<style scoped lang="less">
  .organize-dashboard {
    display: grid;
    gap: 14px;
  }

  .organize-dashboard__metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }

  .organize-dashboard-metric.b_btn {
    width: 100%;
    height: 44px;
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr) auto;
    gap: 8px;
    padding: 0 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 11px;
    color: var(--text-color);
    background: var(--card-background);
    text-align: left;
    transition:
      color 0.16s ease,
      border-color 0.16s ease,
      background-color 0.16s ease;
  }

  .organize-dashboard-metric.b_btn:hover,
  .organize-dashboard-metric.b_btn:focus-visible {
    border-color: var(--primary-color);
    color: var(--primary-color);
    background: var(--workspace-panel-bg-color);
  }

  .organize-dashboard-metric__icon {
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border-radius: 7px;
    color: var(--primary-color);
    background: var(--workspace-panel-bg-color);
  }

  .organize-dashboard-metric.is-untagged .organize-dashboard-metric__icon {
    color: var(--resource-tag-color, #ec4899);
  }

  .organize-dashboard-metric.is-bookmark_health .organize-dashboard-metric__icon {
    color: var(--danger-color, #fe2c55);
  }

  .organize-dashboard-metric strong,
  .organize-dashboard-card__count,
  .organize-dashboard-legend strong,
  .organize-dashboard-bars strong {
    font-variant-numeric: tabular-nums;
  }

  .organize-dashboard-metric strong {
    min-width: 26px;
    padding: 1px 7px;
    border-radius: 999px;
    color: var(--primary-color);
    background: var(--workspace-panel-bg-color);
    font-size: 12px;
    text-align: center;
  }

  .organize-dashboard__grid {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 310px;
    align-items: start;
    gap: 14px;
  }

  .organize-dashboard__main,
  .organize-dashboard__aside {
    min-width: 0;
    display: grid;
    gap: 14px;
  }

  .organize-dashboard-card {
    overflow: hidden;
  }

  .organize-dashboard-card__header {
    min-width: 0;
    min-height: 72px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 14px 16px 12px;
    border-bottom: 1px solid var(--surface-divider-color);
  }

  .organize-dashboard-card__header.is-compact {
    min-height: 68px;
  }

  .organize-dashboard-card__header > div,
  .organize-dashboard-aside-title > div {
    min-width: 0;
  }

  .organize-dashboard-card__title-line {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .organize-dashboard-card__title-line h2,
  .organize-dashboard-card__title-line h3,
  .organize-dashboard-aside-title h3 {
    margin: 0;
    color: var(--text-color);
    line-height: 1.35;
  }

  .organize-dashboard-card__title-line h2 {
    font-size: 17px;
  }

  .organize-dashboard-card__title-line h3,
  .organize-dashboard-aside-title h3 {
    font-size: 15px;
  }

  .organize-dashboard-card__header p,
  .organize-dashboard-aside-title p {
    margin: 3px 0 0;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.45;
  }

  .organize-dashboard-card__count {
    color: var(--desc-color);
    font-size: 12px;
    font-weight: 650;
  }

  .organize-dashboard-card__more.b_btn,
  .organize-dashboard-row-action.b_btn {
    flex: 0 0 auto;
    border: 1px solid transparent;
    color: var(--primary-color);
    background: transparent;
  }

  .organize-dashboard-card__more.b_btn:hover,
  .organize-dashboard-card__more.b_btn:focus-visible,
  .organize-dashboard-row-action.b_btn:hover,
  .organize-dashboard-row-action.b_btn:focus-visible {
    border-color: var(--primary-color);
    background: var(--workspace-panel-bg-color);
  }

  .organize-dashboard-table {
    display: block;
  }

  .organize-dashboard-table :deep(.table-container) {
    padding: 0 12px 8px;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    gap: 0;
  }

  .organize-dashboard-table :deep(.table-header) {
    height: 34px;
    padding: 0 4px;
    border-radius: 0;
    background: transparent;
  }

  .organize-dashboard-table :deep(.header-cell) {
    font-size: 11px;
    font-weight: 650;
  }

  .organize-dashboard-table :deep(.table-body) {
    min-height: 0;
    overflow: visible;
  }

  .organize-dashboard-table :deep(.table-row-window) {
    gap: 0;
  }

  .organize-dashboard-table :deep(.table-row) {
    min-height: 46px;
    padding: 0 4px;
    border-top: 1px solid var(--surface-divider-color);
    border-radius: 0;
    color: var(--text-color);
    font-size: 12px;
  }

  .organize-dashboard-table :deep(.table-cell) {
    padding: 0 4px;
  }

  .organize-dashboard-pending-mobile {
    display: none;
    margin: 0;
    padding: 4px 8px 8px;
    list-style: none;
  }

  .organize-dashboard-pending-mobile__row.b_btn {
    width: 100%;
    height: auto;
    min-height: 48px;
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr) auto;
    gap: 8px;
    padding: 5px 4px;
    border: 1px solid transparent;
    border-radius: 9px;
    color: var(--text-color);
    background: transparent;
    text-align: left;
  }

  .organize-dashboard-pending-mobile__row > span:nth-child(2) {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .organize-dashboard-pending-mobile__row strong {
    overflow: hidden;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .organize-dashboard-pending-mobile__row small,
  .organize-dashboard-pending-mobile__row > span:last-child {
    color: var(--desc-color);
    font-size: 11px;
  }

  .organize-dashboard-pending-mobile__row > span:last-child {
    color: var(--primary-color);
  }

  .organize-dashboard-resource {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 9px;
  }

  .organize-dashboard-resource > span:last-child,
  .organize-dashboard-compact-row__copy strong,
  .organize-dashboard-health-row__copy strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .organize-dashboard-resource__icon,
  .organize-dashboard-title-icon {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    border: 1px solid var(--surface-border-color);
    border-radius: 8px;
    color: var(--resource-bookmark-color, var(--primary-color));
    background: var(--workspace-panel-bg-color);
  }

  .organize-dashboard-resource__icon.is-note {
    color: var(--resource-note-color, #00a884);
  }

  .organize-dashboard-resource__icon.is-file {
    color: var(--resource-file-color, #ff8a00);
  }

  .organize-dashboard-title-icon.is-untagged {
    color: var(--resource-tag-color, #ec4899);
  }

  .organize-dashboard-title-icon.is-duplicate {
    color: var(--resource-bookmark-color, var(--primary-color));
  }

  .organize-dashboard-title-icon.is-health {
    color: var(--danger-color, #fe2c55);
  }

  .organize-dashboard-table__type,
  .organize-dashboard-table__time {
    color: var(--desc-color);
  }

  .organize-dashboard__preview-grid {
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }

  .organize-dashboard-preview--health {
    grid-column: 1 / -1;
  }

  .organize-dashboard-compact-list,
  .organize-dashboard-health-list,
  .organize-dashboard-legend,
  .organize-dashboard-bars {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .organize-dashboard-compact-list {
    padding: 5px 12px 9px;
  }

  .organize-dashboard-compact-row.b_btn,
  .organize-dashboard-health-row.b_btn {
    width: 100%;
    height: auto;
    min-height: 44px;
    padding: 5px 4px;
    border: 1px solid transparent;
    border-radius: 9px;
    color: var(--text-color);
    background: transparent;
    text-align: left;
    white-space: normal;
    transition:
      color 0.16s ease,
      border-color 0.16s ease,
      background-color 0.16s ease;
  }

  .organize-dashboard-compact-row.b_btn {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr) auto;
    gap: 8px;
  }

  .organize-dashboard-compact-row.b_btn:hover,
  .organize-dashboard-compact-row.b_btn:focus-visible,
  .organize-dashboard-health-row.b_btn:hover,
  .organize-dashboard-health-row.b_btn:focus-visible {
    border-color: var(--surface-border-color);
    color: var(--primary-color);
    background: var(--workspace-panel-bg-color);
  }

  .organize-dashboard-compact-row__copy,
  .organize-dashboard-health-row__copy {
    min-width: 0;
    display: grid;
    gap: 1px;
  }

  .organize-dashboard-compact-row__copy strong,
  .organize-dashboard-health-row__copy strong {
    font-size: 12px;
    font-weight: 600;
  }

  .organize-dashboard-compact-row__copy small,
  .organize-dashboard-health-row__copy small,
  .organize-dashboard-compact-row__meta {
    color: var(--desc-color);
    font-size: 11px;
  }

  .organize-dashboard-compact-row__badge {
    min-width: 23px;
    padding: 1px 6px;
    border-radius: 999px;
    color: var(--primary-color);
    background: var(--workspace-panel-bg-color);
    font-size: 11px;
    text-align: center;
  }

  .organize-dashboard-aside-title {
    min-width: 0;
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr);
    align-items: start;
    gap: 8px;
    color: var(--primary-color);
  }

  .organize-dashboard-chart :deep(.organize-donut-chart) {
    grid-template-columns: 112px minmax(0, 1fr);
    gap: 12px;
    margin-top: 14px;
  }

  .organize-dashboard-chart :deep(.organize-donut-chart__visual) {
    width: 112px;
  }

  .organize-dashboard-chart :deep(.organize-donut-chart__legend) {
    gap: 7px;
  }

  .organize-dashboard-chart :deep(.organize-donut-chart__legend-item) {
    grid-template-columns: 8px minmax(0, 1fr) auto minmax(36px, auto);
    gap: 6px;
    font-size: 11px;
  }

  .organize-dashboard-health__coverage {
    display: grid;
    gap: 8px;
    margin-top: 14px;
  }

  .organize-dashboard-health__coverage > div {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    color: var(--desc-color);
    font-size: 12px;
  }

  .organize-dashboard-health__coverage strong {
    color: var(--text-color);
  }

  .organize-dashboard-health__stack {
    height: 7px;
    display: flex;
    margin-top: 14px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--surface-divider-color);
  }

  .organize-dashboard-health__stack > span {
    min-width: 0;
    height: 100%;
  }

  .organize-dashboard-health__stack .is-normal,
  .organize-dashboard-legend__dot.is-normal {
    background: var(--success-color, #20a464);
  }

  .organize-dashboard-health__stack .is-user_normal,
  .organize-dashboard-legend__dot.is-user_normal {
    background: var(--primary-color);
  }

  .organize-dashboard-health__stack .is-suspect,
  .organize-dashboard-legend__dot.is-suspect {
    background: var(--danger-color, #fe2c55);
  }

  .organize-dashboard-health__stack .is-unknown,
  .organize-dashboard-legend__dot.is-unknown {
    background: var(--warning-color, #f59e0b);
  }

  .organize-dashboard-health__stack .is-unchecked,
  .organize-dashboard-legend__dot.is-unchecked {
    background: var(--desc-color);
  }

  .organize-dashboard-legend {
    display: grid;
    gap: 7px;
    margin-top: 12px;
  }

  .organize-dashboard-legend li {
    min-width: 0;
    display: grid;
    grid-template-columns: 8px minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    color: var(--desc-color);
    font-size: 12px;
  }

  .organize-dashboard-legend__dot {
    width: 7px;
    height: 7px;
    border-radius: 999px;
  }

  .organize-dashboard-legend strong {
    color: var(--text-color);
  }

  .organize-dashboard-health-list.is-main-preview {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 4px 10px;
    padding: 5px 12px 9px;
  }

  .organize-dashboard-health-row.b_btn {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
  }

  .organize-dashboard-bars {
    display: grid;
    gap: 12px;
    margin-top: 15px;
  }

  .organize-dashboard-bars li {
    display: grid;
    gap: 6px;
  }

  .organize-dashboard-bars li > div {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    color: var(--desc-color);
    font-size: 12px;
  }

  .organize-dashboard-bars strong {
    color: var(--text-color);
  }

  .organize-dashboard-bars__track {
    height: 6px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--surface-divider-color);
  }

  .organize-dashboard-bars__track > span {
    height: 100%;
    display: block;
    border-radius: inherit;
    background: var(--primary-color);
  }

  .organize-dashboard-bars__track > .is-untagged {
    background: var(--resource-tag-color, #ec4899);
  }

  .organize-dashboard-bars__track > .is-health {
    background: var(--danger-color, #fe2c55);
  }

  .organize-dashboard-updated {
    display: block;
    margin-top: 14px;
    color: var(--desc-color);
    font-size: 11px;
  }

  .organize-dashboard-state {
    min-height: 84px;
    display: grid;
    place-items: center;
    padding: 14px;
    box-sizing: border-box;
    color: var(--desc-color);
    font-size: 12px;
    text-align: center;
  }

  .organize-dashboard-state.is-error,
  .organize-dashboard-warning {
    color: var(--danger-color, #fe2c55);
  }

  .organize-dashboard-warning {
    padding: 9px 12px;
    border: 1px solid var(--danger-color, #fe2c55);
    border-radius: 10px;
    background: var(--card-background);
    font-size: 12px;
  }

  @media (max-width: 1180px) {
    .organize-dashboard__grid {
      grid-template-columns: 1fr;
    }

    .organize-dashboard__aside {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: start;
    }
  }

  @media (max-width: 900px) and (min-width: 768px) {
    .organize-dashboard__metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .organize-dashboard-table {
      display: none;
    }

    .organize-dashboard-pending-mobile {
      display: block;
    }
  }

  @media (max-width: 820px) and (min-width: 768px) {
    .organize-dashboard__aside {
      grid-template-columns: 1fr;
    }

    .organize-dashboard__preview-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 767px) {
    .organize-dashboard {
      gap: 10px;
    }

    .organize-dashboard__metrics {
      display: none;
    }

    .organize-dashboard__grid,
    .organize-dashboard__main,
    .organize-dashboard__aside,
    .organize-dashboard__preview-grid {
      grid-template-columns: 1fr;
      gap: 10px;
    }

    .organize-dashboard-card__header {
      min-height: 66px;
      padding: 11px 12px 9px;
    }

    .organize-dashboard-table {
      display: none;
    }

    .organize-dashboard-pending-mobile {
      display: block;
    }

    .organize-dashboard-row-action.b_btn,
    .organize-dashboard-card__more.b_btn {
      min-height: 44px;
    }

    .organize-dashboard-chart :deep(.organize-donut-chart__visual) {
      display: none;
    }

    .organize-dashboard-chart :deep(.organize-donut-chart) {
      grid-template-columns: 1fr;
    }

    .organize-dashboard-health-list.is-main-preview {
      grid-template-columns: 1fr;
    }
  }

  :global(html.light-note-mobile-rendering .organize-dashboard-card),
  :global(html.light-note-mobile-rendering .organize-dashboard-metric),
  :global(html.light-note-mobile-rendering .organize-dashboard-compact-row),
  :global(html.light-note-mobile-rendering .organize-dashboard-health-row) {
    box-shadow: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .organize-dashboard-metric.b_btn,
    .organize-dashboard-compact-row.b_btn,
    .organize-dashboard-health-row.b_btn {
      transition: none;
    }
  }
</style>
