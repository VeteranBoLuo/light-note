<template>
  <div class="browser-extension-page">
    <header class="browser-extension-header">
      <BButton class="browser-extension-brand" :aria-label="t('browserExtensionLanding.backHome')" @click="goHome">
        <img src="/favicon.svg?v=7" alt="" />
        <span>{{ t('browserExtensionLanding.brand') }}</span>
      </BButton>
      <div class="browser-extension-header__actions">
        <BButton class="browser-extension-header__home" @click="goHome">
          {{ t('browserExtensionLanding.backHome') }}
        </BButton>
        <BButton type="primary" @click="openLightNote">
          {{ t('browserExtensionLanding.openLightNote') }}
          <SvgIcon :src="icon.arrow_right" size="15" aria-hidden="true" />
        </BButton>
      </div>
    </header>

    <main>
      <section class="browser-extension-hero">
        <div class="browser-extension-hero__copy">
          <span class="browser-extension-eyebrow">{{ t('browserExtensionLanding.eyebrow') }}</span>
          <h1 class="browser-extension-hero__title">{{ t('browserExtensionLanding.title') }}</h1>
          <p>{{ t('browserExtensionLanding.subtitle') }}</p>
          <div class="browser-extension-hero__actions">
            <BButton v-if="bookmark.isMobile" type="primary" size="large" @click="copyLandingAddress">
              <SvgIcon :src="icon.share" size="18" aria-hidden="true" />
              {{ t('browserExtensionLanding.mobileAction') }}
            </BButton>
            <a
              v-else
              class="browser-extension-store-link"
              :href="CHROME_WEB_STORE_URL"
              target="_blank"
              rel="noopener noreferrer"
              @click="trackStoreOpen"
            >
              <SvgIcon :src="icon.support.store" size="18" aria-hidden="true" />
              {{ t('browserExtensionLanding.install') }}
            </a>
            <span v-if="!bookmark.isMobile" class="browser-extension-hero__hint">
              {{ t('browserExtensionLanding.installHint') }}
            </span>
          </div>
          <div v-if="bookmark.isMobile" class="browser-extension-mobile-notice" role="note">
            <SvgIcon :src="icon.pwa.tip" size="18" aria-hidden="true" />
            <span>{{ t('browserExtensionLanding.mobileNotice') }}</span>
          </div>
        </div>

        <div class="browser-extension-hero__visual">
          <img
            v-if="!heroImageFailed"
            :src="heroScreenshot"
            :alt="t('browserExtensionLanding.heroAlt')"
            fetchpriority="high"
            @error="heroImageFailed = true"
          />
          <div v-else class="browser-extension-image-error" role="status">
            <SvgIcon :src="icon.pwa.tip" size="24" aria-hidden="true" />
            <span>{{ t('browserExtensionLanding.imageLoadFailed') }}</span>
          </div>
        </div>
      </section>

      <section class="browser-extension-section browser-extension-section--features">
        <div class="browser-extension-section__heading">
          <span class="browser-extension-eyebrow">{{ t('browserExtensionLanding.featureEyebrow') }}</span>
          <h2>{{ t('browserExtensionLanding.featureTitle') }}</h2>
          <p>{{ t('browserExtensionLanding.featureSubtitle') }}</p>
        </div>
        <div class="browser-extension-feature-grid">
          <BCard
            v-for="feature in featureCards"
            :key="feature.key"
            class="browser-extension-feature-card"
            :class="`browser-extension-feature-card--${feature.key}`"
            variant="raised"
            padding="24px"
          >
            <span class="browser-extension-feature-card__icon">
              <SvgIcon :src="feature.icon" size="26" aria-hidden="true" />
            </span>
            <h3>{{ feature.title }}</h3>
            <p>{{ feature.description }}</p>
          </BCard>
        </div>
      </section>

      <section class="browser-extension-section browser-extension-section--gallery">
        <div class="browser-extension-section__heading">
          <span class="browser-extension-eyebrow">{{ t('browserExtensionLanding.galleryEyebrow') }}</span>
          <h2>{{ t('browserExtensionLanding.galleryTitle') }}</h2>
          <p>{{ t('browserExtensionLanding.gallerySubtitle') }}</p>
        </div>
        <div class="browser-extension-gallery">
          <div
            class="browser-extension-gallery__tabs"
            role="tablist"
            :aria-label="t('browserExtensionLanding.galleryTitle')"
          >
            <BButton
              v-for="(item, index) in galleryItems"
              :key="item.key"
              class="browser-extension-gallery__tab"
              :type="galleryIndex === index ? 'primary' : undefined"
              role="tab"
              :aria-selected="galleryIndex === index"
              :aria-controls="`browser-extension-gallery-panel-${index}`"
              @click="selectGallery(index)"
            >
              <SvgIcon :src="item.icon" size="16" aria-hidden="true" />
              {{ item.label }}
            </BButton>
          </div>
          <div
            :id="`browser-extension-gallery-panel-${galleryIndex}`"
            class="browser-extension-gallery__stage"
            role="tabpanel"
          >
            <img
              v-if="!galleryImageFailed"
              :key="activeGalleryItem.src"
              :src="activeGalleryItem.src"
              :alt="activeGalleryItem.alt"
              loading="lazy"
              @error="galleryImageFailed = true"
            />
            <div v-else class="browser-extension-image-error" role="status">
              <SvgIcon :src="icon.pwa.tip" size="24" aria-hidden="true" />
              <span>{{ t('browserExtensionLanding.imageLoadFailed') }}</span>
            </div>
          </div>
        </div>
      </section>

      <section class="browser-extension-section browser-extension-section--methods">
        <div class="browser-extension-section__heading">
          <h2>{{ t('browserExtensionLanding.chooseTitle') }}</h2>
          <p>{{ t('browserExtensionLanding.chooseSubtitle') }}</p>
        </div>
        <div class="browser-extension-method-grid">
          <BCard
            class="browser-extension-method-card browser-extension-method-card--recommended"
            variant="raised"
            padding="24px"
          >
            <div class="browser-extension-method-card__heading">
              <span class="browser-extension-method-card__icon">
                <img src="/favicon.svg?v=7" alt="" />
              </span>
              <h3>{{ t('browserExtensionLanding.extensionMethodTitle') }}</h3>
              <BChip tone="pin" size="medium">{{ t('browserExtensionLanding.extensionMethodBadge') }}</BChip>
            </div>
            <p>{{ t('browserExtensionLanding.extensionMethodDesc') }}</p>
            <ul>
              <li v-for="feature in extensionMethodFeatures" :key="feature">
                <SvgIcon :src="icon.pwa.check" size="16" aria-hidden="true" />
                <span>{{ feature }}</span>
              </li>
            </ul>
            <BButton v-if="bookmark.isMobile" type="primary" block @click="copyLandingAddress">
              {{ t('browserExtensionLanding.mobileAction') }}
            </BButton>
            <a
              v-else
              class="browser-extension-store-link browser-extension-store-link--block"
              :href="CHROME_WEB_STORE_URL"
              target="_blank"
              rel="noopener noreferrer"
              @click="trackStoreOpen"
            >
              {{ t('browserExtensionLanding.install') }}
            </a>
          </BCard>

          <BCard class="browser-extension-method-card" variant="card" padding="24px">
            <div class="browser-extension-method-card__heading">
              <span class="browser-extension-method-card__icon browser-extension-method-card__icon--bookmark">
                <SvgIcon :src="icon.resource.bookmark" size="23" aria-hidden="true" />
              </span>
              <h3>{{ t('browserExtensionLanding.bookmarkletMethodTitle') }}</h3>
              <BChip tone="neutral" size="medium">{{ t('browserExtensionLanding.bookmarkletMethodBadge') }}</BChip>
            </div>
            <p>{{ t('browserExtensionLanding.bookmarkletMethodDesc') }}</p>
            <ul>
              <li v-for="feature in bookmarkletMethodFeatures" :key="feature">
                <SvgIcon :src="icon.pwa.check" size="16" aria-hidden="true" />
                <span>{{ feature }}</span>
              </li>
            </ul>
            <BButton block @click="bookmark.isMobile ? copyLandingAddress() : openBrowserCaptureSettings()">
              {{
                t(
                  bookmark.isMobile
                    ? 'browserExtensionLanding.bookmarkletMobileAction'
                    : 'browserExtensionLanding.openBookmarkletSettings',
                )
              }}
            </BButton>
          </BCard>
        </div>
      </section>

      <section class="browser-extension-section browser-extension-section--setup">
        <div class="browser-extension-section__heading">
          <h2>{{ t('browserExtensionLanding.setupTitle') }}</h2>
        </div>
        <ol class="browser-extension-steps">
          <li v-for="(step, index) in setupSteps" :key="step.title">
            <span class="browser-extension-steps__number">{{ index + 1 }}</span>
            <div>
              <h3>{{ step.title }}</h3>
              <p>{{ step.description }}</p>
            </div>
          </li>
        </ol>
      </section>

      <section class="browser-extension-section browser-extension-privacy">
        <span class="browser-extension-privacy__icon">
          <SvgIcon :src="icon.settings.privacy" size="28" aria-hidden="true" />
        </span>
        <div>
          <h2>{{ t('browserExtensionLanding.privacyTitle') }}</h2>
          <p>{{ t('browserExtensionLanding.privacyDesc') }}</p>
          <div class="browser-extension-privacy__links">
            <a :href="BROWSER_EXTENSION_PRIVACY_PATH" target="_blank" rel="noopener noreferrer">
              {{ t('browserExtensionLanding.privacyPolicy') }}
            </a>
            <a :href="BROWSER_EXTENSION_SUPPORT_URL" target="_blank" rel="noopener noreferrer">
              {{ t('browserExtensionLanding.support') }}
            </a>
          </div>
        </div>
      </section>
    </main>

    <footer class="browser-extension-footer">
      <span>{{ t('browserExtensionLanding.footer') }}</span>
      <BButton @click="goHome">{{ t('browserExtensionLanding.backHome') }}</BButton>
    </footer>
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import { bookmarkStore } from '@/store';
  import { recordOperation } from '@/api/commonApi.ts';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import {
    BROWSER_EXTENSION_LANDING_PATH,
    BROWSER_EXTENSION_PRIVACY_PATH,
    BROWSER_EXTENSION_SUPPORT_URL,
    CHROME_WEB_STORE_URL,
  } from '@/config/browserExtension.ts';
  import { copyTextToClipboard } from '@/utils/clipboard.ts';
  import localizedHome from '../../../store-assets/chrome/screenshots/localized/01-home.png';
  import localizedBookmark from '../../../store-assets/chrome/screenshots/localized/02-bookmark.png';
  import localizedNote from '../../../store-assets/chrome/screenshots/localized/03-note.png';
  import localizedFile from '../../../store-assets/chrome/screenshots/localized/04-file.png';
  import globalHome from '../../../store-assets/chrome/screenshots/global/01-home.png';
  import globalBookmark from '../../../store-assets/chrome/screenshots/global/02-bookmark.png';
  import globalNote from '../../../store-assets/chrome/screenshots/global/03-note.png';
  import globalFile from '../../../store-assets/chrome/screenshots/global/04-file.png';

  const { t, locale } = useI18n();
  const router = useRouter();
  const bookmark = bookmarkStore();
  const galleryIndex = ref(0);
  const galleryImageFailed = ref(false);
  const heroImageFailed = ref(false);
  const previousTitle = typeof document === 'undefined' ? '' : document.title;
  const isChinese = computed(() =>
    String(locale.value || '')
      .toLowerCase()
      .startsWith('zh'),
  );
  const heroScreenshot = computed(() => (isChinese.value ? localizedHome : globalHome));

  const featureCards = computed(() => [
    {
      key: 'bookmark',
      icon: icon.resource.bookmark,
      title: t('browserExtensionLanding.bookmarkTitle'),
      description: t('browserExtensionLanding.bookmarkDesc'),
    },
    {
      key: 'note',
      icon: icon.resource.note,
      title: t('browserExtensionLanding.noteTitle'),
      description: t('browserExtensionLanding.noteDesc'),
    },
    {
      key: 'file',
      icon: icon.resource.file,
      title: t('browserExtensionLanding.fileTitle'),
      description: t('browserExtensionLanding.fileDesc'),
    },
  ]);

  const galleryItems = computed(() => {
    const screenshots = isChinese.value
      ? [localizedHome, localizedBookmark, localizedNote, localizedFile]
      : [globalHome, globalBookmark, globalNote, globalFile];
    return [
      {
        key: 'home',
        label: t('browserExtensionLanding.galleryHome'),
        alt: t('browserExtensionLanding.galleryAltHome'),
        icon: icon.support.store,
        src: screenshots[0],
      },
      {
        key: 'bookmark',
        label: t('browserExtensionLanding.galleryBookmark'),
        alt: t('browserExtensionLanding.galleryAltBookmark'),
        icon: icon.resource.bookmark,
        src: screenshots[1],
      },
      {
        key: 'note',
        label: t('browserExtensionLanding.galleryNote'),
        alt: t('browserExtensionLanding.galleryAltNote'),
        icon: icon.resource.note,
        src: screenshots[2],
      },
      {
        key: 'file',
        label: t('browserExtensionLanding.galleryFile'),
        alt: t('browserExtensionLanding.galleryAltFile'),
        icon: icon.resource.file,
        src: screenshots[3],
      },
    ];
  });
  const activeGalleryItem = computed(() => galleryItems.value[galleryIndex.value] || galleryItems.value[0]);
  const extensionMethodFeatures = computed(() => [
    t('browserExtensionLanding.extensionMethodFeature1'),
    t('browserExtensionLanding.extensionMethodFeature2'),
    t('browserExtensionLanding.extensionMethodFeature3'),
  ]);
  const bookmarkletMethodFeatures = computed(() => [
    t('browserExtensionLanding.bookmarkletMethodFeature1'),
    t('browserExtensionLanding.bookmarkletMethodFeature2'),
    t('browserExtensionLanding.bookmarkletMethodFeature3'),
  ]);
  const setupSteps = computed(() => [
    {
      title: t('browserExtensionLanding.setupStep1Title'),
      description: t('browserExtensionLanding.setupStep1Desc'),
    },
    {
      title: t('browserExtensionLanding.setupStep2Title'),
      description: t('browserExtensionLanding.setupStep2Desc'),
    },
    {
      title: t('browserExtensionLanding.setupStep3Title'),
      description: t('browserExtensionLanding.setupStep3Desc'),
    },
  ]);

  function goHome() {
    void router.push('/');
  }

  function openLightNote() {
    void router.push('/app');
  }

  function trackStoreOpen() {
    void recordOperation({ module: '浏览器扩展官网', operation: '打开 Chrome 扩展商店' });
  }

  async function copyLandingAddress() {
    const copied = await copyTextToClipboard(`${window.location.origin}${BROWSER_EXTENSION_LANDING_PATH}`);
    if (copied) {
      message.success(t('browserExtensionLanding.copySuccess'));
      void recordOperation({ module: '浏览器扩展官网', operation: '移动端复制扩展介绍页地址' });
      return;
    }
    message.warning(t('browserExtensionLanding.copyFailed'));
  }

  function openBrowserCaptureSettings() {
    void router.push({ path: '/settings', hash: '#set-quicksave' });
    void recordOperation({ module: '浏览器扩展官网', operation: '查看书签栏收藏设置' });
  }

  function selectGallery(index: number) {
    galleryIndex.value = index;
    galleryImageFailed.value = false;
  }

  watch(locale, () => {
    if (typeof document !== 'undefined') document.title = t('browserExtensionLanding.pageTitle');
    heroImageFailed.value = false;
    galleryImageFailed.value = false;
  });

  onMounted(() => {
    document.title = t('browserExtensionLanding.pageTitle');
  });

  onBeforeUnmount(() => {
    if (previousTitle) document.title = previousTitle;
  });
</script>

<style scoped lang="less">
  .browser-extension-page {
    --extension-page-bg: #f7f7ff;
    --extension-surface: #ffffff;
    --extension-surface-soft: #f0f0ff;
    --extension-border: #e1e2f1;
    --extension-text: #171823;
    --extension-muted: #666876;
    --extension-shadow: 0 22px 70px rgba(51, 46, 139, 0.12);

    min-height: 100vh;
    color: var(--extension-text);
    background:
      radial-gradient(circle at 10% 0%, rgba(97, 92, 237, 0.14), transparent 28rem),
      radial-gradient(circle at 90% 12%, rgba(0, 168, 132, 0.1), transparent 24rem), var(--extension-page-bg);
    font-family: var(--app-font-family);
  }
  :global([data-theme='night'] .browser-extension-page) {
    --extension-page-bg: #161820;
    --extension-surface: #22252e;
    --extension-surface-soft: #2b2e3a;
    --extension-border: #3a3f4d;
    --extension-text: #f2f3f7;
    --extension-muted: #aeb3c0;
    --extension-shadow: 0 22px 70px rgba(0, 0, 0, 0.34);
  }
  .browser-extension-page,
  .browser-extension-page * {
    box-sizing: border-box;
  }
  .browser-extension-header {
    position: sticky;
    top: 0;
    z-index: 10;
    min-height: 68px;
    padding: 12px max(24px, calc((100vw - 1180px) / 2));
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    border-bottom: 1px solid var(--extension-border);
    background: var(--extension-surface);
    box-shadow: 0 8px 30px rgba(29, 27, 73, 0.05);
  }
  .browser-extension-brand.b_btn {
    min-height: 42px;
    height: auto;
    padding: 4px 8px;
    display: inline-flex;
    gap: 10px;
    border: 0;
    color: var(--extension-text);
    background: transparent;
    font-size: 16px;
    font-weight: 700;
  }
  .browser-extension-brand img {
    width: 30px;
    height: 30px;
  }
  .browser-extension-header__actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .browser-extension-header__actions :deep(.b_btn) {
    gap: 6px;
  }
  main {
    width: min(1180px, calc(100% - 48px));
    margin: 0 auto;
  }
  .browser-extension-hero {
    min-height: 680px;
    padding: 82px 0 70px;
    display: grid;
    grid-template-columns: minmax(0, 0.88fr) minmax(500px, 1.12fr);
    align-items: center;
    gap: 58px;
  }
  .browser-extension-eyebrow {
    display: inline-flex;
    color: #615ced;
    font-size: 12px;
    font-weight: 750;
    letter-spacing: 0.18em;
  }
  :global([data-theme='night'] .browser-extension-eyebrow) {
    color: #aaa6ff;
  }
  .browser-extension-hero__title {
    max-width: 10em;
    margin: 18px 0 20px;
    font-size: clamp(42px, 5vw, 68px);
    line-height: 1.08;
    letter-spacing: -0.045em;
  }
  .browser-extension-hero__copy > p {
    max-width: 35em;
    margin: 0;
    color: var(--extension-muted);
    font-size: 17px;
    line-height: 1.85;
  }
  .browser-extension-hero__actions {
    margin-top: 28px;
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
  }
  .browser-extension-hero__actions :deep(.b_btn) {
    min-height: 48px;
    gap: 8px;
    border-radius: 12px;
  }
  .browser-extension-store-link {
    min-height: 48px;
    padding: 0 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 1px solid #615ced;
    border-radius: 12px;
    color: #fff;
    background: #615ced;
    font-size: 15px;
    font-weight: 650;
    line-height: 1.3;
    text-decoration: none;
    transition:
      background-color 0.18s ease,
      border-color 0.18s ease,
      transform 0.18s ease;
  }
  .browser-extension-store-link:hover {
    border-color: #514ad0;
    background: #514ad0;
    transform: translateY(-1px);
  }
  .browser-extension-store-link:focus-visible {
    outline: 2px solid var(--focus-ring-color, #615ced);
    outline-offset: 3px;
  }
  .browser-extension-store-link--block {
    width: 100%;
    min-height: 42px;
    margin-top: auto;
  }
  .browser-extension-hero__hint {
    color: var(--extension-muted);
    font-size: 12px;
  }
  .browser-extension-mobile-notice {
    margin-top: 16px;
    padding: 13px 14px;
    display: flex;
    align-items: flex-start;
    gap: 9px;
    border: 1px solid #8f89ef;
    border-radius: 12px;
    color: var(--extension-muted);
    background: var(--extension-surface-soft);
    font-size: 12px;
    line-height: 1.6;
  }
  .browser-extension-mobile-notice :deep(svg) {
    color: #615ced;
  }
  .browser-extension-hero__visual,
  .browser-extension-gallery__stage {
    overflow: hidden;
    border: 1px solid var(--extension-border);
    border-radius: 24px;
    background: #1c1e27;
    box-shadow: var(--extension-shadow);
  }
  .browser-extension-hero__visual {
    transform: perspective(1200px) rotateY(-3deg) rotateX(1deg);
  }
  .browser-extension-hero__visual img,
  .browser-extension-gallery__stage img {
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 1280 / 800;
    object-fit: cover;
  }
  .browser-extension-image-error {
    min-height: 320px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: #c7c9d2;
    background: #242731;
    font-size: 13px;
  }
  .browser-extension-section {
    padding: 92px 0;
  }
  .browser-extension-section__heading {
    max-width: 760px;
    margin: 0 auto 38px;
    text-align: center;
  }
  .browser-extension-section__heading h2,
  .browser-extension-privacy h2 {
    margin: 12px 0 10px;
    color: var(--extension-text);
    font-size: clamp(30px, 4vw, 46px);
    line-height: 1.2;
  }
  .browser-extension-section__heading p,
  .browser-extension-privacy p {
    margin: 0;
    color: var(--extension-muted);
    font-size: 15px;
    line-height: 1.75;
  }
  .browser-extension-feature-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
  }
  .browser-extension-feature-card,
  .browser-extension-method-card {
    --b-card-background: var(--extension-surface);
    --b-card-border-color: var(--extension-border);
    --b-card-shadow: 0 12px 36px rgba(42, 39, 106, 0.08);
  }
  :global([data-theme='night'] .browser-extension-feature-card),
  :global([data-theme='night'] .browser-extension-method-card) {
    --b-card-shadow: 0 12px 36px rgba(0, 0, 0, 0.24);
  }
  .browser-extension-feature-card {
    min-height: 250px;
  }
  .browser-extension-feature-card__icon,
  .browser-extension-method-card__icon {
    width: 52px;
    height: 52px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid currentColor;
    border-radius: 15px;
  }
  .browser-extension-feature-card--bookmark .browser-extension-feature-card__icon {
    color: #615ced;
    background: rgba(97, 92, 237, 0.1);
  }
  .browser-extension-feature-card--note .browser-extension-feature-card__icon {
    color: #008a6d;
    background: rgba(0, 168, 132, 0.1);
  }
  .browser-extension-feature-card--file .browser-extension-feature-card__icon {
    color: #b36100;
    background: rgba(255, 138, 0, 0.1);
  }
  :global([data-theme='night'] .browser-extension-feature-card--note .browser-extension-feature-card__icon) {
    color: #3ddcbd;
  }
  :global([data-theme='night'] .browser-extension-feature-card--file .browser-extension-feature-card__icon) {
    color: #ffb04d;
  }
  .browser-extension-feature-card h3 {
    margin: 20px 0 9px;
    color: var(--extension-text);
    font-size: 20px;
  }
  .browser-extension-feature-card p,
  .browser-extension-method-card > p {
    margin: 0;
    color: var(--extension-muted);
    font-size: 13px;
    line-height: 1.75;
  }
  .browser-extension-section--gallery {
    padding-right: 48px;
    padding-left: 48px;
    border: 1px solid var(--extension-border);
    border-radius: 32px;
    background: var(--extension-surface);
    box-shadow: var(--extension-shadow);
  }
  .browser-extension-gallery__tabs {
    margin-bottom: 16px;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }
  .browser-extension-gallery__tab.b_btn {
    width: 100%;
    min-height: 44px;
    gap: 7px;
    border: 1px solid var(--extension-border);
    border-radius: 10px;
  }
  .browser-extension-gallery__stage {
    border-radius: 18px;
    box-shadow: none;
  }
  .browser-extension-method-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px;
  }
  .browser-extension-method-card {
    min-height: 390px;
    display: flex;
    flex-direction: column;
  }
  .browser-extension-method-card--recommended {
    --b-card-border-color: #8f89ef;
  }
  .browser-extension-method-card__heading {
    display: flex;
    align-items: center;
    gap: 11px;
  }
  .browser-extension-method-card__heading h3 {
    min-width: 0;
    flex: 1 1 auto;
    margin: 0;
    color: var(--extension-text);
    font-size: 20px;
  }
  .browser-extension-method-card__icon {
    flex: 0 0 52px;
    color: #615ced;
    border-color: #b2aef5;
    background: rgba(97, 92, 237, 0.08);
  }
  .browser-extension-method-card__icon img {
    width: 34px;
    height: 34px;
  }
  .browser-extension-method-card__icon--bookmark {
    color: #615ced;
  }
  .browser-extension-method-card > p {
    min-height: 72px;
    margin-top: 18px;
  }
  .browser-extension-method-card ul {
    margin: 18px 0 24px;
    padding: 0;
    display: grid;
    gap: 10px;
    list-style: none;
  }
  .browser-extension-method-card li {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--extension-text);
    font-size: 13px;
  }
  .browser-extension-method-card li :deep(svg) {
    color: #008a6d;
  }
  :global([data-theme='night'] .browser-extension-method-card li svg) {
    color: #3ddc84;
  }
  .browser-extension-method-card > :deep(.b_btn) {
    margin-top: auto;
    min-height: 42px;
    border-radius: 10px;
  }
  .browser-extension-steps {
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
    list-style: none;
  }
  .browser-extension-steps li {
    min-height: 190px;
    padding: 24px;
    border: 1px solid var(--extension-border);
    border-radius: 18px;
    background: var(--extension-surface);
  }
  .browser-extension-steps__number {
    width: 34px;
    height: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 11px;
    color: #fff;
    background: #615ced;
    font-size: 13px;
    font-weight: 700;
  }
  .browser-extension-steps h3 {
    margin: 20px 0 8px;
    color: var(--extension-text);
    font-size: 17px;
  }
  .browser-extension-steps p {
    margin: 0;
    color: var(--extension-muted);
    font-size: 13px;
    line-height: 1.7;
  }
  .browser-extension-privacy {
    margin-bottom: 90px;
    padding: 34px 38px;
    display: grid;
    grid-template-columns: 64px minmax(0, 1fr);
    gap: 22px;
    align-items: start;
    border: 1px solid #8f89ef;
    border-radius: 24px;
    background: var(--extension-surface-soft);
  }
  .browser-extension-privacy__icon {
    width: 58px;
    height: 58px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 17px;
    color: #615ced;
    background: var(--extension-surface);
  }
  :global([data-theme='night'] .browser-extension-privacy__icon) {
    color: #aaa6ff;
  }
  .browser-extension-privacy h2 {
    margin-top: 0;
    font-size: 28px;
  }
  .browser-extension-privacy__links {
    margin-top: 16px;
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
  }
  .browser-extension-privacy__links a {
    color: #514ad0;
    font-size: 13px;
    font-weight: 650;
    text-decoration: none;
  }
  :global([data-theme='night'] .browser-extension-privacy__links a) {
    color: #aaa6ff;
  }
  .browser-extension-privacy__links a:hover,
  .browser-extension-privacy__links a:focus-visible {
    text-decoration: underline;
  }
  .browser-extension-privacy__links a:focus-visible {
    border-radius: 4px;
    outline: 2px solid var(--focus-ring-color, #615ced);
    outline-offset: 3px;
  }
  .browser-extension-footer {
    min-height: 88px;
    padding: 18px max(24px, calc((100vw - 1180px) / 2));
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    border-top: 1px solid var(--extension-border);
    color: var(--extension-muted);
    background: var(--extension-surface);
    font-size: 12px;
  }

  @media (max-width: 960px) {
    .browser-extension-hero {
      grid-template-columns: 1fr;
      gap: 38px;
    }
    .browser-extension-hero__copy {
      text-align: center;
    }
    .browser-extension-hero__title,
    .browser-extension-hero__copy > p {
      margin-right: auto;
      margin-left: auto;
    }
    .browser-extension-hero__actions {
      justify-content: center;
    }
    .browser-extension-hero__visual {
      max-width: 760px;
      margin: 0 auto;
      transform: none;
    }
    .browser-extension-feature-grid,
    .browser-extension-steps {
      grid-template-columns: 1fr;
    }
    .browser-extension-feature-card,
    .browser-extension-steps li {
      min-height: 0;
    }
  }

  @media (max-width: 640px) {
    .browser-extension-header {
      min-height: 58px;
      padding: 8px 14px;
    }
    .browser-extension-header__home {
      display: none;
    }
    .browser-extension-brand.b_btn {
      font-size: 14px;
    }
    .browser-extension-header__actions :deep(.b_btn) {
      padding: 0 11px;
      font-size: 12px;
    }
    main {
      width: min(calc(100% - 28px), 540px);
    }
    .browser-extension-hero {
      min-height: 0;
      padding: 58px 0 46px;
    }
    .browser-extension-hero__title {
      margin-top: 13px;
      font-size: clamp(38px, 12vw, 54px);
    }
    .browser-extension-hero__copy > p {
      font-size: 14px;
      line-height: 1.75;
    }
    .browser-extension-hero__actions {
      flex-direction: column;
    }
    .browser-extension-hero__actions :deep(.b_btn) {
      width: 100%;
    }
    .browser-extension-hero__actions .browser-extension-store-link {
      width: 100%;
    }
    .browser-extension-mobile-notice {
      text-align: left;
    }
    .browser-extension-hero__visual,
    .browser-extension-gallery__stage {
      border-radius: 14px;
    }
    .browser-extension-section {
      padding: 58px 0;
    }
    .browser-extension-section__heading {
      margin-bottom: 26px;
    }
    .browser-extension-section__heading h2 {
      font-size: 29px;
    }
    .browser-extension-section--gallery {
      width: calc(100% + 12px);
      margin-left: -6px;
      padding-right: 10px;
      padding-left: 10px;
      border-radius: 20px;
    }
    .browser-extension-gallery__tabs {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .browser-extension-method-grid {
      grid-template-columns: 1fr;
    }
    .browser-extension-method-card {
      min-height: 0;
    }
    .browser-extension-method-card > p {
      min-height: 0;
    }
    .browser-extension-privacy {
      margin-bottom: 58px;
      padding: 24px 20px;
      grid-template-columns: 1fr;
      gap: 15px;
    }
    .browser-extension-privacy h2 {
      font-size: 25px;
    }
    .browser-extension-footer {
      padding: 18px 14px;
      flex-direction: column;
      text-align: center;
    }
  }
</style>
