<template>
  <BModal
    v-model:visible="guideVisible"
    :title="t('pwa.guideTitle')"
    :show-footer="false"
    width="760px"
    modal-class="pwa-install-modal"
    mask-class="pwa-install-mask"
  >
    <template #title>
      <div class="pwa-guide__brand-head">
        <span class="pwa-guide__brand-mark">
          <SvgIcon :src="icon.pwa.install" size="20" aria-hidden="true" />
        </span>
        <div>
          <span>{{ t('pwa.guideEyebrow') }}</span>
          <strong>{{ t('pwa.guideTitle') }}</strong>
        </div>
      </div>
    </template>

    <div class="pwa-guide">
      <section class="pwa-guide__hero">
        <div class="pwa-guide__hero-copy">
          <span class="pwa-guide__badge">{{ t('pwa.guideBadge') }}</span>
          <h2>{{ t('pwa.guideIntroTitle') }}</h2>
          <p>{{ t('pwa.guideIntroDesc') }}</p>
          <div class="pwa-guide__benefits">
            <span v-for="benefit in benefits" :key="benefit">
              <SvgIcon :src="icon.pwa.check" size="13" aria-hidden="true" />
              {{ t(benefit) }}
            </span>
          </div>
        </div>

        <div
          class="pwa-guide__action"
          :class="{
            'is-installed': isStandalone,
            'is-direct': canPrompt && !isStandalone,
          }"
        >
          <span class="pwa-guide__action-icon">
            <SvgIcon :src="isStandalone ? icon.pwa.check : icon.pwa.device" size="24" aria-hidden="true" />
          </span>
          <div class="pwa-guide__action-copy">
            <strong>{{ actionTitle }}</strong>
            <span>{{ actionDescription }}</span>
          </div>
          <BButton
            v-if="canPrompt && !isStandalone"
            type="primary"
            class="pwa-guide__install-button"
            :loading="prompting"
            @click="installDirectly"
          >
            <SvgIcon :src="icon.pwa.install" size="16" aria-hidden="true" />
            {{ t('pwa.oneClickInstall') }}
          </BButton>
          <span v-else-if="isStandalone" class="pwa-guide__action-badge">
            {{ t('pwa.installed') }}
          </span>
          <span v-else class="pwa-guide__action-badge is-manual">
            {{ t('pwa.manualCapabilityReady') }}
          </span>
        </div>
      </section>

      <div class="pwa-guide__workspace">
        <aside class="pwa-guide__platforms">
          <span class="pwa-guide__section-label">{{ t('pwa.choosePlatform') }}</span>
          <div ref="platformListRef" class="pwa-guide__platform-list" role="tablist">
            <BButton
              v-for="platform in platformOptions"
              :key="platform.key"
              :data-platform="platform.key"
              class="pwa-guide__platform"
              :class="{ 'is-active': guidePlatform === platform.key }"
              role="tab"
              :aria-selected="guidePlatform === platform.key"
              @click="selectPlatform(platform.key)"
            >
              <span class="pwa-guide__platform-icon">
                <SvgIcon :src="platform.icon" size="20" aria-hidden="true" />
              </span>
              <span class="pwa-guide__platform-copy">
                <strong>{{ platform.label }}</strong>
                <small>{{ platform.title }}</small>
              </span>
              <span class="pwa-guide__platform-state" aria-hidden="true"></span>
            </BButton>
          </div>
        </aside>

        <section :key="guidePlatform" class="pwa-guide__detail">
          <div class="pwa-guide__browser-context">
            <span class="pwa-guide__browser-icon">
              <SvgIcon :src="icon.pwa.device" size="15" aria-hidden="true" />
            </span>
            <strong>{{ t('pwa.detectedBrowser', { browser: detectedBrowserLabel }) }}</strong>
            <span class="pwa-guide__browser-state" :class="{ 'is-ready': canPrompt }">
              {{ canPrompt ? t('pwa.directCapabilityReady') : t('pwa.manualCapabilityReady') }}
            </span>
          </div>

          <header class="pwa-guide__detail-head">
            <div>
              <span class="pwa-guide__detail-kicker">{{ activePlatformLabel }}</span>
              <h3>{{ t(`pwa.platforms.${guidePlatform}.title`) }}</h3>
            </div>
            <span class="pwa-guide__step-count">{{ t('pwa.stepsLabel') }}</span>
          </header>
          <p class="pwa-guide__description">{{ t(`pwa.platforms.${guidePlatform}.description`) }}</p>

          <div class="pwa-guide__steps">
            <div v-for="(step, index) in steps" :key="step" class="pwa-guide__step">
              <span class="pwa-guide__step-number">{{ String(index + 1).padStart(2, '0') }}</span>
              <p>{{ step }}</p>
            </div>
          </div>

          <div class="pwa-guide__note">
            <SvgIcon :src="icon.pwa.tip" size="17" aria-hidden="true" />
            <span>{{ activeNote }}</span>
          </div>
        </section>
      </div>
    </div>
  </BModal>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { bookmarkStore } from '@/store';
  import { usePwaInstall, type PwaGuidePlatform } from '@/composables/usePwaInstall';

  const { t, te } = useI18n();
  const bookmark = bookmarkStore();
  const {
    canPrompt,
    detectedBrowser,
    detectedPlatform,
    guidePlatform,
    guideSource,
    guideVisible,
    isStandalone,
    prompting,
    requestInstall,
  } = usePwaInstall();
  const platformListRef = ref<HTMLElement | null>(null);

  const platformKeys: PwaGuidePlatform[] = ['harmony', 'ios', 'android', 'desktop'];
  const platformIcons: Record<PwaGuidePlatform, string> = {
    harmony: icon.pwa.harmony,
    ios: icon.pwa.ios,
    android: icon.pwa.android,
    desktop: icon.pwa.desktop,
  };
  const benefits = ['pwa.benefitStandalone', 'pwa.benefitSynced', 'pwa.benefitAutoUpdate'];
  const platformOptions = computed(() =>
    platformKeys.map((key) => ({
      key,
      icon: platformIcons[key],
      label: t(`pwa.platforms.${key}.label`),
      title: t(`pwa.platforms.${key}.title`),
    })),
  );
  const activePlatformLabel = computed(
    () => platformOptions.value.find((platform) => platform.key === guidePlatform.value)?.label || '',
  );
  const detectedBrowserLabel = computed(() => t(`pwa.browsers.${detectedBrowser.value}.label`));
  const steps = computed(() => {
    const browserStepKey = `pwa.browsers.${detectedBrowser.value}.step2.${guidePlatform.value}`;
    const useDetectedBrowserStep = guidePlatform.value === detectedPlatform.value && te(browserStepKey);
    return [
      t(`pwa.platforms.${guidePlatform.value}.step1`),
      useDetectedBrowserStep ? t(browserStepKey) : t(`pwa.platforms.${guidePlatform.value}.step2`),
      t(`pwa.platforms.${guidePlatform.value}.step3`),
    ];
  });
  const activeNote = computed(() => {
    const platformNote = t(`pwa.platforms.${guidePlatform.value}.note`);
    if (guidePlatform.value !== detectedPlatform.value) return platformNote;
    const fallbackKey =
      detectedPlatform.value === 'harmony'
        ? 'pwa.harmonyBrowserFallbackHint'
        : detectedPlatform.value === 'ios'
          ? 'pwa.iosBrowserFallbackHint'
          : 'pwa.browserFallbackHint';
    return `${platformNote} ${t(fallbackKey, { browser: detectedBrowserLabel.value })}`;
  });
  const actionTitle = computed(() => {
    if (isStandalone.value) return t('pwa.installed');
    return canPrompt.value ? t('pwa.directAvailable') : t('pwa.manualAvailable');
  });
  const actionDescription = computed(() => {
    if (isStandalone.value) return t('pwa.guideIntroDesc');
    return canPrompt.value ? t('pwa.directAvailableDesc') : t('pwa.manualHint');
  });

  function selectPlatform(platform: PwaGuidePlatform) {
    guidePlatform.value = platform;
  }

  function revealActivePlatform() {
    const activePlatform = platformListRef.value?.querySelector<HTMLElement>(
      `[data-platform="${guidePlatform.value}"]`,
    );
    activePlatform?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

  watch(
    [guideVisible, guidePlatform],
    ([visible]) => {
      if (visible) void nextTick(revealActivePlatform);
    },
    { immediate: true },
  );

  // 移动端返回手势(左滑/右滑/系统返回键)优先关闭本弹窗,而不是后退到下层真实页面。
  // 手法与 FilePreview 全屏预览一致:打开时占一条历史,popstate 时关弹窗,主动关闭时再消费掉这条历史。
  const backHistoryActive = ref(false);

  function handleGuidePopState() {
    // 系统返回已弹出占位历史,这里只需关闭弹窗,不再回退路由
    if (backHistoryActive.value && guideVisible.value) {
      backHistoryActive.value = false;
      guideVisible.value = false;
    }
  }

  watch(guideVisible, (visible) => {
    if (visible) {
      // 仅移动端拦截返回手势;桌面端保持 ESC / 遮罩 / 关闭按钮,不占用浏览器前进后退
      if (bookmark.isMobile && !backHistoryActive.value) {
        history.pushState({ pwaGuide: true }, '');
        backHistoryActive.value = true;
      }
    } else if (backHistoryActive.value) {
      // 关闭按钮、遮罩、一键安装成功等主动关闭:消费掉占位历史,保持历史栈干净
      backHistoryActive.value = false;
      history.back();
    }
  });

  onMounted(() => {
    window.addEventListener('popstate', handleGuidePopState);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('popstate', handleGuidePopState);
  });

  async function installDirectly() {
    const result = await requestInstall(guideSource.value);
    if (result === 'accepted' || result === 'installed') {
      guideVisible.value = false;
      return;
    }
    if (result === 'unsupported' || result === 'failed') {
      message.warning(t(result === 'unsupported' ? 'pwa.unsupportedBrowser' : 'pwa.installFailedFallback'), 6);
    }
  }
</script>

<style scoped lang="less">
  :global(.pwa-install-mask.mask-container) {
    background: radial-gradient(circle at 72% 18%, rgba(97, 92, 237, 0.16), transparent 30%), rgba(2, 3, 10, 0.82);
    backdrop-filter: blur(14px) saturate(115%);
  }

  :global(.pwa-install-modal.modal-view) {
    overflow: hidden;
    border: 1px solid rgba(151, 147, 255, 0.2);
    border-radius: 24px;
    color: #f7f7ff;
    background: #0f101b;
    box-shadow:
      0 36px 100px rgba(0, 0, 0, 0.62),
      0 0 0 1px rgba(255, 255, 255, 0.025) inset,
      0 0 70px rgba(97, 92, 237, 0.11);
  }

  :global(.pwa-install-modal .modal-header) {
    min-height: 72px;
    padding: 15px 20px;
    border-color: rgba(255, 255, 255, 0.07);
    background: rgba(10, 11, 20, 0.88);
  }

  :global(.pwa-install-modal .modal-content) {
    padding: 0;
    background: #0f101b;
  }

  :global(.pwa-install-modal .modal-close) {
    width: 34px;
    height: 34px;
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 11px;
    color: #8e90a3;
    background: rgba(255, 255, 255, 0.04);
  }

  :global(.pwa-install-modal .modal-close:hover) {
    color: #ffffff;
    background: rgba(255, 255, 255, 0.09);
  }

  .pwa-guide {
    --pwa-accent: #7974ff;
    --pwa-accent-soft: #aaa7ff;
    color: #f7f7ff;
  }

  .pwa-guide__brand-head {
    display: flex;
    align-items: center;
    gap: 11px;
    min-width: 0;
  }

  .pwa-guide__brand-mark {
    width: 40px;
    height: 40px;
    flex: 0 0 40px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(151, 147, 255, 0.22);
    border-radius: 12px;
    color: #a9a6ff;
    background: linear-gradient(145deg, rgba(122, 116, 255, 0.2), rgba(97, 92, 237, 0.07));
    box-shadow: 0 10px 24px rgba(63, 56, 195, 0.18);
  }

  .pwa-guide__brand-head > div {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .pwa-guide__brand-head span {
    color: #777a92;
    font-size: 9px;
    font-weight: 700;
    line-height: 1.2;
    letter-spacing: 0.16em;
  }

  .pwa-guide__brand-head strong {
    overflow: hidden;
    color: #f7f7ff;
    font-size: 16px;
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pwa-guide__hero {
    position: relative;
    isolation: isolate;
    min-height: 184px;
    padding: 24px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 292px;
    align-items: center;
    gap: 24px;
    overflow: hidden;
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
    background:
      linear-gradient(115deg, rgba(97, 92, 237, 0.16), transparent 46%),
      linear-gradient(180deg, #131522 0%, #10111c 100%);
  }

  .pwa-guide__hero::before,
  .pwa-guide__hero::after {
    content: '';
    position: absolute;
    z-index: -1;
    border-radius: 999px;
    pointer-events: none;
  }

  .pwa-guide__hero::before {
    top: -128px;
    left: 29%;
    width: 310px;
    height: 310px;
    border: 1px solid rgba(151, 147, 255, 0.1);
    box-shadow:
      0 0 0 34px rgba(151, 147, 255, 0.025),
      0 0 0 78px rgba(151, 147, 255, 0.018);
  }

  .pwa-guide__hero::after {
    right: -54px;
    bottom: -88px;
    width: 220px;
    height: 220px;
    background: rgba(97, 92, 237, 0.08);
    filter: blur(2px);
  }

  .pwa-guide__hero-copy {
    min-width: 0;
  }

  .pwa-guide__badge {
    width: max-content;
    display: inline-flex;
    align-items: center;
    min-height: 25px;
    padding: 0 10px;
    border: 1px solid rgba(151, 147, 255, 0.2);
    border-radius: 999px;
    color: #b9b6ff;
    background: rgba(97, 92, 237, 0.1);
    font-size: 10px;
    font-weight: 650;
    letter-spacing: 0.04em;
  }

  .pwa-guide__hero h2 {
    margin: 12px 0 6px;
    font-size: 23px;
    line-height: 1.3;
    letter-spacing: -0.02em;
  }

  .pwa-guide__hero p {
    max-width: 410px;
    margin: 0;
    color: #999bae;
    font-size: 12px;
    line-height: 1.65;
  }

  .pwa-guide__benefits {
    margin-top: 14px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px 14px;
  }

  .pwa-guide__benefits span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: #c7c8d5;
    font-size: 11px;
  }

  .pwa-guide__benefits :deep(.svg-icon) {
    color: #8d89ff;
  }

  .pwa-guide__action {
    position: relative;
    min-width: 0;
    padding: 16px;
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr);
    align-items: center;
    gap: 11px;
    overflow: hidden;
    border: 1px solid rgba(151, 147, 255, 0.16);
    border-radius: 18px;
    background: rgba(6, 7, 15, 0.48);
    box-shadow:
      0 18px 44px rgba(0, 0, 0, 0.2),
      0 1px 0 rgba(255, 255, 255, 0.025) inset;
    backdrop-filter: blur(18px);
  }

  .pwa-guide__action.is-direct {
    border-color: rgba(151, 147, 255, 0.3);
    background: linear-gradient(145deg, rgba(97, 92, 237, 0.16), rgba(6, 7, 15, 0.52));
  }

  .pwa-guide__action.is-installed {
    border-color: rgba(0, 168, 132, 0.24);
  }

  .pwa-guide__action-icon {
    width: 42px;
    height: 42px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 13px;
    color: #aaa7ff;
    background: rgba(97, 92, 237, 0.15);
  }

  .pwa-guide__action.is-installed .pwa-guide__action-icon {
    color: #53d4b9;
    background: rgba(0, 168, 132, 0.13);
  }

  .pwa-guide__action-copy {
    min-width: 0;
  }

  .pwa-guide__action-copy strong,
  .pwa-guide__action-copy span {
    display: block;
  }

  .pwa-guide__action-copy strong {
    color: #f4f3ff;
    font-size: 12px;
    line-height: 1.4;
  }

  .pwa-guide__action-copy span {
    margin-top: 3px;
    color: #85889c;
    font-size: 10px;
    line-height: 1.5;
  }

  .pwa-guide__install-button,
  .pwa-guide__action-badge {
    grid-column: 1 / -1;
  }

  .pwa-guide__install-button {
    width: 100%;
    gap: 7px;
    border-radius: 10px;
    background: linear-gradient(135deg, #6c66f2, #7d6cff);
    box-shadow: 0 10px 24px rgba(97, 92, 237, 0.25);
  }

  .pwa-guide__action-badge {
    width: max-content;
    max-width: 100%;
    padding: 5px 9px;
    overflow: hidden;
    border-radius: 7px;
    color: #aaa7ff;
    background: rgba(97, 92, 237, 0.1);
    font-size: 10px;
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pwa-guide__workspace {
    min-height: 340px;
    display: grid;
    grid-template-columns: 214px minmax(0, 1fr);
    background: #0d0e18;
  }

  .pwa-guide__platforms {
    min-width: 0;
    padding: 20px 14px 20px 20px;
    border-right: 1px solid rgba(255, 255, 255, 0.07);
    background: rgba(255, 255, 255, 0.012);
  }

  .pwa-guide__section-label {
    display: block;
    margin: 0 8px 11px;
    color: #686b80;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .pwa-guide__platform-list {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .pwa-guide__platform {
    position: relative;
    width: 100%;
    height: 58px;
    padding: 0 10px;
    justify-content: flex-start;
    gap: 10px;
    overflow: hidden;
    border: 1px solid transparent;
    border-radius: 13px;
    color: #9c9eaf;
    background: transparent;
    line-height: normal;
    text-align: left;
    transition:
      color 0.2s ease,
      border-color 0.2s ease,
      background 0.2s ease,
      transform 0.2s ease;
  }

  .pwa-guide__platform:hover {
    color: #ffffff;
    background: rgba(255, 255, 255, 0.035);
    transform: translateX(2px);
  }

  .pwa-guide__platform.is-active {
    border-color: rgba(151, 147, 255, 0.2);
    color: #ffffff;
    background: linear-gradient(100deg, rgba(97, 92, 237, 0.18), rgba(97, 92, 237, 0.05));
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.13);
  }

  .pwa-guide__platform-icon {
    width: 34px;
    height: 34px;
    flex: 0 0 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    color: #777a91;
    background: rgba(255, 255, 255, 0.04);
  }

  .pwa-guide__platform.is-active .pwa-guide__platform-icon {
    color: #b5b2ff;
    background: rgba(97, 92, 237, 0.18);
  }

  .pwa-guide__platform-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .pwa-guide__platform-copy strong,
  .pwa-guide__platform-copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pwa-guide__platform-copy strong {
    font-size: 11px;
    line-height: 1.3;
  }

  .pwa-guide__platform-copy small {
    color: #65687b;
    font-size: 9px;
    line-height: 1.3;
  }

  .pwa-guide__platform-state {
    position: absolute;
    top: 50%;
    right: 9px;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: transparent;
    transform: translateY(-50%);
  }

  .pwa-guide__platform.is-active .pwa-guide__platform-state {
    background: #8f8aff;
    box-shadow: 0 0 10px #7771ff;
  }

  .pwa-guide__detail {
    min-width: 0;
    padding: 22px 24px 24px;
    animation: pwa-detail-in 0.24s ease;
  }

  .pwa-guide__browser-context {
    min-width: 0;
    margin-bottom: 14px;
    padding: 8px 10px;
    display: flex;
    align-items: center;
    gap: 8px;
    border: 1px solid rgba(151, 147, 255, 0.12);
    border-radius: 11px;
    color: #999bae;
    background: rgba(97, 92, 237, 0.045);
  }

  .pwa-guide__browser-icon {
    width: 26px;
    height: 26px;
    flex: 0 0 26px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    color: #9691ff;
    background: rgba(97, 92, 237, 0.1);
  }

  .pwa-guide__browser-context strong {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    color: #c9cad6;
    font-size: 10px;
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pwa-guide__browser-state {
    flex: 0 0 auto;
    padding: 4px 7px;
    border-radius: 999px;
    color: #9294a6;
    background: rgba(255, 255, 255, 0.04);
    font-size: 8px;
    line-height: 1.2;
  }

  .pwa-guide__browser-state.is-ready {
    color: #aaa7ff;
    background: rgba(97, 92, 237, 0.13);
  }

  .pwa-guide__detail-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }

  .pwa-guide__detail-kicker {
    display: block;
    margin-bottom: 4px;
    color: #7772ee;
    font-size: 9px;
    font-weight: 750;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .pwa-guide__detail h3 {
    margin: 0;
    color: #f7f7ff;
    font-size: 18px;
    line-height: 1.35;
  }

  .pwa-guide__step-count {
    flex: 0 0 auto;
    padding: 5px 9px;
    border: 1px solid rgba(151, 147, 255, 0.14);
    border-radius: 999px;
    color: #aaa7ff;
    background: rgba(97, 92, 237, 0.08);
    font-size: 9px;
  }

  .pwa-guide__description {
    margin: 8px 0 16px;
    color: #85889c;
    font-size: 11px;
    line-height: 1.6;
  }

  .pwa-guide__steps {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .pwa-guide__step {
    min-width: 0;
    min-height: 54px;
    padding: 10px 12px;
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr);
    align-items: center;
    gap: 11px;
    border: 1px solid rgba(255, 255, 255, 0.055);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.022);
    transition:
      border-color 0.2s ease,
      background 0.2s ease,
      transform 0.2s ease;
  }

  .pwa-guide__step:hover {
    border-color: rgba(151, 147, 255, 0.16);
    background: rgba(97, 92, 237, 0.05);
    transform: translateY(-1px);
  }

  .pwa-guide__step-number {
    width: 30px;
    height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(151, 147, 255, 0.16);
    border-radius: 9px;
    color: #9691ff;
    background: rgba(97, 92, 237, 0.08);
    font-size: 9px;
    font-weight: 750;
    letter-spacing: 0.05em;
  }

  .pwa-guide__step p {
    margin: 0;
    color: #c6c7d2;
    font-size: 11px;
    line-height: 1.55;
  }

  .pwa-guide__note {
    margin-top: 12px;
    padding: 10px 12px;
    display: flex;
    align-items: flex-start;
    gap: 8px;
    border-radius: 11px;
    color: #85889b;
    background: rgba(97, 92, 237, 0.055);
    font-size: 10px;
    line-height: 1.55;
  }

  .pwa-guide__note :deep(.svg-icon) {
    flex: 0 0 auto;
    margin-top: 1px;
    color: #8f8aff;
  }

  @keyframes pwa-detail-in {
    from {
      opacity: 0;
      transform: translateY(5px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (max-width: 767px) {
    :global(.pwa-install-modal.modal-view) {
      width: calc(100% - 20px) !important;
      max-width: none;
      max-height: calc(100% - 16px);
      border-radius: 22px;
    }

    :global(.pwa-install-modal .modal-header) {
      min-height: 62px;
      padding: 11px 12px 11px 14px;
    }

    .pwa-guide__brand-mark {
      width: 36px;
      height: 36px;
      flex-basis: 36px;
    }

    .pwa-guide__brand-head span {
      font-size: 8px;
    }

    .pwa-guide__brand-head strong {
      font-size: 14px;
    }

    .pwa-guide__hero {
      min-height: 0;
      padding: 18px 16px;
      grid-template-columns: 1fr;
      gap: 16px;
    }

    .pwa-guide__hero h2 {
      margin-top: 10px;
      font-size: 20px;
    }

    .pwa-guide__benefits {
      margin-top: 11px;
    }

    .pwa-guide__action {
      padding: 12px;
      grid-template-columns: 38px minmax(0, 1fr) auto;
    }

    .pwa-guide__action-icon {
      width: 38px;
      height: 38px;
    }

    .pwa-guide__install-button,
    .pwa-guide__action-badge {
      grid-column: auto;
    }

    .pwa-guide__install-button {
      width: max-content;
    }

    .pwa-guide__action-badge {
      display: none;
    }

    .pwa-guide__workspace {
      min-height: 0;
      display: block;
    }

    .pwa-guide__platforms {
      padding: 14px 16px 12px;
      border-right: 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.07);
    }

    .pwa-guide__section-label {
      margin: 0 2px 9px;
    }

    .pwa-guide__platform-list {
      padding-bottom: 2px;
      flex-direction: row;
      gap: 7px;
      overflow-x: auto;
      scrollbar-width: none;
    }

    .pwa-guide__platform-list::-webkit-scrollbar {
      display: none;
    }

    .pwa-guide__platform {
      width: auto;
      height: 42px;
      flex: 0 0 auto;
      padding: 0 11px 0 7px;
      gap: 7px;
      border-radius: 11px;
    }

    .pwa-guide__platform:hover {
      transform: none;
    }

    .pwa-guide__platform-icon {
      width: 30px;
      height: 30px;
      flex-basis: 30px;
      border-radius: 8px;
    }

    .pwa-guide__platform-copy small,
    .pwa-guide__platform-state {
      display: none;
    }

    .pwa-guide__detail {
      padding: 17px 16px 18px;
    }

    .pwa-guide__detail h3 {
      font-size: 16px;
    }

    .pwa-guide__description {
      margin-bottom: 12px;
    }

    .pwa-guide__step {
      min-height: 50px;
      padding: 9px 10px;
    }

    .pwa-guide__note {
      margin-top: 10px;
    }
  }

  @media (max-width: 420px) {
    .pwa-guide__action {
      grid-template-columns: 38px minmax(0, 1fr);
    }

    .pwa-guide__install-button {
      width: 100%;
      grid-column: 1 / -1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .pwa-guide__detail,
    .pwa-guide__platform,
    .pwa-guide__step {
      animation: none;
      transition: none;
    }
  }
</style>
