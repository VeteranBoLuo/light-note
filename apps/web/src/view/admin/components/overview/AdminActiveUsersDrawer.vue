<template>
  <BDrawer
    :open="open"
    :title="t('adminActivity.title')"
    width="var(--ui-layout-620, 620px)"
    :mobile-full-screen="true"
    @close="emit('close')"
    @after-close="restoreFocus"
  >
    <div class="activity-drawer">
      <div class="activity-drawer__trend-heading">
        <strong>{{ t('adminActivity.trendTitle') }}</strong>
        <BTabs v-model:active-tab="trendDays" :options="trendOptions" variant="segment" />
      </div>
      <AdminActivityTrend :points="trend" :selected-date="selectedDate" @select="selectDate" />
      <div class="activity-drawer__toolbar">
        <div class="activity-drawer__date">
          <BDateTimePicker
            :value="selectedDate"
            :show-time="false"
            :aria-label="t('adminActivity.date')"
            @update:value="selectDate"
          />
          <BButton size="small" @click="selectDate(today())">{{ t('adminActivity.today') }}</BButton>
        </div>
        <div class="activity-drawer__date">
          <BPopover trigger="click">
            <BButton size="small">{{ t('adminActivity.metricHelp') }}</BButton>
            <template #content>
              <div class="activity-drawer__rules">
                <p>{{ t('adminActivity.dayHint') }}</p>
                <p>{{ t('adminActivity.chartHint') }}</p>
                <p>{{ t('adminActivity.rule') }}</p>
                <p>{{ t('adminActivity.timeHint') }}</p>
              </div>
            </template>
          </BPopover>
          <BButton size="small" :loading="loading" @click="load(true)">{{ t('adminActivity.refresh') }}</BButton>
        </div>
      </div>
      <p v-if="dateError" class="activity-drawer__error" role="alert">{{ t('adminActivity.invalidDate') }}</p>
      <div class="activity-drawer__heading">
        <strong v-if="page && page.total !== null">{{
          t('adminActivity.total', { date: page.date, count: page.total })
        }}</strong>
        <span class="activity-drawer__hint">{{
          t(hideInternal ? 'adminActivity.internalHidden' : 'adminActivity.internalIncluded')
        }}</span>
      </div>
      <p v-if="page?.partialDate" class="activity-drawer__hint">{{ t('adminActivity.partial') }}</p>
      <p v-if="page?.historyUnavailable" class="activity-drawer__hint">
        {{ t('adminActivity.historyUnavailable', { date: page.startedAt.slice(0, 10) }) }}
      </p>
      <BLoading
        v-if="loading && (!page || page.date !== selectedDate)"
        inline
        loading
        :title="t('adminActivity.loading')"
      />
      <div v-if="error" class="activity-drawer__error" role="alert">
        <span>{{ t('adminActivity.failed') }}</span>
        <BButton size="small" @click="load(retryReset)">{{ t('adminActivity.retry') }}</BButton>
      </div>
      <p v-if="page && !page.historyUnavailable && !page.items.length && !loading && !error">{{
        t('adminActivity.empty')
      }}</p>
      <BVirtualList
        v-if="page?.items.length"
        class="activity-drawer__list"
        :items="page.items"
        item-key="id"
        :item-height="88"
        dynamic-height
        :overscan="3"
        :loading="loading"
        :has-more="page.hasMore && !error && page.date === selectedDate"
        :loading-text="t('adminActivity.loading')"
        role="list"
        :aria-label="t('adminActivity.title')"
        @load-more="load(false)"
      >
        <template #default="{ item }">
          <div class="activity-drawer__row" role="listitem">
            <div class="activity-drawer__identity">
              <strong :title="item.name">{{ item.name || t('adminActivity.unnamed') }}</strong>
              <span class="activity-drawer__ellipsis" :title="item.id">ID · {{ item.id }}</span>
              <span v-if="item.userRemark" class="activity-drawer__ellipsis" :title="item.userRemark">
                {{ t('adminActivity.remark') }} · {{ item.userRemark }}
              </span>
            </div>
            <div class="activity-drawer__times">
              <span>{{ t('adminActivity.first') }} · {{ item.firstActiveAt.slice(11, 19) }}</span>
              <span>{{ t('adminActivity.last') }} · {{ item.lastActiveAt.slice(11, 19) }}</span>
            </div>
          </div>
        </template>
      </BVirtualList>
      <p v-if="page?.items.length && !page.hasMore" class="activity-drawer__hint">{{ t('adminActivity.complete') }}</p>
    </div>
  </BDrawer>
</template>
<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import AdminActivityTrend from './AdminActivityTrend.vue';
  import type { ActivityTrendPoint } from '@/api/userActivity';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import BDateTimePicker from '@/components/base/BasicComponents/BDateTimePicker.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BVirtualList from '@/components/base/BasicComponents/BVirtualList.vue';
  import { getActiveUsers, type ActiveUsersPage } from '@/api/userActivity';
  const props = defineProps<{ open: boolean; hideInternal: boolean }>();
  const emit = defineEmits<{ close: []; snapshot: [page: ActiveUsersPage] }>();
  const { t } = useI18n();
  const trendDays = ref('7');
  const trend = ref<ActivityTrendPoint[]>([]);
  const trendOptions = computed(() =>
    [7, 30, 90].map((days) => ({ label: t('adminActivity.range', { days }), key: String(days) })),
  );
  const page = ref<ActiveUsersPage | null>(null);
  const loading = ref(false);
  const error = ref(false);
  const retryReset = ref(true);
  let returnFocus: HTMLElement | null = null;
  function restoreFocus() {
    if (!props.open && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  }
  let sequence = 0;
  let abort: AbortController | null = null;
  let midnightTimer: ReturnType<typeof setTimeout> | undefined;
  const today = () => new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
  const selectedDate = ref(today());
  const dateError = ref(false);
  function selectDate(value: string) {
    const date = value.slice(0, 10) || today();
    if (date > today()) {
      dateError.value = true;
      return;
    }
    dateError.value = false;
    selectedDate.value = date;
  }
  function cancel() {
    sequence++;
    abort?.abort();
    abort = null;
    loading.value = false;
  }
  function scheduleMidnight() {
    if (midnightTimer !== undefined) clearTimeout(midnightTimer);
    if (!props.open) return;
    const delay = 86_400_000 - ((Date.now() + 8 * 3_600_000) % 86_400_000) + 100;
    const scheduledDay = today();
    midnightTimer = setTimeout(() => {
      if (selectedDate.value === scheduledDay) selectedDate.value = today();
      scheduleMidnight();
    }, delay);
  }
  async function load(reset = false) {
    if (!props.open) return;
    const changedDay = Boolean(page.value && page.value.date !== selectedDate.value);
    reset ||= changedDay;
    if (!reset && (loading.value || (page.value && !page.value.hasMore))) return;
    if (reset) {
      cancel();
    }
    const requestSequence = ++sequence;
    const scope = props.hideInternal;
    const date = selectedDate.value;
    abort = new AbortController();
    loading.value = true;
    error.value = false;
    try {
      const response = await getActiveUsers(
        scope,
        reset ? null : page.value?.nextCursor || null,
        reset ? null : page.value?.snapshotAt || null,
        abort.signal,
        date,
        reset ? Number(trendDays.value) : undefined,
      );
      if (requestSequence !== sequence || !props.open) return;
      if (response.status !== 200) throw new Error('ACTIVITY_UNAVAILABLE');
      const next = response.data as ActiveUsersPage;
      if (next.date !== date) throw new Error('ACTIVITY_DATE_MISMATCH');
      if (next.trend) trend.value = next.trend;
      const prior = reset ? [] : page.value?.items || [];
      const existing = new Set(prior.map((item) => item.id));
      page.value = { ...next, items: [...prior, ...next.items.filter((item) => !existing.has(item.id))] };
      if (!prior.length && next.date === today() && next.total !== null) emit('snapshot', next);
    } catch {
      if (requestSequence === sequence) {
        error.value = true;
        retryReset.value = reset || !page.value;
      }
    } finally {
      if (requestSequence === sequence) {
        loading.value = false;
        abort = null;
      }
    }
  }
  watch(trendDays, () => {
    if (props.open) void load(true);
  });
  watch(selectedDate, () => {
    if (props.open) void load(true);
  });
  watch(
    () => [props.open, props.hideInternal],
    (_, previous) => {
      if (props.open && !previous?.[0])
        returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      cancel();
      page.value = null;
      trend.value = [];
      error.value = false;
      scheduleMidnight();
      if (props.open) void load(true);
    },
    { immediate: true },
  );
  onBeforeUnmount(() => {
    cancel();
    if (midnightTimer !== undefined) clearTimeout(midnightTimer);
  });
</script>
<style scoped lang="less">
  .activity-drawer {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-8, 8px);
    height: 100%;
    min-height: 0;
    color: var(--text-color);
  }
  .activity-drawer p {
    margin: 0;
  }
  .activity-drawer__toolbar,
  .activity-drawer__trend-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--ui-space-8, 8px);
  }
  .activity-drawer__date {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--ui-space-8, 8px);
    font-size: var(--ui-font-14, 14px);
  }
  .activity-drawer__rules {
    max-width: var(--ui-layout-280, 280px);
    color: var(--text-color);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.6;
  }
  .activity-drawer__heading {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: var(--ui-space-4, 4px) var(--ui-space-12, 12px);
    padding-top: var(--ui-space-4, 4px);
  }
  .activity-drawer__hint {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.6;
  }
  .activity-drawer__list {
    flex: 1;
    min-height: 0;
  }
  .activity-drawer__row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: var(--ui-space-12, 12px);
    padding: var(--ui-space-10, 10px) 0;
    line-height: var(--ui-layout-18, 18px);
    border-bottom: 1px solid var(--surface-border-color);
    font-size: var(--ui-font-12, 12px);
    color: var(--desc-color);
  }
  .activity-drawer__identity,
  .activity-drawer__times {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: var(--ui-space-3, 3px);
  }
  .activity-drawer__times {
    text-align: right;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .activity-drawer__row strong {
    color: var(--text-color);
    font-size: var(--ui-font-14, 14px);
  }
  .activity-drawer__ellipsis,
  .activity-drawer__row strong {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .activity-drawer__error {
    display: flex;
    align-items: center;
    gap: var(--ui-space-12, 12px);
    color: var(--danger-color);
  }
</style>
