<template>
  <BModal
    v-model:visible="visible"
    :title="t('communityChat.settings.title')"
    width="min(560px, 92vw)"
    :show-footer="false"
  >
    <div class="chat-settings-modal">
      <CommunityChatNotificationSettingsPanel compact />

      <section class="chat-settings-modal__management">
        <div>
          <strong>{{ t('communityChat.settings.blockedUsersTitle') }}</strong>
          <span>{{ t('communityChat.settings.blockedUsersDescription') }}</span>
        </div>
        <BButton @click="openBlockedUsers">
          <SvgIcon :src="icon.navigation.permissions" size="16" aria-hidden="true" />
          {{ t('communityChat.settings.blockedUsersAction') }}
        </BButton>
      </section>

      <div class="chat-settings-modal__footer">
        <BButton @click="visible = false">{{ t('common.close') }}</BButton>
      </div>
    </div>
  </BModal>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import CommunityChatNotificationSettingsPanel from '@/components/communityChat/CommunityChatNotificationSettingsPanel.vue';
  import icon from '@/config/icon';

  const visible = defineModel<boolean>('visible', { default: false });
  const emit = defineEmits<{ manageBlocks: [] }>();
  const { t } = useI18n();

  function openBlockedUsers() {
    visible.value = false;
    emit('manageBlocks');
  }
</script>

<style scoped lang="less">
  .chat-settings-modal {
    display: grid;
    gap: 18px;
  }

  .chat-settings-modal__management {
    min-width: 0;
    padding: 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    border: 1px solid var(--surface-border-color);
    border-radius: 13px;
    background: var(--workspace-panel-bg-color);
  }

  .chat-settings-modal__management > div {
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  .chat-settings-modal__management strong {
    color: var(--text-color);
    font-size: 12px;
  }

  .chat-settings-modal__management span {
    color: var(--desc-color);
    font-size: 10px;
    line-height: 1.5;
  }

  .chat-settings-modal__management .b_btn {
    flex: 0 0 auto;
    gap: 5px;
  }

  .chat-settings-modal__footer {
    display: flex;
    justify-content: flex-end;
  }

  @media (max-width: 520px) {
    .chat-settings-modal__management {
      align-items: stretch;
      flex-direction: column;
    }

    .chat-settings-modal__management .b_btn,
    .chat-settings-modal__footer .b_btn {
      min-height: 44px;
    }
  }
</style>
