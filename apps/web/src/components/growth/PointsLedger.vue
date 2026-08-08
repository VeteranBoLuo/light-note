<template>
  <div class="ledger">
    <div class="ledger-head">
      <h3>{{ t('growth.pointsLogTitle') }}</h3>
      <p>{{ t('growth.pointsLedgerSubtitle') }}</p>
    </div>
    <div v-if="!loading && !rows.length" class="ledger-empty">{{ t('growth.pointsLogEmpty') }}</div>
    <div v-else class="ledger-list">
      <div v-for="(row, index) in rows" :key="`${row.create_time}-${index}`" class="ledger-row">
        <div class="ledger-main">
          <b>{{ labelOf(row.reason) }}</b>
          <span>{{ fmtTime(row.create_time) }}</span>
        </div>
        <strong :class="row.delta > 0 ? 'up' : row.delta < 0 ? 'down' : 'flat'">
          {{ row.delta > 0 ? `+${row.delta}` : row.delta < 0 ? row.delta : '·' }}
        </strong>
      </div>
    </div>
    <BButton v-if="rows.length < total" class="ledger-more" :loading="loading" @click="loadMore">
      {{ t('growth.pointsLogMore') }}
    </BButton>
    <span v-else-if="rows.length" class="ledger-all">{{ t('growth.pointsLogAll') }}</span>
  </div>
</template>

<script setup lang="ts">
  import { onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import growthApi from '@/api/growthApi.ts';
  import BButton from '@/components/base/BasicComponents/BButton.vue';

  interface LogRow {
    delta: number;
    reason: string;
    create_time: string;
  }
  const { t, te } = useI18n();
  const rows = ref<LogRow[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const PAGE = 30;

  function baseReason(reason: string) {
    return reason.startsWith('storage:') ? 'storage' : reason;
  }
  function labelOf(reason: string) {
    const key = `growth.pointsReason.${baseReason(reason)}`;
    return te(key) ? t(key) : reason;
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
    try {
      const response = await growthApi.getPointsLog(PAGE, reset ? 0 : rows.value.length);
      if (response?.status === 200 && response.data) {
        const list = (response.data.rows || []) as LogRow[];
        rows.value = reset ? list : [...rows.value, ...list];
        total.value = Number(response.data.total || 0);
      }
    } catch (error) {
      console.warn('加载积分明细失败:', error);
    } finally {
      loading.value = false;
    }
  }
  function loadMore() {
    void fetchPage(false);
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
