<template>
  <BCard
    as="article"
    class="package-card"
    :class="{ 'is-campaign': isCampaign, 'is-recommended': isRecommended }"
    padding="12px"
    radius="12px"
  >
    <span v-if="isRecommended" class="package-card__recommendation">{{ t('entitlementStore.recommended') }}</span>
    <div class="package-card__top">
      <span class="package-card__icon" aria-hidden="true">
        <SvgIcon :src="packageIcon" size="20" />
      </span>
      <BChip v-if="isCampaign" tone="pending" max-width="160px">{{ campaignItem.campaignTitle }}</BChip>
      <BChip v-else :tone="firstPurchaseTone">{{ firstPurchaseLabel }}</BChip>
    </div>

    <div class="package-card__price"
      ><small>¥</small><strong>{{ item.amount }}</strong></div
    >

    <template v-if="isCampaign">
      <h3>{{ campaignItem.title }}</h3>

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
        <div
          v-if="regularItem.firstPurchaseStatus !== 'used'"
          class="package-card__benefit-row package-card__benefit-row--primary"
          :class="{ 'is-highlighted': regularItem.firstPurchaseStatus === 'available' && !previewMode }"
        >
          <span>{{ expectedArrivalLabel }}</span>
          <strong>{{ formatBenefit(expectedBenefit) }}</strong>
        </div>
        <div class="package-card__benefit-row package-card__benefit-row--base">
          <span>{{ t('entitlementStore.baseArrival') }}</span>
          <strong>{{ formatBenefit(regularItem.base) }}</strong>
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
  const isRecommended = computed(() => !isCampaign.value && props.index === (props.item.category === 'ai' ? 0 : 1));
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
    position: relative;
    display: flex;
    flex-direction: column;
    min-width: 0;
    border: 1px solid var(--surface-border-color);
    background: var(--card-background);
    box-shadow: 0 5px 15px #5b54aa05;
  }
  .package-card__recommendation {
    position: absolute;
    top: -10px;
    right: 12px;
    padding: 2px 10px;
    border-radius: 13px;
    background: var(--primary-color);
    color: white;
    font-size: 12px;
    line-height: 1.5;
  }
  .package-card__top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    margin-bottom: 8px;
    min-height: 32px;
  }
  .package-card__icon {
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    border: 1px solid var(--primary-color);
    border-radius: 8px;
    background: var(--primary-color-light);
    color: var(--primary-color);
  }
  .package-card__top :deep(.b-chip) {
    font-size: 12px;
    white-space: normal;
    line-height: 1.4;
  }
  .package-card__price {
    display: flex;
    align-items: baseline;
    gap: 3px;
    line-height: 1.2;
  }
  .package-card__price small {
    font-size: 15px;
  }
  .package-card__price strong {
    font-size: 32px;
    font-weight: 700;
    letter-spacing: -0.035em;
  }
  h3 {
    font:
      700 16px/1.5 'Songti SC',
      serif;
    margin: 4px 0 0;
  }
  .package-card__scenario {
    font-size: 14px;
    line-height: 1.6;
    margin: 3px 0 10px;
    color: var(--desc-color);
  }
  .package-card__benefits {
    display: grid;
    grid-template-columns: 1fr;
    gap: 5px;
    margin-top: auto;
    margin-bottom: 8px;
    padding-top: 10px;
  }
  .package-card__benefit-row {
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-width: 0;
    padding: 6px 7px;
    background: var(--primary-color-light);
    border: 1px solid var(--surface-border-color);
    border-radius: 6px;
  }
  .package-card__benefit-row span {
    font-size: 12px;
    color: var(--desc-color);
    line-height: 1.5;
  }
  .package-card__benefit-row strong {
    font-size: 13px;
    line-height: 1.6;
    overflow-wrap: break-word;
  }
  .package-card__benefit-row--primary strong {
    color: var(--primary-color);
  }
  .package-card__status-note,
  .package-card__saving {
    font-size: 12px;
    line-height: 1.5;
    margin: 0 0 8px;
    color: var(--desc-color);
  }
  .package-card__action-wrap {
    margin-top: auto;
  }
  .package-card__action.b_btn {
    width: 100%;
    min-height: 34px;
    font-size: 13px;
  }
  .is-campaign .package-card__benefits {
    grid-template-columns: 1fr;
  }
  .package-card__meta-list {
    display: grid;
    gap: 3px;
    font-size: 12px;
    color: var(--desc-color);
    margin: 4px 0 10px;
  }
  .is-mobile .package-card__action.b_btn {
    min-height: 40px;
  }
</style>
