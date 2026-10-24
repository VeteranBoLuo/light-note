<template>
  <div class="ledger" :class="{ 'is-settings': settingsLayout }">
    <div class="ledger-head">
      <h3>{{ t('growth.pointsLogTitle') }}</h3>
      <p>{{ t('growth.pointsLedgerSubtitle') }}</p>
    </div>
    <BTabs
      v-model:active-tab="filter"
      v-click-log="{ module: '成长', operation: '筛选积分明细' }"
      variant="pill"
      :options="filterOptions"
      @select="handleFilterSelect"
    />
    <div v-if="settingsLayout && rows.length" class="ledger-columns" aria-hidden="true">
      <span>{{ t('growth.pointsLedgerEvent') }}</span
      ><span>{{ t('settingsRefine.ledger.source') }}</span> <span>{{ t('settingsRefine.ledger.time') }}</span
      ><span>{{ t('growth.pointsLedgerChange') }}</span
      ><span></span>
    </div>
    <div v-if="(loading || !initialized) && !rows.length" class="ledger-loading"><BLoading inline loading /></div>
    <div v-else-if="loadError && !rows.length" class="ledger-empty">
      <span>{{ t('growth.pointsLogFailed') }}</span
      ><BButton @click="reload">{{ t('common.retry') }}</BButton>
    </div>
    <div v-else-if="!rows.length" class="ledger-empty">{{ t('growth.pointsLogEmpty') }}</div>
    <BVirtualList
      v-else
      :key="filter"
      class="ledger-list"
      :items="rows"
      :item-height="64"
      dynamic-height
      scroll-mode="ancestor"
      :loading="loading"
      :has-more="hasMore && !loadError"
      :loading-text="t('common.loading')"
      @load-more="loadMore"
    >
      <template #default="{ item: row }">
        <component
          :is="settingsLayout ? BButton : 'div'"
          class="ledger-row"
          @click="settingsLayout && (selected = row)"
        >
          <div class="ledger-main">
            <SvgIcon v-if="settingsLayout" class="ledger-icon" :src="icon.growth.coin" size="20" aria-hidden="true" />
            <b>{{ labelOf(row.reason) }}</b>
            <span
              >{{ sourceOf(row)
              }}<span :class="{ 'ledger-time-inline': settingsLayout }">
                {{ sourceOf(row) ? ' · ' : '' }}{{ fmtTime(row.createTime || row.create_time || '') }}</span
              ></span
            >
          </div>
          <span v-if="settingsLayout" class="ledger-source">{{ sourceOf(row) || '—' }}</span>
          <time v-if="settingsLayout" class="ledger-time">{{ fmtTime(row.createTime || row.create_time || '') }}</time>
          <strong :class="row.delta > 0 || row.assetChange ? 'up' : row.delta < 0 ? 'down' : 'flat'">
            {{ amountOf(row) }}
          </strong>
          <SvgIcon v-if="settingsLayout" class="ledger-chevron" :src="icon.arrow_right" size="14" aria-hidden="true" />
        </component>
      </template>
    </BVirtualList>
    <p v-if="loadError && rows.length" role="alert" class="ledger-page-error"
      >{{ t('growth.pointsLogFailed') }} <BButton @click="loadMore">{{ t('common.retry') }}</BButton></p
    >
    <span v-if="rows.length && !hasMore && !loadError" class="ledger-all">{{ t('growth.pointsLogAll') }}</span>
    <BModal
      v-if="settingsLayout"
      :visible="Boolean(selected)"
      :title="t('settingsRefine.ledger.detail')"
      width="var(--ui-layout-460, 460px)"
      :show-footer="false"
      @close="selected = null"
    >
      <dl v-if="selected" class="ledger-detail">
        <dt>{{ t('settingsRefine.ledger.source') }}</dt
        ><dd>{{ [labelOf(selected.reason), sourceOf(selected)].filter(Boolean).join(' · ') }}</dd>
        <dt>{{ t('settingsRefine.ledger.time') }}</dt
        ><dd>{{ fmtTime(selected.createTime || selected.create_time || '') }}</dd>
        <dt>{{ t('settingsRefine.ledger.change') }}</dt
        ><dd>{{ amountOf(selected) }}</dd>
      </dl>
    </BModal>
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import growthApi from '@/api/growthApi.ts';
  import { describeLedgerSource } from '@/utils/pointsLedgerSource';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BVirtualList from '@/components/base/BasicComponents/BVirtualList.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { formatGrowthAssetChange, type GrowthAssetChange } from '@/utils/growthAssetChange.ts';

  interface LogRow {
    id: number;
    delta: number;
    reason: string;
    createTime?: string;
    create_time?: string;
    sourceType?: string;
    sourceKey?: string | null;
    sourceName?: { zh?: string; en?: string } | null;
    meta?: { required?: number; challengeKey?: string; achievementKey?: string } | null;
    assetChange?: GrowthAssetChange | null;
  }
  withDefaults(defineProps<{ settingsLayout?: boolean }>(), { settingsLayout: false });
  const { t, te, locale } = useI18n();
  const rows = ref<LogRow[]>([]);
  const selected = ref<LogRow | null>(null);
  const loading = ref(false);
  const initialized = ref(false);
  const loadError = ref(false);
  const cursor = ref<string | null>(null);
  const hasMore = ref(false);
  type PointsFilter = 'all' | 'earned' | 'spent' | 'lottery' | 'system';
  const filter = ref<PointsFilter>('all');
  const PAGE = 30;
  const filterOptions = computed(() => [
    { key: 'all', label: t('growth.pointsFilterAll') },
    { key: 'earned', label: t('growth.pointsFilterEarned') },
    { key: 'spent', label: t('growth.pointsFilterSpent') },
    { key: 'lottery', label: t('growth.pointsFilterLottery') },
    { key: 'system', label: t('growth.pointsFilterSystem') },
  ]);

  function baseReason(reason: string) {
    return reason.startsWith('storage:') ? 'storage' : reason;
  }
  function labelOf(reason: string) {
    const key = `growth.pointsReason.${baseReason(reason)}`;
    return te(key) ? t(key) : reason;
  }
  function sourceOf(row: LogRow) {
    return describeLedgerSource(row, t, te, String(locale.value));
  }

  function amountOf(row: LogRow) {
    if (row.delta > 0) return `+${row.delta}`;
    if (row.delta < 0) return String(row.delta);
    return row.assetChange ? formatGrowthAssetChange(row.assetChange, String(locale.value)) : '0';
  }
  function fmtTime(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value || '';
    return date.toLocaleString(locale.value, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  let requestGeneration = 0;
  onBeforeUnmount(() => {
    requestGeneration++;
  });
  async function fetchPage(reset = false) {
    if (loading.value && !reset) return;
    const generation = ++requestGeneration;
    loading.value = true;
    loadError.value = false;
    try {
      const response = await growthApi.getPointsLog(PAGE, {
        cursor: reset ? null : cursor.value,
        filter: filter.value,
      });
      if (generation !== requestGeneration) return;
      if (response?.status !== 200 || !Array.isArray(response.data?.rows)) throw new Error('POINTS_LOG_FAILED');
      if (response?.status === 200 && response.data) {
        const list = (response.data.rows || []) as LogRow[];
        rows.value = [...new Map((reset ? list : [...rows.value, ...list]).map((row) => [row.id, row])).values()];
        cursor.value = response.data.nextCursor || null;
        hasMore.value = Boolean(response.data.hasMore);
      }
    } catch (error) {
      if (generation !== requestGeneration) return;
      loadError.value = true;
    } finally {
      if (generation === requestGeneration) {
        loading.value = false;
        initialized.value = true;
      }
    }
  }
  function loadMore() {
    if (!hasMore.value || loading.value) return;
    void fetchPage(false);
  }
  function reload() {
    selected.value = null;
    rows.value = [];
    cursor.value = null;
    hasMore.value = false;
    void fetchPage(true);
  }
  function handleFilterSelect(value: string) {
    if (['all', 'earned', 'spent', 'lottery', 'system'].includes(value)) {
      filter.value = value as PointsFilter;
    }
    reload();
  }
  onMounted(() => void fetchPage(true));
</script>

<style scoped lang="less">
  .ledger {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-12, 12px);
  }
  .ledger :deep(.tab-container) {
    min-width: 0;
    max-width: 100%;
    overflow-x: auto;
  }
  .ledger :deep(.tab) {
    flex-shrink: 0;
  }
  .ledger :deep(.tab.is-active) {
    color: var(--workspace-purple-text);
  }
  .ledger-head h3 {
    margin: 0;
    font-size: var(--ui-font-16, 16px);
  }
  .ledger-head p {
    margin: var(--ui-space-4, 4px) 0 0;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .ledger-list {
    width: 100%;
  }
  .ledger-row {
    display: flex;
    align-items: center;
    gap: var(--ui-space-12, 12px);
    padding: var(--ui-space-10, 10px) var(--ui-space-4, 4px);
    border-bottom: 1px solid var(--card-border-color);
  }
  .ledger-main {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
    flex-direction: column;
    gap: var(--ui-space-2, 2px);
  }
  .ledger-main b {
    font-size: var(--ui-font-13, 13px);
  }
  .ledger-main > span {
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
  }
  .ledger-row strong {
    font-variant-numeric: tabular-nums;
  }
  .up {
    color: var(--success-color);
  }
  .down {
    color: var(--danger-color);
  }
  .flat,
  .ledger-all,
  .ledger-empty {
    color: var(--desc-color);
  }
  .ledger-loading {
    display: grid;
    min-height: var(--ui-layout-150, 150px);
    place-items: center;
  }
  .ledger-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--ui-space-8, 8px);
  }
  .ledger-all,
  .ledger-empty {
    align-self: center;
    padding: var(--ui-space-16, 16px);
    font-size: var(--ui-font-12, 12px);
  }
  .ledger-detail {
    display: grid;
    gap: var(--ui-space-12, 12px);
  }
  .ledger-detail dt {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .ledger-detail dd {
    margin: 0 0 var(--ui-space-12, 12px);
    overflow-wrap: anywhere;
  }
  .ledger.is-settings {
    gap: var(--ui-space-12, 12px);
    .ledger-head {
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: var(--ui-space-6, 6px) var(--ui-space-12, 12px);
    }
    .ledger-head h3 {
      font-size: var(--ui-font-16, 16px);
    }
    .ledger-head p {
      font-size: var(--ui-font-13, 13px);
    }
    .ledger-row {
      width: 100%;
      height: auto;
      border-radius: 0;
      text-align: left;
      white-space: normal;
      background: transparent;
      line-height: 1.6;
      padding: var(--ui-space-14, 14px) var(--ui-space-8, 8px);
      min-height: var(--ui-layout-64, 64px);
      display: grid;
      grid-template-columns:
        minmax(0, 1.1fr) minmax(0, 0.9fr) minmax(var(--ui-layout-140, 140px), 1fr) minmax(
          var(--ui-layout-80, 80px),
          0.5fr
        )
        auto;
      border-inline: 1px solid var(--workspace-border);
      &:hover {
        background: var(--workspace-hover);
      }
      &:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: -2px;
      }
    }
    .ledger-main {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: var(--ui-space-4, 4px) var(--ui-space-10, 10px);
      align-items: center;
    }
    .ledger-main b {
      font-size: var(--ui-font-14, 14px);
    }
    .ledger-main > span {
      display: none;
      grid-column: 2;
      font-size: var(--ui-font-12, 12px);
    }
    .ledger-row > strong {
      text-align: right;
      overflow-wrap: anywhere;
    }
    .ledger-time {
      color: var(--desc-color);
      font-size: var(--ui-font-12, 12px);
    }
    .ledger-source {
      color: var(--desc-color);
      font-size: var(--ui-font-12, 12px);
      overflow-wrap: anywhere;
    }
    .ledger-icon {
      grid-column: 1;
      grid-row: 1 / span 2;
      color: var(--primary-color);
    }
    .ledger-chevron {
      color: var(--desc-color);
    }
    .down {
      color: var(--text-color);
    }
    .ledger-columns {
      display: grid;
      grid-template-columns:
        minmax(0, 1.1fr) minmax(0, 0.9fr) minmax(var(--ui-layout-140, 140px), 1fr) minmax(
          var(--ui-layout-80, 80px),
          0.5fr
        )
        var(--ui-layout-14, 14px);
      gap: var(--ui-space-12, 12px);
      padding: var(--ui-space-12, 12px) var(--ui-space-8, 8px);
      margin-bottom: calc(-1 * var(--ui-space-12, 12px));
      border: 1px solid var(--workspace-border);
      border-bottom: none;
      border-radius: 10px 10px 0 0;
      background: var(--workspace-content);
      color: var(--desc-color);
      font-size: var(--ui-font-12, 12px);
      > span:nth-child(4) {
        text-align: right;
      }
    }
    .ledger-time-inline {
      display: none;
    }
    .ledger-page-error {
      color: var(--danger-color);
    }
  }
  @media (max-width: 767px) {
    .ledger.is-settings {
      .ledger-head {
        display: none;
      }
      .ledger-row {
        grid-template-columns: minmax(0, 1fr) auto auto;
        padding: var(--ui-space-14, 14px) 0;
        border-inline: none;
      }
      .ledger-time,
      .ledger-source,
      .ledger-columns {
        display: none;
      }
      .ledger-main > span {
        display: block;
      }
      .ledger-time-inline {
        display: inline;
      }
    }
  }
</style>
