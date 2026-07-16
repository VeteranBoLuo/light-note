<template>
  <div class="ai-edge-host" :class="{ 'ai-edge-host--open': isOpen }">
    <BDrawer
      :open="isOpen"
      :title="t('ai.title')"
      :width="bookmark.isMobile ? '100%' : '480px'"
      :full-screen="bookmark.isMobile"
      mobile-full-screen
      @close="minimize"
    >
      <template #header-actions>
        <BButton size="small" @click="clearConversation">{{ t('ai.newConversation') }}</BButton>
      </template>
      <div class="ai-drawer-content">
        <ChatContainer ref="aiAssistantRef" />
      </div>
    </BDrawer>

    <BButton
      v-show="!isOpen"
      class="ai-edge-trigger"
      role="button"
      tabindex="0"
      :aria-label="t('ai.title')"
      :title="t('ai.title')"
      @click="openAssistant"
      @keydown.enter.prevent="openAssistant"
      @keydown.space.prevent="openAssistant"
      v-click-log="{ module: 'AI助手', operation: '打开ai弹框' }"
    >
      <span class="ai-edge-surface" aria-hidden="true">
        <span class="ai-edge-track"></span>
        <span class="ai-edge-label">AI</span>
      </span>
    </BButton>
  </div>
</template>

<script setup lang="ts">
  import { defineAsyncComponent, onMounted, onUnmounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { bookmarkStore } from '@/store';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';

  const ChatContainer = defineAsyncComponent(() => import('@/view/aiAssistant/ChatContainer.vue'));

  const { t } = useI18n();
  const bookmark = bookmarkStore();
  const isOpen = ref(false);
  const aiAssistantRef = ref<{ clearHistory?: () => void } | null>(null);

  function openAssistant() {
    if (isOpen.value) return;
    isOpen.value = true;
    window.dispatchEvent(new CustomEvent('light-note:close-search'));
  }

  function minimize() {
    isOpen.value = false;
  }

  function clearConversation() {
    aiAssistantRef.value?.clearHistory?.();
    message.success(t('ai.newChart'));
  }

  function shouldIgnoreEscape(event: KeyboardEvent) {
    return event.defaultPrevented || event.isComposing || event.keyCode === 229;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && isOpen.value && !shouldIgnoreEscape(event)) {
      minimize();
    }
  }

  function handleCloseAi() {
    if (isOpen.value) minimize();
  }

  function handleOpenAi() {
    openAssistant();
  }

  onMounted(() => {
    // 空闲时预热对话模块，避免首次打开抽屉等待；预渲染环境继续跳过。
    const warmChat = () => import('@/view/aiAssistant/ChatContainer.vue').catch(() => {});
    if (!(window as any).__PRERENDER__ && !navigator.webdriver) {
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(warmChat);
      } else {
        window.setTimeout(warmChat, 2000);
      }
    }
    document.addEventListener('keydown', handleKeydown);
    window.addEventListener('light-note:close-ai', handleCloseAi);
    window.addEventListener('light-note:open-ai', handleOpenAi);
  });

  onUnmounted(() => {
    document.removeEventListener('keydown', handleKeydown);
    window.removeEventListener('light-note:close-ai', handleCloseAi);
    window.removeEventListener('light-note:open-ai', handleOpenAi);
  });
</script>

<style scoped lang="less">
  .ai-drawer-content {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .ai-drawer-content :deep(.ai-chat-container) {
    flex: 1;
    min-height: 0;
  }

  .ai-edge-host {
    position: fixed;
    right: 0;
    bottom: 44px;
    z-index: 100;
    width: 44px;
    height: 80px;
  }

  .ai-edge-host--open {
    z-index: 200000;
  }

  .ai-edge-trigger {
    position: relative;
    width: 44px;
    min-width: 44px;
    height: 80px;
    padding: 0;
    overflow: visible;
    border: 0 !important;
    border-radius: 0;
    background: transparent !important;
    box-shadow: none !important;
    line-height: normal;
  }

  .ai-edge-surface {
    position: absolute;
    top: 0;
    right: -32px;
    width: 44px;
    height: 80px;
    overflow: hidden;
    border-radius: 18px 0 0 18px;
    background: color-mix(in srgb, var(--primary-color) 14%, var(--card-background));
    box-shadow: -5px 0 18px color-mix(in srgb, var(--primary-color) 14%, transparent);
    pointer-events: none;
    transition:
      right 0.2s ease,
      background 0.2s ease,
      box-shadow 0.2s ease;
  }

  .ai-edge-track {
    position: absolute;
    top: 50%;
    left: 4px;
    width: 4px;
    height: 48px;
    border-radius: 999px;
    background: linear-gradient(180deg, var(--primary-color), color-mix(in srgb, var(--primary-color) 55%, #9a8cff));
    box-shadow: 0 0 10px color-mix(in srgb, var(--primary-color) 38%, transparent);
    transform: translateY(-50%);
  }

  .ai-edge-label {
    position: absolute;
    top: 50%;
    left: 14px;
    color: var(--primary-color);
    font-size: 10px;
    font-weight: 750;
    letter-spacing: 0.08em;
    opacity: 0;
    transform: translateY(-50%);
    transition: opacity 0.16s ease;
    writing-mode: vertical-rl;
  }

  .ai-edge-trigger:hover .ai-edge-surface,
  .ai-edge-trigger:focus-visible .ai-edge-surface {
    right: -18px;
    background: color-mix(in srgb, var(--primary-color) 20%, var(--card-background));
    box-shadow: -7px 0 22px color-mix(in srgb, var(--primary-color) 20%, transparent);
  }

  .ai-edge-trigger:hover .ai-edge-label,
  .ai-edge-trigger:focus-visible .ai-edge-label {
    opacity: 0.9;
  }

  .ai-edge-trigger:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--primary-color) 56%, transparent);
    outline-offset: -2px;
  }

  @media (max-width: 600px) {
    .ai-edge-host {
      bottom: calc(72px + env(safe-area-inset-bottom));
      height: 68px;
    }

    .ai-edge-trigger,
    .ai-edge-surface {
      height: 68px;
    }

    .ai-edge-surface {
      right: -26px;
      border-radius: 16px 0 0 16px;
    }

    .ai-edge-track {
      height: 40px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ai-edge-surface,
    .ai-edge-label {
      transition: none;
    }
  }
</style>
