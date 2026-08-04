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

          <!-- 能直接装 APK 的平台先给这条路:此前只讲「添加到主屏幕」,等于把更好的方式藏了。
               鸿蒙归到这里是因为部分机型可通过卓易通兼容运行 APK,能不能装由用户自己判断。 -->
          <template v-if="supportsApkInstall">
            <div class="pwa-guide__method-label">
              <span>{{ t('pwa.apkMethodTitle') }}</span>
              <span class="pwa-guide__method-badge">{{ t('pwa.apkMethodBadge') }}</span>
            </div>
            <!-- 保留 href 让右键新标签、复制链接照常;普通点击接管成 SPA 路由,
                 这样历史里留下这一跳,下载页的返回按钮才能识别出"从设置页来的"并退回原处。
                 不用 router-link:它自带的 navigate 会和下面必须先等占位出栈的关闭流程抢跑。 -->
            <a class="pwa-guide__apk-card" href="/download/android" @click="handleNativeAppClick">
              <span class="pwa-guide__apk-icon">
                <SvgIcon :src="icon.pwa.android" size="21" aria-hidden="true" />
              </span>
              <span class="pwa-guide__apk-copy">
                <strong>{{ t('pwa.apkCardTitle', { version: apkVersionName }) }}</strong>
                <small>{{ t(guidePlatform === 'harmony' ? 'pwa.apkCardDescHarmony' : 'pwa.apkCardDesc') }}</small>
              </span>
              <span class="pwa-guide__apk-cta">
                {{ t('pwa.nativeAppCta') }}
                <SvgIcon :src="icon.arrow_right" size="13" aria-hidden="true" />
              </span>
            </a>

            <div class="pwa-guide__method-label pwa-guide__method-label--secondary">
              <span>{{ t('pwa.webMethodTitle') }}</span>
            </div>
          </template>

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
  import { computed, nextTick, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { useRouter } from 'vue-router';
  import { usePwaInstall, type PwaGuidePlatform } from '@/composables/usePwaInstall';
  import { ANDROID_RELEASE } from '@/config/androidRelease';
  import { closeCurrentMobileOverlayThen } from '@/utils/mobileOverlayHistory';

  const { t, te } = useI18n();
  const router = useRouter();
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
  const apkVersionName = ANDROID_RELEASE.versionName;
  // iOS 装不了 APK;电脑不是 APK 的目标环境(想给手机装就切到 Android tab)。
  const supportsApkInstall = computed(
    () => ANDROID_RELEASE.released && (guidePlatform.value === 'android' || guidePlatform.value === 'harmony'),
  );
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
  // 这块讲的是"网页安装"那条路的能力。在能直接装 APK 的平台上,若照旧只说"请从浏览器菜单添加",
  // 会和下方的"方式一：安装 App"打架,让人以为添加到桌面是唯一出路,所以这里改口指向下面两种方式。
  const actionTitle = computed(() => {
    if (isStandalone.value) return t('pwa.installed');
    if (canPrompt.value) return t('pwa.directAvailable');
    return supportsApkInstall.value ? t('pwa.chooseMethod') : t('pwa.manualAvailable');
  });
  const actionDescription = computed(() => {
    if (isStandalone.value) return t('pwa.guideIntroDesc');
    if (canPrompt.value) return t('pwa.directAvailableDesc');
    return supportsApkInstall.value ? t('pwa.chooseMethodDesc') : t('pwa.manualHint');
  });

  function selectPlatform(platform: PwaGuidePlatform) {
    guidePlatform.value = platform;
  }

  // 移动端浮层在 history 里压了占位,关闭时会 history.back()。若把"关弹框"和"跳路由"写在
  // 同一轮事件里,那次 back() 会把刚 push 的下载页直接弹回来(表现为点了没反应)。
  // 统一走 closeCurrentMobileOverlayThen:先关弹框、等占位真正出栈,再跳转。
  // 桌面端没有占位,它会立即 resolve,不产生额外延迟。
  function handleNativeAppClick(event: MouseEvent) {
    // 修饰键或非左键:保留浏览器原生的新标签/新窗口行为
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    void closeCurrentMobileOverlayThen(
      () => {
        guideVisible.value = false;
      },
      () => router.push('/download/android'),
    );
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

  // 移动端返回键与边缘返回手势由 BModal 统一接管，避免与其他嵌套浮层重复压入历史占位。

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

  /* 桌面端固定弹框高度,只让右侧详情区滚动:
     1) 整体滚动时,切换平台还得把左侧列表滚回去才能选下一个;
     2) 各平台步骤长短不一,高度自适应会让弹框在切 tab 时上下跳。
     移动端窄屏分区滚动反而难用,下面的 767px 断点会整体还原成一起滚。 */
  :global(.pwa-install-modal.modal-view) {
    height: min(680px, calc(100% - 32px));
  }

  :global(.pwa-install-modal .modal-content) {
    padding: 0;
    background: #0f101b;
    overflow: hidden;
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
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
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
    flex: 0 0 auto;
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

  /* 两种安装方式的分节标题:让"直接安装"和"添加到主屏幕"不再糊成一团 */
  .pwa-guide__method-label {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 9px;
    color: #c9cad6;
    font-size: 11px;
    font-weight: 700;
  }

  .pwa-guide__method-label--secondary {
    margin-top: 18px;
    color: #85889c;
    font-weight: 650;
  }

  .pwa-guide__method-badge {
    padding: 3px 7px;
    border: 1px solid rgba(151, 147, 255, 0.28);
    border-radius: 999px;
    color: #b9b6ff;
    background: rgba(97, 92, 237, 0.14);
    font-size: 9px;
    font-weight: 700;
    line-height: 1.2;
  }

  .pwa-guide__apk-card {
    min-width: 0;
    padding: 12px 13px;
    display: grid;
    grid-template-columns: 38px minmax(0, 1fr) auto;
    align-items: center;
    gap: 11px;
    border: 1px solid rgba(151, 147, 255, 0.24);
    border-radius: 13px;
    background: linear-gradient(120deg, rgba(97, 92, 237, 0.16), rgba(97, 92, 237, 0.04));
    text-decoration: none;
    transition:
      border-color 0.2s ease,
      background 0.2s ease,
      transform 0.2s ease;
  }

  .pwa-guide__apk-card:hover {
    border-color: rgba(151, 147, 255, 0.48);
    background: linear-gradient(120deg, rgba(97, 92, 237, 0.26), rgba(97, 92, 237, 0.08));
    transform: translateY(-1px);
  }

  .pwa-guide__apk-icon {
    width: 38px;
    height: 38px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(151, 147, 255, 0.2);
    border-radius: 11px;
    color: #aaa7ff;
    background: rgba(97, 92, 237, 0.14);
  }

  .pwa-guide__apk-copy {
    min-width: 0;
  }

  .pwa-guide__apk-copy strong,
  .pwa-guide__apk-copy small {
    display: block;
  }

  .pwa-guide__apk-copy strong {
    color: #f4f3ff;
    font-size: 12px;
    line-height: 1.4;
  }

  .pwa-guide__apk-copy small {
    margin-top: 3px;
    color: #9093a6;
    font-size: 10px;
    line-height: 1.5;
  }

  .pwa-guide__apk-cta {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 7px 12px;
    border-radius: 999px;
    color: #c6c3ff;
    background: rgba(97, 92, 237, 0.22);
    font-size: 10px;
    font-weight: 700;
    line-height: 1.2;
    white-space: nowrap;
  }

  .pwa-guide__apk-card:hover .pwa-guide__apk-cta {
    color: #ffffff;
    background: rgba(97, 92, 237, 0.4);
  }

  .pwa-guide__workspace {
    flex: 1 1 auto;
    /* min-height:0 是关键:否则 grid 子项的内容高度会撑破 flex 容器,详情区永远不滚 */
    min-height: 0;
    display: grid;
    grid-template-columns: 214px minmax(0, 1fr);
    background: #0d0e18;
  }

  .pwa-guide__platforms {
    min-width: 0;
    min-height: 0;
    padding: 20px 14px 20px 20px;
    overflow-y: auto;
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
    min-height: 0;
    padding: 22px 24px 24px;
    overflow-y: auto;
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
    /* 窄屏还原成整体滚动:侧栏已横排、详情区没有富余高度,分区滚动只会挤出两个小滚动窗口 */
    :global(.pwa-install-modal.modal-view) {
      width: calc(100% - 20px) !important;
      max-width: none;
      height: auto;
      max-height: calc(100% - 16px);
      border-radius: 22px;
    }

    :global(.pwa-install-modal .modal-content) {
      overflow: auto;
    }

    .pwa-guide {
      height: auto;
    }

    .pwa-guide__platforms,
    .pwa-guide__detail {
      overflow: visible;
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

    .pwa-guide__apk-card {
      grid-template-columns: 36px minmax(0, 1fr);
      gap: 10px;
    }

    .pwa-guide__apk-icon {
      width: 36px;
      height: 36px;
    }

    .pwa-guide__apk-cta {
      grid-column: 2;
      width: max-content;
      margin-top: 1px;
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
