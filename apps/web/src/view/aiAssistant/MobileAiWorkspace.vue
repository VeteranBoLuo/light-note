<template>
  <main class="mobile-ai-workspace">
    <AiWorkspaceShell ref="workspaceRef" class="mobile-ai-workspace__body" :suppress-scroll-prompt="historyVisible" />
    <transition name="mobile-ai-history">
      <section
        v-if="historyVisible"
        class="mobile-ai-workspace__history"
        role="dialog"
        :aria-label="t('ai.conversations.title')"
      >
        <header class="mobile-ai-workspace__history-header">
          <strong>{{ t('ai.conversations.title') }}</strong>
          <BButton :aria-label="t('common.close')" @click="closeHistory">
            <SvgIcon :src="icon.common.close" size="18" aria-hidden="true" />
          </BButton>
        </header>
        <div class="mobile-ai-workspace__history-body">
          <AiConversationCenter
            :current-id="conversationId"
            @open="openConversation"
            @new="createConversation"
            @deleted="handleConversationDeleted"
            @restored="openConversation"
            @cleared="createConversation"
          />
        </div>
      </section>
    </transition>
  </main>
</template>

<script setup lang="ts">
  import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { storeToRefs } from 'pinia';
  import AiWorkspaceShell from '@/components/aiAssistant/AiWorkspaceShell.vue';
  import AiConversationCenter from '@/components/aiAssistant/AiConversationCenter.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { useMobileTopBar } from '@/composables/useMobileTopBar';
  import icon from '@/config/icon';
  import { useAiAssistantStore } from '@/store';
  import {
    closeCurrentMobileOverlayThen,
    registerMobileOverlayHistory,
    releaseMobileOverlayHistory,
    requestMobileOverlayHistoryClose,
    type MobileOverlayHistoryHandle,
  } from '@/utils/mobileOverlayHistory';

  const { t } = useI18n();
  const aiAssistant = useAiAssistantStore();
  const { conversationId, edgeStatus } = storeToRefs(aiAssistant);
  const workspaceRef = ref<{
    clearHistory?: () => Promise<boolean>;
    openConversation?: (conversationId: string) => Promise<void>;
  } | null>(null);
  const historyVisible = ref(false);
  let historyHandle: MobileOverlayHistoryHandle | null = null;
  let creatingConversation = false;

  function closeHistory() {
    if (historyHandle && requestMobileOverlayHistoryClose(historyHandle)) return;
    historyHandle = null;
    historyVisible.value = false;
  }

  function closeHistoryFromMobileBack() {
    historyHandle = null;
    historyVisible.value = false;
  }

  watch(historyVisible, (visible) => {
    if (visible) {
      if (!historyHandle) historyHandle = registerMobileOverlayHistory(closeHistoryFromMobileBack);
      return;
    }
    if (historyHandle) {
      releaseMobileOverlayHistory(historyHandle);
      historyHandle = null;
    }
  });

  async function createConversation() {
    if (creatingConversation) return;
    creatingConversation = true;
    try {
      await closeCurrentMobileOverlayThen(
        () => {
          historyVisible.value = false;
        },
        async () => {
          const cleared = (await workspaceRef.value?.clearHistory?.()) ?? true;
          if (cleared) message.success(t('ai.newChart'));
          else message.warning(t('ai.newConversationCleanupFailed'));
        },
      );
    } finally {
      creatingConversation = false;
    }
  }

  async function openConversation(cloudConversationId: string) {
    await closeCurrentMobileOverlayThen(
      () => {
        historyVisible.value = false;
      },
      () => workspaceRef.value?.openConversation?.(cloudConversationId),
    );
  }

  function handleConversationDeleted(deletedConversationId: string) {
    if (deletedConversationId === conversationId.value) void createConversation();
  }

  useMobileTopBar(['mobileAiWorkspace'], {
    searchMode: 'icon',
    showNotification: false,
    onAuxiliaryAction: () => {
      historyVisible.value = true;
    },
    auxiliaryActionLabel: () => t('ai.conversations.title'),
    auxiliaryActionIcon: () => icon.ai.conversations,
    onAdd: createConversation,
    addLabel: () => t('ai.newConversation'),
  });

  onMounted(() => {
    aiAssistant.acknowledgeEdgeStatus();
  });

  watch(
    edgeStatus,
    (status) => {
      if (status !== 'idle' && status !== 'generating') {
        nextTick(() => aiAssistant.acknowledgeEdgeStatus());
      }
    },
    { flush: 'post' },
  );

  onBeforeUnmount(() => {
    if (historyHandle) releaseMobileOverlayHistory(historyHandle);
    historyHandle = null;
  });
</script>

<style scoped lang="less">
  .mobile-ai-workspace {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--background-color);
  }

  .mobile-ai-workspace__body {
    min-height: 0;
    flex: 1 1 auto;
  }

  .mobile-ai-workspace__history {
    position: absolute;
    inset: 0;
    z-index: 3;
    display: flex;
    min-height: 0;
    flex-direction: column;
    background: var(--background-color);
  }

  .mobile-ai-workspace__history-header {
    height: 48px;
    padding: 0 12px 0 16px;
    display: flex;
    flex: 0 0 48px;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--surface-divider-color);
  }

  .mobile-ai-workspace__history-header strong {
    color: var(--text-color);
    font-size: 15px;
  }

  .mobile-ai-workspace__history-header :deep(.b_btn) {
    width: 36px;
    min-width: 36px;
    height: 36px;
    padding: 0;
    background: transparent;
  }

  .mobile-ai-workspace__history-body {
    min-height: 0;
    flex: 1 1 auto;
    padding: 12px;
    overflow: auto;
  }

  .mobile-ai-history-enter-active,
  .mobile-ai-history-leave-active {
    transition:
      transform 0.18s ease,
      opacity 0.18s ease;
  }

  .mobile-ai-history-enter-from,
  .mobile-ai-history-leave-to {
    transform: translateX(16px);
    opacity: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .mobile-ai-history-enter-active,
    .mobile-ai-history-leave-active {
      transition: none;
    }
  }
</style>
