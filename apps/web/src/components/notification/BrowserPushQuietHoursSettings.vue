<template>
  <div class="browser-push-quiet-hours">
    <div class="quiet-hours-copy">
      <span class="quiet-hours-title">{{ t('settings.notificationsDnd') }}</span>
      <span class="field-desc">{{ t('settings.notificationsDndDesc') }}</span>
    </div>
    <div class="notification-dnd-controls">
      <BTimePicker
        class="notification-dnd-time"
        :disabled="restricted || saving"
        :value="String(user.preferences.notificationsDndStart || '22:00')"
        :aria-label="t('settings.notificationsDndStart')"
        @change="setNotificationTime('notificationsDndStart', $event, '22:00')"
      />
      <span>—</span>
      <BTimePicker
        class="notification-dnd-time"
        :disabled="restricted || saving"
        :value="String(user.preferences.notificationsDndEnd || '08:00')"
        :aria-label="t('settings.notificationsDndEnd')"
        @change="setNotificationTime('notificationsDndEnd', $event, '08:00')"
      />
      <BSwitch
        :disabled="restricted || saving"
        :checked="user.preferences.notificationsDnd === true"
        :aria-label="t('settings.notificationsDnd')"
        @change="setDnd"
      />
    </div>
  </div>
</template>
<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useUserStore } from '@/store';
  import { updatePreference } from '@/utils/savePreference';
  import { isAdminLoginPreview } from '@/utils/authStorage';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import BTimePicker from '@/components/base/BasicComponents/BTimePicker.vue';
  import BSwitch from '@/components/base/BasicComponents/BSwitch.vue';
  const { t } = useI18n();
  const user = useUserStore();
  const saving = ref(false);
  const restricted = computed(() => Boolean(user.adminContext) || isAdminLoginPreview());
  async function setDnd(value: boolean) {
    if (restricted.value || saving.value) return;
    saving.value = true;
    try {
      await updatePreference({
        notificationsDnd: value,
        notificationsTimezoneOffset: new Date().getTimezoneOffset(),
      });
    } catch {
      message.warning(t('settings.saveFailed'));
    } finally {
      saving.value = false;
    }
  }

  async function setNotificationTime(
    key: 'notificationsDndStart' | 'notificationsDndEnd',
    value: unknown,
    fallback: string,
  ) {
    const normalized = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || '')) ? String(value) : fallback;
    if (restricted.value || saving.value) return;
    saving.value = true;
    try {
      await updatePreference({
        [key]: normalized,
        notificationsTimezoneOffset: new Date().getTimezoneOffset(),
      });
    } catch {
      message.warning(t('settings.saveFailed'));
    } finally {
      saving.value = false;
    }
  }
</script>
<style scoped lang="less">
  .browser-push-quiet-hours {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px;
    padding: 12px 0;
  }
  .quiet-hours-copy {
    display: grid;
    gap: 6px;
    flex: 1 1 260px;
    min-width: 0;
    color: var(--desc-color);
    font-size: 12px;
  }
  .quiet-hours-title {
    color: var(--text-color);
    font-size: 13px;
    font-weight: 500;
  }
  .notification-dnd-controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .notification-dnd-time :deep(.b-time-trigger) {
    width: 100px;
    min-width: 100px;
  }
</style>
