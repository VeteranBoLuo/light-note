<template>
  <section
    v-if="visible"
    class="native-notification-status"
    :class="{ 'is-connected': state === 'connected' }"
    :aria-label="t('nativePush.title')"
  >
    <div class="native-notification-status__copy" role="status" aria-live="polite">
      <div class="native-notification-status__heading">
        <strong>{{ t(`nativePush.state.${state}`) }}</strong>
        <BSwitch
          v-if="settingsAvailable"
          class="native-notification-status__switch"
          controlled
          :checked="systemEnabled === true"
          :disabled="openingSettings"
          :aria-busy="openingSettings || undefined"
          :aria-label="t('nativePush.phoneNotifications')"
          :title="t('nativePush.settingsHint')"
          @change="openSettings"
        />
      </div>
      <p>{{ t(descriptionKey) }}</p>
      <p v-if="user.preferences.notificationsInApp === false">{{ t('nativePush.inAppOff') }}</p>
      <p v-if="settingsError" class="native-notification-status__error" role="alert">{{
        t('nativePush.settingsFailed')
      }}</p>
    </div>
    <BButton
      v-if="['retrying', 'unavailable'].includes(state) || (state === 'disabled' && !settingsAvailable)"
      size="small"
      @click="retryNativeNotifications"
    >
      {{ t('nativePush.retry') }}
    </BButton>
  </section>
</template>
<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useUserStore } from '@/store';
  import { hasAndroidBridge } from '@/utils/androidBridge';
  import { isAdminLoginPreview } from '@/utils/authStorage';
  import {
    nativeNotificationStatus,
    nativeNotificationOnline,
    nativeNotificationDevice,
    retryNativeNotifications,
  } from '@/composables/useNativeNotificationStatus';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BSwitch from '@/components/base/BasicComponents/BSwitch.vue';
  import { nativeNotificationMessage } from '@/utils/nativeNotificationSync';
  const { t } = useI18n();
  const user = useUserStore();
  const visible = computed(
    () =>
      hasAndroidBridge() &&
      Boolean(user.id) &&
      user.role !== 'visitor' &&
      !user.adminContext &&
      !isAdminLoginPreview() &&
      nativeNotificationStatus.value.owner === String(user.id) &&
      nativeNotificationStatus.value.state !== 'idle',
  );
  const device = computed(() =>
    nativeNotificationDevice.value.owner === String(user.id) ? nativeNotificationDevice.value : null,
  );
  const systemEnabled = computed(() => device.value?.systemEnabled ?? null);
  const settingsAvailable = computed(() => device.value?.settingsAvailable === true && systemEnabled.value !== null);
  const state = computed(() =>
    systemEnabled.value === false
      ? 'disabled'
      : nativeNotificationOnline.value
        ? nativeNotificationStatus.value.state
        : 'offline',
  );
  const descriptionKey = computed(() =>
    settingsAvailable.value && ['connected', 'disabled'].includes(state.value)
      ? state.value === 'disabled' && systemEnabled.value === true
        ? 'nativePush.settingsPermissionOn'
        : `nativePush.settings${state.value === 'connected' ? 'Connected' : 'Disabled'}`
      : `nativePush.description.${state.value}`,
  );
  const openingSettings = ref(false);
  const settingsError = ref(false);
  let settingsGeneration = 0;
  watch(
    () => [user.id, visible.value],
    () => {
      settingsGeneration++;
      openingSettings.value = false;
      settingsError.value = false;
    },
    { flush: 'sync' },
  );
  async function openSettings() {
    if (!visible.value || !settingsAvailable.value || openingSettings.value) return;
    const generation = ++settingsGeneration;
    openingSettings.value = true;
    settingsError.value = false;
    const result = await nativeNotificationMessage({ action: 'settings', owner: String(user.id) });
    if (generation !== settingsGeneration) return;
    openingSettings.value = false;
    settingsError.value = !result.ok;
  }
  onMounted(() => {
    if (visible.value) retryNativeNotifications();
  });
  onBeforeUnmount(() => {
    settingsGeneration++;
  });
</script>
<style scoped lang="less">
  .native-notification-status {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ui-space-10, 10px);
    padding: var(--ui-space-12, 12px);
    margin: var(--ui-space-12, 12px) 0;
    border: 1px solid var(--surface-border-color);
    border-radius: 9px;
    box-sizing: border-box;
    color: var(--text-color);
    background: var(--workspace-panel-bg-color);
  }
  .native-notification-status__copy {
    flex: 1 1 var(--ui-layout-220, 220px);
    min-width: 0;
    font-size: var(--ui-font-13, 13px);
  }
  strong {
    font-weight: 600;
  }
  .native-notification-status__heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-12, 12px);
  }
  .native-notification-status__switch {
    flex: 0 0 auto;
    min-height: var(--ui-control-44, 44px);
    padding-inline: var(--ui-space-2, 2px);
  }
  .native-notification-status__switch:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
    border-radius: 9px;
  }
  .native-notification-status__error {
    color: var(--danger-color);
  }
  p {
    margin: var(--ui-space-4, 4px) 0 0;
    font-size: var(--ui-font-12, 12px);
    line-height: 1.7;
    color: var(--desc-color);
  }
  .is-connected {
    border-color: var(--success-color);
  }
  .is-connected strong {
    color: var(--success-color);
  }
</style>
