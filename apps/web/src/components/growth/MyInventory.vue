<template>
  <div class="inv">
    <div class="inv-head">
      <h3 class="inv-title">🎒 {{ t('growth.inventoryTitle') }}</h3>
      <p class="inv-sub">{{ t('growth.inventorySubtitle') }}</p>
    </div>

    <!-- 我的资产:即时到账类(积分 / 永久扩容 / 今日 AI 加油) -->
    <div class="inv-label">{{ t('growth.inventoryAssetsTitle') }}</div>
    <div class="inv-assets">
      <div class="asset">
        <span class="asset-ico">🪙</span>
        <div class="asset-body">
          <b class="asset-val">{{ (inv?.assets.points || 0).toLocaleString('en-US') }}</b>
          <span class="asset-label">{{ t('growth.assetPoints') }}</span>
        </div>
      </div>
      <div class="asset">
        <span class="asset-ico">💾</span>
        <div class="asset-body">
          <b class="asset-val">{{ fmtStorage(inv?.assets.storageBonusMb || 0) }}</b>
          <span class="asset-label">{{ t('growth.assetStorage') }}</span>
        </div>
      </div>
      <div class="asset">
        <span class="asset-ico">⚡</span>
        <div class="asset-body">
          <b class="asset-val">{{ fmtTokens(inv?.assets.todayAiBonus || 0) }}</b>
          <span class="asset-label">{{ t('growth.assetTodayAi') }}</span>
        </div>
      </div>
    </div>

    <!-- 我的物品:消耗品(AI 加油包 / 补签卡) -->
    <div class="inv-label">{{ t('growth.inventoryItemsTitle') }}</div>
    <div class="inv-items">
      <div v-for="it in inv?.items || []" :key="it.id" class="inv-item" :class="{ 'is-empty': it.qty < 1 }">
        <span class="item-ico">{{ it.icon }}</span>
        <div class="item-main">
          <div class="item-name-row">
            <span class="item-name">{{ it.name }}</span>
            <span class="item-qty" :class="{ zero: it.qty < 1 }">{{ it.qty > 0 ? '×' + it.qty : t('growth.itemEmptyQty') }}</span>
          </div>
          <p class="item-desc">{{ it.desc }}</p>
        </div>
        <div class="item-action">
          <!-- AI 加油包:直接使用(加今日额度) -->
          <button v-if="it.action === 'use'" class="inv-btn" :disabled="it.qty < 1 || usingId === it.id" @click="onUse(it)">
            {{ usingId === it.id ? t('growth.itemUsing') : t('growth.itemUse') }}
          </button>
          <!-- 补签卡:补回昨天漏签(仅昨天漏签且有卡时可用) -->
          <button
            v-else-if="it.action === 'makeup'"
            class="inv-btn"
            :disabled="it.qty < 1 || !canMakeup || makingUp"
            :title="!canMakeup ? t('growth.itemMakeupHint') : ''"
            @click="onMakeup"
          >
            {{ t('growth.itemGoMakeup') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useGrowth } from '@/composables/useGrowth.ts';
  import type { InventoryItem } from '@/composables/useGrowth.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { recordOperation } from '@/api/commonApi.ts';

  const { t } = useI18n();
  const { inventory, growth, loadInventory, useItem, useProtectCard } = useGrowth();
  const inv = inventory;
  const canMakeup = computed(() => !!growth.value?.canUseProtectCard);

  const usingId = ref<string | null>(null);
  const makingUp = ref(false);

  function fmtStorage(mb: number) {
    if (mb >= 1024) return (mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1) + 'GB';
    return mb + 'MB';
  }
  function fmtTokens(n: number) {
    if (n >= 10000) return (n / 10000).toFixed(n % 10000 === 0 ? 0 : 1) + ' 万';
    return String(n);
  }

  async function onUse(it: InventoryItem) {
    if (usingId.value) return;
    usingId.value = it.id;
    try {
      const res = await useItem(it.id);
      if (res?.status === 200 && res.data?.ok) {
        if (it.id === 'ai_pack') message.success(t('growth.aiPackUseOk', { n: fmtTokens(res.data.amount || 0) }));
        else message.success(t('growth.itemUse'));
        recordOperation({ module: '成长', operation: `使用物品 ${it.name}` });
      } else {
        message.info(t('growth.itemUseFail'));
      }
    } catch {
      message.info(t('growth.itemUseFail'));
    } finally {
      usingId.value = null;
    }
  }

  async function onMakeup() {
    if (makingUp.value || !canMakeup.value) return;
    makingUp.value = true;
    try {
      const res = await useProtectCard();
      if (res?.status === 200 && res.data?.ok) {
        message.success(t('growth.protectCardOk', { n: res.data.streak }));
        recordOperation({ module: '成长', operation: `使用补签卡（连签续至 ${res.data.streak} 天）` });
      } else {
        message.info(t('growth.protectCardFail'));
      }
    } finally {
      makingUp.value = false;
    }
  }

  onMounted(loadInventory);
</script>

<style scoped lang="less">
  .inv {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .inv-head {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .inv-title {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
    color: var(--text-color);
  }
  .inv-sub {
    margin: 0;
    font-size: 12px;
    color: var(--desc-color);
    line-height: 1.5;
  }
  .inv-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--desc-color);
    margin-top: 4px;
  }
  .inv-assets {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }
  @media (max-width: 520px) {
    .inv-assets {
      grid-template-columns: 1fr;
    }
  }
  .asset {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 55%, transparent);
    background: color-mix(in srgb, var(--card-border-color) 8%, transparent);
  }
  .asset-ico {
    font-size: 20px;
    line-height: 1;
  }
  .asset-body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .asset-val {
    font-size: 17px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    color: var(--text-color);
  }
  .asset-label {
    font-size: 11px;
    color: var(--desc-color);
  }
  .inv-items {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .inv-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 55%, transparent);
    background: color-mix(in srgb, var(--card-border-color) 6%, transparent);
    transition: opacity 0.15s;
  }
  .inv-item.is-empty {
    opacity: 0.62;
  }
  .item-ico {
    font-size: 24px;
    line-height: 1;
    flex-shrink: 0;
  }
  .item-main {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .item-name-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .item-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-color);
  }
  .item-qty {
    font-size: 12px;
    font-weight: 700;
    color: var(--primary-color);
    font-variant-numeric: tabular-nums;
  }
  .item-qty.zero {
    color: var(--desc-color);
    font-weight: 500;
  }
  .item-desc {
    margin: 0;
    font-size: 12px;
    color: var(--desc-color);
    line-height: 1.5;
  }
  .item-action {
    flex-shrink: 0;
  }
  .inv-btn {
    min-width: 60px;
    height: 30px;
    padding: 0 14px;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--primary-color) 45%, transparent);
    background: color-mix(in srgb, var(--primary-color) 10%, transparent);
    color: var(--primary-color);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition:
      background 0.15s,
      opacity 0.15s;
  }
  .inv-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--primary-color) 20%, transparent);
  }
  .inv-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
</style>
