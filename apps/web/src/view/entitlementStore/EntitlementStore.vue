<template>
  <div class="store-page">
    <MobileTopBar v-if="bookmark.isMobile" />
    <div v-auto-scrollbar class="store-page__scroll">
      <main class="store-shell">
        <header class="store-hero">
          <BButton v-if="!bookmark.isMobile" class="store-back" @click="goBack">
            <SvgIcon :src="icon.arrow_left" size="16" aria-hidden="true" />
            <span>{{ t('common.back') }}</span>
          </BButton>
          <div class="store-hero__layout">
            <div>
              <div class="store-kicker">
                <span class="store-icon" aria-hidden="true"><SvgIcon :src="icon.support.store" size="23" /></span>
                <span>{{ t('entitlementStore.kicker') }}</span>
              </div>
              <h1>{{ t('entitlementStore.title') }}</h1>
              <p>{{ t('entitlementStore.description') }}</p>
              <div class="store-hero__signals">
                <BChip tone="success">{{ t('entitlementStore.permanentBenefit') }}</BChip>
                <BChip tone="neutral">{{ t('entitlementStore.purchaseNotRanking') }}</BChip>
              </div>
            </div>
            <BCard class="store-separation-card" padding="20px" radius="18px">
              <span class="store-separation-card__icon" aria-hidden="true">
                <SvgIcon :src="icon.support.heart" size="21" />
              </span>
              <div>
                <strong>{{ t('entitlementStore.supportTitle') }}</strong>
                <p>{{ t('entitlementStore.supportDescription') }}</p>
              </div>
              <BButton @click="openSupport">{{ t('entitlementStore.supportAction') }}</BButton>
            </BCard>
          </div>
        </header>

        <BCard as="section" class="store-cost-note" padding="20px" radius="18px">
          <span class="store-cost-note__icon" aria-hidden="true">
            <SvgIcon :src="icon.message.info" size="21" />
          </span>
          <div>
            <h2>{{ t('entitlementStore.costNoticeTitle') }}</h2>
            <p>{{ t('entitlementStore.costNoticeFree') }}</p>
            <p>{{ t('entitlementStore.costNoticePaid') }}</p>
          </div>
        </BCard>

        <section v-if="stateReady && storeState.authenticated" class="store-summary" aria-label="购买摘要">
          <BCard v-for="item in summaryCards" :key="item.key" class="store-summary__card" padding="16px">
            <span class="store-summary__icon" aria-hidden="true"><SvgIcon :src="item.icon" size="19" /></span>
            <div
              ><span>{{ item.label }}</span
              ><strong>{{ item.value }}</strong></div
            >
          </BCard>
        </section>

        <div v-if="stateReady && stateError" class="store-notice is-error" role="alert">
          <SvgIcon :src="icon.message.error" size="16" aria-hidden="true" />
          <span>{{ t('entitlementStore.stateLoadFailed') }}</span>
          <BButton size="small" :loading="stateLoading" @click="loadState">{{ t('common.retry') }}</BButton>
        </div>

        <section class="store-section" aria-labelledby="store-catalog-title">
          <div class="store-section__heading">
            <div>
              <h2 id="store-catalog-title">{{ t('entitlementStore.catalogTitle') }}</h2>
              <p>{{ t('entitlementStore.catalogDescription') }}</p>
            </div>
            <BChip v-if="catalog?.previewMode" tone="pending">{{ t('entitlementStore.localPreview') }}</BChip>
          </div>

          <div v-if="catalog?.previewMode" class="store-notice" role="status">
            <SvgIcon :src="icon.settings.privacy" size="16" aria-hidden="true" />
            <span>{{ t('entitlementStore.localPreviewHint') }}</span>
          </div>

          <div v-if="catalogLoading" class="store-state">
            <BLoading inline loading :title="t('entitlementStore.loading')" />
          </div>
          <div v-else-if="catalogError" class="store-state is-error" role="alert">
            <span>{{ t('entitlementStore.loadFailed') }}</span>
            <BButton size="small" @click="loadCatalog">{{ t('common.retry') }}</BButton>
          </div>
          <div v-else-if="!catalog?.catalogEnabled" class="store-state">
            <span>{{ t('entitlementStore.catalogUnavailable') }}</span>
          </div>
          <template v-else>
            <section v-if="campaignPackages.length" class="campaign-block" aria-labelledby="campaign-title">
              <div class="campaign-heading">
                <div>
                  <h3 id="campaign-title">{{ t('entitlementStore.campaigns.title') }}</h3>
                  <p>{{ t('entitlementStore.campaigns.description') }}</p>
                </div>
                <BChip tone="pending">{{ t('entitlementStore.campaigns.limited') }}</BChip>
              </div>
              <div class="package-grid">
                <BCard
                  v-for="item in campaignPackages"
                  :key="item.campaignSkuId"
                  as="article"
                  class="package-card is-campaign"
                  padding="18px"
                  radius="16px"
                >
                  <div class="package-card__top">
                    <span class="package-card__icon" aria-hidden="true">
                      <SvgIcon :src="packageIcon(item.category)" size="20" />
                    </span>
                    <BChip tone="pending">{{ item.campaignTitle }}</BChip>
                  </div>
                  <div class="package-card__price"
                    ><small>¥</small><strong>{{ item.amount }}</strong></div
                  >
                  <h3>{{ item.title }}</h3>
                  <p class="package-card__benefit">{{ formatBenefit(item.benefit) }}</p>
                  <p class="package-card__meta">
                    {{ t('entitlementStore.campaigns.endsAt', { time: formatDate(item.endsAt) }) }}
                  </p>
                  <p class="package-card__meta">
                    {{
                      item.remainingPurchases === null
                        ? t('entitlementStore.campaigns.limit', { count: item.perUserLimit })
                        : t('entitlementStore.campaigns.remaining', { count: item.remainingPurchases })
                    }}
                  </p>
                  <BButton
                    class="package-card__action"
                    type="primary"
                    :disabled="!canCheckout(item)"
                    :loading="checkoutSkuId === item.campaignSkuId"
                    @click="checkout(item)"
                  >
                    {{ actionLabel(item) }}
                  </BButton>
                </BCard>
              </div>
            </section>

            <BTabs v-model:active-tab="activeCategory" class="store-tabs" variant="segment" :options="categoryTabs" />
            <div class="package-grid">
              <BCard
                v-for="item in visiblePackages"
                :key="item.skuId"
                as="article"
                class="package-card"
                padding="18px"
                radius="16px"
              >
                <div class="package-card__top">
                  <span class="package-card__icon" aria-hidden="true">
                    <SvgIcon :src="packageIcon(item.category)" size="20" />
                  </span>
                  <BChip :tone="item.firstPurchaseStatus === 'available' ? 'success' : 'neutral'">
                    {{ firstPurchaseLabel(item) }}
                  </BChip>
                </div>
                <div class="package-card__price"
                  ><small>¥</small><strong>{{ item.amount }}</strong></div
                >
                <p class="package-card__label">{{ t('entitlementStore.baseArrival') }}</p>
                <h3>{{ formatBenefit(item.base) }}</h3>
                <div class="package-card__first" :class="{ 'is-used': item.firstPurchaseStatus === 'used' }">
                  <span>{{ t('entitlementStore.firstArrival') }}</span>
                  <strong>{{ formatBenefit(item.firstPurchase) }}</strong>
                  <small>{{ t('entitlementStore.firstBonusHint') }}</small>
                </div>
                <p v-if="item.comboSavings" class="package-card__saving">
                  {{ t('entitlementStore.comboSaving', { amount: item.comboSavings }) }}
                </p>
                <BButton
                  class="package-card__action"
                  type="primary"
                  :disabled="!canCheckout(item)"
                  :loading="checkoutSkuId === item.skuId"
                  @click="checkout(item)"
                >
                  {{ actionLabel(item) }}
                </BButton>
              </BCard>
            </div>
            <p class="store-notice store-notice--bottom">
              <SvgIcon :src="icon.settings.privacy" size="16" aria-hidden="true" />
              <span>{{ t('entitlementStore.identityHint') }}</span>
            </p>
          </template>
        </section>

        <section
          v-if="stateReady && storeState.authenticated"
          class="store-section"
          aria-labelledby="purchase-history-title"
        >
          <div class="store-section__heading">
            <div>
              <h2 id="purchase-history-title">{{ t('entitlementStore.historyTitle') }}</h2>
              <p>{{ t('entitlementStore.historyDescription') }}</p>
            </div>
          </div>
          <BCard v-if="!storeState.recentOrders.length" class="store-empty" padding="22px">
            <SvgIcon :src="icon.support.store" size="26" aria-hidden="true" />
            <span>{{ t('entitlementStore.historyEmpty') }}</span>
          </BCard>
          <div v-else class="purchase-history">
            <BCard v-for="order in storeState.recentOrders" :key="order.id" class="purchase-order" padding="16px">
              <span class="purchase-order__icon" aria-hidden="true">
                <SvgIcon
                  :src="
                    order.rewardStorageMb && order.rewardTokens
                      ? icon.growth.reward
                      : order.rewardStorageMb
                        ? icon.growth.storage
                        : icon.growth.ai
                  "
                  size="19"
                />
              </span>
              <div class="purchase-order__main">
                <strong>{{ formatOrderBenefit(order) }}</strong>
                <span>{{ formatDate(order.confirmedAt) }}</span>
              </div>
              <div class="purchase-order__amount">¥{{ order.amount }}</div>
              <BChip :tone="order.rewardStatus === 'credited' ? 'success' : 'pending'">
                {{
                  order.rewardStatus === 'credited' ? t('entitlementStore.credited') : t('entitlementStore.processing')
                }}
              </BChip>
            </BCard>
          </div>
        </section>

        <BCard as="section" class="store-rule-card" padding="20px" radius="18px">
          <span class="store-rule-card__icon" aria-hidden="true">
            <SvgIcon :src="icon.message.success" size="21" />
          </span>
          <div>
            <h2>{{ t('entitlementStore.rulesTitle') }}</h2>
            <p>{{ t('entitlementStore.rulesDescription') }}</p>
          </div>
        </BCard>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import MobileTopBar from '@/components/mobile/MobileTopBar.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import icon from '@/config/icon';
  import { openTrackedEntitlementCheckout } from '@/config/support';
  import { bookmarkStore } from '@/store';
  import { recordOperation } from '@/api/commonApi';
  import {
    getEntitlementStoreCatalog,
    getEntitlementStoreState,
    type AfdianSupportOrder,
    type EntitlementStoreState,
    type SupportBenefit,
    type SupportCampaignPackage,
    type SupportCatalog,
    type SupportPackage,
    type SupportPackageCategory,
  } from '@/api/supportApi';
  import { useMobileTopBar } from '@/composables/useMobileTopBar';
  import { useForegroundRefresh } from '@/composables/useForegroundRefresh';
  import { formatAiQuotaTokens } from '@/composables/useAiQuotaStatus';

  const { t, locale } = useI18n();
  const router = useRouter();
  const route = useRoute();
  const bookmark = bookmarkStore();
  const emptyStoreState: EntitlementStoreState = {
    authenticated: false,
    orderSyncAvailable: false,
    orderCount: 0,
    totalAmount: '0.00',
    grantedTokens: 0,
    grantedStorageMb: 0,
    recentOrders: [],
  };
  const catalog = ref<SupportCatalog | null>(null);
  const catalogLoading = ref(true);
  const catalogError = ref(false);
  const storeState = ref<EntitlementStoreState>({ ...emptyStoreState });
  const stateReady = ref(false);
  const stateLoading = ref(false);
  const stateError = ref(false);
  const checkoutSkuId = ref('');
  const requestedCategory = String(route.query.category || '');
  const activeCategory = ref<SupportPackageCategory>(
    ['ai', 'storage', 'combo'].includes(requestedCategory) ? (requestedCategory as SupportPackageCategory) : 'ai',
  );

  const categoryTabs = computed(() => [
    { key: 'ai', label: t('entitlementStore.tabs.ai') },
    { key: 'storage', label: t('entitlementStore.tabs.storage') },
    { key: 'combo', label: t('entitlementStore.tabs.combo') },
  ]);
  const visiblePackages = computed(() =>
    (catalog.value?.packages || []).filter((item) => item.category === activeCategory.value),
  );
  const campaignPackages = computed(() => catalog.value?.campaigns || []);
  const summaryCards = computed(() => [
    {
      key: 'orders',
      icon: icon.support.store,
      label: t('entitlementStore.summaryOrders'),
      value: String(storeState.value.orderCount),
    },
    {
      key: 'ai',
      icon: icon.growth.ai,
      label: t('entitlementStore.summaryAi'),
      value: formatAiQuotaTokens(storeState.value.grantedTokens, locale.value),
    },
    {
      key: 'storage',
      icon: icon.growth.storage,
      label: t('entitlementStore.summaryStorage'),
      value: formatStorage(storeState.value.grantedStorageMb),
    },
  ]);

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
  function formatOrderBenefit(order: AfdianSupportOrder) {
    const credited = order.rewardStatus === 'credited';
    return formatBenefit({
      aiTokens: credited ? order.grantedTokens : order.rewardTokens,
      storageMb: credited ? order.grantedStorageMb : order.rewardStorageMb,
    });
  }
  function packageIcon(category: SupportPackageCategory) {
    if (category === 'ai') return icon.growth.ai;
    if (category === 'storage') return icon.growth.storage;
    return icon.growth.reward;
  }
  function formatDate(value?: string | null) {
    if (!value) return t('common.unknown');
    const date = new Date(String(value).replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }
  function firstPurchaseLabel(item: SupportPackage) {
    if (catalog.value?.previewMode) return t('entitlementStore.previewFirstStatus');
    if (item.firstPurchaseStatus === 'used') return t('entitlementStore.firstUsed');
    if (item.firstPurchaseStatus === 'login_required') return t('entitlementStore.firstLogin');
    return t('entitlementStore.firstAvailable');
  }
  function canCheckout(item: SupportPackage | SupportCampaignPackage) {
    if (
      !stateReady.value ||
      stateLoading.value ||
      stateError.value ||
      !catalog.value?.checkoutEnabled ||
      !storeState.value.authenticated
    ) {
      return false;
    }
    if ('limitReached' in item && (item.limitReached || item.hasActiveCheckout)) return false;
    return true;
  }
  function actionLabel(item: SupportPackage | SupportCampaignPackage) {
    if ('limitReached' in item) {
      if (item.limitReached) return t('entitlementStore.limitReached');
      if (item.hasActiveCheckout) return t('entitlementStore.checkoutPending');
    }
    if (!stateReady.value || stateLoading.value) return t('entitlementStore.stateLoading');
    if (stateError.value) return t('entitlementStore.stateUnavailable');
    if (!catalog.value?.checkoutEnabled) return t('entitlementStore.checkoutUnavailable');
    if (!storeState.value.authenticated) return t('entitlementStore.loginRequired');
    return t('entitlementStore.checkout');
  }
  function checkout(item: SupportPackage | SupportCampaignPackage) {
    if (!canCheckout(item)) {
      const key = stateError.value
        ? 'entitlementStore.stateLoadFailed'
        : !storeState.value.authenticated
          ? 'entitlementStore.loginMessage'
          : 'limitReached' in item && item.hasActiveCheckout
            ? 'entitlementStore.checkoutPendingMessage'
            : 'entitlementStore.unavailable';
      return message.warning(t(key));
    }
    const skuId = 'campaignSkuId' in item ? item.campaignSkuId : item.skuId;
    const catalogVersion = 'catalogVersion' in item ? item.catalogVersion : String(catalog.value?.catalogVersion || '');
    checkoutSkuId.value = skuId;
    const opened = openTrackedEntitlementCheckout(skuId, catalogVersion);
    checkoutSkuId.value = '';
    if (!opened) return message.warning(t('entitlementStore.unavailable'));
    void recordOperation({ module: '资源商店', operation: '打开资源购买:' + item.skuId });
  }
  function goBack() {
    if (window.history.length > 1) return router.back();
    void router.push(bookmark.isMobile ? '/personCenter' : '/home');
  }
  function openSupport() {
    void router.push('/support');
    void recordOperation({ module: '资源商店', operation: '前往支持轻笺页面' });
  }
  async function loadCatalog() {
    catalogLoading.value = true;
    catalogError.value = false;
    try {
      catalog.value = await getEntitlementStoreCatalog();
    } catch {
      catalogError.value = true;
    } finally {
      catalogLoading.value = false;
    }
  }
  async function loadState() {
    stateLoading.value = true;
    stateError.value = false;
    try {
      storeState.value = { ...emptyStoreState, ...(await getEntitlementStoreState()) };
    } catch {
      stateError.value = true;
    } finally {
      stateReady.value = true;
      stateLoading.value = false;
    }
  }
  async function refreshStore() {
    await Promise.all([loadCatalog(), loadState()]);
  }

  useMobileTopBar(['store'], { title: () => t('entitlementStore.pageTitle'), onBack: goBack, showNotification: false });
  const { markLoaded } = useForegroundRefresh({
    refresh: refreshStore,
    staleMs: 30_000,
    enabled: () => stateReady.value,
  });
  onMounted(() => {
    void refreshStore().then(markLoaded);
    void recordOperation({ module: '资源商店', operation: '查看资源商店' });
  });
  watch(
    () => route.query.category,
    (value) => {
      const category = String(value || '');
      if (['ai', 'storage', 'combo'].includes(category)) activeCategory.value = category as SupportPackageCategory;
    },
  );
  watch(activeCategory, (category) => {
    if (route.query.category !== category) void router.replace({ query: { ...route.query, category } });
  });
</script>

<style scoped lang="less">
  .store-page {
    width: 100%;
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    color: var(--text-color);
    background: var(--surface-page-bg, var(--background-color));
  }
  .store-page__scroll {
    min-height: 0;
    flex: 1 1 auto;
    overflow-y: auto;
    overscroll-behavior-y: contain;
  }
  .store-shell {
    width: min(1160px, calc(100% - 40px));
    margin: 0 auto;
    padding: 24px 0 40px;
    box-sizing: border-box;
  }
  .store-hero {
    padding: clamp(24px, 4vw, 42px);
    border: 1px solid var(--surface-border-color);
    border-radius: 24px;
    background: var(--surface-raised-background);
    box-shadow: var(--surface-raised-shadow);
  }
  .store-back {
    height: 36px;
    margin-bottom: 22px;
    gap: 7px;
    border: 1px solid var(--surface-border-color);
    background: var(--card-background) !important;
  }
  .store-hero__layout {
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(300px, 0.75fr);
    align-items: center;
    gap: clamp(28px, 5vw, 60px);
  }
  .store-kicker {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--primary-color);
    font-size: 14px;
    font-weight: 720;
  }
  .store-icon,
  .store-separation-card__icon,
  .store-cost-note__icon,
  .package-card__icon,
  .store-summary__icon,
  .purchase-order__icon,
  .store-rule-card__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    color: var(--primary-color);
    background: var(--primary-color-light);
    border: 1px solid var(--primary-color);
  }
  .store-icon {
    width: 44px;
    height: 44px;
    border-radius: 14px;
  }
  .store-hero h1 {
    margin: 18px 0 10px;
    font-size: clamp(36px, 5vw, 58px);
    line-height: 1.08;
    letter-spacing: -0.04em;
  }
  .store-hero__layout > div > p {
    max-width: 670px;
    margin: 0;
    color: var(--text-color-secondary);
    font-size: 16px;
    line-height: 1.8;
  }
  .store-hero__signals {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 18px;
  }
  .store-separation-card {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 14px;
    border: 1px solid var(--surface-border-color);
  }
  .store-separation-card__icon {
    width: 44px;
    height: 44px;
    border-radius: 14px;
  }
  .store-separation-card strong {
    font-size: 18px;
  }
  .store-separation-card p {
    margin: 6px 0 0;
    color: var(--text-color-secondary);
    line-height: 1.6;
  }
  .store-separation-card :deep(.b_btn) {
    grid-column: 1 / -1;
    width: 100%;
  }
  .store-cost-note {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    margin-top: 20px;
    border: 1px solid var(--surface-border-color);
  }
  .store-cost-note__icon {
    width: 40px;
    height: 40px;
    border-radius: 12px;
  }
  .store-cost-note h2,
  .store-cost-note p {
    margin: 0;
  }
  .store-cost-note h2 {
    font-size: 18px;
  }
  .store-cost-note p {
    margin-top: 6px;
    color: var(--text-color-secondary);
    line-height: 1.65;
  }
  .store-summary {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
    margin-top: 20px;
  }
  .store-summary__card {
    display: flex;
    align-items: center;
    gap: 12px;
    border: 1px solid var(--surface-border-color);
  }
  .store-summary__icon,
  .purchase-order__icon,
  .store-rule-card__icon {
    width: 40px;
    height: 40px;
    border-radius: 12px;
  }
  .store-summary__card div {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .store-summary__card span {
    color: var(--text-color-secondary);
    font-size: 12px;
  }
  .store-summary__card strong {
    overflow: hidden;
    font-size: 17px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .store-section {
    margin-top: 42px;
  }
  .store-section__heading,
  .campaign-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 18px;
  }
  .store-section__heading h2,
  .campaign-heading h3 {
    margin: 0;
    font-size: 27px;
  }
  .store-section__heading p,
  .campaign-heading p {
    margin: 7px 0 0;
    color: var(--text-color-secondary);
    line-height: 1.65;
  }
  .store-notice {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 16px;
    padding: 11px 13px;
    border: 1px solid var(--warning-color);
    border-radius: 12px;
    color: var(--text-color-secondary);
    font-size: 13px;
    line-height: 1.55;
  }
  .store-notice :deep(.svg-icon) {
    flex: 0 0 auto;
    margin-top: 2px;
    color: var(--warning-color);
  }
  .store-notice.is-error {
    border-color: var(--error-color, #c33f47);
    color: var(--error-color, #c33f47);
  }
  .store-notice.is-error :deep(.svg-icon) {
    color: currentColor;
  }
  .store-notice--bottom {
    margin: 14px 2px 0;
    border-color: var(--surface-border-color);
  }
  .store-notice--bottom :deep(.svg-icon) {
    color: var(--primary-color);
  }
  .store-state {
    min-height: 160px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    border: 1px dashed var(--surface-border-color);
    border-radius: 16px;
    color: var(--text-color-secondary);
  }
  .store-state.is-error {
    color: var(--error-color);
  }
  .campaign-block {
    margin-bottom: 28px;
    padding: 22px;
    border: 1px solid var(--warning-color);
    border-radius: 18px;
    background: var(--card-background);
  }
  .campaign-heading h3 {
    font-size: 21px;
  }
  .store-tabs {
    margin-bottom: 18px;
  }
  .package-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 15px;
  }
  .package-card {
    display: flex;
    flex-direction: column;
    min-height: 370px;
    border: 1px solid var(--surface-border-color);
    transition:
      transform 0.18s ease,
      border-color 0.18s ease;
  }
  .package-card:hover {
    transform: translateY(-2px);
    border-color: var(--primary-color);
  }
  .package-card.is-campaign {
    min-height: 340px;
  }
  .package-card__top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 40px;
  }
  .package-card__icon {
    width: 40px;
    height: 40px;
    border-radius: 12px;
  }
  .package-card__price {
    display: flex;
    align-items: flex-start;
    gap: 3px;
    margin-top: 19px;
  }
  .package-card__price small {
    margin-top: 8px;
    color: var(--text-color-secondary);
    font-size: 14px;
  }
  .package-card__price strong {
    font-size: 40px;
    line-height: 1;
  }
  .package-card__label {
    margin: 16px 0 4px;
    color: var(--text-color-secondary);
    font-size: 12px;
  }
  .package-card h3 {
    margin: 8px 0 12px;
    font-size: 19px;
    line-height: 1.35;
  }
  .package-card__benefit {
    margin: 4px 0 14px;
    color: var(--primary-color);
    font-size: 17px;
    font-weight: 700;
  }
  .package-card__first {
    padding: 12px;
    border: 1px solid var(--primary-color);
    border-radius: 12px;
    background: var(--primary-color-light);
  }
  .package-card__first span,
  .package-card__first strong,
  .package-card__first small {
    display: block;
  }
  .package-card__first span,
  .package-card__first small {
    color: var(--text-color-secondary);
    font-size: 11px;
  }
  .package-card__first strong {
    margin: 4px 0;
    color: var(--primary-color);
    font-size: 16px;
  }
  .package-card__first.is-used {
    border-color: var(--surface-border-color);
    background: var(--surface-panel-bg);
  }
  .package-card__first.is-used strong {
    color: var(--text-color);
  }
  .package-card__saving {
    margin: 10px 0 0;
    color: var(--success-color);
    font-size: 12px;
    font-weight: 650;
  }
  .package-card__meta {
    margin: 4px 0;
    color: var(--text-color-secondary);
    font-size: 12px;
    line-height: 1.5;
  }
  .package-card__action {
    width: 100%;
    margin-top: auto;
  }
  .purchase-history {
    display: grid;
    gap: 10px;
  }
  .purchase-order {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 13px;
    border: 1px solid var(--surface-border-color);
  }
  .purchase-order__main {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .purchase-order__main strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .purchase-order__main span {
    color: var(--text-color-secondary);
    font-size: 12px;
  }
  .purchase-order__amount {
    font-weight: 700;
  }
  .store-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-height: 90px;
    border: 1px dashed var(--surface-border-color);
    color: var(--text-color-secondary);
  }
  .store-rule-card {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    margin-top: 28px;
    border: 1px solid var(--surface-border-color);
  }
  .store-rule-card h2,
  .store-rule-card p {
    margin: 0;
  }
  .store-rule-card h2 {
    font-size: 18px;
  }
  .store-rule-card p {
    margin-top: 6px;
    color: var(--text-color-secondary);
    line-height: 1.65;
  }

  @media (max-width: 980px) {
    .store-hero__layout {
      grid-template-columns: 1fr;
    }
    .package-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 640px) {
    .store-shell {
      width: calc(100% - 24px);
      max-width: 1160px;
      padding: 14px 0 28px;
    }
    .store-hero {
      padding: 22px 18px;
      border-radius: 20px;
    }
    .store-hero h1 {
      font-size: 35px;
    }
    .store-summary,
    .package-grid {
      grid-template-columns: 1fr;
    }
    .store-separation-card {
      grid-template-columns: 1fr;
      gap: 12px;
    }
    .store-cost-note {
      flex-direction: column;
      gap: 12px;
    }
    .store-section__heading,
    .campaign-heading {
      align-items: flex-start;
      flex-direction: column;
      gap: 10px;
    }
    .campaign-block {
      padding: 16px;
    }
    .package-card {
      min-height: 0;
    }
    .package-card__action {
      margin-top: 18px;
    }
    .purchase-order {
      grid-template-columns: auto minmax(0, 1fr) auto;
    }
    .purchase-order :deep(.b-chip) {
      grid-column: 2 / -1;
      justify-self: start;
    }
  }
  html.light-note-mobile-rendering & {
    .store-hero,
    .store-cost-note,
    .package-card,
    .store-summary__card,
    .purchase-order {
      box-shadow: none;
    }
    .package-card:hover {
      transform: none;
    }
  }
</style>
