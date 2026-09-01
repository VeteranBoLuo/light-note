<template>
  <BCard as="article" class="package-card" :class="{ 'is-campaign': isCampaign }" padding="18px" radius="16px">
    <div class="package-card__top">
      <span class="package-card__icon" aria-hidden="true">
        <SvgIcon :src="packageIcon" size="20" />
      </span>
      <BChip v-if="isCampaign" tone="pending" max-width="160px">{{ campaignItem.campaignTitle }}</BChip>
      <BChip v-else :tone="firstPurchaseTone">{{ firstPurchaseLabel }}</BChip>
    </div>

    <p class="package-card__eyebrow">{{ categoryLabel }}</p>
    <div class="package-card__price"
      ><small>¥</small><strong>{{ item.amount }}</strong></div
    >

    <template v-if="isCampaign">
      <h3>{{ campaignItem.title }}</h3>
      <p class="package-card__scenario">{{ campaignItem.description }}</p>
      <div class="package-card__benefits">
        <div class="package-card__benefit-row is-highlighted">
          <span>{{ t('entitlementStore.campaigns.arrival') }}</span>
          <strong>{{ formatBenefit(campaignItem.benefit) }}</strong>
        </div>
      </div>
      <div class="package-card__meta-list">
        <span>{{ t('entitlementStore.campaigns.endsAt', { time: formatDate(campaignItem.endsAt) }) }}</span>
        <span>
          {{
            campaignItem.remainingPurchases === null
              ? t('entitlementStore.campaigns.limit', { count: campaignItem.perUserLimit })
              : t('entitlementStore.campaigns.remaining', { count: campaignItem.remainingPurchases })
          }}
        </span>
      </div>
    </template>

    <template v-else>
      <h3>{{ tierLabel }}</h3>
      <p class="package-card__scenario">{{ scenarioLabel }}</p>
      <div class="package-card__benefits">
        <div class="package-card__benefit-row">
          <span>{{ t('entitlementStore.baseArrival') }}</span>
          <strong>{{ formatBenefit(regularItem.base) }}</strong>
        </div>
        <div
          class="package-card__benefit-row"
          :class="{ 'is-highlighted': regularItem.firstPurchaseStatus === 'available' && !previewMode }"
        >
          <span>{{ expectedArrivalLabel }}</span>
          <strong>{{ formatBenefit(expectedBenefit) }}</strong>
        </div>
      </div>
      <p class="package-card__status-note">{{ firstPurchaseNote }}</p>
      <p v-if="regularItem.comboSavings" class="package-card__saving">
        {{ t('entitlementStore.comboSaving', { amount: regularItem.comboSavings }) }}
      </p>
    </template>

    <div class="package-card__action-wrap">
      <BButton
        class="package-card__action"
        type="primary"
        size="large"
        :disabled="disabled"
        @click="emit('select', item)"
      >
        {{ actionLabel }}
      </BButton>
    </div>
  </BCard>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import type {
    SupportBenefit,
    SupportCampaignPackage,
    SupportPackage,
    SupportPackageCategory,
  } from '@/api/supportApi';
  import { formatAiQuotaTokens } from '@/composables/useAiQuotaStatus';

  type StoreItem = SupportPackage | SupportCampaignPackage;
  type ChipTone = 'success' | 'neutral' | 'pending';

  const props = withDefaults(
    defineProps<{
      item: StoreItem;
      index?: number;
      previewMode?: boolean;
      actionLabel: string;
      disabled?: boolean;
    }>(),
    { index: 0, previewMode: false, disabled: false },
  );
  const emit = defineEmits<{ select: [item: StoreItem] }>();
  const { t, locale } = useI18n();

  const isCampaign = computed(() => 'campaignSkuId' in props.item);
  const campaignItem = computed(() => props.item as SupportCampaignPackage);
  const regularItem = computed(() => props.item as SupportPackage);
  const tierKey = computed(() => ['light', 'regular', 'frequent', 'heavy'][Math.min(Math.max(props.index, 0), 3)]);
  const categoryLabel = computed(() => t(`entitlementStore.categoryNames.${props.item.category}`));
  const tierLabel = computed(() => t(`entitlementStore.tiers.${tierKey.value}`));
  const scenarioLabel = computed(() => t(`entitlementStore.scenarios.${regularItem.value.category}.${tierKey.value}`));
  const packageIcon = computed(() => {
    if (props.item.category === 'ai') return icon.growth.ai;
    if (props.item.category === 'storage') return icon.growth.storage;
    return icon.growth.reward;
  });
  const firstPurchaseLabel = computed(() => {
    if (props.previewMode) return t('entitlementStore.previewFirstStatus');
    if (regularItem.value.firstPurchaseStatus === 'used') return t('entitlementStore.firstUsed');
    if (regularItem.value.firstPurchaseStatus === 'login_required') return t('entitlementStore.firstLogin');
    return t('entitlementStore.firstAvailable');
  });
  const firstPurchaseTone = computed<ChipTone>(() => {
    if (props.previewMode || regularItem.value.firstPurchaseStatus === 'login_required') return 'pending';
    return regularItem.value.firstPurchaseStatus === 'available' ? 'success' : 'neutral';
  });
  const expectedBenefit = computed(() =>
    regularItem.value.firstPurchaseStatus === 'used' ? regularItem.value.base : regularItem.value.firstPurchase,
  );
  const expectedArrivalLabel = computed(() =>
    props.previewMode || regularItem.value.firstPurchaseStatus === 'login_required'
      ? t('entitlementStore.possibleFirstArrival')
      : t('entitlementStore.expectedArrival'),
  );
  const firstPurchaseNote = computed(() => {
    if (props.previewMode) return t('entitlementStore.previewNote');
    if (regularItem.value.firstPurchaseStatus === 'used') return t('entitlementStore.usedNote');
    if (regularItem.value.firstPurchaseStatus === 'login_required') return t('entitlementStore.loginNote');
    return t('entitlementStore.availableNote');
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
  function formatDate(value?: string | null) {
    if (!value) return t('common.unknown');
    const date = new Date(String(value).replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }
</script>

<style scoped lang="less">
  .package-card {
    min-height: 432px;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--surface-border-color);
    transition:
      border-color 0.18s ease;
  }
  .package-card.is-campaign {
    min-height: 410px;
  }
  .package-card__top {
    min-height: 38px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .package-card__icon {
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
  .package-card__eyebrow {
    margin: 17px 0 0;
    color: var(--text-color-secondary);
    font-size: 11px;
    font-weight: 600;
  }
  .package-card__price {
    display: flex;
    align-items: flex-start;
    gap: 3px;
    margin-top: 7px;
  }
  .package-card__price small {
    margin-top: 7px;
    color: var(--text-color-secondary);
    font-size: 14px;
  }
  .package-card__price strong {
    font-size: 38px;
    line-height: 1;
  }
  .package-card h3 {
    margin: 14px 0 0;
    font-size: 18px;
    line-height: 1.35;
  }
  .package-card__scenario {
    min-height: 42px;
    margin: 6px 0 0;
    color: var(--text-color-secondary);
    font-size: 12px;
    line-height: 1.55;
  }
  .package-card__benefits {
    display: grid;
    gap: 7px;
    margin-top: 15px;
  }
  .package-card__benefit-row {
    padding: 9px 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
  }
  .package-card__benefit-row span,
  .package-card__benefit-row strong {
    display: block;
  }
  .package-card__benefit-row span {
    color: var(--text-color-secondary);
    font-size: 10px;
  }
  .package-card__benefit-row strong {
    margin-top: 3px;
    font-size: 13px;
    line-height: 1.4;
  }
  .package-card__benefit-row.is-highlighted {
    border-color: var(--primary-color);
  }
  .package-card__benefit-row.is-highlighted strong {
    color: var(--primary-color);
  }
  .package-card__status-note,
  .package-card__saving,
  .package-card__meta-list {
    font-size: 11px;
    line-height: 1.5;
  }
  .package-card__status-note {
    margin: 10px 0 0;
    color: var(--text-color-secondary);
  }
  .package-card__saving {
    margin: 6px 0 0;
    color: var(--success-color);
    font-weight: 600;
  }
  .package-card__meta-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 10px;
    color: var(--text-color-secondary);
  }
  .package-card__action-wrap {
    margin-top: auto;
    padding-top: 14px;
  }
  .package-card__action {
    width: 100%;
  }
  @media (hover: hover) and (pointer: fine) {
    .package-card:hover {
      border-color: var(--primary-color);
    }
  }
  @media (max-width: 640px) {
    .package-card,
    .package-card.is-campaign {
      min-height: 0;
    }
    .package-card__scenario {
      min-height: 0;
    }
    .package-card__action-wrap {
      margin-top: 18px;
      padding-top: 0;
    }
    .package-card__action {
      min-height: 44px;
    }
  }
  html.light-note-mobile-rendering & {
    .package-card {
      box-shadow: none;
    }
    .package-card:hover {
      transform: none;
      border-color: var(--surface-border-color);
    }
  }
</style>
