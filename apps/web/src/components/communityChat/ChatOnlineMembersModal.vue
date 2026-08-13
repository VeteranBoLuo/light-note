<template>
  <BModal
    v-model:visible="visible"
    :title="t('communityChat.onlineMembers.title')"
    width="min(520px, 92vw)"
    :show-footer="false"
  >
    <div class="chat-online-members-modal">
      <p class="chat-online-members-modal__summary">
        {{ t('communityChat.onlineMembers.summary', { count: snapshot?.onlineCount ?? onlineCount }) }}
      </p>

      <div v-if="loading" class="chat-online-members-modal__state">
        <BLoading inline loading :title="t('communityChat.onlineMembers.loading')" />
      </div>
      <div v-else-if="error" class="chat-online-members-modal__state">
        <strong>{{ t('communityChat.onlineMembers.loadFailed') }}</strong>
        <span>{{ t('communityChat.onlineMembers.loadFailedDescription') }}</span>
        <BButton size="small" @click="emit('retry')">{{ t('communityChat.onlineMembers.retry') }}</BButton>
      </div>
      <ul v-else class="chat-online-members-modal__list">
        <li v-for="(member, index) in snapshot?.members || []" :key="`${member.alias}-${member.role}-${index}`">
          <AvatarFramePreview
            :frame-id="member.frameId"
            :src="member.avatar || icon.communityChat.defaultAvatar"
            :size="38"
            :animated="false"
          />
          <span class="chat-online-members-modal__copy">
            <strong>{{ member.alias || t('communityChat.memberFallback') }}</strong>
            <small>{{ roleLabel(member.role) }}</small>
          </span>
          <i aria-hidden="true"></i>
        </li>
        <li v-if="snapshot?.guestCount" class="is-guest-summary">
          <span class="chat-online-members-modal__guest-avatar" aria-hidden="true">
            {{ t('communityChat.onlineMembers.guestInitial') }}
          </span>
          <span class="chat-online-members-modal__copy">
            <strong>{{ t('communityChat.onlineMembers.guests', { count: snapshot.guestCount }) }}</strong>
            <small>{{ t('communityChat.onlineMembers.guestPrivacy') }}</small>
          </span>
          <i aria-hidden="true"></i>
        </li>
      </ul>

      <p v-if="!loading && !error && !snapshot?.members.length && !snapshot?.guestCount" class="chat-online-members-modal__empty">
        {{ t('communityChat.onlineMembers.empty') }}
      </p>
      <p class="chat-online-members-modal__privacy">{{ t('communityChat.onlineMembers.privacy') }}</p>
      <div class="chat-online-members-modal__actions">
        <BButton @click="visible = false">{{ t('common.close') }}</BButton>
      </div>
    </div>
  </BModal>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import AvatarFramePreview from '@/components/growth/AvatarFramePreview.vue';
  import type {
    CommunityChatOnlineMember,
    CommunityChatOnlineMembersSnapshot,
  } from '@/composables/useCommunityChatSocket';
  import icon from '@/config/icon';

  withDefaults(
    defineProps<{
      onlineCount?: number;
      snapshot?: CommunityChatOnlineMembersSnapshot | null;
      loading?: boolean;
      error?: boolean;
    }>(),
    {
      onlineCount: 0,
      snapshot: null,
      loading: false,
      error: false,
    },
  );
  const emit = defineEmits<{ retry: [] }>();
  const visible = defineModel<boolean>('visible', { default: false });
  const { t } = useI18n();

  function roleLabel(role: CommunityChatOnlineMember['role']) {
    return t(`communityChat.onlineMembers.role.${role}`);
  }
</script>

<style scoped lang="less">
  .chat-online-members-modal {
    display: grid;
    gap: 12px;
    color: var(--text-color);
  }

  .chat-online-members-modal__summary,
  .chat-online-members-modal__privacy,
  .chat-online-members-modal__empty {
    margin: 0;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.6;
  }

  .chat-online-members-modal__state,
  .chat-online-members-modal__empty {
    min-height: 116px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .chat-online-members-modal__state {
    flex-direction: column;
    gap: 7px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--workspace-panel-bg-color);
    text-align: center;
  }

  .chat-online-members-modal__state strong {
    font-size: 13px;
  }

  .chat-online-members-modal__state span {
    color: var(--desc-color);
    font-size: 11px;
  }

  .chat-online-members-modal__list {
    max-height: min(430px, 54vh);
    margin: 0;
    padding: 0;
    display: grid;
    gap: 7px;
    overflow-y: auto;
    list-style: none;
  }

  .chat-online-members-modal__list li {
    min-width: 0;
    min-height: 62px;
    padding: 8px 10px;
    box-sizing: border-box;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--card-background);
  }

  .chat-online-members-modal__copy {
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  .chat-online-members-modal__copy strong,
  .chat-online-members-modal__copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chat-online-members-modal__copy strong {
    font-size: 13px;
  }

  .chat-online-members-modal__copy small {
    color: var(--desc-color);
    font-size: 11px;
  }

  .chat-online-members-modal__list li > i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--success-color, #159455);
  }

  .chat-online-members-modal__guest-avatar {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border: 1px solid var(--surface-border-color);
    border-radius: 50%;
    background: var(--workspace-panel-bg-color);
    color: var(--desc-color);
    font-size: 13px;
    font-weight: 700;
  }

  .chat-online-members-modal__privacy {
    padding-top: 2px;
  }

  .chat-online-members-modal__actions {
    display: flex;
    justify-content: flex-end;
  }
</style>
