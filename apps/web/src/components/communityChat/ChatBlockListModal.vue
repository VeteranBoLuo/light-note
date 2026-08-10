<template>
  <BModal
    v-model:visible="visible"
    :title="t('communityChat.blocks.title')"
    width="min(520px, 92vw)"
    :show-footer="false"
  >
    <div class="chat-block-list-modal">
      <p class="chat-block-list-modal__description">{{ t('communityChat.blocks.description') }}</p>

      <div v-if="loading" class="chat-block-list-modal__loading">
        <BLoading inline loading :title="t('common.loading')" />
      </div>
      <ul v-else-if="items.length" class="chat-block-list-modal__list">
        <li v-for="item in items" :key="item.id" class="chat-block-list-modal__item">
          <span class="chat-block-list-modal__avatar" aria-hidden="true">{{ initial(item.displayName) }}</span>
          <span class="chat-block-list-modal__copy">
            <strong>{{ item.displayName || t('communityChat.memberFallback') }}</strong>
            <small>{{ roleLabel(item.role) }} · {{ formatTime(item.createTime) }}</small>
          </span>
          <BButton
            size="small"
            :loading="unblockingId === item.id"
            :disabled="Boolean(unblockingId) && unblockingId !== item.id"
            @click="emit('unblock', item)"
          >
            {{ t('communityChat.blocks.unblock') }}
          </BButton>
        </li>
      </ul>
      <div v-else class="chat-block-list-modal__empty">
        <strong>{{ t('communityChat.blocks.empty') }}</strong>
        <span>{{ t('communityChat.blocks.emptyDescription') }}</span>
      </div>

      <div class="chat-block-list-modal__actions">
        <BButton @click="visible = false">{{ t('common.close') }}</BButton>
      </div>
    </div>
  </BModal>
</template>

<script setup lang="ts">
  import { watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { CommunityChatBlockItem } from '@/api/communityChatApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';

  withDefaults(
    defineProps<{
      items?: CommunityChatBlockItem[];
      loading?: boolean;
      unblockingId?: string;
    }>(),
    {
      items: () => [],
      loading: false,
      unblockingId: '',
    },
  );
  const emit = defineEmits<{
    refresh: [];
    unblock: [item: CommunityChatBlockItem];
  }>();
  const visible = defineModel<boolean>('visible', { default: false });
  const { t, locale } = useI18n();

  function initial(value: string) {
    return Array.from(value || t('communityChat.memberFallback'))[0] || '·';
  }

  function roleLabel(role: CommunityChatBlockItem['role']) {
    return t(`communityChat.authorRole.${role}`);
  }

  function formatTime(value: string) {
    const date = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString(locale.value, { hour12: false });
  }

  watch(visible, (nextVisible) => {
    if (nextVisible) emit('refresh');
  });
</script>

<style scoped lang="less">
  .chat-block-list-modal {
    display: grid;
    gap: 12px;
    color: var(--text-color);
  }

  .chat-block-list-modal__description {
    margin: 0;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.6;
  }

  .chat-block-list-modal__loading,
  .chat-block-list-modal__empty {
    min-height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .chat-block-list-modal__empty {
    flex-direction: column;
    gap: 5px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    color: var(--desc-color);
    background: var(--workspace-panel-bg-color);
    text-align: center;
  }

  .chat-block-list-modal__empty strong {
    color: var(--text-color);
    font-size: 13px;
  }

  .chat-block-list-modal__empty span {
    font-size: 11px;
  }

  .chat-block-list-modal__list {
    max-height: min(420px, 52vh);
    margin: 0;
    padding: 0;
    display: grid;
    gap: 7px;
    overflow-y: auto;
    list-style: none;
  }

  .chat-block-list-modal__item {
    min-width: 0;
    min-height: 58px;
    padding: 8px 9px;
    box-sizing: border-box;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 9px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--card-background);
  }

  .chat-block-list-modal__avatar {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border: 1px solid var(--primary-color);
    border-radius: 11px;
    color: var(--primary-color);
    font-size: 12px;
    font-weight: 700;
  }

  .chat-block-list-modal__copy {
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  .chat-block-list-modal__copy strong,
  .chat-block-list-modal__copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chat-block-list-modal__copy strong {
    font-size: 13px;
  }

  .chat-block-list-modal__copy small {
    color: var(--desc-color);
    font-size: 10px;
  }

  .chat-block-list-modal__actions {
    display: flex;
    justify-content: flex-end;
  }

  @media (max-width: 767px) {
    .chat-block-list-modal__item {
      min-height: 66px;
    }

    .chat-block-list-modal__item :deep(.b_btn),
    .chat-block-list-modal__actions :deep(.b_btn) {
      min-height: 42px;
    }
  }
</style>
