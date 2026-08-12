<template>
  <BModal
    v-model:visible="visible"
    :title="t('communityChat.settings.title')"
    width="min(640px, 92vw)"
    :show-footer="false"
  >
    <div class="chat-settings-modal">
      <CommunityChatNotificationSettingsPanel compact @saved="emit('notificationSaved', $event)" />

      <section class="chat-settings-modal__management" :aria-label="t('communityChat.settings.managementTitle')">
        <BButton class="chat-settings-modal__action" @click="openOwnProfile">
          <span class="chat-settings-modal__action-icon is-profile" aria-hidden="true">
            <SvgIcon :src="icon.userCenter.growth" size="17" />
          </span>
          <span class="chat-settings-modal__action-copy">
            <strong>{{ t('communityChat.settings.ownProfileTitle') }}</strong>
            <span>{{ t('communityChat.settings.ownProfileDescription') }}</span>
          </span>
          <SvgIcon class="chat-settings-modal__chevron" :src="icon.arrow_right" size="15" aria-hidden="true" />
        </BButton>

        <BButton class="chat-settings-modal__action" @click="openBlockedUsers">
          <span class="chat-settings-modal__action-icon" aria-hidden="true">
            <SvgIcon :src="icon.navigation.permissions" size="17" />
          </span>
          <span class="chat-settings-modal__action-copy">
            <strong>{{ t('communityChat.settings.blockedUsersTitle') }}</strong>
            <span>{{ t('communityChat.settings.blockedUsersDescription') }}</span>
          </span>
          <SvgIcon class="chat-settings-modal__chevron" :src="icon.arrow_right" size="15" aria-hidden="true" />
        </BButton>
      </section>
    </div>
  </BModal>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import CommunityChatNotificationSettingsPanel from '@/components/communityChat/CommunityChatNotificationSettingsPanel.vue';
  import type { CommunityChatNotificationSettings } from '@/api/communityChatApi';
  import icon from '@/config/icon';
  import { closeCurrentMobileOverlayThen } from '@/utils/mobileOverlayHistory';

  const visible = defineModel<boolean>('visible', { default: false });
  const emit = defineEmits<{
    manageBlocks: [];
    manageProfile: [];
    notificationSaved: [settings: CommunityChatNotificationSettings];
  }>();
  const { t } = useI18n();

  async function openDestination(eventName: 'manageBlocks' | 'manageProfile') {
    await closeCurrentMobileOverlayThen(
      () => {
        visible.value = false;
      },
      () => emit(eventName),
    );
  }

  function openBlockedUsers() {
    return openDestination('manageBlocks');
  }

  function openOwnProfile() {
    return openDestination('manageProfile');
  }
</script>

<style scoped lang="less">
  .chat-settings-modal {
    display: grid;
    gap: 12px;
  }

  .chat-settings-modal__management {
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .chat-settings-modal__action.b_btn {
    width: 100%;
    height: auto;
    min-width: 0;
    min-height: 70px;
    padding: 11px 12px;
    justify-content: flex-start;
    gap: 10px;
    border: 1px solid var(--surface-border-color) !important;
    border-radius: 14px;
    color: var(--text-color);
    background: var(--workspace-panel-bg-color);
    line-height: normal;
    text-align: left;
    white-space: normal;
    transition:
      border-color 0.18s ease,
      background 0.18s ease;
  }

  .chat-settings-modal__action.b_btn:hover {
    border-color: var(--primary-color) !important;
    background: var(--mobile-selected-bg, var(--card-background));
  }

  .chat-settings-modal__action-icon {
    width: 34px;
    height: 34px;
    flex: 0 0 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    color: var(--desc-color);
    background: var(--card-background);
  }

  .chat-settings-modal__action-icon.is-profile {
    border-color: var(--primary-color);
    color: var(--primary-color);
    background: var(--mobile-selected-bg, var(--card-background));
  }

  .chat-settings-modal__action-copy {
    min-width: 0;
    flex: 1;
    display: grid;
    gap: 3px;
  }

  .chat-settings-modal__action-copy strong {
    overflow: hidden;
    color: var(--text-color);
    font-size: 12px;
    line-height: 1.35;
    text-overflow: ellipsis;
  }

  .chat-settings-modal__action-copy > span {
    display: -webkit-box;
    overflow: hidden;
    color: var(--desc-color);
    font-size: 9px;
    line-height: 1.45;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .chat-settings-modal__chevron {
    flex: 0 0 auto;
    color: var(--desc-color);
  }

  @media (max-width: 520px) {
    .chat-settings-modal {
      gap: 9px;
    }

    .chat-settings-modal__management {
      gap: 8px;
    }

    .chat-settings-modal__action.b_btn {
      min-height: 58px;
      padding: 9px;
      gap: 8px;
      border-radius: 12px;
    }

    .chat-settings-modal__action-icon {
      width: 30px;
      height: 30px;
      flex-basis: 30px;
      border-radius: 9px;
    }

    .chat-settings-modal__action-copy {
      gap: 0;
    }

    .chat-settings-modal__action-copy strong {
      font-size: 11px;
    }

    .chat-settings-modal__action-copy > span {
      display: none;
    }

    .chat-settings-modal__chevron {
      width: 12px;
      height: 12px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .chat-settings-modal__action.b_btn {
      transition: none;
    }
  }
</style>
