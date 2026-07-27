<template>
  <aside v-if="shouldShow" class="pwa-nudge" :aria-label="t('pwa.nudgeTitle')">
    <span class="pwa-nudge__icon">
      <SvgIcon :src="icon.pwa.install" size="20" aria-hidden="true" />
    </span>
    <div class="pwa-nudge__text">
      <strong>{{ t('pwa.nudgeTitle') }}</strong>
      <span>{{ t('pwa.nudgeDesc') }}</span>
    </div>
    <BButton class="pwa-nudge__close" :aria-label="t('pwa.dismissNudge')" @click="dismiss">
      <SvgIcon :src="icon.navigation.close" size="16" aria-hidden="true" />
    </BButton>
    <BButton size="small" type="primary" class="pwa-nudge__install" @click="showInstallGuide">
      {{ t('pwa.install') }}
    </BButton>
  </aside>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { usePwaInstall } from '@/composables/usePwaInstall';

  const props = defineProps<{ eligible: boolean }>();
  const { t } = useI18n();
  const { canPrompt, isStandalone, openGuide, visitCount } = usePwaInstall();
  const DISMISSED_KEY = 'light-note:pwa-nudge-dismissed';
  const LEGACY_DISMISSED_AT_KEY = 'light-note:pwa-nudge-dismissed-at';
  const ready = ref(false);
  const dismissed = ref(false);
  const keyboardOpen = ref(false);
  let timer: number | undefined;

  function readDismissed() {
    try {
      const permanentlyDismissed = localStorage.getItem(DISMISSED_KEY) === '1';
      const legacyDismissedAt = Number(localStorage.getItem(LEGACY_DISMISSED_AT_KEY));
      const hasLegacyDismissal = Number.isFinite(legacyDismissedAt) && legacyDismissedAt > 0;
      dismissed.value = permanentlyDismissed || hasLegacyDismissal;
      if (hasLegacyDismissal && !permanentlyDismissed) localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      dismissed.value = false;
    }
  }

  function updateKeyboardState() {
    const viewport = window.visualViewport;
    keyboardOpen.value = Boolean(
      viewport && (window.innerHeight - viewport.height > 120 || viewport.height / window.innerHeight < 0.75),
    );
  }

  const shouldShow = computed(
    () =>
      props.eligible &&
      ready.value &&
      !dismissed.value &&
      !keyboardOpen.value &&
      !isStandalone.value &&
      (canPrompt.value || visitCount.value >= 2),
  );

  function rememberDismissed() {
    dismissed.value = true;
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
      localStorage.removeItem(LEGACY_DISMISSED_AT_KEY);
    } catch {}
  }

  function dismiss() {
    rememberDismissed();
  }

  function showInstallGuide() {
    rememberDismissed();
    ready.value = false;
    openGuide('mobile-nudge');
  }

  onMounted(() => {
    readDismissed();
    updateKeyboardState();
    window.visualViewport?.addEventListener('resize', updateKeyboardState);
    timer = window.setTimeout(() => {
      ready.value = true;
    }, 8000);
  });

  onBeforeUnmount(() => {
    if (timer) window.clearTimeout(timer);
    window.visualViewport?.removeEventListener('resize', updateKeyboardState);
  });
</script>

<style scoped lang="less">
  .pwa-nudge {
    position: fixed;
    z-index: 5;
    right: 12px;
    bottom: calc(64px + env(safe-area-inset-bottom));
    left: 12px;
    max-width: 520px;
    margin: 0 auto;
    padding: 10px 12px;
    box-sizing: border-box;
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) auto 30px;
    align-items: center;
    gap: 10px;
    border: 1px solid color-mix(in srgb, var(--primary-color) 22%, var(--card-border-color));
    border-radius: 14px;
    color: var(--text-color);
    background: color-mix(in srgb, var(--background-color) 94%, var(--primary-color));
    box-shadow: 0 12px 34px rgba(30, 32, 55, 0.18);
  }

  .pwa-nudge__icon {
    width: 34px;
    height: 34px;
    flex: 0 0 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 11%, transparent);
  }

  .pwa-nudge__text {
    min-width: 0;
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .pwa-nudge__text strong {
    font-size: 13px;
  }

  .pwa-nudge__text span {
    overflow: hidden;
    color: var(--desc-color);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pwa-nudge__close {
    grid-column: 4;
    width: 30px;
    height: 30px;
    padding: 0;
    border-radius: 9px;
    color: var(--desc-color);
    background: transparent;
  }

  .pwa-nudge__close:hover {
    color: var(--text-color);
    background: var(--hover-background);
  }

  .pwa-nudge__install {
    grid-column: 3;
    border-radius: 9px;
  }

  @media (max-width: 520px) {
    .pwa-nudge {
      grid-template-columns: 34px minmax(0, 1fr) 30px;
    }

    .pwa-nudge__text span {
      overflow: visible;
      line-height: 1.4;
      text-overflow: clip;
      white-space: normal;
    }

    .pwa-nudge__close {
      grid-column: 3;
      grid-row: 1;
    }

    .pwa-nudge__install {
      width: 100%;
      grid-column: 2 / 4;
      grid-row: 2;
    }
  }
</style>
