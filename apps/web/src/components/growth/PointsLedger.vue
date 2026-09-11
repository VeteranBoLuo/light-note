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
    <div v-if="(loading || !initialized) && !rows.length" class="ledger-loading"><BLoading inline loading /></div>
    <div v-else-if="loadError && !rows.length" class="ledger-empty">
      <span>{{ t('growth.pointsLogFailed') }}</span
      ><BButton size="small" @click="reload">{{ t('common.retry') }}</BButton>
    </div>
    <div v-else-if="!rows.length" class="ledger-empty">{{ t('growth.pointsLogEmpty') }}</div>
    <div v-else class="ledger-list">
      <component
        :is="settingsLayout ? BButton : 'div'"
        v-for="row in rows"
        :key="row.id"
        class="ledger-row"
        @click="settingsLayout && (selected = row)"
      >
        <div class="ledger-main">
          <b>{{ labelOf(row.reason) }}</b>
          <span
            >{{ sourceOf(row)
            }}<span :class="{ 'ledger-time-inline': settingsLayout }">
              · {{ fmtTime(row.createTime || row.create_time || '') }}</span
            ></span
          >
        </div>
        <time v-if="settingsLayout" class="ledger-time">{{ fmtTime(row.createTime || row.create_time || '') }}</time>
        <strong :class="row.delta > 0 || row.assetChange ? 'up' : row.delta < 0 ? 'down' : 'flat'">
          {{ amountOf(row) }}
        </strong>
      </component>
    </div>
    <p v-if="loadError && rows.length" role="alert" class="ledger-page-error"
      >{{ t('growth.pointsLogFailed') }} <BButton size="small" @click="loadMore">{{ t('common.retry') }}</BButton></p
    >
    <BButton v-if="hasMore && !loadError" class="ledger-more" :loading="loading" @click="loadMore">
      {{ t('growth.pointsLogMore') }}
    </BButton>
    <span v-else-if="rows.length && !loadError" class="ledger-all">{{ t('growth.pointsLogAll') }}</span>
    <BModal
      v-if="settingsLayout"
      :visible="Boolean(selected)"
      :title="t('settingsRefine.ledger.detail')"
      width="460px"
      :show-footer="false"
      @close="selected = null"
    >
      <dl v-if="selected" class="ledger-detail">
        <dt>{{ t('settingsRefine.ledger.source') }}</dt
        ><dd>{{ labelOf(selected.reason) }} · {{ sourceOf(selected) }}</dd>
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
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
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
      if (response?.status !== 200 || !response.data) throw new Error('POINTS_LOG_FAILED');
      if (response?.status === 200 && response.data) {
        const list = (response.data.rows || []) as LogRow[];
        rows.value = reset ? list : [...rows.value, ...list];
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
  .ledger-detail {
    display: grid;
    gap: 12px;
  }
  .ledger-detail dt {
    color: var(--desc-color);
    font-size: 12px;
  }
  .ledger-detail dd {
    margin: 0 0 12px;
    overflow-wrap: anywhere;
  }
  .ledger.is-settings {
    gap: 18px;
    .ledger-head {
      border-bottom: 1px solid var(--card-border-color);
      padding-bottom: 18px;
    }
    .ledger-head h3 {
      font-size: 16px;
    }
    .ledger-head p {
      font-size: 13px;
    }
    .ledger-list {
      grid-template-columns: 1fr;
      gap: 0;
    }
    .ledger-row {
      width: 100%;
      height: auto;
      border-radius: 0;
      text-align: left;
      white-space: normal;
      background: transparent;
      line-height: 1.6;
      padding: 20px 0;
      min-height: 78px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(140px, 20%) minmax(80px, 15%);
    }
    .ledger-main {
      gap: 7px;
    }
    .ledger-main b {
      font-size: 14px;
    }
    .ledger-main span {
      font-size: 12px;
    }
    .ledger-row > strong {
      text-align: right;
      overflow-wrap: anywhere;
    }
    .ledger-time {
      color: var(--desc-color);
      font-size: 12px;
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
      .ledger-row {
        grid-template-columns: minmax(0, 1fr) auto;
      }
      .ledger-time {
        display: none;
      }
      .ledger-time-inline {
        display: inline;
      }
    }
  }
</style>
