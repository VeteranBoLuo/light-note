<template>
  <section class="lr" :class="{ 'is-mobile': bookmark.isMobile, 'is-inventory': inventory }">
    <header class="lr-head">
      <div
        ><h3>{{ t(inventory ? 'growth.inventoryRecent' : 'growth.lotteryRecent') }}</h3>
        <p v-if="inventory">{{ t('growth.inventoryRecentScope') }}</p></div
      >
      <BButton type="text" @click="openRecords()"
        >{{ t('growth.lotteryAllRecords') }} <SvgIcon :src="icon.arrow_right" :size="15"
      /></BButton>
    </header>
    <div v-if="recentLoading && !recent.length" class="lr-state"><BLoading inline loading /></div>
    <div v-else-if="recentError && !recent.length" class="lr-state" role="alert">
      {{ historyText('Failed') }} <BButton @click="loadRecent">{{ t('common.retry') }}</BButton>
    </div>
    <p v-else-if="!recent.length" class="lr-state">{{ historyText('Empty') }}</p>
    <template v-else>
      <div v-if="!bookmark.isMobile" class="lr-row lr-columns" aria-hidden="true">
        <span>{{ t('growth.lotteryHistoryReward') }}</span
        ><span>{{ t(inventory ? 'growth.inventoryHistorySource' : 'growth.lotteryHistoryMode') }}</span>
        <span>{{ t('growth.lotteryHistoryTime') }}</span
        ><span>{{ t('growth.lotteryHistoryStatus') }}</span>
      </div>
      <div v-for="row in recent" :key="row.id" class="lr-row">
        <div class="lr-reward">
          <SvgIcon :src="row.results.length === 1 ? prizeIcon(row.results[0]) : icon.growth.reward" :size="20" />
          <strong v-if="row.results.length === 1">{{ label(row.results[0]) }}</strong>
          <BButton v-else type="text" @click="openRecords(row.id)">{{
            t('growth.lotteryRewardCount', { n: row.results.length })
          }}</BButton>
        </div>
        <div class="lr-meta">
          <span class="lr-mode">{{ recordTitle(row) }}</span>
          <time :datetime="row.createdAt">{{ time(row.createdAt, inventory && bookmark.isMobile) }}</time>
        </div>
        <span class="lr-delivered"><SvgIcon :src="icon.growth.action" :size="16" />{{ recordStatus(row) }}</span>
      </div>
    </template>
    <div v-if="recentError && recent.length" class="lr-state" role="alert">
      {{ historyText('Failed') }} <BButton @click="loadRecent">{{ t('common.retry') }}</BButton>
    </div>
    <p v-if="inventory" class="lr-note">{{ t('growth.inventoryAutoCreditNote') }}</p>

    <BDrawer
      :open="opened"
      :title="historyText('Title')"
      width="var(--ui-layout-560, 560px)"
      mobile-full-screen
      :mobile-centered-header="bookmark.isMobile"
      @close="opened = false"
    >
      <div class="lr-drawer" :class="{ 'is-inventory': inventory }">
        <BTabs v-model:active-tab="mode" :options="modeOptions" variant="pill" />
        <p class="lr-note">{{ historyText('Hint') }}</p>
        <div ref="listRef" class="lr-list" v-auto-scrollbar @scroll.passive="loadNearEnd">
          <div v-if="listLoading && !rows.length" class="lr-state"><BLoading inline loading /></div>
          <p v-else-if="!listError && !rows.length" class="lr-state">{{ historyText('Empty') }}</p>
          <article v-for="row in rows" :key="row.id" class="lr-receipt">
            <header>
              <div
                ><strong>{{ recordTitle(row) }}</strong
                ><time :datetime="row.createdAt">{{ time(row.createdAt) }}</time></div
              >
              <div class="lr-receipt-status"
                ><span v-if="!inventory">{{
                  row.cost
                    ? t('growth.lotteryHistoryCost', { n: row.cost.toLocaleString(locale) })
                    : t('growth.lotteryHistoryFree')
                }}</span>
                <span class="lr-delivered"
                  ><SvgIcon :src="icon.growth.action" :size="15" />{{ recordStatus(row) }}</span
                ></div
              >
            </header>
            <div v-if="row.results.length === 1" class="lr-reward lr-receipt-reward">
              <SvgIcon :src="prizeIcon(row.results[0])" :size="20" /><strong>{{ label(row.results[0]) }}</strong>
              <span v-if="row.results[0].guaranteed" class="lr-pity">{{ t('growth.lotteryPityHitBadge') }}</span>
            </div>
            <template v-else>
              <p class="lr-summary">{{ summary(row) }}</p>
              <BButton
                type="text"
                class="lr-expand"
                :aria-expanded="expanded.has(row.id)"
                :aria-controls="`draw-${row.id}`"
                @click="toggle(row.id)"
              >
                {{
                  t(expanded.has(row.id) ? 'growth.lotteryCollapseRewards' : 'growth.lotteryExpandRewards', {
                    n: row.results.length,
                  })
                }}
                <SvgIcon :src="icon.noteTree.chevron" :size="14" :class="{ 'is-open': expanded.has(row.id) }" />
              </BButton>
              <ol v-if="expanded.has(row.id)" :id="`draw-${row.id}`" class="lr-details">
                <li v-for="(prize, i) in row.results" :key="i"
                  ><span class="lr-index">{{ String(i + 1).padStart(2, '0') }}</span>
                  <SvgIcon :src="prizeIcon(prize)" :size="18" /><span>{{ label(prize) }}</span>
                  <span v-if="prize.guaranteed" class="lr-pity">{{ t('growth.lotteryPityHitBadge') }}</span>
                  <span v-if="prize.compensated" class="lr-pity">{{ t('growth.lotteryHistoryCompensated') }}</span>
                </li>
              </ol>
            </template>
          </article>
          <div v-if="listError" class="lr-state" role="alert"
            >{{ historyText('Failed') }} <BButton @click="loadPage(!rows.length)">{{ t('common.retry') }}</BButton></div
          >
          <div v-else-if="listLoading && rows.length" class="lr-state"><BLoading inline loading /></div>
          <p v-else-if="rows.length && !hasMore" class="lr-end">{{ historyText('End') }}</p>
        </div>
      </div>
    </BDrawer>
  </section>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { bookmarkStore, useUserStore } from '@/store';
  import { getLotteryHistory, getInventoryAcquisitions } from '@/api/growthApi';
  import { prizeIcon, prizeLabel, recordLabel, type LotteryRecord } from '@/utils/lotteryPresentation';
  import type { AcquisitionKind, AcquisitionRecord } from '@/utils/inventoryAcquisitions';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';

  const props = withDefaults(defineProps<{ inventory?: boolean; revision?: number }>(), {
    inventory: false,
    revision: 0,
  });
  const { t, locale } = useI18n();
  const bookmark = bookmarkStore();
  const user = useUserStore();
  type HistoryRecord = LotteryRecord | AcquisitionRecord;
  const recent = ref<HistoryRecord[]>([]);
  const rows = ref<HistoryRecord[]>([]);
  const recentLoading = ref(false);
  const recentError = ref(false);
  const listLoading = ref(false);
  const listError = ref(false);
  const listRef = ref<HTMLElement | null>(null);
  const opened = ref(false);
  const mode = ref<AcquisitionKind | 'free' | 'paid'>('all');
  const cursor = ref<string | null>(null);
  const hasMore = ref(false);
  const expanded = ref(new Set<string>());
  let recentGeneration = 0;
  let listGeneration = 0;
  const owner = computed(() => [user.id, user.adminContext?.id, user.adminContext?.subjectUserId].join('|'));
  const modeOptions = computed(() =>
    props.inventory
      ? [
          { key: 'all', label: t('growth.pointsFilterAll') },
          { key: 'card', label: t('growth.inventoryFilterCard') },
          { key: 'ai_pack', label: t('growth.inventoryFilterAi') },
          { key: 'storage', label: t('growth.inventoryFilterStorage') },
          { key: 'points', label: t('growth.inventoryFilterPoints') },
        ]
      : [
          { key: 'all', label: t('growth.pointsFilterAll') },
          { key: 'free', label: t('growth.lotteryFreePoolTab') },
          { key: 'paid', label: t('growth.lotteryPaidPoolTab') },
        ],
  );
  const historyText = (suffix: string) =>
    t(`growth.${props.inventory ? 'inventoryHistory' : 'lotteryHistory'}${suffix}`);
  const recordTitle = (row: HistoryRecord) =>
    props.inventory
      ? t(`growth.inventorySources.${'source' in row ? row.source : 'other'}`)
      : recordLabel(row as LotteryRecord, t);
  function recordStatus(row: HistoryRecord) {
    const kind = row.results[0]?.kind;
    const key =
      props.inventory && row.results.every((prize) => prize.kind === kind)
        ? kind === 'card'
          ? 'inventoryStored'
          : kind === 'storage'
            ? 'inventoryApplied'
            : kind === 'ai_pack'
              ? 'lotteryCreditedBalance'
              : null
        : null;
    return t(`growth.${key || 'lotteryDelivered'}`);
  }
  const label = (prize: LotteryRecord['results'][number]) => prizeLabel(prize, t, locale.value);
  const time = (value: string, short = false) =>
    new Date(value).toLocaleString(locale.value, {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      year: short ? undefined : 'numeric',
    });
  function summary(row: HistoryRecord) {
    const grouped = new Map<string, LotteryRecord['results'][number]>();
    for (const prize of row.results) {
      const prior = grouped.get(prize.kind);
      grouped.set(prize.kind, { ...prize, amount: (prior?.amount || 0) + prize.amount });
    }
    return [...grouped.values()].map(label).join(' · ');
  }
  async function loadRecent() {
    const generation = ++recentGeneration;
    recentLoading.value = true;
    recentError.value = false;
    try {
      const response = await (props.inventory
        ? getInventoryAcquisitions({ limit: 3 })
        : getLotteryHistory({ limit: 3 }));
      if (generation !== recentGeneration) return;
      if (response?.status !== 200 || !Array.isArray(response.data?.rows)) throw new Error('HISTORY_FAILED');
      recent.value = response.data.rows;
    } catch {
      if (generation === recentGeneration) recentError.value = true;
    } finally {
      if (generation === recentGeneration) recentLoading.value = false;
    }
  }
  async function loadPage(reset = false) {
    if (listLoading.value && !reset) return;
    const generation = ++listGeneration;
    listLoading.value = true;
    listError.value = false;
    try {
      const paging = { limit: 20, cursor: reset ? null : cursor.value };
      const response = await (props.inventory
        ? getInventoryAcquisitions({ ...paging, kind: mode.value as AcquisitionKind })
        : getLotteryHistory({ ...paging, mode: mode.value as 'all' | 'free' | 'paid' }));
      if (generation !== listGeneration) return;
      if (response?.status !== 200 || !Array.isArray(response.data?.rows)) throw new Error('HISTORY_FAILED');
      const data = response.data as { rows: HistoryRecord[]; hasMore: boolean; nextCursor: string | null };
      if (data.hasMore && (!data.rows.length || !data.nextCursor || data.nextCursor === paging.cursor))
        throw new Error('HISTORY_CURSOR_INVALID');
      rows.value = [
        ...new Map((reset ? data.rows : [...rows.value, ...data.rows]).map((row) => [row.id, row])).values(),
      ];
      hasMore.value = data.hasMore;
      cursor.value = data.nextCursor;
      if (reset && listRef.value) listRef.value.scrollTop = 0;
    } catch {
      if (generation === listGeneration) listError.value = true;
    } finally {
      if (generation === listGeneration) {
        listLoading.value = false;
        await nextTick();
        if (generation === listGeneration) loadNearEnd();
      }
    }
  }
  function openRecords(id?: string) {
    opened.value = true;
    if (mode.value !== 'all') mode.value = 'all';
    else void loadPage(true);
    expanded.value = new Set(id ? [id] : []);
  }
  function toggle(id: string) {
    const next = new Set(expanded.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    expanded.value = next;
  }
  function loadNearEnd() {
    const el = listRef.value;
    if (
      opened.value &&
      el &&
      el.clientHeight > 0 &&
      hasMore.value &&
      !listLoading.value &&
      !listError.value &&
      el.scrollHeight - el.scrollTop - el.clientHeight < 120
    )
      void loadPage();
  }
  watch(listRef, (el, _old, onCleanup) => {
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(loadNearEnd);
    observer.observe(el);
    onCleanup(() => observer.disconnect());
  });
  watch(
    mode,
    () => {
      rows.value = [];
      cursor.value = null;
      hasMore.value = false;
      expanded.value = new Set();
      if (opened.value) void loadPage(true);
    },
    { flush: 'sync' },
  );
  watch(
    owner,
    () => {
      ++listGeneration;
      cursor.value = null;
      hasMore.value = false;
      listLoading.value = false;
      listError.value = false;
      expanded.value = new Set();
      rows.value = [];
      recent.value = [];
      opened.value = false;
      void loadRecent();
    },
    { immediate: true },
  );
  watch(
    () => props.revision,
    () => {
      void loadRecent();
      if (opened.value) void loadPage(true);
    },
  );
  onBeforeUnmount(() => {
    ++recentGeneration;
    ++listGeneration;
  });
  defineExpose({ open: openRecords });
</script>

<style scoped lang="less">
  @import (reference) '@/assets/css/ui-density.less';
  .lr {
    border: 1px solid var(--workspace-border);
    border-radius: 14px;
    background: var(--workspace-content);
    padding: .ui-space(18px) [];
    color: var(--text-color);
  }
  .lr-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: .ui-space(12px) [];
    margin-bottom: .ui-space(12px) [];
  }
  .lr-head h3 {
    margin: 0;
    font-size: .ui-font(16px) [];
  }
  .lr-head p {
    margin: .ui-space(4px) [] 0 0;
    color: var(--desc-color);
    font-size: .ui-font(12px) [];
  }
  .lr-head .b_btn {
    gap: .ui-space(6px) [];
    flex-shrink: 0;
  }
  .lr-row {
    display: grid;
    grid-template-columns: minmax(0, 1.5fr) minmax(0, 0.8fr) minmax(0, 1fr) minmax(0, 1fr);
    align-items: center;
    gap: .ui-space(14px) [];
    padding: .ui-space(14px) [] 0;
    border-top: 1px solid var(--workspace-divider);
    font-size: .ui-font(13px) [];
  }
  .lr-row > * {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .lr-meta {
    display: contents;
  }
  .lr-meta > * {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .lr-columns {
    color: var(--desc-color);
    border-top: 0;
    padding-top: 0;
    font-size: .ui-font(12px) [];
  }
  .lr-reward {
    display: flex;
    align-items: center;
    gap: .ui-space(10px) [];
    min-width: 0;
  }
  .lr-reward > :first-child {
    flex-shrink: 0;
    color: var(--primary-color);
  }
  .lr-reward strong {
    font-weight: 600;
  }
  .lr-delivered {
    display: inline-flex;
    align-items: center;
    gap: .ui-space(5px) [];
    color: var(--success-color);
    font-size: .ui-font(12px) [];
  }
  .lr-delivered > :first-child {
    flex-shrink: 0;
  }
  .lr-note,
  .lr-end {
    margin: 0;
    color: var(--desc-color);
    font-size: .ui-font(12px) [];
    line-height: 1.6;
  }
  .lr > .lr-note {
    padding-top: .ui-space(12px) [];
    border-top: 1px solid var(--workspace-divider);
  }
  .lr-state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: .ui-space(10px) [];
    margin: 0;
    padding: .ui-space(24px) [] 0;
    color: var(--desc-color);
    font-size: .ui-font(13px) [];
    flex-wrap: wrap;
  }
  .lr-drawer {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: .ui-space(12px) [];
  }
  .lr-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .lr-receipt {
    padding: .ui-space(16px) [];
    margin-bottom: .ui-space(12px) [];
    border: 1px solid var(--workspace-border);
    border-radius: 12px;
    background: var(--workspace-content);
    font-size: .ui-font(14px) [];
  }
  .lr-receipt header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: .ui-space(12px) [];
  }
  .lr-receipt header > div {
    display: flex;
    flex-direction: column;
    gap: .ui-space(6px) [];
    min-width: 0;
  }
  .lr-receipt time {
    color: var(--desc-color);
    font-size: .ui-font(12px) [];
  }
  .lr-receipt-status {
    align-items: flex-end;
    text-align: right;
    flex-shrink: 0;
    max-width: 50%;
  }
  .lr-receipt-status .lr-delivered {
    max-width: 100%;
    text-align: left;
  }
  .lr-receipt-reward {
    margin-top: .ui-space(16px) [];
    flex-wrap: wrap;
  }
  .lr-summary {
    margin: .ui-space(14px) [] 0 .ui-space(6px) [];
    color: var(--desc-color);
    line-height: 1.7;
    font-size: .ui-font(13px) [];
  }
  .lr-expand {
    gap: .ui-space(6px) [];
    font-size: .ui-font(12px) [];
  }
  .lr-expand .is-open {
    transform: rotate(180deg);
  }
  .lr-details {
    list-style: none;
    margin: .ui-space(8px) [] 0 0;
    padding: 0;
  }
  .lr-details li {
    display: flex;
    align-items: center;
    gap: .ui-space(8px) [];
    padding: .ui-space(8px) [] 0;
    font-size: .ui-font(13px) [];
    flex-wrap: wrap;
  }
  .lr-details li > :nth-child(2) {
    color: var(--primary-color);
    flex-shrink: 0;
  }
  .lr-index {
    color: var(--desc-color);
    width: .ui-layout(20px) [];
    font-variant-numeric: tabular-nums;
  }
  .lr-pity {
    border: 1px solid var(--primary-color);
    border-radius: 4px;
    color: var(--chip-pin-fg);
    padding: .ui-space(2px) [] .ui-space(4px) [];
    font-size: .ui-font(11px) [];
  }
  .lr-end {
    text-align: center;
    padding: .ui-space(12px) [] 0;
  }
  .is-mobile.lr {
    padding: .ui-space(14px) [];
  }
  .is-mobile .lr-row {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: .ui-space(8px) [];
  }
  .is-mobile .lr-reward {
    grid-column: 1 / -1;
  }
  .is-mobile .lr-row time {
    grid-column: 1;
    grid-row: 3;
    font-size: .ui-font(12px) [];
    color: var(--desc-color);
  }
  .is-mobile .lr-delivered {
    grid-column: 2;
    grid-row: 2 / 4;
  }
  .is-mobile .lr-mode {
    font-size: .ui-font(12px) [];
    color: var(--desc-color);
  }
  .is-mobile.is-inventory .lr-meta {
    display: flex;
    flex-wrap: wrap;
    gap: .ui-space(4px) [] .ui-space(8px) [];
    grid-column: 1;
    grid-row: 2;
  }
  .is-mobile.is-inventory .lr-meta time {
    white-space: nowrap;
  }
  .is-mobile.is-inventory .lr-row > .lr-delivered {
    grid-row: 2;
    align-self: start;
  }
  .lr-drawer.is-inventory {
    .lr-receipt {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: .ui-space(8px) [] .ui-space(12px) [];
      border: none;
      border-bottom: 1px solid var(--workspace-divider);
      border-radius: 0;
      margin: 0;
      padding: .ui-space(18px) [] 0;
    }
    .lr-receipt header {
      display: contents;
    }
    .lr-receipt header > div:first-child {
      grid-column: 1;
      grid-row: 2;
      flex-direction: row;
      flex-wrap: wrap;
      align-items: baseline;
      color: var(--desc-color);
      font-size: .ui-font(12px) [];
      strong {
        font-weight: normal;
      }
    }
    .lr-receipt-status {
      grid-column: 2;
      grid-row: 2;
      align-self: center;
      max-width: .ui-layout(140px) [];
    }
    .lr-receipt-reward {
      grid-column: 1 / -1;
      grid-row: 1;
      margin: 0;
    }
  }
</style>
