<template>
  <div class="ai-edge-host" :class="{ 'ai-edge-host--open': isOpen }">
    <BDrawer
      :open="isOpen"
      :title="t('ai.title')"
      :width="bookmark.isMobile ? '100%' : 'clamp(480px, 28vw, 720px)'"
      :full-screen="bookmark.isMobile || (bookmark.isDesktop && isMaximized)"
      mobile-full-screen
      @close="minimize"
    >
      <template #header-actions>
        <BButton size="small" @click="clearConversation">{{ t('ai.newConversation') }}</BButton>
        <BTooltip
          v-if="bookmark.isDesktop"
          :title="isMaximized ? t('ai.restoreWindow') : t('ai.maximize')"
          :z-index="200001"
        >
          <BButton
            class="ai-window-toggle"
            role="button"
            tabindex="0"
            :aria-label="isMaximized ? t('ai.restoreWindow') : t('ai.maximize')"
            :aria-pressed="isMaximized"
            @click="toggleMaximized"
            @keydown.enter.prevent="toggleMaximized"
            @keydown.space.prevent="toggleMaximized"
            v-click-log="{ module: 'AI助手', operation: isMaximized ? '还原AI助手' : '最大化AI助手' }"
          >
            <SvgIcon :src="isMaximized ? icon.ai.restoreWindow : icon.ai.maximize" size="17" />
          </BButton>
        </BTooltip>
      </template>
      <div class="ai-drawer-content" :class="{ 'ai-drawer-content--maximized': isMaximized && bookmark.isDesktop }">
        <ChatContainer ref="aiAssistantRef" @source-navigate="handleSourceNavigate" />
      </div>
    </BDrawer>

    <BButton
      v-show="!isOpen"
      class="ai-edge-trigger"
      role="button"
      tabindex="0"
      :aria-label="aiTriggerTitle"
      :title="aiTriggerTitle"
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
  import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { bookmarkStore } from '@/store';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import icon from '@/config/icon';
  import { recordOperation } from '@/api/commonApi.ts';
  import { getGlobalShortcutLabel, matchesGlobalShortcut } from '@/config/keyboardShortcuts.ts';

  const ChatContainer = defineAsyncComponent(() => import('@/view/aiAssistant/ChatContainer.vue'));

  const { t } = useI18n();
  const bookmark = bookmarkStore();
  const isOpen = ref(false);
  const isMaximized = ref(false);
  const aiAssistantRef = ref<{ clearHistory?: () => Promise<boolean>; focusInput?: () => void } | null>(null);
  const aiShortcutLabel = getGlobalShortcutLabel('aiAssistant');
  const aiTriggerTitle = computed(() => t('ai.openShortcutHint', { shortcut: aiShortcutLabel }));

  function focusAssistantInput() {
    nextTick(() => {
      window.requestAnimationFrame(() => aiAssistantRef.value?.focusInput?.());
    });
  }

  function openAssistant() {
    if (!isOpen.value) {
      isOpen.value = true;
      window.dispatchEvent(new CustomEvent('light-note:close-search'));
    }
    focusAssistantInput();
  }

  function minimize() {
    isOpen.value = false;
    isMaximized.value = false;
  }

  function toggleMaximized() {
    if (!bookmark.isDesktop) return;
    isMaximized.value = !isMaximized.value;
  }

  function handleSourceNavigate() {
    if (bookmark.isMobile) {
      minimize();
      return;
    }
    if (bookmark.isDesktop && isMaximized.value) isMaximized.value = false;
  }

  watch(
    () => bookmark.isDesktop,
    (isDesktop) => {
      if (!isDesktop) isMaximized.value = false;
    },
  );

  watch(aiAssistantRef, (instance) => {
    if (instance && isOpen.value) instance.focusInput?.();
  });

  async function clearConversation() {
    const cleaned = (await aiAssistantRef.value?.clearHistory?.()) ?? true;
    if (cleaned) message.success(t('ai.newChart'));
    else message.warning(t('ai.newConversationCleanupFailed'));
  }

  function shouldIgnoreEscape(event: KeyboardEvent) {
    return event.defaultPrevented || event.isComposing || event.keyCode === 229;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (bookmark.isDesktop && matchesGlobalShortcut(event, 'aiAssistant')) {
      event.preventDefault();
      recordOperation({
        module: 'AI助手',
        operation: isOpen.value ? '使用快捷键聚焦AI助手' : '使用快捷键唤起AI助手',
      });
      openAssistant();
      return;
    }
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

  .ai-drawer-content--maximized {
    width: min(960px, 100%);
    margin: 0 auto;
  }

  .ai-window-toggle {
    width: 32px;
    height: 32px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    color: var(--desc-color);
    background: transparent;
  }

  .ai-window-toggle:hover,
  .ai-window-toggle:focus-visible {
    color: var(--text-color);
    background: var(--menu-item-bg-color);
  }

  .ai-window-toggle:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--primary-color) 48%, transparent);
    outline-offset: 1px;
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
