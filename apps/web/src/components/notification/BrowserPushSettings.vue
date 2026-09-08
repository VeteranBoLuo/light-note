<template>
  <div v-if="browserPushDesktop" class="browser-push-settings">
    <header class="browser-push-settings__head">
      <div
        ><h2
          >{{ t('settings.notificationsBrowser') }}
          <BChip tone="neutral">{{ t('settingsRefine.push.device') }}</BChip></h2
        ><p>{{ t('settings.notificationsBrowserDesc') }}</p></div
      >
      <BSwitch controlled
        :checked="preferred"
        :disabled="restricted || guest || busy || state === 'loading' || state === 'unsupported'"
        :aria-label="t('settings.notificationsBrowser')"
        @change="(value) => setEnabled(value, locale)"
      />
    </header>
    <div
      class="browser-push-status"
      :class="{
        'is-ready': !restricted && !guest && state === 'on',
        'is-error': !restricted && !guest && state === 'error',
      }"
      role="status"
    >
      <SvgIcon
        :src="state === 'on' && !restricted && !guest ? icon.message.success : icon.message.info"
        size="18"
        aria-hidden="true"
      />
      <div
        ><strong>{{
          guest
            ? t('settingsRefine.push.guest')
            : state === 'on' && !restricted
              ? t('settingsRefine.push.connected')
              : t(`browserPush.state.${restricted ? 'restricted' : state}`)
        }}</strong
        ><p v-if="state === 'on' && !restricted && !guest">{{ t('settingsRefine.push.connectedDesc') }}</p></div
      >
    </div>
    <BrowserPushFacts v-if="!restricted && !guest" />
    <div class="browser-push-actions">
      <BButton
        v-if="!restricted && !guest && preferred && ['pending', 'error'].includes(state)"
        type="primary"
        :disabled="busy"
        @click="setEnabled(true, locale)"
        >{{
          t(diagnostics.permission === 'granted' ? 'settingsRefine.push.reconnect' : 'browserPush.authorize')
        }}</BButton
      >
      <BrowserPushHelp v-if="!restricted && !guest" />
      <BButton v-if="guest" @click="bookmark.isShowLogin = true">{{ t('personCenter.loginRegister') }}</BButton>
    </div>
    <p v-if="user.preferences.notificationsInApp === false" class="browser-push-note">{{
      t('settingsRefine.push.inAppOff')
    }}</p>
    <slot />
  </div>
</template>
<script setup lang="ts">
  import { computed, onMounted, onUnmounted } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { bookmarkStore, useUserStore } from '@/store';
  import { isAdminLoginPreview } from '@/utils/authStorage';
  import { useBrowserPushDesktop } from '@/utils/browserPushPlatform';
  import { useBrowserPush } from '@/composables/useBrowserPush';
  import BrowserPushHelp from './BrowserPushHelp.vue';
  import BrowserPushFacts from './BrowserPushFacts.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BSwitch from '@/components/base/BasicComponents/BSwitch.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  const browserPushDesktop = useBrowserPushDesktop();
  const { t, locale } = useI18n();
  const { state, busy, preferred, diagnostics, refresh, setEnabled } = useBrowserPush();
  const user = useUserStore(),
    bookmark = bookmarkStore();
  const guest = computed(() => !user.id || user.role === 'visitor');
  const restricted = computed(() => Boolean(user.adminContext) || isAdminLoginPreview());
  const refreshWhenVisible = () => {
    if (
      browserPushDesktop.value &&
      !guest.value &&
      !restricted.value &&
      !busy.value &&
      document.visibilityState === 'visible'
    )
      void refresh();
  };
  onMounted(() => {
    refreshWhenVisible();
    window.addEventListener('focus', refreshWhenVisible);
  });
  onUnmounted(() => window.removeEventListener('focus', refreshWhenVisible));
</script>
<style scoped lang="less">
  .browser-push-settings {
    min-width: 0;
    padding: 0 0 12px;
  }
  .browser-push-settings__head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;
  }
  h2 {
    margin: 0;
    font-size: 16px;
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  p {
    margin: 6px 0 0;
    font-size: 12px;
    color: var(--desc-color);
    line-height: 1.7;
  }
  .browser-push-status {
    display: flex;
    gap: 10px;
    padding: 14px;
    margin-top: 18px;
    border: 1px solid var(--surface-border-color);
    border-radius: 9px;
    background: var(--workspace-panel-bg-color);
  }
  .browser-push-status strong {
    font-size: 13px;
    font-weight: 600;
  }
  .browser-push-status.is-ready {
    border-color: var(--success-color);
    background: color-mix(in srgb, var(--success-color) 8%, var(--card-background));
  }
  .browser-push-status.is-ready > :first-child {
    color: var(--success-color);
  }
  .browser-push-status.is-error {
    border-color: var(--error-color);
    color: var(--error-color);
  }
  .browser-push-actions {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .browser-push-actions > :last-child {
    margin-left: auto;
  }
  .browser-push-note {
    padding: 12px 0;
  }
</style>
