<template>
  <div class="ai-edge-host" :class="{ 'ai-edge-host--open': isOpen }">
    <BDrawer
      :open="isOpen"
      :title="t('ai.title')"
      :width="drawerWidth"
      :full-screen="bookmark.isMobile || (bookmark.isDesktop && isMaximized)"
      mobile-full-screen
      :modal="bookmark.isMobile || isMaximized"
      :resizable="bookmark.isDesktop && !isMaximized"
      :close-on-click-outside="bookmark.isDesktop && !isMaximized"
      :min-width="440"
      :max-width="720"
      :destroy-on-close="false"
      body-padding="0"
      @close="minimize"
      @resize="handleDrawerResize"
    >
      <template #header-actions>
        <BTooltip :title="t('ai.conversations.title')">
          <BButton
            class="ai-window-toggle"
            :class="{ 'ai-window-toggle--active': activePanel === 'conversations' }"
            :aria-label="t('ai.conversations.title')"
            :aria-pressed="activePanel === 'conversations'"
            @click="togglePanel('conversations')"
          >
            <SvgIcon :src="icon.ai.conversations" size="17" aria-hidden="true" />
          </BButton>
        </BTooltip>
        <BButton size="small" :loading="newConversationSubmitting" @click="clearConversation">
          {{ t('ai.newConversation') }}
        </BButton>
        <BTooltip
          v-if="bookmark.isDesktop && activeMode === 'ask'"
          :title="isMaximized ? t('ai.restoreWindow') : t('ai.maximize')"
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
        <!-- 全屏时左侧常驻会话列表(像 Claude/Codex):快速切换 + 新建;齿轮打开完整会话中心做搜索/重命名/删除。
             非全屏窄抽屉放不下,仍走顶部"会话中心"模态。 -->
        <AiConversationSidebar
          v-if="isMaximized && bookmark.isDesktop"
          class="ai-drawer-sidebar"
          :current-id="conversationId"
          :refresh-token="conversationListToken"
          @open="openCloudConversation"
          @new="startNewConversation"
          @manage="activePanel = 'conversations'"
        />
        <AiWorkspaceShell
          ref="aiAssistantRef"
          class="ai-drawer-main"
          @source-navigate="handleSourceNavigate"
          @mode-change="handleModeChange"
        />
        <transition name="ai-center">
          <section
            v-if="activePanel"
            class="ai-center-panel"
            role="dialog"
            :aria-label="panelTitle"
            @keydown.esc="onPanelEscape"
          >
            <header class="ai-center-panel__header">
              <span class="ai-center-panel__title">{{ panelTitle }}</span>
              <BButton class="ai-center-panel__close" :aria-label="t('common.close')" @click="closePanel">
                <SvgIcon :src="icon.common.close" size="18" aria-hidden="true" />
              </BButton>
            </header>
            <div class="ai-center-panel__body">
              <AiConversationCenter
                v-if="activePanel === 'conversations'"
                :current-id="conversationId"
                @open="openCloudConversation"
                @new="startNewConversation"
                @deleted="handleConversationDeleted"
                @restored="openCloudConversation"
                @cleared="handleConversationsCleared"
              />
            </div>
          </section>
        </transition>
      </div>
    </BDrawer>

    <BTooltip v-if="!isOpen" :title="aiTriggerAccessibleLabel">
      <BButton
        class="ai-edge-trigger"
        :class="`ai-edge-trigger--${edgeStatus}`"
        role="button"
        tabindex="0"
        :aria-label="aiTriggerAccessibleLabel"
        :aria-busy="edgeStatus === 'generating'"
        :data-status="edgeStatus"
        @click="openAssistant('edge')"
        @keydown.enter.prevent="openAssistant('edge')"
        @keydown.space.prevent="openAssistant('edge')"
        v-click-log="{ module: 'AI助手', operation: '打开ai弹框' }"
      >
        <span class="ai-edge-surface" aria-hidden="true">
          <span class="ai-edge-track"></span>
          <span class="ai-edge-label">AI</span>
        </span>
        <span
          v-if="edgeStatus !== 'idle'"
          class="ai-edge-status"
          :class="`ai-edge-status--${edgeStatus}`"
          aria-hidden="true"
        />
        <span v-if="aiEdgeStatusText" class="ai-edge-status-text" role="status" aria-live="polite" aria-atomic="true">
          {{ aiEdgeStatusText }}
        </span>
      </BButton>
    </BTooltip>
  </div>
</template>

<script setup lang="ts">
  import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { bookmarkStore, useAiAssistantStore, useUserStore } from '@/store';
  import { storeToRefs } from 'pinia';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import icon from '@/config/icon';
  import { recordOperation } from '@/api/commonApi.ts';
  import { recordAiProductEvent } from '@/api/aiTelemetry.ts';
  import { getGlobalShortcutLabel, matchesGlobalShortcut } from '@/config/keyboardShortcuts.ts';
  import { updatePreference } from '@/utils/savePreference';
  import { shouldIgnoreBackgroundEscape } from '@/utils/topLayerEscape';
  import {
    AI_ASSISTANT_OPEN_EVENT,
    normalizeAiAssistantLaunchPayload,
    type AiAssistantLaunchPayload,
  } from '@/utils/aiEntry';

  const AiWorkspaceShell = defineAsyncComponent(() => import('@/components/aiAssistant/AiWorkspaceShell.vue'));
  const AiConversationCenter = defineAsyncComponent(() => import('@/components/aiAssistant/AiConversationCenter.vue'));
  const AiConversationSidebar = defineAsyncComponent(
    () => import('@/components/aiAssistant/AiConversationSidebar.vue'),
  );

  const { t } = useI18n();
  const bookmark = bookmarkStore();
  const user = useUserStore();
  const aiAssistant = useAiAssistantStore();
  const { isLoading, conversationId, temporarySession, edgeStatus } = storeToRefs(aiAssistant);
  // 全屏左侧会话列表的刷新信号:每轮问答结束时 bump(首句自动改名后列表要更新标题);
  // 新建/切换/删除/清空会话时也会 bump(见对应 handler)。
  const conversationListToken = ref(0);
  watch(isLoading, (loading, wasLoading) => {
    if (wasLoading && !loading) conversationListToken.value += 1;
  });
  const isOpen = ref(false);
  const isMaximized = ref(false);
  const newConversationSubmitting = ref(false);
  // 记住“对话”态用户选择的全屏偏好:整理固定全屏,切回对话时恢复此偏好,
  // 避免“全屏 → 切整理 → 切回对话”被强制掉回抽屉。
  const askMaximized = ref(false);
  const activeMode = ref<'ask' | 'organize'>('ask');
  type AiCenterPanel = 'conversations';
  const activePanel = ref<AiCenterPanel | null>(null);
  const panelTitle = computed(() => {
    switch (activePanel.value) {
      case 'conversations':
        return t('ai.conversations.title');
      default:
        return '';
    }
  });
  function closePanel() {
    activePanel.value = null;
  }
  // 面板始终吃掉 Esc,避免连累抽屉/document 的 Esc 处理;但内部控件(如 BSelect 下拉)
  // 已处理过(defaultPrevented)时只收下拉、保留面板,不误关整个面板。
  function onPanelEscape(event: KeyboardEvent) {
    event.stopPropagation();
    if (event.defaultPrevented) return;
    event.preventDefault();
    closePanel();
  }
  function togglePanel(name: AiCenterPanel) {
    activePanel.value = activePanel.value === name ? null : name;
  }
  const aiAssistantRef = ref<{
    clearHistory?: () => Promise<boolean>;
    focusInput?: () => void;
    applyLaunchContext?: (payload: AiAssistantLaunchPayload) => void;
    openConversation?: (conversationId: string) => Promise<void>;
    openWorkItem?: (kind: 'change-set', id: string) => void;
  } | null>(null);
  const aiShortcutLabel = getGlobalShortcutLabel('aiAssistant');
  const aiTriggerTitle = computed(() => t('ai.openShortcutHint', { shortcut: aiShortcutLabel }));
  const aiEdgeStatusText = computed(() => (edgeStatus.value === 'idle' ? '' : t(`ai.edgeStatus.${edgeStatus.value}`)));
  const aiTriggerAccessibleLabel = computed(() =>
    aiEdgeStatusText.value
      ? t('ai.edgeStatus.triggerLabel', { title: aiTriggerTitle.value, status: aiEdgeStatusText.value })
      : aiTriggerTitle.value,
  );

  function focusAssistantInput() {
    nextTick(() => {
      window.requestAnimationFrame(() => aiAssistantRef.value?.focusInput?.());
    });
  }

  function telemetryDevice(): 'desktop' | 'tablet' | 'mobile' | 'unknown' {
    if (bookmark.isMobile) return 'mobile';
    if (bookmark.isDesktop) return 'desktop';
    return 'tablet';
  }

  function openAssistant(
    surface:
      | 'edge'
      | 'shortcut'
      | 'note_detail'
      | 'note_library'
      | 'search'
      | 'bookmark_manage'
      | 'cloud_space'
      | 'tag_detail'
      | 'workspace' = 'edge',
  ) {
    const wasClosed = !isOpen.value;
    if (wasClosed) {
      const defaultAskMaximized = bookmark.isDesktop && user.preferences.aiDefaultFullscreen === true;
      askMaximized.value = defaultAskMaximized;
      isMaximized.value = activeMode.value === 'organize' ? bookmark.isDesktop : defaultAskMaximized;
      isOpen.value = true;
      window.dispatchEvent(new CustomEvent('light-note:close-search'));
    }
    if (wasClosed) {
      void recordAiProductEvent('ai_entry_opened', {
        surface,
        device: telemetryDevice(),
        mode: activeMode.value,
      });
    }
    // 抽屉已经进入前台后再确认终态；生成态不会被确认掉，仍持续提示后台任务。
    nextTick(() => aiAssistant.acknowledgeEdgeStatus());
    focusAssistantInput();
  }

  function minimize() {
    if (isLoading.value) {
      void recordAiProductEvent('ai_closed_while_generating', {
        surface: 'edge',
        device: telemetryDevice(),
        mode: activeMode.value,
        conversationId: conversationId.value || undefined,
      });
    }
    isOpen.value = false;
    isMaximized.value = false;
  }

  // —— AI 抽屉宽度记忆(纯本地:抽屉宽度是设备相关偏好,不跨设备同步;开关在 设置→AI 设置,默认关)——
  const REMEMBER_FLAG_KEY = 'light-note:ai-remember-drawer-width';
  const REMEMBER_WIDTH_KEY = 'light-note:ai-drawer-width';
  function rememberWidthEnabled() {
    try {
      return localStorage.getItem(REMEMBER_FLAG_KEY) === 'true';
    } catch {
      return false;
    }
  }
  const drawerWidth = ref('560px');
  function refreshDrawerWidth() {
    if (bookmark.isMobile) {
      drawerWidth.value = '100%';
      return;
    }
    if (rememberWidthEnabled()) {
      try {
        const saved = Number(localStorage.getItem(REMEMBER_WIDTH_KEY));
        if (Number.isFinite(saved) && saved > 0) {
          drawerWidth.value = `${saved}px`;
          return;
        }
      } catch {}
    }
    drawerWidth.value = '560px';
  }
  function handleDrawerResize(width: number) {
    if (!rememberWidthEnabled()) return;
    try {
      localStorage.setItem(REMEMBER_WIDTH_KEY, String(Math.round(width)));
    } catch {}
  }
  refreshDrawerWidth();
  watch(isOpen, (open) => {
    if (open) refreshDrawerWidth();
  });

  function toggleMaximized() {
    if (!bookmark.isDesktop || activeMode.value !== 'ask') return;
    const nextMaximized = !isMaximized.value;
    isMaximized.value = nextMaximized;
    askMaximized.value = nextMaximized;
    // 用户主动全屏/还原时，同步更新“默认全屏打开”，下次重新打开 AI 延续这次选择。
    if (user.preferences.aiDefaultFullscreen !== nextMaximized) {
      void updatePreference({ aiDefaultFullscreen: nextMaximized }).catch(() => message.warning(t('settings.saveFailed')));
    }
  }

  function handleModeChange(mode: 'ask' | 'organize') {
    activeMode.value = mode;
    // 整理是工作台形态,固定全屏;对话恢复用户上次的全屏偏好(全屏切回对话仍保持全屏)。
    if (bookmark.isDesktop) isMaximized.value = mode === 'ask' ? askMaximized.value : true;
  }

  function handleSourceNavigate() {
    if (bookmark.isMobile) {
      minimize();
      return;
    }
    if (bookmark.isDesktop && isMaximized.value) {
      isMaximized.value = false;
      if (activeMode.value === 'ask') askMaximized.value = false;
    }
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

  watch(
    edgeStatus,
    (status) => {
      if (isOpen.value && status !== 'idle' && status !== 'generating') {
        nextTick(() => aiAssistant.acknowledgeEdgeStatus());
      }
    },
    { flush: 'post' },
  );

  async function clearConversation() {
    if (newConversationSubmitting.value) return false;
    const wasMaximized = isMaximized.value;
    newConversationSubmitting.value = true;
    closePanel();
    try {
      // clearHistory 会把工作区切回问答态；新建对话不应顺带改变用户当前的抽屉/全屏尺寸。
      const cleanupTask = aiAssistantRef.value?.clearHistory?.();
      if (bookmark.isDesktop) {
        isMaximized.value = wasMaximized;
        askMaximized.value = wasMaximized;
      }
      const cleaned = (await cleanupTask) ?? true;
      if (cleaned) message.success(t('ai.newChart'));
      else message.warning(t('ai.newConversationCleanupFailed'));
      return cleaned;
    } finally {
      newConversationSubmitting.value = false;
    }
  }

  async function startNewConversation() {
    closePanel();
    await clearConversation();
    openAssistant();
    conversationListToken.value += 1;
  }

  async function openCloudConversation(cloudConversationId: string) {
    closePanel();
    openAssistant();
    await nextTick();
    await aiAssistantRef.value?.openConversation?.(cloudConversationId);
    conversationListToken.value += 1;
  }

  function handleConversationDeleted(deletedConversationId: string) {
    if (deletedConversationId === conversationId.value) void startNewConversation();
  }

  function handleConversationsCleared() {
    void startNewConversation();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (bookmark.isDesktop && matchesGlobalShortcut(event, 'aiAssistant')) {
      event.preventDefault();
      if (isOpen.value) {
        recordOperation({ module: 'AI助手', operation: '使用快捷键关闭AI助手' });
        minimize();
        return;
      }
      recordOperation({
        module: 'AI助手',
        operation: '使用快捷键唤起AI助手',
      });
      openAssistant('shortcut');
      return;
    }
    if (event.key === 'Escape' && isOpen.value && !shouldIgnoreBackgroundEscape(event)) {
      if (activePanel.value) {
        closePanel();
        return;
      }
      minimize();
    }
  }

  function handleCloseAi() {
    if (isOpen.value) minimize();
  }

  function handleOpenAi(event?: Event) {
    const payload = normalizeAiAssistantLaunchPayload((event as CustomEvent<unknown> | undefined)?.detail);
    openAssistant(payload.surface || 'workspace');
    if (payload.contextRefs?.length || payload.attachmentRefs?.length || payload.suggestedIntent || payload.query) {
      nextTick(() => aiAssistantRef.value?.applyLaunchContext?.(payload));
    }
  }

  onMounted(() => {
    void recordAiProductEvent('ai_entry_impression', {
      surface: 'edge',
      device: telemetryDevice(),
      mode: activeMode.value,
    });
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
    window.addEventListener(AI_ASSISTANT_OPEN_EVENT, handleOpenAi);
  });

  onUnmounted(() => {
    document.removeEventListener('keydown', handleKeydown);
    window.removeEventListener('light-note:close-ai', handleCloseAi);
    window.removeEventListener(AI_ASSISTANT_OPEN_EVENT, handleOpenAi);
  });
</script>

<style scoped lang="less">
  .ai-drawer-content {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  /* 会话/记忆/维护/待处理中心:抽屉内滑入面板,不再用居中弹框与抽屉抢层级 */
  .ai-center-panel {
    position: absolute;
    inset: 0;
    z-index: 5;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--background-color);
  }

  .ai-center-panel__header {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px 12px;
    border-bottom: 1px solid var(--border-color, rgba(0, 0, 0, 0.06));
  }

  .ai-center-panel__title {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-color);
  }

  .ai-center-panel__close {
    width: 32px;
    height: 32px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    color: var(--desc-color);
    background: transparent;
  }

  .ai-center-panel__close:hover,
  .ai-center-panel__close:focus-visible {
    color: var(--text-color);
    background: var(--menu-item-bg-color);
  }

  @media (pointer: coarse) {
    .ai-center-panel__close {
      width: 44px;
      min-width: 44px;
      height: 44px;
    }
  }

  .ai-center-panel__body {
    flex: 1;
    min-height: 0;
    padding: 16px 20px 20px;
    overflow: auto;
    overflow-wrap: break-word;
  }

  .ai-center-enter-active,
  .ai-center-leave-active {
    transition:
      transform 0.22s ease,
      opacity 0.22s ease;
  }

  .ai-center-enter-from,
  .ai-center-leave-to {
    transform: translateX(16px);
    opacity: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .ai-center-enter-active,
    .ai-center-leave-active {
      transition: opacity 0.12s ease;
    }

    .ai-center-enter-from,
    .ai-center-leave-to {
      transform: none;
    }
  }

  .ai-window-toggle--active {
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 14%, transparent);
  }

  .ai-drawer-content :deep(.ai-chat-container) {
    flex: 1;
    min-height: 0;
  }

  .ai-drawer-content--maximized {
    /* 全屏:左会话栏 + 右对话,横向排布 */
    flex-direction: row;
    width: min(100%, clamp(1040px, 66vw, 1560px));
    margin: 0 auto;
  }

  /* 对话主区在两种模式下都填满剩余空间(列向填高、横向填宽) */
  .ai-drawer-main {
    flex: 1;
    min-width: 0;
    min-height: 0;
  }

  .ai-drawer-content--maximized :deep(.chat-wrapper) {
    max-width: none;
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

  @media (pointer: coarse) {
    .ai-window-toggle {
      width: 44px;
      min-width: 44px;
      height: 44px;
    }
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
    z-index: 900;
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

  .ai-edge-status {
    position: absolute;
    top: 5px;
    left: 5px;
    width: 8px;
    height: 8px;
    border: 2px solid var(--card-background);
    border-radius: 50%;
    background: var(--primary-color);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary-color) 15%, transparent);
    animation: ai-edge-status-pulse 1.5s ease-in-out infinite;
  }

  .ai-edge-status--completed {
    background: var(--success-color, #2e8b57);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--success-color, #2e8b57) 17%, transparent);
    animation: none;
  }

  .ai-edge-status--needs_attention {
    background: var(--warning-color, #c47f17);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--warning-color, #c47f17) 18%, transparent);
    animation: none;
  }

  .ai-edge-status--failed {
    background: var(--danger-color, #d14343);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--danger-color, #d14343) 17%, transparent);
    animation: none;
  }

  .ai-edge-status-text {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }

  @keyframes ai-edge-status-pulse {
    50% {
      opacity: 0.55;
      transform: scale(0.86);
    }
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

  .ai-edge-trigger--completed .ai-edge-track {
    background: var(--success-color, #2e8b57);
  }

  .ai-edge-trigger--needs_attention .ai-edge-track {
    background: var(--warning-color, #c47f17);
  }

  .ai-edge-trigger--failed .ai-edge-track {
    background: var(--danger-color, #d14343);
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

    .ai-edge-status {
      animation: none;
    }
  }
</style>
