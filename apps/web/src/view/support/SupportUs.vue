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
              <span class="support-badge">{{ t('support.freeBadge') }}</span>
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
                :disabled="!supportConfigured"
                @click="handleSupport"
                v-click-log="{ module: '支持轻笺', operation: '前往爱发电' }"
              >
                <SvgIcon :src="icon.support.heart" size="18" aria-hidden="true" />
                <span>{{ t('support.primaryAction') }}</span>
                <SvgIcon :src="icon.noteTree.openPage" size="16" aria-hidden="true" />
              </BButton>
              <span v-if="supportConfigured" class="support-action-card__caption">
                {{ t('support.newPageHint') }}
              </span>
              <span v-else class="support-action-card__unavailable" role="status">
                {{ t('support.unavailable') }}
              </span>
            </BCard>
          </div>
        </header>

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
                <span class="support-tier-card__currency">¥</span>
                <strong>{{ option.amount }}</strong>
                <span>{{ t('support.optionPerMonth') }}</span>
              </div>
              <div v-else class="support-tier-card__amount support-tier-card__amount--custom">
                <strong>{{ t('support.optionCustomAmount') }}</strong>
              </div>

              <h3>{{ option.title }}</h3>
              <p>{{ option.description }}</p>

              <BButton
                class="support-tier-card__action"
                type="primary"
                :disabled="!option.configured"
                @click="handleSupportOption(option)"
                v-click-log="{ module: '支持轻笺', operation: option.logOperation }"
              >
                <span>{{ option.action }}</span>
                <SvgIcon :src="icon.noteTree.openPage" size="15" aria-hidden="true" />
              </BButton>
            </BCard>
          </div>

          <p class="support-options__hint">
            <SvgIcon class="support-options__hint-icon" :src="icon.settings.privacy" size="16" aria-hidden="true" />
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
              <span class="support-info-card__icon" aria-hidden="true">
                <SvgIcon :src="item.icon" size="22" />
              </span>
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
            <BCard
              v-for="item in usageCards"
              :key="item.key"
              as="article"
              class="support-usage-card"
              variant="panel"
              padding="18px"
            >
              <span class="support-usage-card__icon" aria-hidden="true">
                <SvgIcon :src="item.icon" size="21" />
              </span>
              <div>
                <h3>{{ item.title }}</h3>
                <p>{{ item.description }}</p>
              </div>
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

        <BCard as="section" class="support-thanks" variant="panel" padding="22px" radius="18px">
          <span class="support-thanks__icon" aria-hidden="true">
            <SvgIcon :src="icon.userCenter.growth" size="24" />
          </span>
          <div>
            <h2>{{ t('support.thanksTitle') }}</h2>
            <p>{{ t('support.thanksDescription') }}</p>
          </div>
        </BCard>

        <BCard as="section" class="support-closing" variant="raised" padding="24px" radius="20px">
          <div>
            <h2>{{ t('support.closingTitle') }}</h2>
            <p>{{ t('support.closingDescription') }}</p>
          </div>
          <BButton
            class="support-closing__action"
            type="primary"
            size="large"
            :disabled="!supportConfigured"
            @click="handleSupport"
            v-click-log="{ module: '支持轻笺', operation: '底部前往爱发电' }"
          >
            <SvgIcon :src="icon.support.heart" size="18" aria-hidden="true" />
            <span>{{ t('support.primaryAction') }}</span>
          </BButton>
        </BCard>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import MobileTopBar from '@/components/mobile/MobileTopBar.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import icon from '@/config/icon';
  import { AFDIAN_SUPPORT_CONFIGURED, AFDIAN_SUPPORT_OPTIONS, openAfdianSupportPage } from '@/config/support';
  import { bookmarkStore } from '@/store';
  import { recordOperation } from '@/api/commonApi';
  import { useMobileTopBar } from '@/composables/useMobileTopBar';

  const { t } = useI18n();
  const router = useRouter();
  const bookmark = bookmarkStore();
  const supportConfigured = AFDIAN_SUPPORT_CONFIGURED;

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
        logOperation: `选择爱发电赞助档位:${option.key}`,
      };
    }),
  );

  const disclosureItems = computed(() => [
    t('support.disclosureExternal'),
    t('support.disclosurePayment'),
    t('support.disclosurePrivacy'),
    t('support.disclosureRewards'),
  ]);

  function goBack() {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    void router.push(bookmark.isMobile ? '/personCenter' : '/home');
  }

  useMobileTopBar(['support'], {
    title: () => t('support.pageTitle'),
    onBack: goBack,
    showNotification: false,
  });

  function handleSupport() {
    if (!openAfdianSupportPage()) {
      message.warning(t('support.unavailableMessage'));
      return;
    }
    void recordOperation({ module: '支持轻笺', operation: '打开爱发电赞助主页' });
  }

  function handleSupportOption(option: (typeof supportOptions.value)[number]) {
    if (!openAfdianSupportPage(option.url)) {
      message.warning(t('support.unavailableMessage'));
      return;
    }
    void recordOperation({ module: '支持轻笺', operation: `打开爱发电赞助档位:${option.key}` });
  }

  onMounted(() => {
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
    position: relative;
    padding: clamp(24px, 4vw, 46px);
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 24px;
    background:
      radial-gradient(circle at 8% 12%, color-mix(in srgb, var(--primary-color) 18%, transparent), transparent 34%),
      radial-gradient(
        circle at 94% 88%,
        color-mix(in srgb, var(--primary-color) 12%, transparent),
        transparent 34%
      ),
      var(--surface-raised-background);
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

  .support-kicker {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--primary-color);
    font-size: 14px;
    font-weight: 720;
  }

  .support-kicker__icon,
  .support-info-card__icon,
  .support-usage-card__icon,
  .support-disclosure__icon,
  .support-thanks__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    color: var(--primary-color);
  }

  .support-kicker__icon {
    width: 42px;
    height: 42px;
    border: 1px solid var(--primary-color);
    border-radius: 14px;
    background: color-mix(in srgb, var(--primary-color) 10%, var(--card-background));
  }

  .support-badge {
    display: inline-flex;
    align-items: center;
    min-height: 28px;
    margin-top: 22px;
    padding: 3px 10px;
    box-sizing: border-box;
    border: 1px solid var(--primary-color);
    border-radius: 999px;
    color: var(--primary-color);
    background: var(--card-background);
    font-size: 12px;
    font-weight: 700;
  }

  .support-hero h1 {
    max-width: 760px;
    margin: 15px 0 14px;
    color: var(--text-color);
    font-size: clamp(32px, 4.3vw, 54px);
    font-weight: 800;
    line-height: 1.12;
    letter-spacing: -0.045em;
  }

  .support-hero__copy > p {
    max-width: 720px;
    margin: 0;
    color: var(--desc-color);
    font-size: 15px;
    line-height: 1.8;
  }

  .support-action-card {
    --b-card-background: var(--card-background);
    min-width: 0;
    border-width: 1px;
    border-color: var(--surface-border-color);
  }

  .support-action-card__label {
    display: block;
    margin-bottom: 6px;
    color: var(--desc-color);
    font-size: 12px;
    font-weight: 650;
  }

  .support-action-card strong {
    display: block;
    color: var(--text-color);
    font-size: 23px;
    line-height: 1.3;
  }

  .support-action-card p {
    margin: 8px 0 18px;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.65;
  }

  .support-primary-action,
  .support-closing__action {
    min-height: 46px;
    height: auto;
    gap: 8px;
    border-radius: 12px;
    font-weight: 700;
  }

  .support-primary-action {
    width: 100%;
  }

  .support-action-card__caption,
  .support-action-card__unavailable {
    display: block;
    margin-top: 10px;
    font-size: 12px;
    line-height: 1.5;
  }

  .support-action-card__caption {
    color: var(--desc-color);
    text-align: center;
  }

  .support-action-card__unavailable {
    padding-left: 10px;
    border-left: 3px solid var(--warning-color);
    color: var(--warning-color);
  }

  .support-section {
    margin-top: 34px;
  }

  .support-section__heading {
    max-width: 760px;
    margin-bottom: 16px;
  }

  .support-section h2,
  .support-disclosure h2,
  .support-thanks h2,
  .support-closing h2 {
    margin: 0;
    color: var(--text-color);
    font-size: clamp(21px, 2vw, 27px);
    line-height: 1.3;
  }

  .support-section__heading p,
  .support-disclosure__heading p,
  .support-thanks p,
  .support-closing p {
    margin: 7px 0 0;
    color: var(--desc-color);
    font-size: 14px;
    line-height: 1.7;
  }

  .support-card-grid {
    display: grid;
    gap: 14px;
  }

  .support-tier-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
  }

  .support-tier-card {
    --b-card-background: var(--card-background);
    position: relative;
    min-height: 278px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-color: var(--surface-border-color);
  }

  .support-tier-card::before {
    position: absolute;
    top: 0;
    right: 0;
    left: 0;
    height: 4px;
    background: var(--primary-color);
    content: '';
  }

  .support-tier-card__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .support-tier-card__icon {
    width: 40px;
    height: 40px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    border: 1px solid var(--primary-color);
    border-radius: 12px;
    color: var(--primary-color);
    background: var(--card-background);
  }

  .support-tier-card__eyebrow {
    color: var(--primary-color);
    font-size: 12px;
    font-weight: 700;
  }

  .support-tier-card__amount {
    min-height: 58px;
    display: flex;
    align-items: baseline;
    gap: 5px;
    margin-top: 16px;
    color: var(--text-color);
  }

  .support-tier-card__amount strong {
    font-size: 40px;
    font-weight: 800;
    line-height: 1;
    letter-spacing: -0.035em;
  }

  .support-tier-card__amount > span:last-child,
  .support-tier-card__currency {
    color: var(--desc-color);
    font-size: 13px;
    font-weight: 650;
  }

  .support-tier-card__amount--custom strong {
    color: var(--primary-color);
    font-size: 27px;
    letter-spacing: 0;
  }

  .support-tier-card h3 {
    margin: 8px 0 7px;
    color: var(--text-color);
    font-size: 16px;
    line-height: 1.4;
  }

  .support-tier-card > p {
    margin: 0 0 18px;
    flex: 1 1 auto;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.65;
  }

  .support-tier-card__action {
    width: 100%;
    min-height: 44px;
    height: auto;
    gap: 7px;
    border-radius: 11px;
    font-weight: 700;
  }

  .support-options__hint {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin: 12px 2px 0;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.6;
  }

  .support-options__hint-icon {
    margin-top: 2px;
    flex: 0 0 auto;
    color: var(--primary-color);
  }

  .support-card-grid--promises,
  .support-card-grid--usage {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .support-info-card,
  .support-usage-card {
    height: 100%;
  }

  .support-info-card__icon,
  .support-usage-card__icon {
    width: 42px;
    height: 42px;
    border: 1px solid var(--surface-border-color);
    border-radius: 13px;
    background: color-mix(in srgb, var(--primary-color) 9%, var(--card-background));
  }

  .support-info-card h3,
  .support-usage-card h3 {
    margin: 14px 0 7px;
    color: var(--text-color);
    font-size: 16px;
    line-height: 1.4;
  }

  .support-info-card p,
  .support-usage-card p {
    margin: 0;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.7;
  }

  .support-usage-card {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    border-color: var(--surface-border-color);
  }

  .support-usage-card h3 {
    margin-top: 1px;
  }

  .support-disclosure,
  .support-thanks,
  .support-closing {
    margin-top: 34px;
    border-color: var(--surface-border-color);
  }

  .support-disclosure__heading,
  .support-thanks {
    display: flex;
    align-items: flex-start;
    gap: 15px;
  }

  .support-disclosure__icon,
  .support-thanks__icon {
    width: 46px;
    height: 46px;
    border: 1px solid var(--primary-color);
    border-radius: 14px;
    background: color-mix(in srgb, var(--primary-color) 9%, var(--card-background));
  }

  .support-disclosure ul {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px 18px;
    margin: 20px 0 0;
    padding: 18px 0 0;
    border-top: 1px solid var(--surface-divider-color);
    list-style: none;
  }

  .support-disclosure li {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.65;
  }

  .support-disclosure__check {
    margin-top: 2px;
    flex: 0 0 auto;
    color: var(--success-color);
  }

  .support-thanks {
    --b-card-background: var(--surface-panel-bg);
  }

  .support-closing {
    --b-card-background: var(--surface-raised-background);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 22px;
  }

  .support-closing > div {
    max-width: 700px;
  }

  .support-closing__action {
    flex: 0 0 auto;
  }

  @media (max-width: 860px) {
    .support-hero__layout {
      grid-template-columns: 1fr;
    }

    .support-action-card {
      max-width: 520px;
    }

    .support-tier-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .support-card-grid--promises,
    .support-card-grid--usage {
      grid-template-columns: 1fr;
    }

    .support-info-card {
      display: grid;
      grid-template-columns: 42px minmax(0, 1fr);
      column-gap: 14px;
    }

    .support-info-card h3 {
      margin: 2px 0 5px;
    }

    .support-info-card p {
      grid-column: 2;
    }
  }

  @media (max-width: 767px) {
    .support-shell {
      width: 100%;
      padding: 12px 12px max(28px, env(safe-area-inset-bottom));
    }

    .support-hero {
      padding: 22px 18px;
      border-radius: 18px;
    }

    .support-kicker__icon {
      width: 38px;
      height: 38px;
      border-radius: 12px;
    }

    .support-badge {
      margin-top: 18px;
    }

    .support-hero h1 {
      margin-top: 13px;
      font-size: clamp(30px, 10vw, 42px);
    }

    .support-hero__copy > p {
      font-size: 14px;
    }

    .support-action-card {
      max-width: none;
      padding: 18px !important;
    }

    .support-tier-grid {
      grid-template-columns: 1fr;
    }

    .support-tier-card {
      min-height: 0;
    }

    .support-section,
    .support-disclosure,
    .support-thanks,
    .support-closing {
      margin-top: 24px;
    }

    .support-disclosure ul {
      grid-template-columns: 1fr;
    }

    .support-closing {
      align-items: stretch;
      flex-direction: column;
    }

    .support-closing__action {
      width: 100%;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .support-page * {
      scroll-behavior: auto !important;
    }
  }
</style>
