<template>
  <div
    class="support-page commerce-surface"
    :class="{ 'is-mobile': bookmark.isMobile, 'is-compact': !bookmark.isDesktop, 'is-dense': bookmark.isCompactLayout }"
  >
    <MobileTopBar v-if="bookmark.isMobile" />
    <div v-auto-scrollbar class="support-page__scroll"
      ><div class="commerce-page-content"
        ><div class="commerce-landscape commerce-landscape--support" aria-hidden="true"
          ><img src="/brand-scenes/support-strip-footer.webp" alt="" loading="lazy" decoding="async"
        /></div>
        <BrandSceneHero
          scene="support"
          :title="t('autumn.reference.supportTitle')"
          :description="t('autumn.reference.supportIntro')"
          :eyebrow="t('support.pageTitle')" />
        <main class="support-shell">
          <div class="support-top">
            <section class="support-section support-options" aria-labelledby="support-options-title">
              <div class="support-section__heading"
                ><h2 id="support-options-title">{{ t('support.optionsTitle') }}</h2
                ><p>{{ t('support.optionsDescription') }}</p></div
              >
              <div class="support-tier-grid">
                <BCard
                  v-for="(option, index) in supportOptions"
                  :key="option.key"
                  as="article"
                  class="support-tier-card"
                  :class="{ 'is-recommended': option.key === 'server' }"
                  padding="12px"
                  radius="12px"
                >
                  <span v-if="option.key === 'server'" class="support-tier-card__recommended">{{
                    t('autumn.reference.encourage')
                  }}</span>
                  <div class="support-tier-card__header"
                    ><span class="support-tier-card__icon"><SvgIcon :src="option.icon" size="23" /></span
                    ><div
                      ><div class="support-tier-card__amount"
                        ><template v-if="option.amount !== null"
                          ><span>¥</span><strong>{{ option.amount }}</strong></template
                        ><strong v-else class="support-tier-card__custom">{{
                          t('support.optionCustomAmount')
                        }}</strong></div
                      ><h3>{{ t(`autumn.reference.${['coffee', 'encourage', 'trust', 'custom'][index]}`) }}</h3></div
                    ></div
                  >
                  <p>{{ t(`autumn.reference.supportTier${index + 1}`) }}</p>
                  <BButton
                    class="support-tier-card__action"
                    type="primary"
                    :disabled="!option.configured || !supportStateReady || supportStateError"
                    @click="handleSupportOption(option)"
                    >{{
                      option.amount === null
                        ? t('support.optionCustomAmount')
                        : t('autumn.reference.donate', { amount: option.amount })
                    }}</BButton
                  >
                </BCard>
              </div>
              <p v-if="!supportConfigured" class="support-privacy-summary" role="status">{{ t('support.unavailable') }}</p>
              <p v-if="supportStateError" role="alert"
                >{{ t('autumn.stateError') }}
                <BButton size="small" @click="loadSupportState">{{ t('common.retry') }}</BButton></p
              >
              <p
                v-if="supportStateReady && !supportStateError && supportState.authenticated"
                class="support-privacy-summary"
                ><SvgIcon :src="icon.settings.privacy" size="14" /><span>{{
                  t(
                    supportState.publicPreference.adminHidden || !supportState.publicPreference.participateInRanking
                      ? 'autumn.privacyOff'
                      : supportState.publicPreference.showIdentity
                        ? 'autumn.privacyPublic'
                        : 'autumn.privacyAnonymous',
                  )
                }}</span
                ><BButton class="scene-link" size="small" @click="accountVisible = true">{{
                  t('autumn.privacyEdit')
                }}</BButton></p
              >
              <p v-else class="support-privacy-summary">{{ supportPrimaryActionHint }}</p>
            </section>
            <BCard as="aside" class="support-store-gateway" padding="18px" radius="13px">
              <h2><SvgIcon :src="icon.support.store" size="24" />{{ t('support.storeGatewayTitle') }}</h2
              ><p>{{ t('autumn.reference.resourceInvitation') }}</p>
              <div class="support-cross-art"
                ><img src="/brand-scenes/cloud-object.webp" alt="" loading="lazy" /><div
                  ><span><SvgIcon :src="icon.growth.ai" size="16" />{{ t('entitlementStore.tabs.ai') }}</span
                  ><span><SvgIcon :src="icon.growth.storage" size="16" />{{ t('entitlementStore.tabs.storage') }}</span
                  ><span
                    ><SvgIcon :src="icon.growth.reward" size="16" />{{ t('entitlementStore.tabs.combo') }}</span
                  ></div
                ></div
              >
              <div class="support-cross-footer">
                <BButton type="primary" @click="openStore"
                  >{{ t('support.storeGatewayAction') }}<SvgIcon :src="icon.arrow_right" size="15"
                /></BButton>
                <p class="support-margin-note">{{ t('autumn.reference.morePossibilities') }}</p>
              </div>
            </BCard>
          </div>
          <div class="support-lower">
            <section class="support-section"
              ><h2>{{ t('autumn.reference.usageTitle') }}</h2
              ><p>{{ t('autumn.reference.usageIntro') }}</p
              ><div class="support-card-grid--usage"
                ><article v-for="item in usageCards" :key="item.key" class="support-usage-card"
                  ><span class="support-usage-card__icon"><SvgIcon :src="item.icon" size="27" /></span
                  ><h3>{{ item.title }}</h3
                  ><p>{{ item.description }}</p></article
                ></div
              ></section
            >
            <div ref="leaderboardSection" class="support-section"
              ><p v-if="leaderboardError" role="alert"
                >{{ t('autumn.stateError') }}<BButton @click="loadLeaderboard">{{ t('common.retry') }}</BButton></p
              ><SupportLeaderboard v-else compact :leaderboard="leaderboard" :loading="leaderboardLoading"
            /></div>
            <section ref="accountSection" class="support-section support-account-summary"
              ><div class="support-account-title"
                ><h2>{{ t('support.accountTitle') }}</h2
                ><BChip v-if="supportState.linked" tone="success">{{ t('support.accountLinkedStatus') }}</BChip></div
              >
              <p>{{ t('autumn.reference.supportAccountIntro') }}</p
              ><div class="support-account-summary__row"
                ><span class="support-tier-card__icon"><SvgIcon :src="icon.settings.account" size="21" /></span
                ><div
                  ><strong>{{ user.alias || user.userName || t('entitlementStore.confirm.currentAccount') }}</strong
                  ><small>{{
                    supportState.linked ? t('support.accountLinkedStatus') : t('autumn.reference.accountUnlinked')
                  }}</small></div
                >
                <BButton
                  v-if="supportStateReady && !supportStateError && supportState.authenticated && !supportState.linked"
                  class="support-account-link"
                  size="small"
                  type="primary"
                  :disabled="!supportState.oauthAvailable"
                  :title="supportState.oauthAvailable ? undefined : t('support.accountLinkUnavailable')"
                  @click="handleOAuthLink"
                  >{{ t('support.accountLinkAction') }}</BButton
                ></div
              ><p v-if="supportStateReady && !supportStateError" class="support-account-summary__totals">{{
                t('support.accountOrderSummary', { count: supportState.orderCount, amount: supportState.totalAmount })
              }}</p>
              <div class="support-account-actions"
                ><BButton
                  :disabled="!supportStateReady || supportStateError"
                  type="primary"
                  @click="accountVisible = true"
                  >{{ t('autumn.reference.viewRecords') }}</BButton
                ><BButton
                  :disabled="!supportStateReady || supportStateError || unlinking"
                  @click="supportState.linked ? confirmUnlink() : (accountVisible = true)"
                  >{{ supportState.linked ? t('support.accountUnlinkAction') : t('autumn.privacyEdit') }}</BButton
                ></div
              ></section
            >
          </div>
          <p class="support-ranking-note">{{ t('support.leaderboardFootnote') }}</p>
          <section class="support-closing"
            ><div
              ><h2>{{ t('autumn.reference.supportClosing') }}</h2
              ><p>{{ t('autumn.reference.supportClosingIntro') }}</p></div
            ><BButton
              class="support-closing__action support-primary-action"
              type="primary"
              :disabled="!supportConfigured || !supportStateReady || supportStateError"
              @click="handleSupport"
              >{{ supportPrimaryActionLabel }}<SvgIcon :src="icon.arrow_right" size="16" /></BButton
          ></section> </main
      ></div>
    </div>
    <BModal v-model:visible="accountVisible" :title="t('support.accountTitle')" width="700px" :show-footer="false"
      ><SupportAccountPanel
        v-if="supportStateReady && !supportStateError"
        :state="supportState"
        :unlinking="unlinking"
        :preference-saving="preferenceSaving"
        @link="handleOAuthLink"
        @unlink="confirmUnlink"
        @preference-change="handlePreferenceChange"
    /></BModal>
  </div>
</template>
<script setup lang="ts">
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BrandSceneHero from '@/components/support/BrandSceneHero.vue';
  import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
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
  import { bookmarkStore, useUserStore } from '@/store';
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
    publicPreference: { participateInRanking: true, showIdentity: true, adminHidden: false },
    recentOrders: [],
  };
  const supportState = ref<AfdianSupportState>({ ...emptySupportState });
  const supportStateReady = ref(false);
  const supportStateError = ref(false);
  const unlinking = ref(false);
  const preferenceSaving = ref(false);
  const leaderboard = ref<AfdianLeaderboard | null>(null);
  const leaderboardLoading = ref(true);
  const leaderboardError = ref(false);
  const user = useUserStore();
  let stateGeneration = 0,
    boardGeneration = 0,
    mutationGeneration = 0;
  const leaderboardSection = ref<HTMLElement | null>(null);
  const accountSection = ref<HTMLElement | null>(null);
  const accountVisible = ref(false);

  const canOpenTrackedSupport = computed(
    () => supportStateReady.value && supportState.value.authenticated && supportState.value.orderSyncAvailable,
  );
  const supportPrimaryActionLabel = computed(() =>
    t(canOpenTrackedSupport.value ? 'support.trackedPrimaryAction' : 'support.creatorPageAction'),
  );
  const supportPrimaryActionHint = computed(() =>
    t(canOpenTrackedSupport.value ? 'support.trackedActionHint' : 'support.creatorPageHint'),
  );
  const usageCards = computed(() => [
    {
      key: 'infrastructure',
      icon: icon.support.server,
      title: t('support.usageInfrastructureTitle'),
      description: t('support.usageInfrastructureDescription'),
    },
    {
      key: 'reliability',
      icon: icon.support.security,
      title: t('autumn.reference.securityTitle'),
      description: t('autumn.reference.securityDescription'),
    },
    {
      key: 'backup',
      icon: icon.support.backup,
      title: t('autumn.reference.backupTitle'),
      description: t('autumn.reference.backupDescription'),
    },
    {
      key: 'development',
      icon: icon.support.development,
      title: t('support.usageDevelopmentTitle'),
      description: t('support.usageDevelopmentDescription'),
    },
  ]);
  const supportOptionContent = {
    coffee: {
      icon: icon.support.coffee,
      titleKey: 'support.tierCoffeeTitle',
      descriptionKey: 'support.tierCoffeeDescription',
    },
    server: {
      icon: icon.support.heart,
      titleKey: 'support.tierServerTitle',
      descriptionKey: 'support.tierServerDescription',
    },
    companion: {
      icon: icon.todoWorkspace.star,
      titleKey: 'support.tierCompanionTitle',
      descriptionKey: 'support.tierCompanionDescription',
    },
    custom: {
      icon: icon.common.more,
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

  function goBack() {
    if (window.history.length > 1) return router.back();
    void router.push(bookmark.isMobile ? '/personCenter' : '/home');
  }

  useMobileTopBar(['support'], { title: () => t('support.pageTitle'), onBack: goBack, showNotification: false });

  function openStore() {
    void router.push('/store');
    void recordOperation({ module: '资源商店', operation: '从支持页进入资源商店' });
  }

  function scrollToLeaderboard() {
    leaderboardSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function handleSupport() {
    if (!supportStateReady.value || supportStateError.value) return;
    const opened = canOpenTrackedSupport.value ? openTrackedAfdianCheckout('custom') : openAfdianSupportPage();
    if (!opened) return message.warning(t('support.unavailableMessage'));
    void recordOperation({ module: '支持轻笺', operation: '打开爱发电赞助入口' });
  }

  function handleSupportOption(option: (typeof supportOptions.value)[number]) {
    if (!supportStateReady.value || supportStateError.value) return;
    const opened = canOpenTrackedSupport.value
      ? openTrackedAfdianCheckout(option.key)
      : openAfdianSupportPage(option.url);
    if (!opened) return message.warning(t('support.unavailableMessage'));
    void recordOperation({ module: '支持轻笺', operation: '打开爱发电赞助档位:' + option.key });
  }

  async function loadSupportState() {
    const gen = ++stateGeneration;
    try {
      const next = await getAfdianSupportState();
      if (gen !== stateGeneration) return;
      supportState.value = {
        ...emptySupportState,
        ...next,
        publicPreference: { ...emptySupportState.publicPreference, ...next.publicPreference },
        recentOrders: Array.isArray(next.recentOrders) ? next.recentOrders : [],
      };
      supportStateError.value = false;
    } catch {
      if (gen === stateGeneration) supportStateError.value = true;
    } finally {
      if (gen === stateGeneration) supportStateReady.value = true;
    }
  }

  async function loadLeaderboard() {
    const gen = ++boardGeneration;
    leaderboardLoading.value = true;
    try {
      const result = await getAfdianLeaderboard();
      if (gen === boardGeneration) {
        leaderboard.value = result;
        leaderboardError.value = false;
      }
    } catch {
      if (gen === boardGeneration) leaderboardError.value = true;
    } finally {
      if (gen === boardGeneration) leaderboardLoading.value = false;
    }
  }

  async function refreshSupport() {
    await Promise.allSettled([loadSupportState(), loadLeaderboard()]);
  }

  async function handlePreferenceChange(value: { participateInRanking: boolean; showIdentity: boolean }) {
    const gen = ++mutationGeneration;
    preferenceSaving.value = true;
    try {
      const preference = await updateAfdianPublicPreference(value);
      if (gen !== mutationGeneration) return;
      supportState.value.publicPreference = preference;
      await loadLeaderboard();
      message.success(t('support.rankingPreferenceSaved'));
    } catch {
      if (gen === mutationGeneration) message.error(t('support.rankingPreferenceFailed'));
    } finally {
      if (gen === mutationGeneration) preferenceSaving.value = false;
    }
  }

  function handleOAuthLink() {
    if (
      !supportStateReady.value ||
      supportStateError.value ||
      !supportState.value.authenticated ||
      supportState.value.linked
    )
      return;
    if (!supportState.value.oauthAvailable) return message.warning(t('support.accountLinkUnavailable'));
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
        const gen = ++mutationGeneration;
        unlinking.value = true;
        try {
          await unlinkAfdianAccount();
          if (gen !== mutationGeneration) return;
          await loadSupportState();
          if (gen === mutationGeneration) message.success(t('support.accountUnlinkSuccess'));
        } catch {
          if (gen === mutationGeneration) message.error(t('support.accountUnlinkFailed'));
        } finally {
          if (gen === mutationGeneration) unlinking.value = false;
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
  watch(
    () => user.id,
    () => {
      ++stateGeneration;
      ++boardGeneration;
      ++mutationGeneration;
      supportState.value = { ...emptySupportState, publicPreference: { ...emptySupportState.publicPreference } };
      accountVisible.value = false;
      supportStateReady.value = false;
      supportStateError.value = false;
      leaderboard.value = null;
      leaderboardError.value = false;
      preferenceSaving.value = false;
      unlinking.value = false;
      void refreshSupport();
    },
  );
  onBeforeUnmount(() => {
    ++stateGeneration;
    ++boardGeneration;
    ++mutationGeneration;
  });
</script>

<style scoped lang="less">
  .support-page {
    width: 100%;
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .support-page__scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior-y: contain;
  }
  .support-shell {
    width: 94%;
    max-width: 1600px;
    margin: auto;
    padding: 0 0 32px;
    position: relative;
  }
  .support-top {
    display: grid;
    grid-template-columns: minmax(0, 2.15fr) minmax(0, 1fr);
    gap: 12px;
    align-items: stretch;
  }
  .support-section {
    padding: 16px 18px;
    border: 1px solid var(--surface-border-color);
    border-radius: 13px;
    background: var(--card-background);
    min-width: 0;
    box-shadow: var(--scene-shadow);
  }
  h2 {
    margin: 0 0 6px;
  }
  h3 {
    font:
      700 14px/1.5 'Songti SC',
      serif;
    margin: 4px 0;
  }
  p {
    font-size: 14px;
    line-height: 1.65;
    color: var(--desc-color);
    margin: 4px 0;
  }
  .support-tier-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
    margin-top: 16px;
  }
  .support-tier-card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    border: 1px solid var(--surface-border-color);
  }
  .support-tier-card__header {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .support-tier-card__icon {
    width: 48px;
    height: 48px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    flex-shrink: 0;
    background: var(--hover-background);
    color: var(--primary-color);
  }
  .support-tier-card__amount {
    display: flex;
    align-items: baseline;
    gap: 2px;
    line-height: 1.2;
  }
  .support-tier-card__amount strong {
    font-size: 27px;
  }
  .support-tier-card__amount span {
    font-size: 13px;
  }
  .support-tier-card__amount strong.support-tier-card__custom {
    font-size: 18px;
  }
  .support-tier-card__action {
    width: 100%;
    margin-top: auto;
  }
  .support-tier-card p {
    flex: 1;
    margin: 0;
    font-size: 14px;
  }
  .support-tier-card__recommended {
    position: absolute;
    top: -10px;
    right: 10px;
    padding: 2px 10px;
    font-size: 12px;
    background: var(--primary-color);
    color: white;
    border-radius: 13px;
  }

  .support-privacy-summary {
    display: flex;
    align-items: center;
    gap: 7px;
    flex-wrap: wrap;
    font-size: 12px;
    margin-top: 8px;
  }
  .support-store-gateway {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    box-shadow: var(--scene-shadow);
  }
  .support-store-gateway h2 {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .support-store-gateway h2 > .svg-icon {
    color: var(--primary-color);
    flex-shrink: 0;
  }
  .support-cross-footer {
    display: grid;
    grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
    align-items: center;
    gap: 12px;
    width: 100%;
  }
  .support-cross-footer > .b_btn {
    min-width: 0;
    width: 100%;
  }
  .support-cross-art {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    margin: 8px 0;
  }
  .support-cross-art img {
    width: 48%;
    height: 110px;
    object-fit: contain;
    mix-blend-mode: multiply;
  }
  .support-cross-art > div {
    display: grid;
    gap: 6px;
  }
  .support-cross-art span {
    display: flex;
    align-items: center;
    gap: 6px;
    border: 1px solid var(--surface-border-color);
    border-radius: 5px;
    padding: 4px 8px;
    font-size: 12px;
  }
  .support-lower {
    display: grid;
    grid-template-columns: 1.43fr 1fr 0.95fr;
    gap: 12px;
    margin-top: 12px;
    align-items: stretch;
  }
  .support-lower > * {
    min-width: 0;
  }
  .support-card-grid--usage {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 7px;
    margin-top: 12px;
  }
  .support-usage-card {
    padding: 12px 9px;
    background: var(--hover-background);
    border-radius: 9px;
    min-width: 0;
  }
  .support-usage-card > .svg-icon {
    color: var(--primary-color);
    margin-bottom: 6px;
  }
  .support-usage-card__icon {
    display: block;
    color: var(--primary-color);
    margin-bottom: 12px;
  }
  .support-usage-card p {
    font-size: 12px;
  }
  .support-account-summary__row {
    display: flex;
    gap: 8px;
    align-items: center;
    border: 1px solid var(--surface-border-color);
    border-radius: 9px;
    padding: 9px;
    margin: 12px 0;
  }
  .support-account-summary__row > div {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .support-account-link {
    flex-shrink: 0;
    max-width: 42%;
    margin-left: auto;
  }
  .support-account-summary__row small {
    display: block;
    font-size: 12px;
    color: var(--desc-color);
    line-height: 1.5;
  }
  .support-account-summary__row strong {
    font-size: 14px;
  }
  .support-account-summary > .b_btn {
    width: 100%;
  }
  .support-closing {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    padding: 20px 10% 12px;
    border-top: 1px solid var(--surface-border-color);
  }
  .support-closing p {
    font-size: 12px;
  }
  .support-closing > .b_btn {
    flex-shrink: 0;
  }
  .support-lower :deep(.support-leaderboard) {
    margin: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  .support-lower :deep(.support-leaderboard__heading) {
    margin: 0 0 10px;
    display: block;
  }
  .support-lower :deep(.support-leaderboard__heading > div > span) {
    display: none;
  }
  .support-lower :deep(.support-leaderboard__heading p),
  .support-lower :deep(.support-leaderboard__footnote) {
    font-size: 12px;
    line-height: 1.6;
  }
  .support-lower :deep(.support-leaderboard__state) {
    min-height: 100px;
    padding: 12px;
    font-size: 12px;
  }
  .support-lower :deep(.support-leaderboard__state > span:last-child) {
    display: none;
  }
  .support-lower :deep(.support-leaderboard__card) {
    border: 0;
    box-shadow: none;
    background: transparent;
  }
  .support-lower > .support-section {
    display: flex;
    flex-direction: column;
  }
  .support-lower h2,
  .support-lower :deep(.support-leaderboard h2) {
    margin: 0 0 6px;
    font:
      700 20px/1.4 'Songti SC',
      'STSong',
      serif;
  }
  .support-lower > .support-section > p {
    font-size: 12px;
  }
  .support-card-grid--usage {
    flex: 1;
  }
  .support-usage-card {
    border: 1px solid var(--surface-border-color);
    background: var(--hover-background);
  }
  .support-account-summary > .b_btn {
    margin-top: auto;
  }
  .support-account-summary__row {
    margin: 14px 0;
  }
  .support-ranking-note {
    margin: 10px 0 16px;
    font-size: 12px;
    line-height: 1.6;
  }
  .support-lower :deep(.support-leaderboard__card) {
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  .support-lower :deep(.support-leaderboard__state) {
    flex: 1;
    min-height: 110px;
    gap: 8px;
    padding: 12px 0;
  }
  .support-lower :deep(.support-leaderboard__state strong) {
    font-size: 13px;
    text-align: center;
  }
  .support-lower :deep(.support-leaderboard ol) {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 0;
    max-height: 200px;
    overflow-y: auto;
  }
  .support-lower :deep(.support-leaderboard li),
  .support-lower :deep(.support-leaderboard li.is-featured) {
    display: grid;
    grid-template-columns: 20px 24px minmax(0, 1fr) auto;
    gap: 6px;
    min-height: 40px;
    padding: 6px 0;
    border: 0;
    border-bottom: 1px solid var(--surface-border-color);
    border-radius: 0;
    background: transparent;
    text-align: left;
  }
  .support-lower :deep(.support-leaderboard__rank),
  .support-lower :deep(li.is-featured .support-leaderboard__rank) {
    position: static;
    width: 20px;
    height: 20px;
    border: 0;
    font-size: 12px;
  }
  .support-lower :deep(.support-leaderboard__avatar),
  .support-lower :deep(li.is-featured .support-leaderboard__avatar) {
    width: 24px;
    height: 24px;
    border: 0;
    box-shadow: none;
  }
  .support-lower :deep(.support-leaderboard__identity strong),
  .support-lower :deep(li.is-featured .support-leaderboard__amount) {
    font-size: 12px;
  }
  .support-lower :deep(.support-leaderboard__identity span) {
    display: none;
  }
  .support-account-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .support-account-avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
  }
  .support-account-avatar--fallback {
    display: grid;
    place-items: center;
    background: linear-gradient(135deg, var(--primary-color), var(--desc-color));
    color: white;
    font-size: 17px;
  }
  .support-account-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: auto;
  }
  .support-account-actions .b_btn {
    width: 100%;
  }
  .support-account-summary__totals {
    margin: 0 0 12px;
  }
  .support-margin-note {
    margin: 0;
    min-width: 0;
    justify-self: end;
    font:
      italic 14px/1.8 'Songti SC',
      serif;
    color: var(--primary-color);
    white-space: pre-line;
    transform: rotate(-8deg);
    pointer-events: none;
  }
  .is-compact .support-cross-footer {
    grid-template-columns: minmax(0, 1fr);
  }
  .is-dense .support-shell {
    width: 94%;
  }
  .is-compact .support-top {
    grid-template-columns: minmax(0, 2.6fr) minmax(200px, 1fr);
  }
  .is-compact .support-tier-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .is-compact .support-lower {
    grid-template-columns: 1fr 1fr;
  }
  .is-compact .support-lower > .support-section:first-child {
    grid-column: 1/-1;
  }
  .is-mobile .support-shell {
    width: calc(100% - 24px);
  }
  .is-mobile .support-top,
  .is-mobile .support-lower {
    grid-template-columns: 1fr;
  }
  .is-mobile .support-tier-grid {
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
  }
  .is-mobile .support-section {
    padding: 14px 11px;
  }
  .is-mobile .support-closing {
    padding: 20px 0 12px;
    flex-direction: column;
    align-items: flex-start;
  }
  .is-mobile .support-tier-card__header {
    flex-wrap: wrap;
  }
  .is-mobile .support-cross-art {
    max-width: 310px;
  }
  .is-mobile .support-card-grid--usage {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
</style>
