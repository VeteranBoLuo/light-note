<template>
  <div class="store-page">
    <MobileTopBar v-if="bookmark.isMobile" />
    <div v-auto-scrollbar class="store-page__scroll">
      <main class="store-shell">
        <BButton v-if="!bookmark.isMobile" class="store-back" @click="goBack">
          <SvgIcon :src="icon.arrow_left" size="16" aria-hidden="true" />
          <span>{{ t('common.back') }}</span>
        </BButton>

        <header class="store-hero">
          <div class="store-hero__intro">
            <div class="store-kicker">
              <span class="store-icon" aria-hidden="true"><SvgIcon :src="icon.support.store" size="22" /></span>
              <span>{{ t('entitlementStore.kicker') }}</span>
            </div>
            <h1>{{ t('entitlementStore.title') }}</h1>
            <p>{{ t('entitlementStore.description') }}</p>
            <div class="store-hero__signals">
              <BChip tone="success">{{ t('entitlementStore.permanentBenefit') }}</BChip>
              <BChip tone="neutral">{{ t('entitlementStore.firstPurchasePerPackage') }}</BChip>
            </div>
          </div>

          <BCard
            as="section"
            class="store-account"
            padding="18px"
            radius="18px"
            :aria-label="t('entitlementStore.accountSummaryAria')"
          >
            <div class="store-account__heading">
              <span class="store-account__icon" aria-hidden="true">
                <SvgIcon :src="icon.support.store" size="19" />
              </span>
              <div>
                <strong>{{ t('entitlementStore.accountTitle') }}</strong>
                <span v-if="stateReady && !stateError && storeState.authenticated">{{ accountName }}</span>
              </div>
            </div>
            <div v-if="!stateReady || stateLoading" class="store-account__state">
              <BLoading inline loading :title="t('entitlementStore.accountLoading')" />
            </div>
            <div v-else-if="stateError" class="store-account__state is-error" role="alert">
              <SvgIcon :src="icon.message.error" size="18" aria-hidden="true" />
              <div>
                <strong>{{ t('entitlementStore.stateUnavailable') }}</strong>
                <span>{{ t('entitlementStore.stateLoadFailed') }}</span>
              </div>
              <BButton size="small" :loading="stateLoading" @click="loadState">{{ t('common.retry') }}</BButton>
            </div>
            <div v-else-if="!storeState.authenticated" class="store-account__state">
              <SvgIcon :src="icon.settings.privacy" size="19" aria-hidden="true" />
              <div>
                <strong>{{ t('entitlementStore.accountGuestTitle') }}</strong>
                <span>{{ t('entitlementStore.accountGuestDescription') }}</span>
              </div>
            </div>
            <template v-else>
              <div class="store-account__metrics">
                <div v-for="item in summaryCards" :key="item.key">
                  <span>{{ item.label }}</span>
                  <strong>{{ item.value }}</strong>
                </div>
              </div>
              <p class="store-account__caption">
                {{
                  storeState.orderCount
                    ? t('entitlementStore.accountSummaryDescription')
                    : t('entitlementStore.accountEmptyDescription')
                }}
              </p>
            </template>
          </BCard>
        </header>

        <BCard as="section" class="store-cost-note" padding="15px 18px" radius="16px">
          <span class="store-cost-note__icon" aria-hidden="true"><SvgIcon :src="icon.message.info" size="19" /></span>
          <p>
            <strong>{{ t('entitlementStore.costNoticeTitle') }}</strong>
            <span>{{ t('entitlementStore.costNoticeBody') }}</span>
          </p>
        </BCard>

        <section class="store-section" aria-labelledby="store-catalog-title">
          <div class="store-section__heading">
            <div>
              <h2 id="store-catalog-title">{{ t('entitlementStore.catalogTitle') }}</h2>
              <p>{{ t('entitlementStore.catalogDescription') }}</p>
            </div>
            <BChip :tone="catalog?.previewMode ? 'pending' : 'neutral'">
              {{ catalog?.previewMode ? t('entitlementStore.localPreview') : t('entitlementStore.eligibilityBadge') }}
            </BChip>
          </div>

          <div v-if="catalog?.previewMode" class="store-notice" role="status">
            <SvgIcon :src="icon.settings.privacy" size="16" aria-hidden="true" />
            <span>{{ t('entitlementStore.localPreviewHint') }}</span>
          </div>
          <div v-if="catalogLoading" class="store-state">
            <BLoading inline loading :title="t('entitlementStore.loading')" />
          </div>
          <div v-else-if="catalogError" class="store-state is-error" role="alert">
            <SvgIcon :src="icon.message.error" size="18" aria-hidden="true" />
            <span>{{ t('entitlementStore.loadFailed') }}</span>
            <BButton size="small" @click="loadCatalog">{{ t('common.retry') }}</BButton>
          </div>
          <div v-else-if="!catalog?.catalogEnabled" class="store-state">
            <SvgIcon :src="icon.support.store" size="21" aria-hidden="true" />
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
                <EntitlementPackageCard
                  v-for="item in campaignPackages"
                  :key="item.campaignSkuId"
                  :item="item"
                  :action-label="actionLabel(item)"
                  :disabled="!canCheckout(item)"
                  @select="openCheckoutModal"
                />
              </div>
            </section>

            <BTabs v-model:active-tab="activeCategory" class="store-tabs" variant="solid" :options="categoryTabs" />
            <div class="package-grid">
              <EntitlementPackageCard
                v-for="(item, index) in visiblePackages"
                :key="item.skuId"
                :item="item"
                :index="index"
                :preview-mode="Boolean(catalog.previewMode)"
                :action-label="actionLabel(item)"
                :disabled="!canCheckout(item)"
                @select="openCheckoutModal"
              />
            </div>
            <p class="store-notice store-notice--bottom">
              <SvgIcon :src="icon.settings.privacy" size="16" aria-hidden="true" />
              <span>{{ t('entitlementStore.identityHint') }}</span>
            </p>
          </template>
        </section>

        <section class="store-section store-flow" aria-labelledby="purchase-flow-title">
          <div class="store-section__heading">
            <div>
              <h2 id="purchase-flow-title">{{ t('entitlementStore.flowTitle') }}</h2>
              <p>{{ t('entitlementStore.flowDescription') }}</p>
            </div>
          </div>
          <div class="store-flow__steps">
            <BCard v-for="step in purchaseSteps" :key="step.key" class="store-flow__step" padding="18px" radius="16px">
              <span>{{ step.number }}</span>
              <div>
                <strong>{{ step.title }}</strong>
                <p>{{ step.description }}</p>
              </div>
            </BCard>
          </div>
          <p class="store-flow__rule">
            <SvgIcon :src="icon.message.success" size="17" aria-hidden="true" />
            <span>{{ t('entitlementStore.rulesDescription') }}</span>
          </p>
        </section>

        <section class="store-lower" :class="{ 'has-history': showHistory }">
          <div v-if="showHistory" class="store-history" aria-labelledby="purchase-history-title">
            <div class="store-lower__heading">
              <h2 id="purchase-history-title">{{ t('entitlementStore.historyTitle') }}</h2>
              <p>{{ t('entitlementStore.historyDescription') }}</p>
            </div>
            <BCard v-if="!storeState.recentOrders.length" class="store-empty" padding="22px">
              <SvgIcon :src="icon.support.store" size="24" aria-hidden="true" />
              <span>{{ t('entitlementStore.historyEmpty') }}</span>
            </BCard>
            <div v-else class="purchase-history">
              <BCard v-for="order in storeState.recentOrders" :key="order.id" class="purchase-order" padding="15px">
                <span class="purchase-order__icon" aria-hidden="true"
                  ><SvgIcon :src="orderIcon(order)" size="19"
                /></span>
                <div class="purchase-order__main">
                  <strong>{{ formatOrderBenefit(order) }}</strong>
                  <span>{{ formatDate(order.confirmedAt) }}</span>
                </div>
                <div class="purchase-order__amount">¥{{ order.amount }}</div>
                <BChip :tone="order.rewardStatus === 'credited' ? 'success' : 'pending'">
                  {{
                    order.rewardStatus === 'credited'
                      ? t('entitlementStore.credited')
                      : t('entitlementStore.processing')
                  }}
                </BChip>
              </BCard>
            </div>
          </div>

          <BCard as="aside" class="store-support" padding="20px" radius="18px">
            <span class="store-support__icon" aria-hidden="true"><SvgIcon :src="icon.support.heart" size="21" /></span>
            <div>
              <h2>{{ t('entitlementStore.supportTitle') }}</h2>
              <p>{{ t('entitlementStore.supportDescription') }}</p>
            </div>
            <BButton @click="openSupport">{{ t('entitlementStore.supportAction') }}</BButton>
          </BCard>
        </section>
      </main>
    </div>

    <EntitlementCheckoutModal
      v-model:visible="checkoutModalVisible"
      :item="selectedItem"
      :package-name="selectedPackageName"
      :account-name="accountName"
      :expected-benefit="selectedExpectedBenefit"
      :can-confirm="Boolean(selectedItem && canCheckout(selectedItem))"
      @confirm="confirmCheckout"
    />
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
  import { bookmarkStore, useUserStore } from '@/store';
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
  import EntitlementCheckoutModal from './EntitlementCheckoutModal.vue';
  import EntitlementPackageCard from './EntitlementPackageCard.vue';

  type StoreItem = SupportPackage | SupportCampaignPackage;
  const { t, locale } = useI18n();
  const router = useRouter();
  const route = useRoute();
  const bookmark = bookmarkStore();
  const user = useUserStore();
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
  const checkoutModalVisible = ref(false);
  const selectedItem = ref<StoreItem | null>(null);
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
  const accountName = computed(() => {
    if (!storeState.value.authenticated || !user.id) return t('entitlementStore.confirm.currentAccount');
    return user.alias || user.userName || t('entitlementStore.confirm.currentAccount');
  });
  const summaryCards = computed(() => [
    { key: 'orders', label: t('entitlementStore.summaryOrders'), value: String(storeState.value.orderCount) },
    {
      key: 'ai',
      label: t('entitlementStore.summaryAi'),
      value: formatAiQuotaTokens(storeState.value.grantedTokens, locale.value),
    },
    {
      key: 'storage',
      label: t('entitlementStore.summaryStorage'),
      value: formatStorage(storeState.value.grantedStorageMb),
    },
  ]);
  const purchaseSteps = computed(() => [
    {
      key: 'choose',
      number: '1',
      title: t('entitlementStore.flow.chooseTitle'),
      description: t('entitlementStore.flow.chooseDescription'),
    },
    {
      key: 'pay',
      number: '2',
      title: t('entitlementStore.flow.payTitle'),
      description: t('entitlementStore.flow.payDescription'),
    },
    {
      key: 'return',
      number: '3',
      title: t('entitlementStore.flow.returnTitle'),
      description: t('entitlementStore.flow.returnDescription'),
    },
  ]);
  const showHistory = computed(() => stateReady.value && !stateError.value && storeState.value.authenticated);
  const selectedExpectedBenefit = computed<SupportBenefit>(() => {
    const item = selectedItem.value;
    if (!item) return { aiTokens: 0, storageMb: 0 };
    if ('campaignSkuId' in item) return item.benefit;
    return item.firstPurchaseStatus === 'used' ? item.base : item.firstPurchase;
  });
  const selectedPackageName = computed(() => {
    const item = selectedItem.value;
    if (!item) return '';
    if ('campaignSkuId' in item) return item.title;
    const siblings = (catalog.value?.packages || []).filter((candidate) => candidate.category === item.category);
    const index = Math.max(
      0,
      siblings.findIndex((candidate) => candidate.skuId === item.skuId),
    );
    const tier = ['light', 'regular', 'frequent', 'heavy'][Math.min(index, 3)];
    return t('entitlementStore.packageName', {
      category: t(`entitlementStore.categoryNames.${item.category}`),
      tier: t(`entitlementStore.tiers.${tier}`),
    });
  });

  function formatStorage(mb: number) {
    if (mb >= 1024) return Number((mb / 1024).toFixed(2)) + ' GB';
    return mb + ' MB';
  }
  function formatBenefit(benefit: SupportBenefit) {
    const parts: string[] = [];
    if (benefit.aiTokens > 0)
      parts.push(t('entitlementStore.aiAmount', { amount: formatAiQuotaTokens(benefit.aiTokens, locale.value) }));
    if (benefit.storageMb > 0)
      parts.push(t('entitlementStore.storageAmount', { amount: formatStorage(benefit.storageMb) }));
    return parts.join(' + ');
  }
  function formatOrderBenefit(order: AfdianSupportOrder) {
    const credited = order.rewardStatus === 'credited';
    return formatBenefit({
      aiTokens: credited ? order.grantedTokens : order.rewardTokens,
      storageMb: credited ? order.grantedStorageMb : order.rewardStorageMb,
    });
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
  function canCheckout(item: StoreItem) {
    if (
      !stateReady.value ||
      stateLoading.value ||
      stateError.value ||
      !catalog.value?.checkoutEnabled ||
      !storeState.value.authenticated
    )
      return false;
    if ('limitReached' in item) return !item.limitReached && !item.hasActiveCheckout;
    return item.firstPurchaseStatus !== 'login_required';
  }
  function actionLabel(item: StoreItem) {
    if ('limitReached' in item) {
      if (item.limitReached) return t('entitlementStore.limitReached');
      if (item.hasActiveCheckout) return t('entitlementStore.checkoutPending');
    }
    if (!stateReady.value || stateLoading.value) return t('entitlementStore.stateLoading');
    if (stateError.value) return t('entitlementStore.stateUnavailable');
    if (!catalog.value?.checkoutEnabled) return t('entitlementStore.checkoutUnavailable');
    if (!storeState.value.authenticated || (!('limitReached' in item) && item.firstPurchaseStatus === 'login_required'))
      return t('entitlementStore.loginRequired');
    return t('entitlementStore.buyFor', { amount: item.amount });
  }
  function unavailableMessage(item: StoreItem) {
    if (stateError.value) return t('entitlementStore.stateLoadFailed');
    if (!storeState.value.authenticated) return t('entitlementStore.loginMessage');
    if ('limitReached' in item && item.hasActiveCheckout) return t('entitlementStore.checkoutPendingMessage');
    return t('entitlementStore.unavailable');
  }
  function openCheckoutModal(item: StoreItem) {
    if (!canCheckout(item)) return message.warning(unavailableMessage(item));
    selectedItem.value = item;
    checkoutModalVisible.value = true;
  }
  function confirmCheckout() {
    const item = selectedItem.value;
    if (!item || !canCheckout(item)) {
      if (item) message.warning(unavailableMessage(item));
      return;
    }
    const skuId = 'campaignSkuId' in item ? item.campaignSkuId : item.skuId;
    const catalogVersion = 'catalogVersion' in item ? item.catalogVersion : String(catalog.value?.catalogVersion || '');
    // 保持在确认按钮的同步点击栈中打开外部页面，避免浏览器或 App WebView 拦截新窗口。
    const opened = openTrackedEntitlementCheckout(skuId, catalogVersion);
    if (!opened) return message.warning(t('entitlementStore.unavailable'));
    checkoutModalVisible.value = false;
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
  function syncSelectedItem(nextCatalog: SupportCatalog) {
    const current = selectedItem.value;
    if (!current) return;
    const nextItem =
      'campaignSkuId' in current
        ? nextCatalog.campaigns.find((item) => item.campaignSkuId === current.campaignSkuId)
        : nextCatalog.packages.find((item) => item.skuId === current.skuId);
    if (!nextItem) {
      checkoutModalVisible.value = false;
      return;
    }
    selectedItem.value = nextItem;
  }
  async function loadCatalog() {
    catalogLoading.value = true;
    catalogError.value = false;
    try {
      const nextCatalog = await getEntitlementStoreCatalog();
      catalog.value = nextCatalog;
      syncSelectedItem(nextCatalog);
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
  watch(checkoutModalVisible, (visible) => {
    if (!visible) selectedItem.value = null;
  });
</script>

<style scoped lang="less">
  @import './entitlementStore.less';
</style>
