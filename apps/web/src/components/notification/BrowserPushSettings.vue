<template>
  <div class="browser-push-settings">
    <div class="browser-push-settings__copy">
      <strong>{{ t('settings.notificationsBrowser') }}</strong>
      <span>{{ t('settings.notificationsBrowserDesc') }}</span>
      <span role="status" :class="{ 'is-error': state === 'error' }">{{
        t(`browserPush.state.${restricted ? 'restricted' : state}`)
      }}</span>
      <BButton
        v-if="!restricted && ['error', 'denied', 'unavailable'].includes(state)"
        size="small"
        :disabled="busy"
        @click="refresh"
      >
        {{ t('browserPush.retry') }}
      </BButton>
      <BButton
        v-if="!restricted && preferred && ['pending', 'error'].includes(state)"
        size="small"
        :disabled="busy"
        @click="setEnabled(true, locale)"
      >
        {{ t('browserPush.authorize') }}
      </BButton>
      <BrowserPushHelp v-if="!restricted" />
    </div>
    <BSwitch
      :checked="preferred"
      :disabled="restricted || busy || state === 'loading'"
      :aria-label="t('settings.notificationsBrowser')"
      @change="(value) => setEnabled(value, locale)"
    />
  </div>
</template>
<script setup lang="ts">
  import BrowserPushHelp from './BrowserPushHelp.vue';
  import { computed, onMounted, onUnmounted } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useUserStore } from '@/store';
  import { isAdminLoginPreview } from '@/utils/authStorage';
  import { useBrowserPush } from '@/composables/useBrowserPush';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BSwitch from '@/components/base/BasicComponents/BSwitch.vue';
  const { t, locale } = useI18n();
  const { state, busy, preferred, refresh, setEnabled } = useBrowserPush();
  const user = useUserStore();
  const restricted = computed(() => Boolean(user.adminContext) || isAdminLoginPreview());
  const refreshWhenVisible = () => {
    if (!restricted.value && !busy.value && document.visibilityState === 'visible') void refresh();
  };
  onMounted(() => {
    refreshWhenVisible();
    window.addEventListener('focus', refreshWhenVisible);
  });
  onUnmounted(() => window.removeEventListener('focus', refreshWhenVisible));
</script>
<style scoped lang="less">
  .browser-push-settings {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 0;
    min-width: 0;
  }
  .browser-push-settings__copy {
    display: grid;
    gap: 6px;
    min-width: 0;
    font-size: 12px;
    color: var(--desc-color);
  }
  .browser-push-settings__copy strong {
    color: var(--text-color);
    font-size: 13px;
    font-weight: 500;
  }
  .browser-push-settings__copy .is-error {
    color: var(--error-color);
  }
</style>
