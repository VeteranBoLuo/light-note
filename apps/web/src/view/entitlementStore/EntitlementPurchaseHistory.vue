<template>
  <div class="purchase-history">
    <div v-if="error" class="purchase-history__state" role="alert">
      <span>{{ t('entitlementStore.layout.recordsFailed') }}</span>
      <BButton size="small" @click="emit('retry')">{{ t('common.retry') }}</BButton>
    </div>
    <div v-else-if="!ready" class="purchase-history__state">
      <BLoading inline loading :title="t('entitlementStore.layout.historyLoading')" />
    </div>
    <div v-else-if="!authenticated || !orders.length" class="purchase-history__state">
      <SvgIcon :src="icon.noteDetail.history" size="23" aria-hidden="true" />
      <strong>{{ t(authenticated ? 'entitlementStore.historyEmpty' : 'entitlementStore.layout.historyGuest') }}</strong>
      <span v-if="authenticated">{{ t('entitlementStore.layout.historyEmptyHint') }}</span>
    </div>
    <ul v-else class="purchase-history__orders">
      <li v-for="order in orders" :key="order.id" class="purchase-order">
        <SvgIcon class="purchase-order__icon" :src="orderIcon(order)" size="18" aria-hidden="true" />
        <div class="purchase-order__main">
          <strong>{{ orderTitle(order) }}</strong>
          <div class="purchase-order__detail">
            <time>{{ formatDate(order.confirmedAt) }}</time>
            <span v-if="formatBenefit(order)"> · {{ formatBenefit(order) }}</span>
          </div>
        </div>
        <div class="purchase-order__end">
          <strong>¥{{ order.amount }}</strong>
          <BChip
            :tone="
              order.rewardStatus === 'credited' ? 'success' : order.rewardStatus === 'ineligible' ? 'danger' : 'pending'
            "
            >{{ orderStatus(order) }}</BChip
          >
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import { SUPPORT_PACKAGE_CATALOG } from '@lightnote/shared';
  import type { AfdianSupportOrder } from '@/api/supportApi';
  import { formatAiQuotaTokens } from '@/composables/useAiQuotaStatus';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';

  defineProps<{
    orders: AfdianSupportOrder[];
    authenticated: boolean;
    ready: boolean;
    error: boolean;
  }>();
  const emit = defineEmits<{ retry: [] }>();
  const { t, locale } = useI18n();

  function formatBenefit(order: AfdianSupportOrder) {
    const credited = order.rewardStatus === 'credited';
    const aiTokens = credited ? order.grantedTokens : order.rewardTokens;
    const storageMb = credited ? order.grantedStorageMb : order.rewardStorageMb;
    const parts: string[] = [];
    if (aiTokens > 0)
      parts.push(t('entitlementStore.aiAmount', { amount: formatAiQuotaTokens(aiTokens, locale.value) }));
    if (storageMb > 0) {
      const amount = storageMb >= 1024 ? Number((storageMb / 1024).toFixed(2)) + ' GB' : storageMb + ' MB';
      parts.push(t('entitlementStore.storageAmount', { amount }));
    }
    return parts.join(' + ');
  }

  function orderTitle(order: AfdianSupportOrder) {
    const item = order.intentType === 'permanent' && SUPPORT_PACKAGE_CATALOG.find((sku) => sku.skuId === order.skuId);
    if (!item) return t('entitlementStore.layout.resourcePurchase');
    const index = SUPPORT_PACKAGE_CATALOG.filter((sku) => sku.category === item.category).indexOf(item);
    return (
      t('entitlementStore.categoryNames.' + item.category) +
      ' · ' +
      t('entitlementStore.tiers.' + ['light', 'regular', 'frequent', 'heavy'][index])
    );
  }

  function formatDate(value?: string | null) {
    if (!value) return t('common.unknown');
    const date = new Date(String(value).replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  function orderIcon(order: AfdianSupportOrder) {
    if (order.rewardStorageMb && order.rewardTokens) return icon.growth.reward;
    if (order.rewardStorageMb) return icon.growth.storage;
    return icon.growth.ai;
  }

  function orderStatus(order: AfdianSupportOrder) {
    if (order.rewardStatus === 'credited') return t('entitlementStore.credited');
    if (['manual_review', 'reversal_review'].includes(order.rewardStatus || '')) return t('entitlementJourney.review');
    if (order.rewardStatus === 'ineligible') return t('entitlementJourney.failed');
    return t('entitlementStore.processing');
  }
</script>

<style scoped lang="less">
  .purchase-history__state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--ui-space-5, 5px);
    padding: var(--ui-space-16, 16px) var(--ui-space-8, 8px);
    min-height: var(--ui-layout-94, 94px);
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    text-align: center;
  }
  .purchase-history__state strong {
    color: var(--text-color);
    font-size: var(--ui-font-13, 13px);
    font-weight: 600;
  }
  .purchase-history__orders {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .purchase-order {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--ui-space-10, 10px);
    padding: var(--ui-space-8, 8px) 0;
    border-top: 1px solid var(--surface-divider-color);
    font-size: var(--ui-font-12, 12px);
  }
  .purchase-order:first-child {
    border-top: 0;
  }
  .purchase-order__icon {
    color: var(--workspace-purple-text);
  }
  .purchase-order__main,
  .purchase-order__end {
    display: grid;
    gap: var(--ui-space-3, 3px);
    min-width: 0;
  }
  .purchase-order__main strong {
    overflow-wrap: anywhere;
  }
  .purchase-order__detail {
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
  }
  .purchase-order__end {
    justify-items: end;
  }
</style>
