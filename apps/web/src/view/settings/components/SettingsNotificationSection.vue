<template>
  <div class="settings-section-stack" id="set-notification">
    <SettingsSectionCard :title="t('settingsRefine.channels')" :description="t('settingsRefine.channelsDesc')">
      <SettingsPreferenceField
        v-for="key in ['notificationsInApp', 'notificationsEmail']"
        :key="key"
        :pref-key="key"
        :label="t(`settings.${key}`)"
        :description="t(`settings.${key}Desc`)"
        kind="switch"
        :default-value="true"
      />
    </SettingsSectionCard>
    <SettingsSectionCard v-if="desktop && !bookmark.isMobileDevice" class="settings-push-card">
      <BrowserPushSettings><BrowserPushQuietHoursSettings /></BrowserPushSettings>
    </SettingsSectionCard>
    <SettingsSectionCard v-if="!isGuestUser()">
      <CommunityChatNotificationSettingsPanel class="settings-chat-panel" compact />
    </SettingsSectionCard>
    <SettingsSectionCard :title="t('settingsRefine.types')" :description="t('settingsRefine.typesDesc')">
      <div class="settings-notification-grid">
        <SettingsPreferenceField
          v-for="key in types"
          :key="key"
          :pref-key="key"
          :label="t(`settings.${key}`)"
          :description="t(`settings.${key}Desc`)"
          kind="switch"
          :default-value="true"
        />
      </div>
    </SettingsSectionCard>
  </div>
</template>
<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { bookmarkStore } from '@/store';
  import { isGuestUser } from '@/utils/savePreference';
  import { useBrowserPushDesktop } from '@/utils/browserPushPlatform';
  import BrowserPushSettings from '@/components/notification/BrowserPushSettings.vue';
  import BrowserPushQuietHoursSettings from '@/components/notification/BrowserPushQuietHoursSettings.vue';
  import CommunityChatNotificationSettingsPanel from '@/components/communityChat/CommunityChatNotificationSettingsPanel.vue';
  import SettingsSectionCard from './SettingsSectionCard.vue';
  import SettingsPreferenceField from './SettingsPreferenceField.vue';
  const { t } = useI18n();
  const desktop = useBrowserPushDesktop(),
    bookmark = bookmarkStore();
  const types = computed(() => [
    ...(!isGuestUser() ? ['notificationsOrganize'] : []),
    'weeklyReport',
    'notifyLevelUp',
    'notifyOpinionReply',
    'notifyFeatureRequest',
    'notifyStreakRisk',
  ]);
</script>
<style scoped lang="less">
  .settings-notification-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
    column-gap: 28px;
  }
  .settings-push-card {
    padding-bottom: 4px;
  }
  .settings-chat-panel {
    padding: 0 0 14px;
  }
  .settings-chat-panel :deep(.community-notification-settings__rail) {
    margin-top: 16px;
  }
  .settings-chat-panel :deep(.community-notification-settings__compact-results) {
    display: grid;
    gap: 7px;
  }
  .settings-chat-panel.community-notification-settings {
    border: 0;
    padding: 0;
    background: transparent;
  }
</style>
