<template>
  <BModal
    v-model:visible="visible"
    :title="t('entitlementStore.confirm.title')"
    :show-footer="false"
    width="520px"
    initial-focus=".checkout-modal__confirm"
  >
    <div v-if="item" class="checkout-modal">
      <div class="checkout-modal__product">
        <span class="checkout-modal__icon" aria-hidden="true">
          <SvgIcon :src="packageIcon" size="21" />
        </span>
        <div>
          <span>{{ categoryLabel }}</span>
          <h3>{{ packageName }}</h3>
        </div>
        <strong>¥{{ item.amount }}</strong>
      </div>

      <dl class="checkout-modal__facts">
        <div v-if="!isCampaign">
          <dt>{{ t('entitlementStore.confirm.baseArrival') }}</dt>
          <dd>{{ formatBenefit(regularItem.base) }}</dd>
        </div>
        <div class="is-emphasis">
          <dt>{{ t('entitlementStore.confirm.expectedArrival') }}</dt>
          <dd>{{ formatBenefit(expectedBenefit) }}</dd>
        </div>
        <div>
          <dt>{{ t('entitlementStore.confirm.account') }}</dt>
          <dd>{{ accountName }}</dd>
        </div>
        <div>
          <dt>{{ t('entitlementStore.confirm.provider') }}</dt>
          <dd>{{ t('entitlementStore.confirm.afdian') }}</dd>
        </div>
      </dl>

      <p class="checkout-modal__notice">
        <SvgIcon :src="icon.message.info" size="17" aria-hidden="true" />
        <span>{{ notice }}</span>
      </p>
      <div class="checkout-modal__actions">
        <BButton @click="visible = false">{{ t('entitlementStore.confirm.cancel') }}</BButton>
        <BButton class="checkout-modal__confirm" type="primary" :disabled="!canConfirm" @click="emit('confirm')">
          {{ t('entitlementStore.confirm.pay', { amount: item.amount }) }}
        </BButton>
      </div>
    </div>
  </BModal>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import type { SupportBenefit, SupportCampaignPackage, SupportPackage } from '@/api/supportApi';
  import { formatAiQuotaTokens } from '@/composables/useAiQuotaStatus';

  type StoreItem = SupportPackage | SupportCampaignPackage;

  const props = defineProps<{
    item: StoreItem | null;
    packageName: string;
    accountName: string;
    expectedBenefit: SupportBenefit;
    canConfirm: boolean;
  }>();
  const emit = defineEmits<{ confirm: [] }>();
  const visible = defineModel<boolean>('visible', { required: true });
  const { t, locale } = useI18n();

  const isCampaign = computed(() => Boolean(props.item && 'campaignSkuId' in props.item));
  const regularItem = computed(() => props.item as SupportPackage);
  const categoryLabel = computed(() => (props.item ? t(`entitlementStore.categoryNames.${props.item.category}`) : ''));
  const packageIcon = computed(() => {
    if (props.item?.category === 'ai') return icon.growth.ai;
    if (props.item?.category === 'storage') return icon.growth.storage;
    return icon.growth.reward;
  });
  const notice = computed(() => {
    if (!props.item) return '';
    if ('campaignSkuId' in props.item) return t('entitlementStore.confirm.campaignNotice');
    if (props.item.firstPurchaseStatus === 'available') return t('entitlementStore.confirm.availableNotice');
    return t('entitlementStore.confirm.usedNotice');
  });

  function formatStorage(mb: number) {
    if (mb >= 1024) return Number((mb / 1024).toFixed(2)) + ' GB';
    return mb + ' MB';
  }
  function formatBenefit(benefit: SupportBenefit) {
    const parts: string[] = [];
    if (benefit.aiTokens > 0) {
      parts.push(t('entitlementStore.aiAmount', { amount: formatAiQuotaTokens(benefit.aiTokens, locale.value) }));
    }
    if (benefit.storageMb > 0) {
      parts.push(t('entitlementStore.storageAmount', { amount: formatStorage(benefit.storageMb) }));
    }
    return parts.join(' + ');
  }
</script>

<style scoped lang="less">
  .checkout-modal__product {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
  }
  .checkout-modal__icon {
    width: 38px;
    height: 38px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    border: 1px solid var(--primary-color);
    border-radius: 11px;
    color: var(--primary-color);
    background: var(--primary-color-light);
  }
  .checkout-modal__product > div {
    min-width: 0;
  }
  .checkout-modal__product span {
    color: var(--text-color-secondary);
    font-size: 11px;
  }
  .checkout-modal__product h3 {
    margin: 3px 0 0;
    font-size: 17px;
  }
  .checkout-modal__product > strong {
    font-size: 25px;
  }
  .checkout-modal__facts {
    display: grid;
    gap: 0;
    margin: 18px 0 0;
    padding: 0 13px;
    border: 1px solid var(--surface-border-color);
    border-radius: 13px;
  }
  .checkout-modal__facts > div {
    display: grid;
    grid-template-columns: minmax(100px, auto) minmax(0, 1fr);
    gap: 16px;
    padding: 11px 0;
    border-bottom: 1px solid var(--surface-border-color);
  }
  .checkout-modal__facts > div:last-child {
    border-bottom: 0;
  }
  .checkout-modal__facts dt,
  .checkout-modal__facts dd {
    margin: 0;
  }
  .checkout-modal__facts dt {
    color: var(--text-color-secondary);
    font-size: 12px;
  }
  .checkout-modal__facts dd {
    text-align: right;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.45;
  }
  .checkout-modal__facts .is-emphasis dd {
    color: var(--primary-color);
  }
  .checkout-modal__notice {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin: 13px 0 0;
    padding: 11px 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 11px;
    color: var(--text-color-secondary);
    font-size: 12px;
    line-height: 1.55;
  }
  .checkout-modal__notice :deep(.svg-icon) {
    flex: 0 0 auto;
    margin-top: 1px;
    color: var(--primary-color);
  }
  .checkout-modal__actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 18px;
  }
  @media (max-width: 640px) {
    .checkout-modal__facts > div {
      grid-template-columns: 1fr;
      gap: 4px;
    }
    .checkout-modal__facts dd {
      text-align: left;
    }
    .checkout-modal__actions {
      flex-direction: column-reverse;
    }
    .checkout-modal__actions :deep(.b_btn) {
      width: 100%;
      min-height: 44px;
    }
  }
</style>
