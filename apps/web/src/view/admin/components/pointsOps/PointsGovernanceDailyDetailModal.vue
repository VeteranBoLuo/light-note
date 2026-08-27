<template>
  <BModal
    v-model:visible="visible"
    :title="t('adminPointsGovernance.dailyDetail.title', { day: summary?.day || '' })"
    :show-footer="false"
    width="min(960px, 94vw)"
    height="min(720px, 86vh)"
    content-class="points-daily-detail-modal__content"
    fullscreen-mobile
  >
    <div class="points-daily-detail">
      <header v-if="summary" class="points-daily-detail__summary">
        <div>
          <strong>{{ summary.day }}</strong>
          <span>{{ t('adminPointsGovernance.dailyDetail.hint') }}</span>
        </div>
        <div class="points-daily-detail__metrics" role="list">
          <span class="is-issued" role="listitem">
            {{ t('adminPointsGovernance.issued') }} <b>+{{ formatNumber(summary.issued) }}</b>
          </span>
          <span class="is-spent" role="listitem">
            {{ t('adminPointsGovernance.spent') }} <b>-{{ formatNumber(summary.spent) }}</b>
          </span>
          <span class="is-net" role="listitem">
            {{ t('adminPointsGovernance.net') }} <b>{{ formatSigned(summary.net) }}</b>
          </span>
        </div>
      </header>

      <div v-if="errorState === 'initial'" class="points-daily-detail__state is-error" role="alert">
        <strong>{{ t('adminPointsGovernance.dailyDetail.loadFailed') }}</strong>
        <span>{{ t('adminPointsGovernance.dailyDetail.loadFailedHint') }}</span>
        <BButton size="small" :loading="loading" @click="retryInitial">
          {{ t('adminPointsGovernance.retry') }}
        </BButton>
      </div>

      <div
        v-else-if="!loading && !tableRows.length"
        class="points-daily-detail__state"
        role="status"
        aria-live="polite"
      >
        <strong>{{ t('adminPointsGovernance.dailyDetail.empty') }}</strong>
        <span>{{ t('adminPointsGovernance.dailyDetail.emptyHint') }}</span>
      </div>

      <BTable
        v-else
        ref="tableRef"
        class="points-daily-detail__table"
        :data="tableRows"
        :columns="columns"
        row-key="id"
        fill
        virtual
        :row-height="rowHeight"
        :overscan="8"
        :loading="loading"
        :loading-text="t('adminPointsGovernance.dailyDetail.loading')"
        :has-more="canAutoLoad"
        row-clickable
        @load-more="loadNext"
        @row-click="openUser"
      >
        <template #bodyCell="{ record, column }">
          <BButton
            v-if="column.key === 'user'"
            class="points-daily-detail__user"
            :aria-label="t('adminPointsGovernance.dailyDetail.openUser', { name: record.userLabel })"
            @click.stop="openUser(record)"
          >
            <strong>{{ record.userLabel }}</strong>
            <small v-if="record.userSecondary">{{ record.userSecondary }}</small>
          </BButton>

          <strong
            v-else-if="column.key === 'deltaLabel'"
            class="points-daily-detail__delta"
            :class="record.delta > 0 ? 'is-issued' : record.delta < 0 ? 'is-spent' : 'is-zero'"
          >
            {{ record.deltaLabel }}
          </strong>

          <span v-else-if="column.key === 'behavior'" class="points-daily-detail__behavior">
            <strong>{{ record.source.title }}</strong>
            <small v-if="record.source.detail">{{ record.source.detail }}</small>
          </span>

          <time
            v-else-if="column.key === 'timeLabel'"
            class="points-daily-detail__time"
            :datetime="record.createTime.replace(' ', 'T')"
          >
            {{ record.timeLabel }}
          </time>

          <span v-else-if="column.key === 'activity'" class="points-daily-detail__activity">
            <span>
              <strong
                class="points-daily-detail__delta"
                :class="record.delta > 0 ? 'is-issued' : record.delta < 0 ? 'is-spent' : 'is-zero'"
              >
                {{ record.deltaLabel }}
              </strong>
              <b>{{ record.source.title }}</b>
            </span>
            <small>
              <template v-if="record.source.detail">{{ record.source.detail }} · </template>
              <time :datetime="record.createTime.replace(' ', 'T')">{{ record.timeLabel }}</time>
            </small>
          </span>
        </template>
      </BTable>

      <footer v-if="tableRows.length" class="points-daily-detail__footer" aria-live="polite">
        <template v-if="errorState === 'append'">
          <span role="alert">{{ t('adminPointsGovernance.dailyDetail.appendFailed') }}</span>
          <BButton size="small" :loading="loading" @click="retryAppend">
            {{ t('adminPointsGovernance.retry') }}
          </BButton>
        </template>
        <span v-else-if="loading">{{ t('adminPointsGovernance.dailyDetail.loading') }}</span>
        <span v-else-if="canAutoLoad">{{ t('adminPointsGovernance.dailyDetail.autoLoadHint') }}</span>
        <span v-else>{{ t('adminPointsGovernance.dailyDetail.complete', { count: tableRows.length }) }}</span>
      </footer>
    </div>
  </BModal>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import growthApi, {
    type PointsGovernanceDailyDetailRow,
    type PointsGovernanceDailyDetailUser,
    type PointsGovernanceDailyDetailsResponse,
  } from '@/api/growthApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import { useMobileLayout } from '@/composables/useMobileLayout';
  import { describePointsLogSource } from './pointsLogSource';
  import type { PointsGovernanceTrendPoint } from './pointsGovernanceTrend';

  interface DisplayRow extends PointsGovernanceDailyDetailRow {
    userLabel: string;
    userSecondary: string;
    deltaLabel: string;
    timeLabel: string;
    source: ReturnType<typeof describePointsLogSource>;
  }

  const props = withDefaults(defineProps<{ summary: PointsGovernanceTrendPoint | null; hideInternal?: boolean }>(), {
    hideInternal: true,
  });
  const emit = defineEmits<{ 'select-user': [user: PointsGovernanceDailyDetailUser] }>();
  const visible = defineModel<boolean>('visible', { default: false });
  const { t, te } = useI18n();
  const isMobile = useMobileLayout();
  const tableRef = ref<{ scrollToTop?: () => void } | null>(null);
  const rows = ref<PointsGovernanceDailyDetailRow[]>([]);
  const nextCursor = ref<string | null>(null);
  const hasMore = ref(false);
  const loading = ref(false);
  const paginationBlocked = ref(false);
  const errorState = ref<'initial' | 'append' | ''>('');
  let requestSequence = 0;

  const columns = computed(() =>
    isMobile.value
      ? [
          {
            title: t('adminPointsGovernance.dailyDetail.user'),
            key: 'user',
            width: 'minmax(108px, 0.9fr)',
            ellipsis: false,
          },
          {
            title: t('adminPointsGovernance.dailyDetail.activity'),
            key: 'activity',
            width: 'minmax(164px, 1.4fr)',
            ellipsis: false,
          },
        ]
      : [
          {
            title: t('adminPointsGovernance.dailyDetail.user'),
            key: 'user',
            width: 'minmax(180px, 1fr)',
            ellipsis: false,
          },
          { title: t('adminPointsGovernance.dailyDetail.delta'), key: 'deltaLabel', width: '110px', ellipsis: false },
          {
            title: t('adminPointsGovernance.dailyDetail.behavior'),
            key: 'behavior',
            width: 'minmax(230px, 1.35fr)',
            ellipsis: false,
          },
          { title: t('adminPointsGovernance.dailyDetail.time'), key: 'timeLabel', width: '104px', ellipsis: false },
        ],
  );
  const rowHeight = computed(() => (isMobile.value ? 84 : 66));
  const canAutoLoad = computed(() => hasMore.value && !paginationBlocked.value);
  const tableRows = computed<DisplayRow[]>(() =>
    rows.value.map((row) => ({
      ...row,
      userLabel: row.user.alias || row.user.email || row.user.userId,
      userSecondary: row.user.alias ? row.user.email || row.user.userId : row.user.email ? row.user.userId : '',
      deltaLabel: formatSigned(row.delta),
      timeLabel: formatTime(row.createTime),
      source: describePointsLogSource(
        row,
        (key) => t(key),
        (key) => te(key),
      ),
    })),
  );

  function formatNumber(value: unknown) {
    return Number(value || 0).toLocaleString('zh-CN');
  }

  function formatSigned(value: unknown) {
    const number = Number(value || 0);
    return number > 0 ? `+${formatNumber(number)}` : formatNumber(number);
  }

  function formatTime(value: string) {
    const raw = String(value || '');
    return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw) ? raw.slice(11) : raw || '—';
  }

  watch(
    () => [visible.value === true, props.summary?.day || '', props.hideInternal] as const,
    ([isVisible, day]) => {
      if (!isVisible || !day) {
        requestSequence += 1;
        loading.value = false;
        return;
      }
      void resetAndLoad();
    },
    { immediate: true },
  );

  async function resetAndLoad() {
    const sequence = ++requestSequence;
    rows.value = [];
    nextCursor.value = null;
    hasMore.value = false;
    paginationBlocked.value = false;
    errorState.value = '';
    loading.value = false;
    tableRef.value?.scrollToTop?.();
    await loadPage({ reset: true, sequence });
  }

  async function loadPage({ reset, sequence = requestSequence }: { reset: boolean; sequence?: number }) {
    const day = props.summary?.day;
    if (!day || !visible.value || loading.value) return;
    const requestedCursor = reset ? null : nextCursor.value;
    loading.value = true;
    if (!reset) errorState.value = '';
    try {
      const result = await growthApi.adminPointsGovernanceDailyDetails({
        day,
        cursor: requestedCursor,
        limit: 50,
        hideInternal: props.hideInternal,
      });
      if (sequence !== requestSequence || !visible.value || props.summary?.day !== day) return;
      if (result.status !== 200) throw new Error(result.msg || 'daily detail request failed');
      const payload = result.data as PointsGovernanceDailyDetailsResponse;
      const pageRows = Array.isArray(payload?.rows) ? payload.rows : [];
      const responseCursor = payload?.nextCursor || null;
      if (payload?.hasMore && (!pageRows.length || !responseCursor || responseCursor === requestedCursor)) {
        throw new Error('daily detail cursor did not advance');
      }
      rows.value = reset ? pageRows : [...rows.value, ...pageRows];
      nextCursor.value = responseCursor;
      hasMore.value = Boolean(payload?.hasMore && responseCursor);
      paginationBlocked.value = false;
      errorState.value = '';
    } catch {
      if (sequence !== requestSequence || !visible.value || props.summary?.day !== day) return;
      errorState.value = reset ? 'initial' : 'append';
      paginationBlocked.value = !reset;
      if (reset) {
        rows.value = [];
        nextCursor.value = null;
        hasMore.value = false;
      }
    } finally {
      if (sequence === requestSequence) loading.value = false;
    }
  }

  function loadNext() {
    if (loading.value || !canAutoLoad.value) return;
    void loadPage({ reset: false });
  }

  function retryInitial() {
    void resetAndLoad();
  }

  function retryAppend() {
    paginationBlocked.value = false;
    errorState.value = '';
    void loadPage({ reset: false });
  }

  function openUser(record: DisplayRow) {
    visible.value = false;
    emit('select-user', record.user);
  }
</script>

<style lang="less">
  .points-daily-detail-modal__content {
    display: flex;
    min-height: 0;
    overflow: hidden !important;
  }

  .points-daily-detail {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: 12px;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  .points-daily-detail__summary {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 14px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    background: var(--workbench-subcard-bg);
  }

  .points-daily-detail__summary > div:first-child {
    display: grid;
    min-width: 0;
    gap: 3px;
  }

  .points-daily-detail__summary strong {
    color: var(--text-color);
  }

  .points-daily-detail__summary span,
  .points-daily-detail__footer,
  .points-daily-detail__state span {
    color: var(--desc-color);
    font-size: 12px;
  }

  .points-daily-detail__metrics {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px 14px;
    font-variant-numeric: tabular-nums;
  }

  .points-daily-detail__metrics span {
    display: inline-flex;
    gap: 4px;
  }

  .points-daily-detail__metrics .is-issued b,
  .points-daily-detail__delta.is-issued {
    color: var(--success-color);
  }

  .points-daily-detail__metrics .is-spent b,
  .points-daily-detail__delta.is-spent {
    color: var(--danger-color);
  }

  .points-daily-detail__metrics .is-net b {
    color: var(--points-trend-net-color);
  }

  .points-daily-detail__table {
    min-height: 0;
  }

  .points-daily-detail__table.table-container {
    min-height: 0;
  }

  .points-daily-detail__user.b_btn {
    display: grid;
    justify-items: start;
    width: 100%;
    height: auto;
    min-width: 0;
    padding: 5px 6px;
    border: 1px solid transparent !important;
    background: transparent;
    line-height: 1.3;
    text-align: left;
  }

  .points-daily-detail__user.b_btn:hover,
  .points-daily-detail__user.b_btn:focus-visible {
    border-color: var(--primary-color) !important;
    background: var(--menu-item-h-bg-color);
  }

  .points-daily-detail__user strong,
  .points-daily-detail__user small,
  .points-daily-detail__behavior strong,
  .points-daily-detail__behavior small,
  .points-daily-detail__activity b,
  .points-daily-detail__activity small {
    overflow: hidden;
    width: 100%;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .points-daily-detail__user strong,
  .points-daily-detail__behavior strong,
  .points-daily-detail__activity b {
    color: var(--text-color);
    font-size: 13px;
  }

  .points-daily-detail__user small,
  .points-daily-detail__behavior small,
  .points-daily-detail__activity small {
    color: var(--desc-color);
    font-size: 11px;
  }

  .points-daily-detail__delta,
  .points-daily-detail__time {
    font-variant-numeric: tabular-nums;
  }

  .points-daily-detail__delta.is-zero,
  .points-daily-detail__time {
    color: var(--desc-color);
  }

  .points-daily-detail__behavior,
  .points-daily-detail__activity {
    display: grid;
    min-width: 0;
    gap: 3px;
  }

  .points-daily-detail__activity > span {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    min-width: 0;
    gap: 8px;
  }

  .points-daily-detail__state {
    display: grid;
    place-content: center;
    justify-items: center;
    min-height: 220px;
    gap: 8px;
    padding: 24px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    color: var(--text-color);
    background: var(--table-bg-color);
    text-align: center;
  }

  .points-daily-detail__state.is-error {
    border-color: var(--danger-color);
  }

  .points-daily-detail__footer {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 32px;
    gap: 10px;
    text-align: center;
  }

  @media (max-width: 767px) {
    .points-daily-detail-modal__content {
      padding: 12px 12px calc(12px + env(safe-area-inset-bottom)) !important;
    }

    .points-daily-detail {
      gap: 10px;
    }

    .points-daily-detail__summary {
      display: grid;
      gap: 9px;
      padding: 10px 12px;
    }

    .points-daily-detail__metrics {
      justify-content: flex-start;
      gap: 6px 12px;
    }

    .points-daily-detail__table.table-container {
      padding: 8px;
      border-radius: 10px;
    }

    .points-daily-detail__table .table-row {
      padding: 0 6px;
    }

    .points-daily-detail__table .table-cell {
      padding: 0 4px;
    }
  }
</style>
