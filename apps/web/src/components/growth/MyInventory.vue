<template>
  <div class="inv" :class="{ 'is-mobile': bookmark.isMobile, 'is-narrow': bookmark.isMobileDevice }">
    <header class="inv-head">
      <div
        ><h2>{{ t('growth.inventoryTitle') }}</h2
        ><p>{{ t('growth.inventorySubtitle') }}</p></div
      >
      <BButton @click="openRecords"
        ><SvgIcon :src="icon.noteDetail.history" :size="17" />{{ t('growth.inventoryHistoryTitle') }}</BButton
      >
    </header>
    <div v-if="!inv && !inventoryError" class="inv-state"><BLoading inline loading /></div>
    <div v-else-if="inventoryError && !inv" class="inv-state" role="alert">
      {{ t('growth.inventoryLoadFailed') }}<BButton @click="loadInventory">{{ t('common.retry') }}</BButton>
    </div>
    <section v-else class="inv-assets" :aria-label="t('growth.inventoryAssetsTitle')">
      <article class="asset asset-points">
        <span class="asset-icon"><SvgIcon :src="icon.growth.coin" :size="28" /></span>
        <div class="asset-body"
          ><span>{{ t('growth.assetPoints') }}</span
          ><strong>{{ (inv?.assets.points || 0).toLocaleString(locale) }}</strong></div
        >
        <p>{{ t('growth.assetPointsHint') }}</p>
        <footer>
          <BButton type="text" @click="selectTab('points')">{{
            t(bookmark.isMobileDevice ? 'growth.inventoryDetailShort' : 'growth.assetDetails')
          }}</BButton>
          <BButton type="text" :disabled="readOnly" @click="goToExchange()"
            >{{ t('growth.assetExchange') }}<SvgIcon :src="icon.arrow_right" :size="15"
          /></BButton>
        </footer>
      </article>
      <article class="asset asset-ai">
        <span class="asset-icon"><SvgIcon :src="icon.growth.ai" :size="28" /></span>
        <div class="asset-body"
          ><span>{{ t('growth.assetAiBalance') }}</span
          ><strong :title="(inv?.assets.aiBonusTokens || 0).toLocaleString(locale) + ' tokens'"
            >{{ fmtTokens(inv?.assets.aiBonusTokens || 0) }} <small>tokens</small></strong
          ></div
        >
        <p>{{ t('growth.assetAiHint') }}</p>
        <footer>
          <BButton type="text" @click="router.push({ name: 'aiUsage' })">{{
            t(bookmark.isMobileDevice ? 'growth.inventoryDetailShort' : 'growth.assetDetails')
          }}</BButton>
          <BButton type="text" :disabled="readOnly" @click="goToStore('ai')"
            >{{ t('growth.assetBuy') }}<SvgIcon :src="icon.arrow_right" :size="15"
          /></BButton>
        </footer>
      </article>
      <article class="asset asset-storage">
        <span class="asset-icon"><SvgIcon :src="icon.growth.storage" :size="28" /></span>
        <div class="asset-body"
          ><span>{{ t('growth.assetStorage') }}</span
          ><strong>{{ fmtStorage(inv?.assets.storageBonusMb || 0) }}</strong></div
        >
        <p>{{ t('growth.assetStorageHint') }}</p>
        <footer
          ><BButton type="text" :disabled="readOnly" @click="goToStore('storage')"
            >{{ t('growth.assetBuy') }}<SvgIcon :src="icon.arrow_right" :size="15" /></BButton
        ></footer>
      </article>
    </section>
    <BTabs
      class="inv-tabs"
      :active-tab="activeTab"
      :options="tabOptions"
      variant="line"
      @update:active-tab="selectTab"
    />
    <section v-if="overviewVisited && inv" v-show="activeTab === 'overview'" class="inv-items-panel">
      <h3 class="inv-label">{{ t('growth.inventoryItemsTitle') }}</h3>
      <div class="inv-items">
        <div v-for="it in visibleItems" :key="it.id" class="inv-item">
          <span class="item-icon"><SvgIcon :src="itemIcon(it.id)" :size="26" /></span>
          <div class="item-main">
            <div class="item-name-row"
              ><strong>{{ it.id === 'makeup_card' ? t('growth.shopItems.makeup_card.name') : it.name }}</strong
              ><span :class="{ 'is-empty': it.qty < 1 }">{{
                it.qty > 0 ? '×' + it.qty : t('growth.itemEmptyQty')
              }}</span></div
            >
            <p>{{ itemDescription(it) }}</p>
          </div>
          <BButton
            v-if="it.action === 'use'"
            :loading="usingId === it.id"
            :disabled="readOnly || it.qty < 1 || Boolean(usingId)"
            @click="onUse(it)"
            >{{ t('growth.itemUse') }}</BButton
          >
          <div v-else-if="it.action === 'makeup'" class="item-actions">
            <BButton type="text" :disabled="readOnly" @click="goToExchange('makeup_card')">
              {{ t('growth.assetExchange') }}
            </BButton>
            <BButton
              :loading="makingUp"
              :disabled="readOnly || it.qty < 1 || !canMakeup"
              :title="
                readOnly ? t('growth.adminContextActionUnavailable') : !canMakeup ? t('growth.itemMakeupHint') : ''
              "
              @click="onMakeup"
              >{{ t('growth.itemGoMakeup') }}</BButton
            >
          </div>
        </div>
      </div>
    </section>
    <LotteryRecords
      v-if="overviewVisited"
      v-show="activeTab === 'overview'"
      ref="records"
      inventory
      :revision="historyRevision"
    />
    <InventoryPointsDetails v-if="pointsVisited" v-show="activeTab === 'points'" :show-summary="showPointsSummary" />
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import { useGrowth } from '@/composables/useGrowth.ts';
  import type { InventoryItem } from '@/composables/useGrowth.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import { recordOperation } from '@/api/commonApi.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import LotteryRecords from './LotteryRecords.vue';
  import InventoryPointsDetails from './InventoryPointsDetails.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import type { InventoryTab } from '@/utils/inventoryNavigation';
  import { bookmarkStore } from '@/store';
  import { formatAiTokens } from '@/utils/growthAssetChange';
  import { MAKEUP_WINDOW_DAYS } from '@lightnote/shared';

  const { t, locale } = useI18n();
  const router = useRouter();
  const props = withDefaults(defineProps<{ readOnly?: boolean; showPointsSummary?: boolean }>(), {
    readOnly: false,
    showPointsSummary: true,
  });
  const activeTab = defineModel<InventoryTab>('activeTab', { default: 'overview' });
  const overviewVisited = ref(activeTab.value === 'overview');
  const pointsVisited = ref(activeTab.value === 'points');
  watch(activeTab, (tab) => {
    if (tab === 'points') pointsVisited.value = true;
    else overviewVisited.value = true;
  });
  const tabOptions = computed(() => [
    { key: 'overview', label: t('growth.inventoryOverview') },
    { key: 'points', label: t('growth.pointsLogTitle') },
  ]);
  function selectTab(tab: string) {
    if (tab === 'overview' || tab === 'points') activeTab.value = tab;
  }
  async function openRecords() {
    overviewVisited.value = true;
    await nextTick();
    records.value?.open();
  }
  const readOnly = computed(() => props.readOnly);
  const { inventory, inventoryLoading, inventoryError, growth, loadInventory, loadDashboard, useItem, useProtectCard } =
    useGrowth();
  const inv = inventory;
  const bookmark = bookmarkStore();
  const records = ref<InstanceType<typeof LotteryRecords> | null>(null);
  const historyRevision = ref(0);
  const visibleItems = computed(() => (inv.value?.items || []).filter((item) => item.id !== 'ai_pack' || item.qty > 0));
  const makeupDate = computed(() => growth.value?.makeupDays?.[0] || null);
  const canMakeup = computed(() => !!makeupDate.value);

  const usingId = ref<string | null>(null);
  const makingUp = ref(false);

  function goToExchange(focus?: string) {
    if (readOnly.value) return;
    void router.push({ path: '/growth', query: { section: 'rewards', reward: 'shop', ...(focus ? { focus } : {}) } });
  }

  function goToStore(category: 'ai' | 'storage') {
    if (readOnly.value) return;
    void router.push({ path: '/store', query: { category } });
  }

  function fmtStorage(mb: number) {
    if (mb >= 1024) return (mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1) + 'GB';
    return mb + 'MB';
  }
  const fmtTokens = (n: number) => formatAiTokens(n, locale.value);
  function itemIcon(itemId: string) {
    return itemId === 'ai_pack' ? icon.growth.ai : icon.growth.checkin;
  }
  function itemDescription(item: InventoryItem) {
    return item.id === 'ai_pack'
      ? t('growth.legacyAiPackDesc')
      : item.id === 'makeup_card'
        ? t('growth.inventoryMakeupHint', { n: MAKEUP_WINDOW_DAYS })
        : item.desc;
  }

  async function onUse(it: InventoryItem) {
    if (readOnly.value || usingId.value) return;
    usingId.value = it.id;
    try {
      const res = await useItem(it.id);
      if (res?.status === 200 && res.data?.ok) {
        historyRevision.value++;
        if (it.id === 'ai_pack') message.success(t('growth.aiPackUseOk', { n: fmtTokens(res.data.amount || 0) }));
        else message.success(t('growth.itemUse'));
        recordOperation({ module: '成长', operation: '使用成长物品' });
      } else {
        message.info(t('growth.itemUseFail'));
      }
    } catch {
      message.info(t('growth.itemUseFail'));
    } finally {
      usingId.value = null;
    }
  }

  function onMakeup() {
    const date = makeupDate.value;
    if (readOnly.value || makingUp.value || !date) return;
    Alert.alert({
      title: t('growth.protectCardConfirmTitle'),
      content: t('growth.protectCardConfirmContent', { date: formatDate(date) }),
      onOk: () => performMakeup(date),
    });
  }

  async function performMakeup(date: string) {
    if (readOnly.value) return;
    makingUp.value = true;
    try {
      const res = await useProtectCard(date);
      if (res?.status === 200 && res.data?.ok) {
        message.success(t('growth.protectCardOk', { n: res.data.streak }));
        recordOperation({ module: '成长', operation: '使用补签卡' });
        await loadDashboard(); // 同步签到日历的逐日高亮与统计
      } else {
        message.info(t('growth.protectCardFail'));
      }
    } finally {
      makingUp.value = false;
    }
  }

  function formatDate(key: string) {
    const date = new Date(Number(key.slice(0, 4)), Number(key.slice(4, 6)) - 1, Number(key.slice(6, 8)));
    return date.toLocaleDateString(locale.value, { year: 'numeric', month: 'long', day: 'numeric' });
  }

  onMounted(loadInventory);
</script>

<style scoped lang="less">
  @import (reference) '@/assets/css/ui-density.less';
  .inv {
    display: flex;
    flex-direction: column;
    gap: .ui-space(20px) [];
    color: var(--text-color);
    min-width: 0;
  }
  .inv-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: .ui-space(14px) [];
  }
  .inv-head h2 {
    margin: 0;
    font-size: .ui-font(28px) [];
  }
  .inv-head p {
    margin: .ui-space(6px) [] 0 0;
    color: var(--desc-color);
    font-size: .ui-font(13px) [];
  }
  .inv-head .b_btn {
    flex-shrink: 0;
    gap: .ui-space(6px) [];
    border: 1px solid var(--workspace-border);
    background: var(--workspace-content);
  }
  .inv-state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: .ui-space(12px) [];
    padding: .ui-space(32px) [] 0;
    color: var(--desc-color);
  }
  .inv-assets {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: .ui-space(14px) [];
  }
  .asset {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    column-gap: .ui-space(14px) [];
    row-gap: .ui-space(12px) [];
    padding: .ui-space(20px) [];
    border: 1px solid var(--workspace-border);
    border-radius: 14px;
    background: var(--workspace-content);
    min-width: 0;
  }
  .asset-icon,
  .item-icon {
    display: grid;
    place-items: center;
    flex-shrink: 0;
    width: .ui-control(48px) [];
    height: .ui-control(48px) [];
    border-radius: 50%;
    color: var(--primary-color);
    background: var(--workspace-hover);
  }
  .asset-body {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: .ui-space(6px) [];
    min-width: 0;
  }
  .asset-body > span {
    font-size: .ui-font(13px) [];
  }
  .asset-body strong {
    font-size: .ui-font(28px) [];
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    overflow-wrap: anywhere;
  }
  .asset-body small {
    color: var(--desc-color);
    font-size: .ui-font(12px) [];
    font-weight: normal;
    white-space: nowrap;
  }
  .asset-ai strong {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: .ui-space(4px) [];
  }
  .asset > p {
    grid-column: 2;
    margin: 0;
    font-size: .ui-font(12px) [];
    color: var(--desc-color);
    line-height: 1.6;
  }
  .asset footer {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: .ui-space(4px) [] .ui-space(12px) [];
    align-self: end;
    border-top: 1px solid var(--workspace-divider);
    padding-top: .ui-space(12px) [];
  }
  .asset-storage footer {
    justify-content: flex-end;
  }
  .asset footer .b_btn {
    gap: .ui-space(4px) [];
    font-size: .ui-font(13px) [];
    padding-inline: 0;
    color: var(--workspace-purple-text);
  }
  .inv-tabs {
    flex-shrink: 0;
    border-bottom: 1px solid var(--workspace-divider);
  }
  .inv-tabs :deep(.tab.is-active) {
    color: var(--workspace-purple-text);
  }
  .inv-items-panel {
    padding: .ui-space(20px) [];
    border: 1px solid var(--workspace-border);
    border-radius: 14px;
    background: var(--workspace-content);
  }
  .inv-label {
    margin: 0 0 .ui-space(14px) [];
    font-size: .ui-font(17px) [];
  }
  .inv-item {
    display: flex;
    align-items: center;
    gap: .ui-space(14px) [];
    padding: .ui-space(14px) [];
    border: 1px solid var(--workspace-border);
    border-radius: 12px;
  }
  .inv-item + .inv-item {
    margin-top: .ui-space(10px) [];
  }
  .item-icon {
    width: .ui-control(40px) [];
    height: .ui-control(40px) [];
    border-radius: 10px;
  }
  .item-main {
    flex: 1;
    min-width: 0;
  }
  .item-name-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: .ui-space(10px) [];
    font-size: .ui-font(14px) [];
  }
  .item-name-row > span {
    color: var(--primary-color);
    font-size: .ui-font(12px) [];
  }
  .item-name-row > span.is-empty {
    color: var(--desc-color);
  }
  .item-main p {
    margin: .ui-space(6px) [] 0 0;
    color: var(--desc-color);
    font-size: .ui-font(12px) [];
    line-height: 1.6;
  }
  .item-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: .ui-space(8px) [];
    margin-left: auto;
  }
  .item-actions > .b_btn,
  .inv-item > .b_btn {
    flex-shrink: 0;
  }
  .item-actions > .b_btn:not(.text_btn):not(:disabled),
  .inv-item > .b_btn:not(:disabled) {
    border: 1px solid var(--primary-color);
    color: var(--workspace-purple-text);
    background: transparent;
  }
  .is-narrow .inv-assets {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0;
    border: 1px solid var(--workspace-border);
    border-radius: 14px;
    background: var(--workspace-content);
    overflow: hidden;
  }
  .is-narrow .asset {
    border: none;
    border-radius: 0;
    padding: .ui-space(14px) [];
    gap: .ui-space(8px) [];
  }
  .is-narrow .asset-points {
    grid-column: 1 / -1;
    grid-template-columns: auto minmax(0, 1fr) auto;
    border-bottom: 1px solid var(--workspace-divider);
  }
  .is-narrow .asset-ai {
    border-right: 1px solid var(--workspace-divider);
  }
  .is-narrow .asset > p {
    display: none;
  }
  .is-narrow .asset-icon {
    width: .ui-control(36px) [];
    height: .ui-control(36px) [];
  }
  .is-narrow .asset-body strong {
    font-size: .ui-font(22px) [];
  }
  .is-narrow .asset-ai .asset-body strong {
    font-size: .ui-font(20px) [];
    gap: .ui-space(2px) [];
  }
  .is-narrow .asset-body {
    gap: .ui-space(4px) [];
  }
  .is-narrow .asset footer {
    border: none;
    padding-top: 0;
    gap: .ui-space(8px) [];
  }
  .is-narrow .asset-points footer {
    grid-column: 3;
    grid-row: 1;
  }
  .is-narrow .asset-ai footer {
    grid-column: 2;
    justify-content: flex-start;
  }
  .is-mobile.inv {
    gap: .ui-space(14px) [];
  }
  .is-mobile .inv-head {
    flex-wrap: wrap;
    gap: .ui-space(8px) [];
  }
  .is-mobile .inv-head h2 {
    font-size: .ui-font(20px) [];
  }
  .is-mobile .inv-head p {
    display: none;
  }
  .is-mobile .inv-head .b_btn {
    font-size: .ui-font(12px) [];
  }
  .is-mobile .inv-items-panel {
    padding: .ui-space(12px) [];
  }
  .is-mobile .inv-label {
    font-size: .ui-font(15px) [];
    margin-bottom: .ui-space(10px) [];
  }
  .is-mobile .inv-item {
    padding: .ui-space(10px) [];
    gap: .ui-space(8px) [];
    flex-wrap: wrap;
  }
  .is-mobile .item-main {
    flex-basis: 50%;
  }
  .is-mobile .inv-item > .b_btn {
    margin-left: auto;
  }
</style>
