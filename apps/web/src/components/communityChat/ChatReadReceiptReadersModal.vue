<template>
  <BModal
    v-model:visible="visible"
    :title="t('communityChat.readReceipt.readersTitle')"
    width="min(540px, 92vw)"
    :show-footer="false"
    :fullscreen-mobile="true"
  >
    <div class="chat-read-receipt-readers-modal">
      <div class="chat-read-receipt-readers-modal__summary">
        <strong>{{ t('communityChat.readReceipt.readersSummary', { count: total }) }}</strong>
        <span>{{
          t(enabled ? 'communityChat.readReceipt.readersRule' : 'communityChat.readReceipt.readersPaused')
        }}</span>
      </div>

      <div v-if="loading" class="chat-read-receipt-readers-modal__state" role="status">
        <BLoading inline loading :title="t('communityChat.readReceipt.readersLoading')" />
      </div>
      <div v-else-if="error" class="chat-read-receipt-readers-modal__state is-error" role="alert">
        <strong>{{ t('communityChat.readReceipt.readersLoadFailed') }}</strong>
        <span>{{ t('communityChat.readReceipt.readersLoadFailedDescription') }}</span>
        <BButton size="small" @click="emit('retry')">{{ t('common.retry') }}</BButton>
      </div>
      <ul v-else-if="items.length" class="chat-read-receipt-readers-modal__list">
        <li v-for="(reader, index) in items" :key="reader.userPublicId || `${reader.firstSeenAt}-${index}`">
          <span class="chat-read-receipt-readers-modal__avatar-slot">
            <AvatarFramePreview
              :frame-id="reader.frameId"
              :src="reader.avatar || icon.communityChat.defaultAvatar"
              :size="38"
              :animated="false"
              class="chat-read-receipt-readers-modal__avatar"
            />
          </span>
          <span class="chat-read-receipt-readers-modal__copy">
            <strong>{{ reader.displayName || t('communityChat.memberFallback') }}</strong>
            <small>{{ readerMeta(reader) }}</small>
          </span>
        </li>
      </ul>
      <div v-else class="chat-read-receipt-readers-modal__state is-empty">
        <strong>{{ t('communityChat.readReceipt.readersEmpty') }}</strong>
        <span>{{ t('communityChat.readReceipt.readersEmptyDescription') }}</span>
      </div>

      <BButton
        v-if="!loading && !error && hasMore"
        class="chat-read-receipt-readers-modal__more"
        :loading="loadingMore"
        :disabled="loadingMore"
        @click="emit('loadMore')"
      >
        {{ t('communityChat.readReceipt.readersLoadMore') }}
      </BButton>

      <p class="chat-read-receipt-readers-modal__privacy">
        {{ t('communityChat.readReceipt.readersPrivacy') }}
      </p>
      <div class="chat-read-receipt-readers-modal__actions">
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
  import { useI18n } from 'vue-i18n';
  import type { CommunityChatReadReceiptReader } from '@/api/communityChatApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import AvatarFramePreview from '@/components/growth/AvatarFramePreview.vue';
  import icon from '@/config/icon';

  withDefaults(
    defineProps<{
      items?: CommunityChatReadReceiptReader[];
      total?: number;
      enabled?: boolean;
      loading?: boolean;
      refreshing?: boolean;
      loadingMore?: boolean;
      error?: boolean;
      hasMore?: boolean;
    }>(),
    {
      items: () => [],
      total: 0,
      enabled: true,
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
  const { t, locale } = useI18n();

  function formatTime(value: string) {
    const normalized = String(value || '');
    const date = new Date(normalized.includes('T') ? normalized : normalized.replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? normalized : date.toLocaleString(locale.value, { hour12: false });
  }

  function readerMeta(reader: CommunityChatReadReceiptReader) {
    const identity = reader.communityId
      ? `@${reader.communityId}`
      : t('communityChat.readReceipt.readerIdentityUnavailable');
    return `${identity} · ${t('communityChat.readReceipt.firstSeenAt', { time: formatTime(reader.firstSeenAt) })}`;
  }
</script>

<style scoped lang="less">
  .chat-read-receipt-readers-modal {
    --chat-read-receipt-avatar-column: 82px;

    display: grid;
    gap: 12px;
    color: var(--text-color);
  }

  .chat-read-receipt-readers-modal__summary {
    display: grid;
    gap: 4px;
  }

  .chat-read-receipt-readers-modal__summary strong {
    font-size: 13px;
  }

  .chat-read-receipt-readers-modal__summary span,
  .chat-read-receipt-readers-modal__privacy {
    color: var(--desc-color);
    font-size: 11px;
    line-height: 1.6;
  }

  .chat-read-receipt-readers-modal__state {
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

  .chat-read-receipt-readers-modal__state strong {
    font-size: 13px;
  }

  .chat-read-receipt-readers-modal__state span {
    color: var(--desc-color);
    font-size: 11px;
    line-height: 1.5;
  }

  .chat-read-receipt-readers-modal__state.is-error {
    border-color: var(--error-color, #cf3f4f);
  }

  .chat-read-receipt-readers-modal__list {
    max-height: min(430px, 54vh);
    margin: 0;
    padding: 0;
    display: grid;
    gap: 7px;
    overflow-x: hidden;
    overflow-y: auto;
    list-style: none;
  }

  .chat-read-receipt-readers-modal__list li {
    min-width: 0;
    min-height: 62px;
    padding: 8px 10px;
    box-sizing: border-box;
    display: grid;
    grid-template-columns: var(--chat-read-receipt-avatar-column) minmax(0, 1fr);
    align-items: center;
    gap: 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--card-background);
  }

  .chat-read-receipt-readers-modal__avatar-slot {
    min-width: 0;
    display: grid;
    place-items: center;
    overflow: visible;
  }

  .chat-read-receipt-readers-modal__copy {
    min-width: 0;
    display: grid;
    gap: 4px;
  }

  .chat-read-receipt-readers-modal__copy strong,
  .chat-read-receipt-readers-modal__copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chat-read-receipt-readers-modal__copy strong {
    font-size: 13px;
  }

  .chat-read-receipt-readers-modal__copy small {
    color: var(--desc-color);
    font-size: 11px;
  }

  .chat-read-receipt-readers-modal__more {
    justify-self: center;
  }

  .chat-read-receipt-readers-modal__privacy {
    margin: 0;
  }

  .chat-read-receipt-readers-modal__actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  @media (max-width: 767px) {
    .chat-read-receipt-readers-modal {
      --chat-read-receipt-avatar-column: 74px;

      width: 100%;
      height: 100%;
      min-height: 0;
      padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
      box-sizing: border-box;
      align-content: start;
      overflow-x: hidden;
      overflow-y: auto;
    }

    .chat-read-receipt-readers-modal__list {
      max-height: none;
    }

    .chat-read-receipt-readers-modal__list li {
      min-height: 68px;
    }

    .chat-read-receipt-readers-modal__actions {
      padding-bottom: env(safe-area-inset-bottom);
    }
  }

  html.light-note-mobile-rendering & {
    .chat-read-receipt-readers-modal__list li {
      border-color: var(--surface-border-color);
      background: var(--card-background);
    }
  }
</style>
