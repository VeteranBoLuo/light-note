<template>
  <section
    v-if="visible"
    class="native-notification-status"
    :class="{ 'is-connected': state === 'connected' }"
    :aria-label="t('nativePush.title')"
  >
    <div class="native-notification-status__copy" role="status" aria-live="polite">
      <strong>{{ t(`nativePush.state.${state}`) }}</strong>
      <p>{{ t(`nativePush.description.${state}`) }}</p>
      <p v-if="user.preferences.notificationsInApp === false">{{ t('nativePush.inAppOff') }}</p>
    </div>
    <BButton
      v-if="['retrying', 'unavailable', 'disabled'].includes(state)"
      size="small"
      @click="retryNativeNotifications"
    >
      {{ t('nativePush.retry') }}
    </BButton>
  </section>
</template>
<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useUserStore } from '@/store';
  import { hasAndroidBridge } from '@/utils/androidBridge';
  import { isAdminLoginPreview } from '@/utils/authStorage';
  import {
    nativeNotificationStatus,
    nativeNotificationOnline,
    retryNativeNotifications,
  } from '@/composables/useNativeNotificationStatus';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
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
  const state = computed(() => (nativeNotificationOnline.value ? nativeNotificationStatus.value.state : 'offline'));
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
