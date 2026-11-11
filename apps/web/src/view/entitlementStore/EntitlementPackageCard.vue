<template>
  <BCard
    as="article"
    class="package-card"
    :class="{
      'is-campaign': isCampaign,
      'is-recommended': isRecommended,
      'is-storage': item.category === 'storage',
      'is-mobile': bookmark.isMobile,
    }"
    :padding="bookmark.isMobile ? 'var(--ui-space-14, 14px) var(--ui-space-12, 12px)' : 'var(--ui-space-20, 20px)'"
    radius="12px"
  >
    <span v-if="isRecommended" class="package-card__recommendation">{{ t('entitlementStore.recommended') }}</span>
    <div class="package-card__top">
      <span class="package-card__icon" aria-hidden="true"><SvgIcon :src="packageIcon" size="18" /></span>
      <h3>{{ isCampaign ? campaignItem.title : tierLabel }}</h3>
    </div>
    <template v-if="isCampaign">
      <BChip class="package-card__tag" tone="pending">{{ campaignItem.campaignTitle }}</BChip>
      <div class="package-card__benefits"
        ><div class="package-card__benefit-row is-highlighted"
          ><span>{{ t('entitlementStore.campaigns.arrival') }}</span
          ><strong>{{ formatBenefit(campaignItem.benefit) }}</strong></div
        ></div
      >
      <div class="package-card__meta-list">
        <span>{{ t('entitlementStore.campaigns.endsAt', { time: formatDate(campaignItem.endsAt) }) }}</span>
        <span>{{
          campaignItem.remainingPurchases === null
            ? t('entitlementStore.campaigns.limit', { count: campaignItem.perUserLimit })
            : t('entitlementStore.campaigns.remaining', { count: campaignItem.remainingPurchases })
        }}</span>
      </div>
    </template>
    <template v-else>
      <p class="package-card__scenario">{{ scenarioLabel }}</p>
      <BChip v-if="hasFirstPurchase" class="package-card__tag" :tone="firstPurchaseTone">{{
        firstPurchaseLabel
      }}</BChip>
      <div class="package-card__benefits">
        <div
          v-if="hasFirstPurchase && regularItem.firstPurchaseStatus !== 'used'"
          class="package-card__benefit-row package-card__benefit-row--primary"
          :class="{ 'is-highlighted': regularItem.firstPurchaseStatus === 'available' && !previewMode }"
        >
          <span>{{ expectedArrivalLabel }}</span
          ><strong>{{ formatBenefit(expectedBenefit) }}</strong>
        </div>
        <div class="package-card__benefit-row package-card__benefit-row--base">
          <span>{{ t(hasFirstPurchase ? 'entitlementStore.baseArrival' : 'entitlementStore.purchaseArrival') }}</span>
          <strong v-if="hasFirstPurchase">{{ formatBenefit(regularItem.base) }}</strong>
          <template v-else>
            <div v-if="regularItem.base.aiTokens" class="package-card__value"
              ><strong>{{ aiDisplay.number }}</strong
              ><span>{{ aiDisplay.suffix }}{{ ' ' + t('entitlementStore.layout.aiUnit') }}</span></div
            >
            <div v-else class="package-card__value"
              ><strong>{{ storageDisplay[0] }}</strong
              ><span>{{ ' ' + storageDisplay[1] }}</span></div
            >
            <div v-if="regularItem.base.aiTokens && regularItem.base.storageMb" class="package-card__supplement">
              <span class="package-card__storage">
                <SvgIcon :src="icon.growth.storage" size="14" aria-hidden="true" />{{
                  t('entitlementStore.storageAmount', { amount: formatStorage(regularItem.base.storageMb) })
                }}
              </span>
              <span
                v-if="regularItem.comboSavings"
                class="package-card__saving"
                :aria-label="t('entitlementStore.comboSaving', { amount: regularItem.comboSavings })"
              >
                {{ t('entitlementStore.layout.saving', { amount: regularItem.comboSavings }) }}
              </span>
            </div>
          </template>
        </div>
      </div>
      <p v-if="hasFirstPurchase" class="package-card__status-note">{{ firstPurchaseNote }}</p>
    </template>
    <div class="package-card__footer">
      <div class="package-card__price"
        ><small>¥</small><strong>{{ item.amount }}</strong></div
      >
      <BButton
        class="package-card__action"
        :type="isRecommended ? 'primary' : undefined"
        :disabled="disabled"
        :aria-label="actionLabel + ' · ' + (isCampaign ? campaignItem.title : tierLabel)"
        @click="emit('select', item)"
        >{{ actionLabel }}</BButton
      >
    </div>
  </BCard>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { bookmarkStore } from '@/store';
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
  const bookmark = bookmarkStore();

  const isCampaign = computed(() => 'campaignSkuId' in props.item);
  const isRecommended = computed(() => !isCampaign.value && props.index === (props.item.category === 'ai' ? 0 : 1));
  const campaignItem = computed(() => props.item as SupportCampaignPackage);
  const regularItem = computed(() => props.item as SupportPackage);
  const hasFirstPurchase = computed(() => !isCampaign.value && regularItem.value.firstPurchaseScope !== 'none');
  const aiDisplay = computed(() => {
    const formatted = formatAiQuotaTokens(regularItem.value.base?.aiTokens || 0, locale.value);
    const match = formatted.match(/^([\d.,]+)(.*)$/);
    return { number: match?.[1] || formatted, suffix: match?.[2] || '' };
  });
  const storageDisplay = computed(() => formatStorage(regularItem.value.base?.storageMb || 0).split(' '));
  const tierKey = computed(() => ['light', 'regular', 'frequent', 'heavy'][Math.min(Math.max(props.index, 0), 3)]);
  const tierLabel = computed(() => t(`entitlementStore.tiers.${tierKey.value}`));
  const scenarioLabel = computed(() => t(`entitlementStore.scenarios.${regularItem.value.category}.${tierKey.value}`));
  const packageIcon = computed(() => {
    if (props.item.category === 'ai') return icon.growth.ai;
    if (props.item.category === 'storage') return icon.growth.storage;
    return icon.growth.reward;
  });
  const firstPurchaseLabel = computed(() => {
    if (!hasFirstPurchase.value)
      return t(
        regularItem.value.category === 'storage'
          ? 'entitlementStore.storagePermanentTitle'
          : 'entitlementStore.aiPermanentTitle',
      );
    if (props.previewMode) return t('entitlementStore.previewFirstStatus');
    if (regularItem.value.firstPurchaseStatus === 'used') return t('entitlementStore.firstUsed');
    if (regularItem.value.firstPurchaseStatus === 'login_required') return t('entitlementStore.firstLogin');
    return t('entitlementStore.firstAvailable');
  });
  const firstPurchaseTone = computed<ChipTone>(() => {
    if (!hasFirstPurchase.value) return 'neutral';
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
    if (!hasFirstPurchase.value)
      return t(
        regularItem.value.category === 'storage'
          ? 'entitlementStore.storagePermanentNote'
          : 'entitlementStore.aiPermanentNote',
      );
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
  }
  .package-card.is-recommended {
    border-color: var(--primary-color);
  }
  .package-card__recommendation {
    position: absolute;
    top: calc(-1 * var(--ui-space-10, 10px));
    right: var(--ui-space-14, 14px);
    padding: var(--ui-space-2, 2px) var(--ui-space-7, 7px);
    border: 1px solid var(--primary-color);
    border-radius: 5px;
    background: var(--card-background);
    color: var(--workspace-purple-text);
    font-size: var(--ui-font-11, 11px);
    line-height: 1.5;
  }
  .package-card__top {
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    min-width: 0;
  }
  .package-card__icon {
    width: var(--ui-layout-30, 30px);
    height: var(--ui-layout-30, 30px);
    flex-shrink: 0;
    display: grid;
    place-items: center;
    border-radius: 8px;
    background: var(--workspace-purple-selected);
    color: var(--workspace-purple-text);
  }
  h3 {
    margin: 0;
    font-size: var(--ui-font-15, 15px);
    font-weight: 600;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
  .package-card__scenario {
    min-height: var(--ui-layout-33, 33px);
    margin: var(--ui-space-10, 10px) 0 0;
    font-size: var(--ui-font-12, 12px);
    color: var(--desc-color);
    line-height: 1.6;
  }
  .package-card__tag {
    align-self: flex-start;
    max-width: 100%;
    margin-top: var(--ui-space-8, 8px);
  }
  .package-card__benefits {
    flex: 1;
    display: grid;
    align-content: center;
    gap: var(--ui-space-8, 8px);
    margin-top: var(--ui-space-13, 13px);
    padding: var(--ui-space-12, 12px) 0;
    border-block: 1px solid var(--surface-divider-color);
  }
  .package-card__benefit-row {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-5, 5px);
    min-width: 0;
  }
  .package-card__benefit-row > span {
    font-size: var(--ui-font-11, 11px);
    color: var(--desc-color);
  }
  .package-card__benefit-row > strong {
    font-size: var(--ui-font-13, 13px);
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .package-card__benefit-row.is-highlighted > strong {
    color: var(--workspace-purple-text);
  }
  .package-card__value {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    column-gap: var(--ui-space-4, 4px);
    color: var(--workspace-purple-text);
    line-height: 1.3;
  }
  .package-card__value strong {
    font-size: var(--ui-font-31, 31px);
    font-weight: 500;
  }
  .package-card__value > span {
    font-size: var(--ui-font-13, 13px);
    white-space: pre-wrap;
  }
  .is-storage .package-card__value,
  .is-storage .package-card__icon,
  .package-card__storage {
    color: var(--workspace-file-text);
  }
  .is-storage .package-card__icon {
    background: var(--workspace-file-selected);
  }
  .package-card__storage {
    display: flex;
    align-items: center;
    gap: var(--ui-space-6, 6px);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.5;
  }
  .package-card__status-note,
  .package-card__meta-list {
    margin: var(--ui-space-8, 8px) 0 0;
    font-size: var(--ui-font-11, 11px);
    color: var(--desc-color);
    line-height: 1.7;
  }
  .package-card__saving {
    color: var(--success-color);
    font-size: var(--ui-font-11, 11px);
  }
  .package-card__supplement {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ui-space-4, 4px) var(--ui-space-9, 9px);
  }
  .package-card__meta-list {
    display: grid;
    gap: var(--ui-space-3, 3px);
  }
  .package-card__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--ui-space-8, 8px) var(--ui-space-12, 12px);
    margin-top: auto;
    padding-top: var(--ui-space-11, 11px);
  }
  .package-card__price {
    display: flex;
    align-items: baseline;
    gap: var(--ui-space-2, 2px);
    line-height: 1.3;
    white-space: nowrap;
  }
  .package-card__price small {
    font-size: var(--ui-font-14, 14px);
  }
  .package-card__price strong {
    font-size: var(--ui-font-27, 27px);
    font-weight: 500;
  }
  .package-card__action.b_btn {
    height: auto;
    min-height: var(--ui-control-36, 36px);
    max-width: 100%;
    padding: var(--ui-space-7, 7px) var(--ui-space-14, 14px);
    font-size: var(--ui-font-13, 13px);
    line-height: 1.4;
    white-space: normal;
    border: 1px solid var(--surface-border-color);
    border-radius: 7px;
  }
  .package-card__action.default_btn {
    background: var(--card-background);
  }
  .is-mobile h3 {
    font-size: var(--ui-font-13, 13px);
  }
  .is-mobile .package-card__top {
    gap: var(--ui-space-7, 7px);
    flex-wrap: wrap;
  }
  .is-mobile .package-card__icon {
    width: var(--ui-layout-25, 25px);
    height: var(--ui-layout-25, 25px);
  }
  .is-mobile .package-card__scenario {
    min-height: var(--ui-layout-18, 18px);
    font-size: var(--ui-font-11, 11px);
    margin-top: var(--ui-space-9, 9px);
  }
  .is-mobile .package-card__benefits {
    margin-top: var(--ui-space-10, 10px);
    padding: var(--ui-space-10, 10px) 0;
  }
  .is-mobile .package-card__value strong {
    font-size: var(--ui-font-26, 26px);
  }
  .is-mobile .package-card__value > span,
  .is-mobile .package-card__storage {
    font-size: var(--ui-font-11, 11px);
  }
  .is-mobile .package-card__footer {
    gap: var(--ui-space-6, 6px);
  }
  .is-mobile .package-card__price strong {
    font-size: var(--ui-font-21, 21px);
  }
  .is-mobile .package-card__action.b_btn {
    min-height: var(--ui-control-32, 32px);
    padding: var(--ui-space-7, 7px) var(--ui-space-6, 6px);
    font-size: var(--ui-font-12, 12px);
  }
</style>
