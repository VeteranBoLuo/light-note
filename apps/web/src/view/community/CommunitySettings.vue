<template>
  <div class="community-settings-page community-surface" v-auto-scrollbar>
    <CommunityLayout>
      <template #navigation><CommunityNavigation active="feed" /></template>
      <section class="settings-content">
        <h1 class="community-page-title">{{ t('community.feed.settings') }}</h1>
        <p class="settings-description">{{ t('community.settingsScope') }}</p>
        <template v-if="authenticated">
          <CommunitySettingsPanel />
          <CommunityBlockedMembers />
        </template>
        <p v-else>{{ t('community.preferenceUnavailable') }}</p>
      </section>
    </CommunityLayout>
  </div>
</template>
<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useUserStore } from '@/store';
  import CommunityLayout from '@/components/community/CommunityLayout.vue';
  import CommunityNavigation from '@/components/community/CommunityNavigation.vue';
  import CommunitySettingsPanel from '@/components/community/CommunitySettingsPanel.vue';
  import CommunityBlockedMembers from '@/components/community/CommunityBlockedMembers.vue';
  const { t } = useI18n();
  const user = useUserStore();
  const authenticated = computed(() => Boolean(user.id && user.role !== 'visitor' && !user.adminContext));
</script>
<style scoped>
  .community-settings-page {
    width: 100%;
    height: 100%;
    overflow: auto;
  }
  .settings-content {
    max-width: 980px;
    margin: 0;
  }
  h1 {
    margin: 0;
    font-size: 24px;
  }
  .settings-description {
    color: var(--desc-color);
    font-size: 14px;
    line-height: 1.7;
    margin: 12px 0 28px;
  }
  @media (max-width: 767px) {
    .settings-description {
      margin-top: 0;
    }
  }

  .settings-content :deep(.community-notification-settings.is-compact),
  .settings-content :deep(.community-feed-notifications),
  .settings-content :deep(.community-blocked-members) {
    padding: 24px;
    border: 1px solid var(--workspace-border);
    border-radius: 10px;
    background: var(--workspace-content);
    box-sizing: border-box;
  }
  .settings-content :deep(.community-settings-panel) {
    gap: 16px;
  }
  .settings-content :deep(.community-blocked-members) {
    margin-top: 16px;
  }
  .settings-content :deep(.community-notification-settings__head-icon) {
    display: none;
  }
  .settings-content :deep(.community-notification-settings__head strong) {
    font-size: 16px;
  }
  .settings-content :deep(.community-notification-settings__head-copy > span) {
    font-size: 13px;
  }
  .settings-content :deep(.community-notification-settings__rail) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .settings-content :deep(.community-notification-settings__option) {
    justify-content: flex-start;
    padding: 14px;
    font-size: 13px;
    min-height: 48px;
    border-radius: 8px;
  }
  .settings-content :deep(.community-notification-settings__compact-results) {
    background: transparent;
    border: 0;
    padding: 4px 0;
    display: grid;
    gap: 6px;
  }
  .settings-content :deep(.community-notification-settings__compact-result) {
    white-space: normal;
    font-size: 12px;
    overflow: visible;
  }
  .settings-content :deep(.community-settings-row + .community-settings-row) {
    border-top: 1px solid var(--workspace-divider);
  }
  .settings-content :deep(.community-section-loading) {
    min-height: 70px;
  }
  .settings-content :deep(.community-blocked-members h2) {
    margin: 0 0 16px;
  }
  .settings-content :deep(.community-blocked-members p:not([role='alert'])) {
    text-align: center;
    padding: 16px 0;
  }
  @media (max-width: 767px) {
    .settings-content :deep(.community-notification-settings.is-compact),
    .settings-content :deep(.community-feed-notifications),
    .settings-content :deep(.community-blocked-members) {
      padding: 16px;
    }
    .settings-content :deep(.community-notification-settings__option) {
      padding: 12px 8px;
    }
  }
</style>
