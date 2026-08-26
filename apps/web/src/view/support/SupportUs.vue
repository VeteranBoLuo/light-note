<template>
  <div class="support-page">
    <MobileTopBar v-if="bookmark.isMobile" />
    <div v-auto-scrollbar class="support-page__scroll">
      <main class="support-shell">
        <header class="support-hero">
          <BButton v-if="!bookmark.isMobile" class="support-back" @click="goBack">
            <SvgIcon :src="icon.arrow_left" size="16" aria-hidden="true" />
            <span>{{ t('common.back') }}</span>
          </BButton>

          <div class="support-hero__layout">
            <div class="support-hero__copy">
              <div class="support-kicker">
                <span class="support-kicker__icon" aria-hidden="true">
                  <SvgIcon :src="icon.support.heart" size="22" />
                </span>
                <span>{{ t('support.kicker') }}</span>
              </div>
              <h1>{{ t('support.heroTitle') }}</h1>
              <p>{{ t('support.heroDescription') }}</p>
            </div>

            <BCard class="support-action-card" variant="raised" padding="22px" radius="18px">
              <span class="support-action-card__label">{{ t('support.platformLabel') }}</span>
              <strong>{{ t('support.platformName') }}</strong>
              <p>{{ t('support.platformDescription') }}</p>
              <BButton
                class="support-primary-action"
                type="primary"
                size="large"
                :disabled="!supportConfigured || !supportStateReady"
                @click="handleSupport"
                v-click-log="{ module: '支持轻笺', operation: '前往爱发电赞助' }"
              >
                <SvgIcon :src="icon.support.heart" size="18" aria-hidden="true" />
                <span>{{ supportPrimaryActionLabel }}</span>
                <SvgIcon :src="icon.noteTree.openPage" size="16" aria-hidden="true" />
              </BButton>
              <span v-if="supportConfigured" class="support-action-card__caption">{{ supportPrimaryActionHint }}</span>
              <span v-else class="support-action-card__unavailable" role="status">{{ t('support.unavailable') }}</span>
            </BCard>
          </div>
        </header>

        <SupportAccountPanel
          v-if="supportStateReady"
          :state="supportState"
          :unlinking="unlinking"
          :preference-saving="preferenceSaving"
          @link="handleOAuthLink"
          @unlink="confirmUnlink"
          @preference-change="handlePreferenceChange"
        />

        <BCard as="section" class="support-store-gateway" padding="20px" radius="18px">
          <span class="support-store-gateway__icon" aria-hidden="true">
            <SvgIcon :src="icon.support.store" size="23" />
          </span>
          <div class="support-store-gateway__copy">
            <h2>{{ t('support.storeGatewayTitle') }}</h2>
            <p>{{ t('support.storeGatewayDescription') }}</p>
          </div>
          <BButton type="default" size="large" @click="openStore">
            <span>{{ t('support.storeGatewayAction') }}</span>
            <SvgIcon :src="icon.arrow_right" size="16" aria-hidden="true" />
          </BButton>
        </BCard>

        <SupportLeaderboard :leaderboard="leaderboard" :loading="leaderboardLoading" />

        <section class="support-section support-options" aria-labelledby="support-options-title">
          <div class="support-section__heading">
            <h2 id="support-options-title">{{ t('support.optionsTitle') }}</h2>
            <p>{{ t('support.optionsDescription') }}</p>
          </div>

          <div class="support-tier-grid">
            <BCard
              v-for="option in supportOptions"
              :key="option.key"
              as="article"
              class="support-tier-card"
              padding="20px"
              radius="18px"
            >
              <div class="support-tier-card__header">
                <span class="support-tier-card__icon" aria-hidden="true">
                  <SvgIcon :src="option.icon" size="21" />
                </span>
                <span class="support-tier-card__eyebrow">
                  {{ option.amount === null ? t('support.optionCustomLabel') : t('support.optionMonthlyLabel') }}
                </span>
              </div>
              <div v-if="option.amount !== null" class="support-tier-card__amount">
                <span>¥</span><strong>{{ option.amount }}</strong
                ><span>{{ t('support.optionPerMonth') }}</span>
              </div>
              <div v-else class="support-tier-card__amount support-tier-card__amount--custom">
                <strong>{{ t('support.optionCustomAmount') }}</strong>
              </div>
              <h3>{{ option.title }}</h3>
              <p>{{ option.description }}</p>
              <BButton
                class="support-tier-card__action"
                type="primary"
                :disabled="!option.configured || !supportStateReady"
                @click="handleSupportOption(option)"
              >
                <span>{{ option.action }}</span>
                <SvgIcon :src="icon.noteTree.openPage" size="15" aria-hidden="true" />
              </BButton>
            </BCard>
          </div>
          <p class="support-options__hint">
            <SvgIcon :src="icon.settings.privacy" size="16" aria-hidden="true" />
            <span>{{ t('support.optionsHint') }}</span>
          </p>
        </section>

        <section class="support-section" aria-labelledby="support-promises-title">
          <div class="support-section__heading">
            <h2 id="support-promises-title">{{ t('support.promisesTitle') }}</h2>
            <p>{{ t('support.promisesDescription') }}</p>
          </div>
          <div class="support-card-grid support-card-grid--promises">
            <BCard v-for="item in promiseCards" :key="item.key" as="article" class="support-info-card" padding="20px">
              <span class="support-info-card__icon" aria-hidden="true"><SvgIcon :src="item.icon" size="22" /></span>
              <h3>{{ item.title }}</h3>
              <p>{{ item.description }}</p>
            </BCard>
          </div>
        </section>

        <section class="support-section" aria-labelledby="support-usage-title">
          <div class="support-section__heading">
            <h2 id="support-usage-title">{{ t('support.usageTitle') }}</h2>
            <p>{{ t('support.usageDescription') }}</p>
          </div>
          <div class="support-card-grid support-card-grid--usage">
            <BCard v-for="item in usageCards" :key="item.key" as="article" class="support-usage-card" padding="18px">
              <span class="support-usage-card__icon" aria-hidden="true"><SvgIcon :src="item.icon" size="21" /></span>
              <div
                ><h3>{{ item.title }}</h3
                ><p>{{ item.description }}</p></div
              >
            </BCard>
          </div>
        </section>

        <BCard as="section" class="support-disclosure" padding="22px" radius="18px">
          <div class="support-disclosure__heading">
            <span class="support-disclosure__icon" aria-hidden="true">
              <SvgIcon :src="icon.settings.privacy" size="24" />
            </span>
            <div>
              <h2>{{ t('support.transparencyTitle') }}</h2>
              <p>{{ t('support.transparencyDescription') }}</p>
            </div>
          </div>
          <ul>
            <li v-for="item in disclosureItems" :key="item">
              <SvgIcon class="support-disclosure__check" :src="icon.message.success" size="17" aria-hidden="true" />
              <span>{{ item }}</span>
            </li>
          </ul>
        </BCard>

        <BCard as="section" class="support-closing" variant="raised" padding="24px" radius="20px">
          <div
            ><h2>{{ t('support.closingTitle') }}</h2
            ><p>{{ t('support.closingDescription') }}</p></div
          >
          <BButton
            class="support-closing__action"
            type="primary"
            size="large"
            :disabled="!supportConfigured || !supportStateReady"
            @click="handleSupport"
          >
            <SvgIcon :src="icon.support.heart" size="18" aria-hidden="true" />
            <span>{{ supportPrimaryActionLabel }}</span>
          </BButton>
        </BCard>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import MobileTopBar from '@/components/mobile/MobileTopBar.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import SupportAccountPanel from './SupportAccountPanel.vue';
  import SupportLeaderboard from './SupportLeaderboard.vue';
  import icon from '@/config/icon';
  import {
    AFDIAN_SUPPORT_CONFIGURED,
    AFDIAN_SUPPORT_OPTIONS,
    openAfdianOAuthPage,
    openAfdianSupportPage,
    openTrackedAfdianCheckout,
  } from '@/config/support';
  import { bookmarkStore } from '@/store';
  import { recordOperation } from '@/api/commonApi';
  import {
    getAfdianLeaderboard,
    getAfdianSupportState,
    unlinkAfdianAccount,
    updateAfdianPublicPreference,
    type AfdianLeaderboard,
    type AfdianSupportState,
  } from '@/api/supportApi';
  import { useMobileTopBar } from '@/composables/useMobileTopBar';
  import { useForegroundRefresh } from '@/composables/useForegroundRefresh';

  const { t } = useI18n();
  const router = useRouter();
  const bookmark = bookmarkStore();
  const supportConfigured = AFDIAN_SUPPORT_CONFIGURED;
  const emptySupportState: AfdianSupportState = {
    authenticated: false,
    oauthAvailable: false,
    orderSyncAvailable: false,
    linked: false,
    orderCount: 0,
    totalAmount: '0.00',
    publicPreference: { participateInRanking: true, showIdentity: false, adminHidden: false },
    recentOrders: [],
  };
  const supportState = ref<AfdianSupportState>({ ...emptySupportState });
  const supportStateReady = ref(false);
  const unlinking = ref(false);
  const preferenceSaving = ref(false);
  const leaderboard = ref<AfdianLeaderboard | null>(null);
  const leaderboardLoading = ref(true);

  const canOpenTrackedSupport = computed(
    () => supportStateReady.value && supportState.value.authenticated && supportState.value.orderSyncAvailable,
  );
  const supportPrimaryActionLabel = computed(() =>
    t(canOpenTrackedSupport.value ? 'support.trackedPrimaryAction' : 'support.creatorPageAction'),
  );
  const supportPrimaryActionHint = computed(() =>
    t(canOpenTrackedSupport.value ? 'support.trackedActionHint' : 'support.creatorPageHint'),
  );
  const promiseCards = computed(() => [
    {
      key: 'free',
      icon: icon.message.success,
      title: t('support.promiseFreeTitle'),
      description: t('support.promiseFreeDescription'),
    },
    {
      key: 'voluntary',
      icon: icon.support.heart,
      title: t('support.promiseVoluntaryTitle'),
      description: t('support.promiseVoluntaryDescription'),
    },
    {
      key: 'privacy',
      icon: icon.settings.privacy,
      title: t('support.promisePrivacyTitle'),
      description: t('support.promisePrivacyDescription'),
    },
  ]);
  const usageCards = computed(() => [
    {
      key: 'infrastructure',
      icon: icon.storage,
      title: t('support.usageInfrastructureTitle'),
      description: t('support.usageInfrastructureDescription'),
    },
    {
      key: 'reliability',
      icon: icon.settings.account,
      title: t('support.usageReliabilityTitle'),
      description: t('support.usageReliabilityDescription'),
    },
    {
      key: 'development',
      icon: icon.coBuild.board,
      title: t('support.usageDevelopmentTitle'),
      description: t('support.usageDevelopmentDescription'),
    },
  ]);
  const supportOptionContent = {
    coffee: {
      icon: icon.support.heart,
      titleKey: 'support.tierCoffeeTitle',
      descriptionKey: 'support.tierCoffeeDescription',
    },
    server: {
      icon: icon.storage,
      titleKey: 'support.tierServerTitle',
      descriptionKey: 'support.tierServerDescription',
    },
    companion: {
      icon: icon.coBuild.board,
      titleKey: 'support.tierCompanionTitle',
      descriptionKey: 'support.tierCompanionDescription',
    },
    custom: {
      icon: icon.userCenter.growth,
      titleKey: 'support.tierCustomTitle',
      descriptionKey: 'support.tierCustomDescription',
    },
  } as const;
  const supportOptions = computed(() =>
    AFDIAN_SUPPORT_OPTIONS.map((option) => {
      const content = supportOptionContent[option.key];
      return {
        ...option,
        icon: content.icon,
        title: t(content.titleKey),
        description: t(content.descriptionKey),
        action: t(option.amount === null ? 'support.optionCustomAction' : 'support.optionAction'),
        logOperation: '选择爱发电赞助档位:' + option.key,
      };
    }),
  );
  const disclosureItems = computed(() => [
    t('support.disclosureExternal'),
    t('support.disclosurePayment'),
    t('support.disclosurePrivacy'),
    t('support.disclosureOrderSeparation'),
  ]);

  function goBack() {
    if (window.history.length > 1) return router.back();
    void router.push(bookmark.isMobile ? '/personCenter' : '/home');
  }

  useMobileTopBar(['support'], { title: () => t('support.pageTitle'), onBack: goBack, showNotification: false });

  function openStore() {
    void router.push('/store');
    void recordOperation({ module: '资源商店', operation: '从支持页进入资源商店' });
  }

  function handleSupport() {
    const opened = canOpenTrackedSupport.value ? openTrackedAfdianCheckout('custom') : openAfdianSupportPage();
    if (!opened) return message.warning(t('support.unavailableMessage'));
    void recordOperation({ module: '支持轻笺', operation: '打开爱发电赞助入口' });
  }

  function handleSupportOption(option: (typeof supportOptions.value)[number]) {
    const opened = canOpenTrackedSupport.value
      ? openTrackedAfdianCheckout(option.key)
      : openAfdianSupportPage(option.url);
    if (!opened) return message.warning(t('support.unavailableMessage'));
    void recordOperation({ module: '支持轻笺', operation: '打开爱发电赞助档位:' + option.key });
  }

  async function loadSupportState() {
    try {
      const next = await getAfdianSupportState();
      supportState.value = {
        ...emptySupportState,
        ...next,
        publicPreference: { ...emptySupportState.publicPreference, ...next.publicPreference },
        recentOrders: Array.isArray(next.recentOrders) ? next.recentOrders : [],
      };
    } finally {
      supportStateReady.value = true;
    }
  }

  async function loadLeaderboard() {
    leaderboardLoading.value = true;
    try {
      leaderboard.value = await getAfdianLeaderboard();
    } finally {
      leaderboardLoading.value = false;
    }
  }

  async function refreshSupport() {
    await Promise.allSettled([loadSupportState(), loadLeaderboard()]);
  }

  async function handlePreferenceChange(value: { participateInRanking: boolean; showIdentity: boolean }) {
    preferenceSaving.value = true;
    try {
      supportState.value.publicPreference = await updateAfdianPublicPreference(value);
      await loadLeaderboard();
      message.success(t('support.rankingPreferenceSaved'));
    } catch {
      message.error(t('support.rankingPreferenceFailed'));
    } finally {
      preferenceSaving.value = false;
    }
  }

  function handleOAuthLink() {
    if (!openAfdianOAuthPage()) return message.warning(t('support.accountLinkUnavailable'));
    void recordOperation({ module: '支持轻笺', operation: '发起爱发电账号关联' });
  }

  function consumeOAuthResult() {
    const currentRoute = router.currentRoute.value;
    const rawResult = currentRoute.query.afdian;
    const result = Array.isArray(rawResult) ? rawResult[0] : rawResult;
    if (!result || !['bound', 'failed', 'session_required'].includes(String(result))) return;
    const query = { ...currentRoute.query };
    delete query.afdian;
    void router.replace({ query });
    if (result === 'bound') return message.success(t('support.accountLinkSuccess'));
    if (result === 'session_required') return message.warning(t('support.accountLinkSessionRequired'));
    message.error(t('support.accountLinkFailed'));
  }

  function confirmUnlink() {
    Alert.alert({
      title: t('support.accountUnlinkTitle'),
      content: t('support.accountUnlinkDescription'),
      okText: t('support.accountUnlinkAction'),
      async onOk() {
        unlinking.value = true;
        try {
          await unlinkAfdianAccount();
          await loadSupportState();
          message.success(t('support.accountUnlinkSuccess'));
        } catch {
          message.error(t('support.accountUnlinkFailed'));
        } finally {
          unlinking.value = false;
        }
      },
    });
  }

  const { markLoaded } = useForegroundRefresh({
    refresh: refreshSupport,
    staleMs: 30_000,
    enabled: () => supportStateReady.value,
  });

  onMounted(() => {
    void refreshSupport().then(() => {
      markLoaded();
      consumeOAuthResult();
    });
    void recordOperation({ module: '支持轻笺', operation: '查看支持页面' });
  });
</script>

<style scoped lang="less">
  .support-page {
    width: 100%;
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    color: var(--text-color);
    background: var(--surface-page-bg, var(--background-color));
  }
  .support-page__scroll {
    min-height: 0;
    flex: 1 1 auto;
    overflow-y: auto;
    overscroll-behavior-y: contain;
  }
  .support-shell {
    width: min(1120px, calc(100% - 40px));
    margin: 0 auto;
    padding: 24px 0 40px;
    box-sizing: border-box;
  }
  .support-hero {
    padding: clamp(24px, 4vw, 46px);
    border: 1px solid var(--surface-border-color);
    border-radius: 24px;
    background: var(--surface-raised-background);
    box-shadow: var(--surface-raised-shadow);
  }
  .support-back {
    height: 36px;
    margin-bottom: 22px;
    padding: 0 12px;
    gap: 7px;
    border: 1px solid var(--surface-border-color);
    color: var(--text-color);
    background: var(--card-background) !important;
  }
  .support-hero__layout {
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(280px, 0.65fr);
    align-items: center;
    gap: clamp(28px, 5vw, 62px);
  }
  .support-hero__copy {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }
  .support-kicker {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 14px;
    color: var(--primary-color);
    font-size: 14px;
    font-weight: 720;
  }
  .support-kicker__icon,
  .support-tier-card__icon,
  .support-info-card__icon,
  .support-usage-card__icon,
  .support-store-gateway__icon,
  .support-disclosure__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    color: var(--primary-color);
    background: var(--primary-color-light);
    border: 1px solid var(--primary-color);
  }
  .support-kicker__icon {
    width: 42px;
    height: 42px;
    border-radius: 14px;
  }
  .support-hero h1 {
    margin: 14px 0 10px;
    font-size: clamp(34px, 5vw, 58px);
    line-height: 1.08;
    letter-spacing: -0.04em;
  }
  .support-hero__copy > p {
    max-width: 650px;
    margin: 0;
    color: var(--text-color-secondary);
    font-size: 16px;
    line-height: 1.85;
  }
  .support-action-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    border: 1px solid var(--surface-border-color);
  }
  .support-action-card__label {
    color: var(--text-color-secondary);
    font-size: 13px;
  }
  .support-action-card strong {
    font-size: 22px;
  }
  .support-action-card p {
    margin: 0 0 6px;
    color: var(--text-color-secondary);
    line-height: 1.65;
  }
  .support-primary-action {
    width: 100%;
    gap: 8px;
  }
  .support-action-card__caption,
  .support-action-card__unavailable {
    font-size: 12px;
    line-height: 1.55;
    color: var(--text-color-secondary);
  }
  .support-action-card__unavailable {
    color: var(--error-color);
  }
  .support-store-gateway {
    margin-top: 22px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 16px;
    border: 1px solid var(--surface-border-color);
  }
  .support-store-gateway__icon {
    width: 46px;
    height: 46px;
    border-radius: 15px;
  }
  .support-store-gateway h2,
  .support-store-gateway p {
    margin: 0;
  }
  .support-store-gateway h2 {
    font-size: 18px;
  }
  .support-store-gateway p {
    margin-top: 5px;
    color: var(--text-color-secondary);
    line-height: 1.6;
  }
  .support-section {
    margin-top: 44px;
  }
  .support-section__heading {
    margin-bottom: 18px;
  }
  .support-section__heading h2 {
    margin: 0;
    font-size: 26px;
  }
  .support-section__heading p {
    margin: 7px 0 0;
    color: var(--text-color-secondary);
    line-height: 1.7;
  }
  .support-tier-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
  }
  .support-tier-card {
    display: flex;
    flex-direction: column;
    min-height: 320px;
    border: 1px solid var(--surface-border-color);
    transition:
      transform 0.18s ease,
      border-color 0.18s ease;
  }
  .support-tier-card:hover {
    transform: translateY(-2px);
    border-color: var(--primary-color);
  }
  .support-tier-card__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .support-tier-card__icon,
  .support-info-card__icon,
  .support-usage-card__icon {
    width: 42px;
    height: 42px;
    border-radius: 13px;
  }
  .support-tier-card__eyebrow {
    color: var(--primary-color);
    font-size: 12px;
    font-weight: 700;
  }
  .support-tier-card__amount {
    display: flex;
    align-items: baseline;
    gap: 5px;
    min-height: 62px;
    margin: 20px 0 10px;
  }
  .support-tier-card__amount strong {
    font-size: 42px;
    line-height: 1;
  }
  .support-tier-card__amount span {
    color: var(--text-color-secondary);
  }
  .support-tier-card__amount--custom strong {
    color: var(--primary-color);
    font-size: 28px;
  }
  .support-tier-card h3 {
    margin: 12px 0 7px;
    font-size: 18px;
  }
  .support-tier-card > p {
    min-height: 70px;
    margin: 0;
    color: var(--text-color-secondary);
    line-height: 1.65;
  }
  .support-tier-card__action {
    width: 100%;
    gap: 6px;
    margin-top: auto;
  }
  .support-options__hint {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin: 14px 4px 0;
    color: var(--text-color-secondary);
    font-size: 13px;
    line-height: 1.6;
  }
  .support-options__hint :deep(.svg-icon) {
    flex: 0 0 auto;
    margin-top: 2px;
    color: var(--primary-color);
  }
  .support-card-grid {
    display: grid;
    gap: 16px;
  }
  .support-card-grid--promises,
  .support-card-grid--usage {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .support-info-card,
  .support-usage-card {
    border: 1px solid var(--surface-border-color);
  }
  .support-info-card h3,
  .support-usage-card h3 {
    margin: 14px 0 7px;
    font-size: 17px;
  }
  .support-info-card p,
  .support-usage-card p {
    margin: 0;
    color: var(--text-color-secondary);
    line-height: 1.65;
  }
  .support-usage-card {
    display: flex;
    align-items: flex-start;
    gap: 14px;
  }
  .support-usage-card h3 {
    margin-top: 2px;
  }
  .support-disclosure {
    margin-top: 44px;
    border: 1px solid var(--surface-border-color);
  }
  .support-disclosure__heading {
    display: flex;
    gap: 14px;
  }
  .support-disclosure__icon {
    width: 48px;
    height: 48px;
    border-radius: 15px;
  }
  .support-disclosure h2,
  .support-disclosure p {
    margin: 0;
  }
  .support-disclosure p {
    margin-top: 6px;
    color: var(--text-color-secondary);
  }
  .support-disclosure ul {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px 18px;
    margin: 20px 0 0;
    padding: 0;
    list-style: none;
  }
  .support-disclosure li {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    color: var(--text-color-secondary);
    line-height: 1.55;
  }
  .support-disclosure__check {
    flex: 0 0 auto;
    margin-top: 2px;
    color: var(--success-color);
  }
  .support-closing {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    margin-top: 24px;
    border: 1px solid var(--primary-color);
  }
  .support-closing h2,
  .support-closing p {
    margin: 0;
  }
  .support-closing p {
    margin-top: 6px;
    color: var(--text-color-secondary);
  }
  .support-closing__action {
    flex: 0 0 auto;
    gap: 8px;
  }

  @media (max-width: 900px) {
    .support-hero__layout {
      grid-template-columns: 1fr;
    }
    .support-tier-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 640px) {
    .support-shell {
      width: calc(100% - 24px);
      max-width: 1120px;
      padding: 14px 0 28px;
    }
    .support-hero {
      padding: 22px 18px;
      border-radius: 20px;
    }
    .support-hero h1 {
      font-size: 34px;
    }
    .support-store-gateway {
      grid-template-columns: auto minmax(0, 1fr);
    }
    .support-store-gateway :deep(.b_btn) {
      grid-column: 1 / -1;
      width: 100%;
    }
    .support-tier-grid,
    .support-card-grid--promises,
    .support-card-grid--usage,
    .support-disclosure ul {
      grid-template-columns: 1fr;
    }
    .support-tier-card {
      min-height: 0;
    }
    .support-tier-card > p {
      min-height: 0;
    }
    .support-section {
      margin-top: 34px;
    }
    .support-closing {
      align-items: stretch;
      flex-direction: column;
    }
    .support-closing__action {
      width: 100%;
    }
  }

  html.light-note-mobile-rendering & {
    .support-hero,
    .support-tier-card,
    .support-store-gateway,
    .support-disclosure,
    .support-closing {
      box-shadow: none;
    }
    .support-tier-card:hover {
      transform: none;
    }
  }
</style>
