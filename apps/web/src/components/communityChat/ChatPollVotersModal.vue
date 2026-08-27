<template>
  <BModal
    v-model:visible="visible"
    :title="t('communityChat.poll.voters.title')"
    width="min(540px, 92vw)"
    :show-footer="false"
    :fullscreen-mobile="true"
  >
    <div class="chat-poll-voters-modal">
      <div class="chat-poll-voters-modal__selector">
        <label id="community-chat-poll-voter-option-label">
          {{ t('communityChat.poll.voters.optionLabel') }}
        </label>
        <BSelect
          class="chat-poll-voters-modal__select"
          v-model:value="selectedOptionPublicId"
          :options="optionChoices"
          :disabled="loading || refreshing || loadingMore"
          aria-labelledby="community-chat-poll-voter-option-label"
        />
      </div>

      <div class="chat-poll-voters-modal__summary">
        <strong>{{ t('communityChat.poll.voters.summary', { count: total }) }}</strong>
        <span>{{ t('communityChat.poll.voters.description') }}</span>
      </div>

      <div v-if="loading" class="chat-poll-voters-modal__state" role="status">
        <BLoading inline loading :title="t('communityChat.poll.voters.loading')" />
      </div>
      <div v-else-if="error" class="chat-poll-voters-modal__state is-error" role="alert">
        <strong>{{ t('communityChat.poll.voters.loadFailed') }}</strong>
        <span>{{ t('communityChat.poll.voters.loadFailedDescription') }}</span>
        <BButton size="small" @click="emit('retry')">{{ t('common.retry') }}</BButton>
      </div>
      <ul v-else-if="items.length" class="chat-poll-voters-modal__list">
        <li v-for="(voter, index) in items" :key="voter.userPublicId || `${voter.communityId}-${index}`">
          <span class="chat-poll-voters-modal__avatar-slot">
            <AvatarFramePreview
              :frame-id="voter.frameId"
              :src="voter.avatar || icon.communityChat.defaultAvatar"
              :size="38"
              :animated="false"
              class="chat-poll-voters-modal__avatar"
            />
          </span>
          <span class="chat-poll-voters-modal__copy">
            <strong>{{ voter.displayName || t('communityChat.memberFallback') }}</strong>
            <small>{{
              voter.communityId ? `@${voter.communityId}` : t('communityChat.poll.voters.identityUnavailable')
            }}</small>
          </span>
        </li>
      </ul>
      <div v-else class="chat-poll-voters-modal__state is-empty">
        <strong>{{ t('communityChat.poll.voters.empty') }}</strong>
        <span>{{ t('communityChat.poll.voters.emptyDescription') }}</span>
      </div>

      <BButton
        v-if="!loading && !error && hasMore"
        class="chat-poll-voters-modal__more"
        :loading="loadingMore"
        :disabled="loadingMore"
        @click="emit('loadMore')"
      >
        {{ t('communityChat.poll.voters.loadMore') }}
      </BButton>

      <p class="chat-poll-voters-modal__privacy">{{ t('communityChat.poll.voters.privacy') }}</p>
      <div class="chat-poll-voters-modal__actions">
        <BButton
          :loading="loading || refreshing"
          :disabled="loading || refreshing || loadingMore"
          @click="emit('refresh')"
        >
          {{ t('common.refresh') }}
        </BButton>
        <BButton type="primary" @click="visible = false">{{ t('common.close') }}</BButton>
      </div>
    </div>
  </BModal>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { CommunityChatPoll, CommunityChatPollVoter } from '@/api/communityChatApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import AvatarFramePreview from '@/components/growth/AvatarFramePreview.vue';
  import icon from '@/config/icon';

  const props = withDefaults(
    defineProps<{
      poll?: CommunityChatPoll | null;
      items?: CommunityChatPollVoter[];
      total?: number;
      loading?: boolean;
      refreshing?: boolean;
      loadingMore?: boolean;
      error?: boolean;
      hasMore?: boolean;
    }>(),
    {
      poll: null,
      items: () => [],
      total: 0,
      loading: false,
      refreshing: false,
      loadingMore: false,
      error: false,
      hasMore: false,
    },
  );
  const emit = defineEmits<{
    retry: [];
    refresh: [];
    loadMore: [];
  }>();
  const visible = defineModel<boolean>('visible', { default: false });
  const selectedOptionPublicId = defineModel<string>('selectedOptionPublicId', { default: '' });
  const { t } = useI18n();

  const optionChoices = computed(() =>
    (props.poll?.options || []).map((option) => ({
      value: option.publicId,
      label: t('communityChat.poll.voters.optionChoice', {
        label: option.label,
        count: Math.max(0, Number(option.voteCount || 0)),
      }),
    })),
  );
</script>

<style scoped lang="less">
  .chat-poll-voters-modal {
    --chat-poll-voter-avatar-column: 82px;

    display: grid;
    gap: 12px;
    color: var(--text-color);
  }

  .chat-poll-voters-modal__selector,
  .chat-poll-voters-modal__summary {
    display: grid;
    gap: 5px;
  }

  .chat-poll-voters-modal__selector {
    min-width: 0;
  }

  .chat-poll-voters-modal__select {
    width: 100%;
    min-width: 0;
    max-width: 100%;
  }

  .chat-poll-voters-modal__selector label,
  .chat-poll-voters-modal__summary strong {
    font-size: 13px;
    font-weight: 700;
  }

  .chat-poll-voters-modal__summary span,
  .chat-poll-voters-modal__privacy {
    color: var(--desc-color);
    font-size: 11px;
    line-height: 1.6;
  }

  .chat-poll-voters-modal__state {
    min-height: 132px;
    padding: 18px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--workspace-panel-bg-color);
    text-align: center;
  }

  .chat-poll-voters-modal__state strong {
    font-size: 13px;
  }

  .chat-poll-voters-modal__state span {
    color: var(--desc-color);
    font-size: 11px;
    line-height: 1.5;
  }

  .chat-poll-voters-modal__state.is-error {
    border-color: var(--error-color, #cf3f4f);
  }

  .chat-poll-voters-modal__list {
    max-height: min(430px, 54vh);
    margin: 0;
    padding: 0;
    display: grid;
    gap: 7px;
    overflow-x: hidden;
    overflow-y: auto;
    list-style: none;
  }

  .chat-poll-voters-modal__list li {
    min-width: 0;
    min-height: 62px;
    padding: 8px 10px;
    box-sizing: border-box;
    display: grid;
    grid-template-columns: var(--chat-poll-voter-avatar-column) minmax(0, 1fr);
    align-items: center;
    gap: 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--card-background);
  }

  .chat-poll-voters-modal__avatar-slot {
    min-width: 0;
    display: grid;
    place-items: center;
    overflow: visible;
  }

  .chat-poll-voters-modal__copy {
    min-width: 0;
    display: grid;
    gap: 4px;
  }

  .chat-poll-voters-modal__copy strong,
  .chat-poll-voters-modal__copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chat-poll-voters-modal__copy strong {
    font-size: 13px;
  }

  .chat-poll-voters-modal__copy small {
    color: var(--desc-color);
    font-size: 11px;
  }

  .chat-poll-voters-modal__more {
    justify-self: center;
  }

  .chat-poll-voters-modal__privacy {
    margin: 0;
  }

  .chat-poll-voters-modal__actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  @media (max-width: 767px) {
    .chat-poll-voters-modal {
      --chat-poll-voter-avatar-column: 74px;

      width: 100%;
      height: 100%;
      min-height: 0;
      padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
      box-sizing: border-box;
      align-content: start;
      overflow-x: hidden;
      overflow-y: auto;
    }

    .chat-poll-voters-modal__list {
      max-height: none;
    }

    .chat-poll-voters-modal__list li {
      min-height: 68px;
    }

    .chat-poll-voters-modal__actions {
      padding-bottom: env(safe-area-inset-bottom);
    }
  }

  html.light-note-mobile-rendering & {
    .chat-poll-voters-modal__list li {
      border-color: var(--surface-border-color);
      background: var(--card-background);
    }
  }
</style>
