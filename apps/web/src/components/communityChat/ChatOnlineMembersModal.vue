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

      <div
        v-if="loading"
        class="chat-online-members-modal__list chat-online-members-modal__skeleton"
        :style="{ minHeight: loadingListMinHeight }"
        role="status"
        :aria-label="t('communityChat.onlineMembers.loading')"
      >
        <div
          v-for="index in loadingRowCount"
          :key="`online-member-skeleton-${index}`"
          class="chat-online-members-modal__skeleton-row"
          aria-hidden="true"
        >
          <span class="chat-online-members-modal__skeleton-avatar"></span>
          <span class="chat-online-members-modal__skeleton-copy">
            <i></i>
            <i></i>
          </span>
          <span class="chat-online-members-modal__skeleton-status"></span>
        </div>
      </div>
      <div v-else-if="error" class="chat-online-members-modal__state" :style="{ minHeight: loadingListMinHeight }">
        <strong>{{ t('communityChat.onlineMembers.loadFailed') }}</strong>
        <span>{{ t('communityChat.onlineMembers.loadFailedDescription') }}</span>
        <BButton size="small" @click="emit('retry')">{{ t('communityChat.onlineMembers.retry') }}</BButton>
      </div>
      <ul v-else class="chat-online-members-modal__list" :style="{ minHeight: loadingListMinHeight }">
        <li v-for="(member, index) in snapshot?.members || []" :key="`${member.alias}-${member.role}-${index}`">
          <span class="chat-online-members-modal__avatar-slot">
            <AvatarFramePreview
              :frame-id="member.frameId"
              :src="member.avatar || icon.communityChat.defaultAvatar"
              :size="38"
              :animated="false"
              class="chat-online-members-modal__avatar"
            />
          </span>
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

      <p
        v-if="!loading && !error && !snapshot?.members.length && !snapshot?.guestCount"
        class="chat-online-members-modal__empty"
      >
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
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import AvatarFramePreview from '@/components/growth/AvatarFramePreview.vue';
  import type {
    CommunityChatOnlineMember,
    CommunityChatOnlineMembersSnapshot,
  } from '@/composables/useCommunityChatSocket';
  import icon from '@/config/icon';

  const props = withDefaults(
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
  const loadingRowCount = computed(() => {
    const onlineCount = Number.isFinite(props.onlineCount) ? Math.round(props.onlineCount) : 0;
    return Math.min(Math.max(onlineCount, 1), 7);
  });
  const loadingListMinHeight = computed(() => {
    const rowsHeight = loadingRowCount.value * 62 + (loadingRowCount.value - 1) * 7;
    return `min(${Math.min(rowsHeight, 430)}px, 54vh)`;
  });

  function roleLabel(role: CommunityChatOnlineMember['role']) {
    return t(`communityChat.onlineMembers.role.${role}`);
  }
</script>

<style scoped lang="less">
  .chat-online-members-modal {
    --chat-online-members-avatar-column: 88px;

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

  .chat-online-members-modal__list li,
  .chat-online-members-modal__skeleton-row {
    min-width: 0;
    min-height: 62px;
    padding: 8px 10px;
    box-sizing: border-box;
    display: grid;
    grid-template-columns: var(--chat-online-members-avatar-column) minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--card-background);
  }

  .chat-online-members-modal__skeleton {
    overflow: hidden;
  }

  .chat-online-members-modal__skeleton-row {
    height: 62px;
  }

  .chat-online-members-modal__skeleton-avatar,
  .chat-online-members-modal__skeleton-copy i,
  .chat-online-members-modal__skeleton-status {
    display: block;
    background: var(--hover-background);
    animation: chat-online-members-skeleton-pulse 1.1s ease-in-out infinite alternate;
  }

  .chat-online-members-modal__skeleton-avatar {
    width: 38px;
    height: 38px;
    justify-self: center;
    border-radius: 50%;
  }

  .chat-online-members-modal__skeleton-copy {
    display: grid;
    gap: 7px;
  }

  .chat-online-members-modal__skeleton-copy i {
    width: min(132px, 55%);
    height: 10px;
    border-radius: 5px;
  }

  .chat-online-members-modal__skeleton-copy i:last-child {
    width: min(82px, 36%);
    height: 8px;
  }

  .chat-online-members-modal__skeleton-status {
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }

  @keyframes chat-online-members-skeleton-pulse {
    from {
      opacity: 0.45;
    }
    to {
      opacity: 0.9;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .chat-online-members-modal__skeleton-avatar,
    .chat-online-members-modal__skeleton-copy i,
    .chat-online-members-modal__skeleton-status {
      animation: none;
      opacity: 0.65;
    }
  }

  :global(.disable-animations .chat-online-members-modal__skeleton-avatar),
  :global(.disable-animations .chat-online-members-modal__skeleton-copy i),
  :global(.disable-animations .chat-online-members-modal__skeleton-status) {
    animation: none;
    opacity: 0.65;
  }

  .chat-online-members-modal__copy {
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  /*
   * 横向槽位按 38px 头像下目录最大 artSize 缩放后再留 6px 安全量，
   * 所有成员共用同一列宽；子组件保留自然高度，避免外饰覆盖昵称或相邻成员。
   */
  .chat-online-members-modal__avatar-slot {
    min-width: 0;
    display: grid;
    grid-template: minmax(0, 1fr) / minmax(0, 1fr);
    place-items: center;
    overflow: visible;
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
    justify-self: center;
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
