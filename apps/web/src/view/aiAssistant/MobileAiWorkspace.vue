<template>
  <main class="mobile-ai-workspace">
    <header class="mobile-ai-workspace__header">
      <div>
        <h1>{{ t('ai.title') }}</h1>
        <p>{{ t('mobileNavigation.aiWorkspaceSubtitle') }}</p>
      </div>
    </header>
    <AiWorkspaceShell ref="workspaceRef" class="mobile-ai-workspace__body" />
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

  const { t } = useI18n();
  const aiAssistant = useAiAssistantStore();
  const { conversationId } = storeToRefs(aiAssistant);
  const workspaceRef = ref<{
    clearHistory?: () => Promise<boolean>;
    openConversation?: (conversationId: string) => Promise<void>;
  } | null>(null);
  const historyVisible = ref(false);
  const historyBackActive = ref(false);
  let creatingConversation = false;

  function closeHistory() {
    historyVisible.value = false;
  }

  function handleHistoryPopState() {
    if (!historyBackActive.value || !historyVisible.value) return;
    historyBackActive.value = false;
    historyVisible.value = false;
  }

  watch(historyVisible, (visible) => {
    if (visible) {
      if (!historyBackActive.value) {
        history.pushState({ mobileAiHistory: true }, '');
        historyBackActive.value = true;
      }
      return;
    }
    if (historyBackActive.value) {
      historyBackActive.value = false;
      history.back();
    }
  });

  async function createConversation() {
    if (creatingConversation) return;
    creatingConversation = true;
    closeHistory();
    try {
      const cleared = (await workspaceRef.value?.clearHistory?.()) ?? true;
      if (cleared) message.success(t('ai.newChart'));
      else message.warning(t('ai.newConversationCleanupFailed'));
    } finally {
      creatingConversation = false;
    }
  }

  async function openConversation(cloudConversationId: string) {
    closeHistory();
    await nextTick();
    await workspaceRef.value?.openConversation?.(cloudConversationId);
  }

  function handleConversationDeleted(deletedConversationId: string) {
    if (deletedConversationId === conversationId.value) void createConversation();
  }

  useMobileTopBar(['mobileAiWorkspace'], {
    showSearch: false,
    showMoreMenu: false,
    onAuxiliaryAction: () => {
      historyVisible.value = true;
    },
    auxiliaryActionLabel: () => t('ai.conversations.title'),
    auxiliaryActionIcon: () => icon.ai.conversations,
    onAdd: createConversation,
    addLabel: () => t('ai.newConversation'),
  });

  onMounted(() => {
    window.addEventListener('popstate', handleHistoryPopState);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('popstate', handleHistoryPopState);
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

  .mobile-ai-workspace__header {
    padding: 12px 16px 8px;
    flex: 0 0 auto;
    border-bottom: 1px solid var(--surface-divider-color);
  }

  .mobile-ai-workspace__header h1 {
    margin: 0;
    color: var(--text-color);
    font-size: 19px;
    line-height: 26px;
  }

  .mobile-ai-workspace__header p {
    margin: 2px 0 0;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 18px;
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
