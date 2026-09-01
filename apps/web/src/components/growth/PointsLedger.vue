<template>
  <div class="ledger">
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
    <div v-if="(loading || !initialized) && !rows.length" class="ledger-loading"><BLoading size="small" /></div>
    <div v-else-if="loadError && !rows.length" class="ledger-empty">
      <span>{{ t('growth.pointsLogFailed') }}</span
      ><BButton size="small" @click="reload">{{ t('common.retry') }}</BButton>
    </div>
    <div v-else-if="!rows.length" class="ledger-empty">{{ t('growth.pointsLogEmpty') }}</div>
    <div v-else class="ledger-list">
      <div v-for="row in rows" :key="row.id" class="ledger-row">
        <div class="ledger-main">
          <b>{{ labelOf(row.reason) }}</b>
          <span>{{ sourceOf(row) }} · {{ fmtTime(row.createTime || row.create_time || '') }}</span>
        </div>
        <strong :class="row.delta > 0 || row.assetChange ? 'up' : row.delta < 0 ? 'down' : 'flat'">
          {{ amountOf(row) }}
        </strong>
      </div>
    </div>
    <BButton v-if="hasMore" class="ledger-more" :loading="loading" @click="loadMore">
      {{ t('growth.pointsLogMore') }}
    </BButton>
    <span v-else-if="rows.length" class="ledger-all">{{ t('growth.pointsLogAll') }}</span>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import growthApi from '@/api/growthApi.ts';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import { formatGrowthAssetChange, type GrowthAssetChange } from '@/utils/growthAssetChange.ts';

  interface LogRow {
    id: number;
    delta: number;
    reason: string;
    createTime?: string;
    create_time?: string;
    sourceType?: string;
    sourceKey?: string | null;
    assetChange?: GrowthAssetChange | null;
  }
  const { t, te, locale } = useI18n();
  const rows = ref<LogRow[]>([]);
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
    const sourceType = row.sourceType || baseReason(row.reason);
    const sourceKey = row.sourceKey || '';
    const specificKey = sourceKey ? `growth.pointsSource.${sourceKey}` : '';
    if (specificKey && te(specificKey)) return t(specificKey);
    const typeKey = `growth.pointsSourceType.${sourceType}`;
    return te(typeKey) ? t(typeKey) : labelOf(row.reason);
  }
  function amountOf(row: LogRow) {
    if (row.delta > 0) return `+${row.delta}`;
    if (row.delta < 0) return String(row.delta);
    return row.assetChange ? formatGrowthAssetChange(row.assetChange, String(locale.value)) : '·';
  }
  function fmtTime(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value || '';
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  async function fetchPage(reset = false) {
    if (loading.value) return;
    loading.value = true;
    loadError.value = false;
    try {
      const response = await growthApi.getPointsLog(PAGE, {
        cursor: reset ? null : cursor.value,
        filter: filter.value,
      });
      if (response?.status === 200 && response.data) {
        const list = (response.data.rows || []) as LogRow[];
        rows.value = reset ? list : [...rows.value, ...list];
        cursor.value = response.data.nextCursor || null;
        hasMore.value = Boolean(response.data.hasMore);
      }
    } catch (error) {
      console.warn('加载积分明细失败:', error);
      loadError.value = true;
    } finally {
      loading.value = false;
      initialized.value = true;
    }
  }
  function loadMore() {
    void fetchPage(false);
  }
  function reload() {
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
    gap: 12px;
  }
  .ledger-head h3 {
    margin: 0;
    font-size: 16px;
  }
  .ledger-head p {
    margin: 4px 0 0;
    color: var(--desc-color);
    font-size: 12px;
  }
  .ledger-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px 18px;
  }
  .ledger-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 4px;
    border-bottom: 1px solid var(--card-border-color);
  }
  .ledger-main {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
    flex-direction: column;
    gap: 2px;
  }
  .ledger-main b {
    font-size: 13px;
  }
  .ledger-main span {
    color: var(--desc-color);
    font-size: 11px;
  }
  .ledger-row strong {
    font-variant-numeric: tabular-nums;
  }
  .up {
    color: #16803a;
  }
  .down {
    color: #c23232;
  }
  .flat,
  .ledger-all,
  .ledger-empty {
    color: var(--desc-color);
  }
  .ledger-loading {
    display: grid;
    min-height: 150px;
    place-items: center;
  }
  .ledger-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
  .ledger-more {
    align-self: center;
    min-height: 34px !important;
    padding: 0 18px !important;
  }
  .ledger-all,
  .ledger-empty {
    align-self: center;
    padding: 16px;
    font-size: 12px;
  }
  @media (max-width: 640px) {
    .ledger-list {
      grid-template-columns: 1fr;
    }
  }
</style>
