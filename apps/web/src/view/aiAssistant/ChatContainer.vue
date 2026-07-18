<template>
  <div class="ai-chat-container">
    <!-- 主聊天容器 -->
    <div class="chat-wrapper">
      <!-- 消息区域 -->
      <main
        class="messages-container"
        ref="messagesContainer"
        @scroll="handleScroll"
        @wheel.passive="handleWheel"
        @touchstart.passive="handleTouchStart"
        @touchmove.passive="handleTouchMove"
        @touchend.passive="handleTouchEnd"
        @touchcancel.passive="handleTouchEnd"
      >
        <template v-for="(message, index) in messages" :key="index">
          <ChatMessageItem
            :message="message"
            :has-answer-started="hasAnswerStarted"
            :is-streaming="isLoading && index === messages.length - 1 && message.role === 'assistant'"
            @edit="handleEditMessage"
            @regenerate="() => handleRegenerate(index)"
            @source-navigate="handleMessageSourceNavigate"
          />
          <AiSourceCards
            v-if="shouldShowAiMessageSources(message, index, messages.length, isLoading)"
            :sources="message.sources || []"
            @source-navigate="handleSourceNavigate"
          />
          <div v-if="message.interactions?.length || message.confirmations?.length" class="ai-message-action-stack">
            <AiInteractionCard
              v-for="interaction in message.interactions || []"
              :key="interaction.id"
              :interaction="interaction"
              @resolved="(resolution) => handleInteractionResolved(index, interaction, resolution)"
              @settled="(settlement) => handleInteractionSettled(index, settlement)"
            />
            <AiToolConfirmationCard
              v-for="confirmation in message.confirmations || []"
              :key="confirmation.id"
              :confirmation="confirmation"
              @resolved="(resolution) => handleConfirmationResolved(index, resolution)"
              @edit="handleConfirmationEdit"
              @settled="(settlement) => handleConfirmationSettled(index, settlement)"
            />
          </div>
        </template>
        <!-- 智能滚动提示  -->
        <ScrollPrompt
          v-if="showScrollToBottom"
          :is-loading="isLoading"
          @scroll-to-bottom-click="handleScrollToBottomClick"
        />

        <!-- 常见问题提示 -->
        <MainQuestionPrompt
          v-if="showRecommendation"
          :used-questions="usedQuestions"
          :round="conversationRound"
          :items="displayRecommendationItems"
          @recommendation-click="handleRecommendationClick"
        />
      </main>

      <!-- 输入区域 -->
      <ChatInputSection
        ref="chatInputRef"
        v-model="userInput"
        :is-loading="isLoading"
        :quota="aiQuota"
        :show-translation="user.role === 'root'"
        :enable-translation="enableTranslation"
        :translation-config="translationConfig"
        :is-mobile="bookmark.isMobile"
        :send-fn="sendMessage"
        :stop-fn="stopResponse"
        :contexts="contexts"
        :attachments="attachments"
        :prepare-attachment-action-fn="prepareAttachmentAction"
        @update:enable-translation="enableTranslation = $event"
        @update:translation-config="translationConfig = $event"
        @update:contexts="contexts = $event"
        @update:attachments="attachments = $event"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, onBeforeUnmount, onMounted, nextTick, watch } from 'vue';
  import { bookmarkStore, useUserStore } from '@/store';
  import ChatMessageItem from '@/components/aiAssistant/ChatMessageItem.vue';
  import ChatInputSection from '@/components/aiAssistant/ChatInputSection.vue';
  import ScrollPrompt from '@/components/aiAssistant/ScrollPrompt.vue';
  import MainQuestionPrompt from '@/components/aiAssistant/MainQuestionPrompt.vue';
  import AiInteractionCard from '@/components/aiAssistant/AiInteractionCard.vue';
  import AiToolConfirmationCard from '@/components/aiAssistant/AiToolConfirmationCard.vue';
  import AiSourceCards, { type AiSource } from '@/components/aiAssistant/AiSourceCards.vue';
  import type { AiToolStatusItem } from '@/components/aiAssistant/AiToolStatusList.vue';
  import type { AiResourceContext } from '@/components/aiAssistant/AiContextPicker.vue';
  import {
    clearAiTemporaryAttachments,
    fetchAiAttachmentStatuses,
    prepareAiAttachmentAction,
    AI_AGENT_CLIENT_CAPABILITIES,
    type AiAttachment,
  } from '@/api/aiAttachmentApi';
  import type { AiAttachmentActionRequest } from '@/components/aiAssistant/attachmentActions';
  import {
    hasPendingAgentActions,
    markConversationConfirmationPending,
    markConversationInteractionPending,
    promoteConversationInteractionToConfirmation,
    settleConversationConfirmation,
    settleConversationInteraction,
    shouldPersistConversationMessage,
    shouldShowAiMessageSources,
  } from '@/components/aiAssistant/aiConversationState';
  import { createQuickQuestionDispatcher } from '@/components/aiAssistant/quickQuestionDispatch';
  import {
    getAiChatBottomDistance,
    isAiChatUpwardScroll,
    isAiChatUpwardTouch,
    isAiChatUpwardWheel,
    resolveAiChatStableViewport,
    shouldPauseAiChatFollow,
    shouldResumeAiChatFollow,
  } from '@/components/aiAssistant/aiAutoScroll';
  import {
    appendAiStreamMessageContent,
    createAiStreamTypewriter,
    type AiStreamTypewriter,
  } from '@/components/aiAssistant/aiStreamTypewriter';
  import { isEditableAttachmentTool, type AiAttachmentDirectActionName } from '@/config/aiTools';
  import type {
    AiAgentInteraction,
    AiAgentInteractionResolution,
    AiAgentInteractionSettlement,
    AiToolConfirmation,
    AiToolConfirmationResolution,
    AiToolConfirmationSettlement,
  } from '@/types/aiAgent';
  import { useI18n } from 'vue-i18n';
  import axios from 'axios';
  import { apiBasePost } from '@/http/request';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { consumeAiSseChunk, flushAiSseBuffer, type AiSseEvent } from '@/utils/aiSse';
  import { fetchAiFollowUps } from '@/api/aiFollowUpApi';
  import { resolveHelpSources, type ResolvedHelpSource } from '@/api/helpApi';

  const { t, locale } = useI18n();

  const emit = defineEmits<{
    (event: 'source-navigate', source?: AiSource): void;
  }>();

  defineExpose({
    clearHistory,
    focusInput,
  });
  const bookmark = bookmarkStore();

  const user = useUserStore();

  function handleSourceNavigate(source: AiSource) {
    emit('source-navigate', source);
  }

  function handleMessageSourceNavigate() {
    emit('source-navigate');
  }

  interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    thoughts?: any[];
    thinkingText?: string; // 当前消息完整的思考过程文本
    thinkingDisplay?: string; // 当前消息用于展示的思考文本（打字机效果）
    confirmations?: AiToolConfirmation[];
    interactions?: AiAgentInteraction[];
    sources?: AiSource[];
    toolEvents?: AiToolStatusItem[];
    contexts?: AiResourceContext[];
    transient?: boolean;
    transientGroupId?: string;
    pendingConfirmationIds?: string[];
    pendingInteractionIds?: string[];
    confirmationSucceeded?: boolean;
    persistAfterConfirmationSettlement?: boolean;
    recommendations?: string[];
    recommendationReady?: boolean;
  }

  // 响应式数据
  const userInput = ref('');
  const messages = ref<ChatMessage[]>([]);
  const isLoading = ref(false);
  const messagesContainer = ref<HTMLElement | null>(null);
  const chatInputRef = ref<{
    focus: () => void;
    openAttachmentAction: (toolName: AiAttachmentDirectActionName, args?: Record<string, unknown>) => boolean;
  } | null>(null);
  const enableTranslation = ref(false);
  const translationConfig = ref({ source: 'auto', target: 'zh' });
  const contexts = ref<AiResourceContext[]>([]);
  const attachments = ref<AiAttachment[]>([]);

  function focusInput() {
    chatInputRef.value?.focus();
  }

  // AI 今日额度(按成长等级下发;root/本机自测豁免返回 exempt)。进页与每轮回复结束后刷新,展示「已用 / 剩余」
  const aiQuota = ref<{ exempt?: boolean; role?: string; used?: number; quota?: number; remaining?: number } | null>(
    null,
  );
  async function fetchAiQuota() {
    try {
      const res = await apiBasePost('/api/chat/aiQuota');
      if (res?.status === 200) aiQuota.value = res.data;
    } catch {
      /* 额度展示失败不影响主流程 */
    }
  }

  // 默认跟随流式正文；只有用户明确向上浏览时暂停，回到底部后自动恢复。
  const shouldFollowMessages = ref(true);
  const showScrollToBottom = ref(false);
  const usedQuestions = computed(() =>
    messages.value
      .filter((message) => message.role === 'user' && !message.transient)
      .map((message) => message.content.trim()),
  );
  const conversationRound = computed(() => usedQuestions.value.length);
  const latestAssistantMessage = computed(() => {
    const latest = messages.value[messages.value.length - 1];
    return latest?.role === 'assistant' ? latest : null;
  });
  const displayRecommendationItems = computed<string[] | null>(() => {
    if (conversationRound.value === 0) return null;
    const latest = latestAssistantMessage.value;
    if (!latest?.recommendationReady) return [];
    return latest.recommendations?.length ? latest.recommendations : null;
  });
  const showRecommendation = computed(() => {
    if (isLoading.value || !messages.value.length) return false;
    const latest = latestAssistantMessage.value;
    return Boolean(
      latest && !hasPendingAgentActions(latest) && (conversationRound.value === 0 || latest.recommendationReady),
    );
  });

  let scrollFrame: number | null = null;
  let lastTouchY: number | null = null;
  let lastKnownScrollTop = 0;

  // 流式输出控制
  const abortController = ref<AbortController | null>(null);
  let activeAnswerTypewriter: AiStreamTypewriter | null = null;
  let currentMessageIndex = -1;
  let activeRequestId = 0; // 请求计数器，隔离停止、切换账号与新请求之间的异步回调

  // 当前这一轮对话是否已经开始输出答案正文
  const hasAnswerStarted = ref(false);

  // 打字机速度（毫秒/字符）
  const TYPING_SPEED = 10;

  // 思考打字机状态（仅作用于当前回答消息）
  let thinkingTyping = false;

  // 推荐提示

  // 启动当前消息的思考打字机（按字符逐步将 thinkingText 显示到 thinkingDisplay）
  const startThinkingTypewriter = () => {
    if (thinkingTyping) return;

    thinkingTyping = true;

    const run = async () => {
      while (true) {
        const msg = currentMessageIndex >= 0 ? messages.value[currentMessageIndex] : null;
        if (!msg) break;

        const full = msg.thinkingText || '';
        const shown = msg.thinkingDisplay || '';

        // 一旦答案正文开始输出，立即结束思考打字效果，直接展示最终思考内容
        if (hasAnswerStarted.value) {
          msg.thinkingDisplay = full;
          break;
        }

        // 已全部展示或已停止加载时，直接同步并结束
        if (!isLoading.value || shown.length >= full.length) {
          msg.thinkingDisplay = full;
          break;
        }

        msg.thinkingDisplay = shown + full.charAt(shown.length);

        // 思考打字时与正文使用同一套逐帧跟随，避免叠加 smooth 动画。
        if (shouldFollowMessages.value) {
          await nextTick();
          scheduleScrollToBottom();
        }

        await new Promise((resolve) => setTimeout(resolve, TYPING_SPEED));
      }

      thinkingTyping = false;
    };

    run();
  };

  // 初始化
  // 对话历史本地持久化:刷新 / 重进不丢当前会话(多会话切换是后续更大的功能,暂不含)
  const chatHistoryKey = () => `ai-chat-history:${user.id || 'visitor'}`;
  function persistHistory() {
    try {
      const toSave = messages.value
        .filter(shouldPersistConversationMessage) // 跳过生成中的空占位和未结算确认动作
        .map((m) => ({
          role: m.role,
          content: m.content,
          sources: m.sources || [],
          contexts: m.contexts || [],
          recommendations: m.recommendations || [],
          recommendationReady: Boolean(m.recommendationReady),
          timestamp: (m.timestamp instanceof Date ? m.timestamp : new Date(m.timestamp)).toISOString(),
        }));
      // 只有产生过真实对话(不止开场白一条)才存
      if (toSave.length > 1) {
        localStorage.setItem(chatHistoryKey(), JSON.stringify({ messages: toSave, sessionId }));
      }
    } catch {
      /* 隐私模式 / 超额写入失败不影响主流程 */
    }
  }
  function restoreHistory() {
    try {
      const raw = localStorage.getItem(chatHistoryKey());
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!Array.isArray(data.messages) || data.messages.length <= 1) return false;
      messages.value = data.messages.map((m: any) => ({
        ...m,
        timestamp: new Date(m.timestamp),
        thoughts: [],
        recommendations: Array.isArray(m.recommendations)
          ? m.recommendations
              .map((item: unknown) => String(item || '').trim())
              .filter(Boolean)
              .slice(0, 3)
          : [],
      }));
      const latest = messages.value[messages.value.length - 1];
      if (latest?.role === 'assistant' && typeof latest.recommendationReady !== 'boolean') {
        latest.recommendationReady = true;
      }
      if (data.sessionId) sessionId = data.sessionId; // 尽力续用服务端记忆(Redis 30min 后失效则当新会话)
      return true;
    } catch {
      return false;
    }
  }

  async function repairLegacyKnowledgeSources() {
    const legacySources = messages.value
      .flatMap((chatMessage) => chatMessage.sources || [])
      .filter((source) => source.type === 'knowledge' && (!source.id || !source.target));
    const titles = [...new Set(legacySources.map((source) => source.title.trim()).filter(Boolean))].slice(0, 20);
    if (!titles.length) return;
    try {
      const response = await resolveHelpSources(titles);
      if (response?.status !== 200 || !Array.isArray(response.data)) return;
      const byTitle = new Map(
        (response.data as ResolvedHelpSource[]).map((source) => [String(source.title || '').trim(), source]),
      );
      let repaired = false;
      messages.value.forEach((chatMessage) => {
        chatMessage.sources?.forEach((source) => {
          if (source.type !== 'knowledge' || (source.id && source.target)) return;
          const resolved = byTitle.get(source.title.trim());
          if (!resolved) return;
          source.id = resolved.id;
          source.category = resolved.category;
          source.status = resolved.status;
          source.target = resolved.target;
          repaired = true;
        });
      });
      if (repaired) persistHistory();
    } catch {
      // 旧会话修复失败不影响聊天；下次进入页面仍会再次尝试。
    }
  }

  onMounted(() => {
    // 优先恢复本地历史;没有历史再显示开场白
    if (!restoreHistory()) {
      messages.value = [
        {
          role: 'assistant',
          content: t('ai.greeting'),
          timestamp: new Date(),
          thoughts: [],
        },
      ];
    } else {
      void repairLegacyKnowledgeSources();
    }
    nextTick(() => {
      scheduleScrollToBottom(true);
    });
    fetchAiQuota();
  });
  // 每轮回复结束(isLoading 落定)后刷新额度,数字实时反映本次消耗
  watch(isLoading, (v) => {
    if (!v) {
      fetchAiQuota();
      persistHistory(); // 一轮回复落定后落地历史
    }
  });

  // 清空对话
  async function clearHistory() {
    stopResponse();
    sessionId = '';
    longChatHinted.value = false;
    attachments.value = [];
    try {
      localStorage.removeItem(chatHistoryKey()); // 清空对话同时清掉当前账号的本地历史
    } catch {
      /* ignore */
    }
    if (isLoading.value) return;
    messages.value = [
      {
        role: 'assistant',
        content: t('ai.greeting'),
        timestamp: new Date(),
        thoughts: [],
      },
    ];
    resetScrollState();
    if (!user.id || user.role === 'visitor') return true;
    try {
      const result = await clearAiTemporaryAttachments();
      return result.failed === 0;
    } catch {
      return false;
    }
  }

  const cancelScheduledScroll = () => {
    if (scrollFrame === null) return;
    window.cancelAnimationFrame(scrollFrame);
    scrollFrame = null;
  };

  // 回答后的来源、推荐项属于附属内容：插入前冻结当前阅读位置，插入后只提示用户主动查看。
  const freezeViewportForPostAnswerContent = () => {
    const container = messagesContainer.value;
    const preservedScrollTop = container?.scrollTop ?? null;
    shouldFollowMessages.value = false;
    showScrollToBottom.value = false;
    cancelScheduledScroll();

    return () => {
      const currentContainer = messagesContainer.value;
      if (!currentContainer || preservedScrollTop === null) return;
      const viewport = resolveAiChatStableViewport(currentContainer, preservedScrollTop);
      currentContainer.scrollTop = viewport.scrollTop;
      lastKnownScrollTop = viewport.scrollTop;
      shouldFollowMessages.value = viewport.shouldFollow;
      showScrollToBottom.value = viewport.showScrollToBottom;
    };
  };

  const pauseFollowing = () => {
    shouldFollowMessages.value = false;
    showScrollToBottom.value = true;
    cancelScheduledScroll();
  };

  // 一帧最多滚动一次，连续 token 不再叠加多个 smooth 动画。
  const scheduleScrollToBottom = (force = false) => {
    if (!messagesContainer.value || (!force && !shouldFollowMessages.value) || scrollFrame !== null) return;
    scrollFrame = window.requestAnimationFrame(() => {
      scrollFrame = null;
      const container = messagesContainer.value;
      if (!container || (!force && !shouldFollowMessages.value)) return;
      container.scrollTop = container.scrollHeight;
      lastKnownScrollTop = container.scrollTop;
      showScrollToBottom.value = false;
    });
  };

  const handleScroll = () => {
    const container = messagesContainer.value;
    if (!container) return;
    const distance = getAiChatBottomDistance(container);
    const movedUp = isAiChatUpwardScroll(lastKnownScrollTop, container.scrollTop);
    lastKnownScrollTop = container.scrollTop;
    if (movedUp) {
      pauseFollowing();
      return;
    }
    if (shouldResumeAiChatFollow(distance)) shouldFollowMessages.value = true;
    else if (shouldPauseAiChatFollow(distance)) shouldFollowMessages.value = false;
    showScrollToBottom.value = !shouldFollowMessages.value;
  };

  const handleWheel = (event: WheelEvent) => {
    if (isAiChatUpwardWheel(event.deltaY)) pauseFollowing();
  };

  const handleTouchStart = (event: TouchEvent) => {
    lastTouchY = event.touches[0]?.clientY ?? null;
  };

  const handleTouchMove = (event: TouchEvent) => {
    const currentY = event.touches[0]?.clientY;
    if (typeof currentY !== 'number') return;
    if (isAiChatUpwardTouch(lastTouchY, currentY)) pauseFollowing();
    lastTouchY = currentY;
  };

  const handleTouchEnd = () => {
    lastTouchY = null;
  };

  // 处理点击跳转到底部
  const handleScrollToBottomClick = () => {
    shouldFollowMessages.value = true;
    showScrollToBottom.value = false;
    scheduleScrollToBottom(true);
  };

  // 重置滚动状态
  const resetScrollState = () => {
    shouldFollowMessages.value = true;
    showScrollToBottom.value = false;
    nextTick(() => scheduleScrollToBottom(true));
  };

  // 暂停响应
  const stopResponse = () => {
    if (!isLoading.value) return; // 已完成的消息不加暂停标记
    activeAnswerTypewriter?.cancel();
    activeAnswerTypewriter = null;
    if (abortController.value) {
      abortController.value.abort();
      abortController.value = null;
    }
    // 只给正在生成的 AI 回复加终止标记（currentMessageIndex 指向的），不影响之前的消息
    if (currentMessageIndex < 0) {
      isLoading.value = false;
      return;
    }
    const currentMsg = messages.value[currentMessageIndex];
    const restoreViewport = currentMsg?.sources?.length ? freezeViewportForPostAnswerContent() : null;
    if (currentMsg?.role === 'assistant') {
      const suffix = t('ai.responsePaused');
      if (!currentMsg.content || currentMsg.content === '') {
        currentMsg.content = suffix;
      } else if (!currentMsg.content.endsWith(suffix)) {
        currentMsg.content += suffix;
      }
    }
    isLoading.value = false;
    if (restoreViewport) nextTick(restoreViewport);
  };

  let sessionId = '';

  async function prepareAttachmentAction(request: AiAttachmentActionRequest) {
    if (isLoading.value) throw new Error(t('ai.attachmentAction.waitForReply'));
    const prepared = await prepareAiAttachmentAction({
      sessionId,
      toolName: request.toolName,
      args: request.args,
    });
    sessionId = prepared.sessionId;

    const confirmation = 'confirmation' in prepared ? prepared.confirmation : null;
    const interaction = 'interaction' in prepared ? prepared.interaction : null;
    const target =
      confirmation?.preview?.target ||
      String(request.args.fileName || request.args.title || t('ai.attachmentAction.currentAttachment'));
    const actionId = confirmation?.id || interaction?.id;
    if (!actionId) throw new Error(t('ai.attachmentAction.prepareFailed'));
    const transientGroupId = `attachment-action:${actionId}`;
    messages.value.push({
      role: 'user',
      content: t('ai.attachmentAction.requestSummary', {
        action: t(`ai.tools.${request.toolName}`, request.toolName),
        target,
      }),
      timestamp: new Date(),
      transient: true,
      transientGroupId,
    });
    messages.value.push({
      role: 'assistant',
      content: confirmation ? t('ai.attachmentAction.confirmationReady') : t('ai.attachmentAction.choiceRequired'),
      timestamp: new Date(),
      thoughts: [],
      confirmations: confirmation ? [confirmation] : [],
      interactions: interaction ? [interaction] : [],
      transient: true,
      transientGroupId,
      pendingConfirmationIds: confirmation ? [confirmation.id] : [],
      pendingInteractionIds: interaction ? [interaction.id] : [],
    });
    persistHistory();
    resetScrollState();
  }

  watch(
    () => user.id,
    (nextId, previousId) => {
      if (nextId === previousId) return;
      stopResponse();
      activeRequestId += 1;
      sessionId = '';
      currentMessageIndex = -1;
      contexts.value = [];
      attachments.value = [];
      messages.value = [];
      if (!restoreHistory()) {
        messages.value = [
          {
            role: 'assistant',
            content: t('ai.greeting'),
            timestamp: new Date(),
            thoughts: [],
          },
        ];
      } else {
        void repairLegacyKnowledgeSources();
      }
      resetScrollState();
    },
  );
  const longChatHinted = ref(false); // 超长对话「新建会话」提示只弹一次(每段会话)
  // 重新设计打字机效果，确保内容完整且逐字显示
  const sendMessage = async () => {
    // 每次开始新的提问时，重置自动滚动状态，确保本轮对话自动跟随到底部
    shouldFollowMessages.value = true;
    showScrollToBottom.value = false;
    // 重置当前轮消息的思考状态，仅影响新创建的AI消息
    hasAnswerStarted.value = false;
    thinkingTyping = false;
    const inputText = userInput.value.trim();
    if (!inputText) return;
    const contextSnapshot = contexts.value.map((item) => ({ ...item }));
    const attachmentSnapshot = attachments.value.map((item) => ({ ...item }));
    if (attachmentSnapshot.some((item) => item.status === 'awaiting_upload')) return;

    // 标记当前请求序号，防止旧请求的 finally 提前关闭 loading
    const thisRequestId = ++activeRequestId;

    // 如果上一个请求未完全清理，补刀（stopFn 已处理大部分情况）
    if (abortController.value) {
      abortController.value.abort();
      abortController.value = null;
    }
    activeAnswerTypewriter?.cancel();
    activeAnswerTypewriter = null;

    // 会话上下文快照:本轮问题「之前」的完整对话(显示多少发多少,保证 AI 记得的=你看得到的)。
    // 后端会按预算截最近部分兜底。此处在推入本轮问题前取,故不含当前这句。
    const historyForRequest = messages.value
      .filter(
        (m) => m.content && !m.transient && !hasPendingAgentActions(m) && (m.role === 'user' || m.role === 'assistant'),
      )
      .map((m) => ({ role: m.role, content: String(m.content) }));
    // 对话较长时提醒新建会话(一次性):更快、更省 AI 额度
    const histChars = historyForRequest.reduce((n, m) => n + m.content.length, 0);
    if (histChars > 11000 && !longChatHinted.value) {
      longChatHinted.value = true;
      message.info('对话较长,新建会话回答更快、更省 AI 额度');
    }

    // 添加用户消息
    const userMessage: ChatMessage = {
      role: 'user',
      content: inputText,
      timestamp: new Date(),
      contexts: contextSnapshot,
    };
    messages.value.push(userMessage);

    // 添加AI消息占位
    const aiMessage: ChatMessage = {
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      thoughts: [],
      thinkingText: '',
      thinkingDisplay: '',
      recommendations: [],
      recommendationReady: false,
    };
    messages.value.push(aiMessage);
    const aiMessageIndex = messages.value.length - 1;
    currentMessageIndex = aiMessageIndex;

    // 先挂上中止控制器再进入生成态，用户即使在首个 nextTick 前点击暂停，也不会漏掉中止请求。
    const requestController = new AbortController();
    abortController.value = requestController;

    userInput.value = '';
    isLoading.value = true;
    await nextTick();
    if (!isLoading.value || activeRequestId !== thisRequestId || requestController.signal.aborted) return;
    scheduleScrollToBottom();

    // 网络分片只负责入队，屏幕按固定绘制帧稳定吐字。这样即使 XHR 一次回调积攒了整段文本，
    // 用户看到的仍是连续打字效果，而不是忽快忽慢的整段跳出。
    const answerTypewriter = createAiStreamTypewriter({
      onText: (content) => {
        if (activeRequestId !== thisRequestId || requestController.signal.aborted) return;
        // aiMessage 是 push 前的普通对象；必须从响应式数组中取 Proxy 再修改，否则内容只会在
        // isLoading 结束时一次性渲染，用户看不到逐帧打字过程。
        if (!appendAiStreamMessageContent(messages.value, aiMessageIndex, content)) return;
        if (shouldFollowMessages.value) scheduleScrollToBottom();
      },
      // 后台标签页没有可见动画，直接排空，避免浏览器暂停 rAF 后请求迟迟无法完成清理。
      shouldFlushImmediately: () => typeof document !== 'undefined' && document.visibilityState === 'hidden',
    });
    activeAnswerTypewriter = answerTypewriter;

    let streamError: string | null = null; // 后端流式返回的错误帧(data.error)，流结束后统一处理
    let followUpRequestId = '';
    let followUpAvailable = false;
    const handleNewContent = (content: string) => {
      if (!content) return;
      if (activeRequestId !== thisRequestId) return;
      if (requestController.signal.aborted) return;
      answerTypewriter.enqueue(content);
    };

    try {
      let buffer = '';
      let processedLength = 0;

      const handleData = (data: AiSseEvent) => {
        // 用户中断后可能仍收到最后一个网络分片；旧请求的工具/确认事件不能挂到新一轮消息上。
        if (activeRequestId !== thisRequestId || requestController.signal.aborted) return;
        try {
          // 后端流式出错时会推送 { error, message } 帧：记下来、标记已开始(停思考流)，
          // 交给流结束后统一显示 —— 不在此直接改内容，避免与打字机争用当前消息
          if (data.error) {
            streamError = data.message || data.error || t('ai.errorMessage');
            hasAnswerStarted.value = true;
            return;
          }

          if (data.event === 'tool_confirmation' && data.confirmation) {
            const currentMsg = messages.value[currentMessageIndex];
            if (currentMsg) {
              currentMsg.confirmations = [...(currentMsg.confirmations || []), data.confirmation];
              markConversationConfirmationPending(
                messages.value,
                currentMessageIndex - 1,
                currentMessageIndex,
                data.confirmation.id,
                `agent-action:${thisRequestId}`,
              );
            }
          }

          if (data.event === 'interaction_required' && data.interaction) {
            const currentMsg = messages.value[currentMessageIndex];
            if (currentMsg) {
              const interactions = [...(currentMsg.interactions || []), data.interaction];
              currentMsg.interactions = interactions.filter(
                (interaction, interactionIndex, all) =>
                  all.findIndex((item) => item.id === interaction.id) === interactionIndex,
              );
              markConversationInteractionPending(
                messages.value,
                currentMessageIndex - 1,
                currentMessageIndex,
                data.interaction.id,
                `agent-action:${thisRequestId}`,
              );
            }
          }

          if ((data.event === 'tool_start' || data.event === 'tool_result') && typeof data.tool === 'string') {
            const currentMsg = messages.value[currentMessageIndex];
            if (currentMsg) {
              const round = Number(data.round || 1);
              const status =
                data.event === 'tool_start'
                  ? 'running'
                  : data.status === 'confirmation_required'
                    ? 'confirmation_required'
                    : data.status === 'interaction_required'
                      ? 'interaction_required'
                      : data.status === 'success'
                        ? 'success'
                        : 'error';
              const items = [...(currentMsg.toolEvents || [])];
              const existing = items.findIndex((item) => item.name === data.tool && Number(item.round || 1) === round);
              const nextItem: AiToolStatusItem = { name: data.tool, status, round };
              if (existing >= 0) items[existing] = nextItem;
              else items.push(nextItem);
              currentMsg.toolEvents = items;
            }
          }

          if (data.event === 'sources' && Array.isArray(data.sources)) {
            const currentMsg = messages.value[currentMessageIndex];
            if (currentMsg) {
              const merged = [...(currentMsg.sources || []), ...data.sources];
              currentMsg.sources = merged.filter(
                (source, index, all) =>
                  all.findIndex((item) => item.type === source.type && item.id === source.id) === index,
              );
            }
          }

          if (data.event === 'done') {
            followUpRequestId = String(data.requestId || '').trim();
            followUpAvailable = data.followUpAvailable === true;
          }

          const content = data.output?.text || data.text || data.content || '';

          if (content && typeof content === 'string') {
            handleNewContent(content);
            // 一旦答案开始输出，标记并停止后续思考流
            hasAnswerStarted.value = true;
          }

          // 只有在答案尚未开始输出时，才继续流式展示思考过程
          if (!hasAnswerStarted.value && data.output?.thoughts && Array.isArray(data.output.thoughts)) {
            const currentMsg = messages.value[currentMessageIndex];
            if (currentMsg) {
              currentMsg.thoughts = data.output.thoughts;
              // 取本次推送中的 reasoning 片段，按顺序直接追加到完整思考文本
              const reasoningParts = data.output.thoughts
                .filter((t) => t.action_type === 'reasoning' && (t.thought || t.response))
                .map((t) => (t.thought || t.response) as string);
              if (reasoningParts.length) {
                currentMsg.thinkingText = (currentMsg.thinkingText || '') + reasoningParts.join('');
                // 触发/继续思考打字机，仅作用于当前消息
                startThinkingTypewriter();
              }
            }
          }

          if (data.output?.session_id) {
            sessionId = data.output.session_id;
          }
        } catch (e) {
          console.warn('处理 AI 流式事件失败，已跳过:', data.event || 'unknown');
        }
      };

      const handleChunk = (chunk: string) => {
        const parsed = consumeAiSseChunk(buffer, chunk);
        buffer = parsed.buffer;
        parsed.events.forEach(handleData);
      };

      // Agent 模式：统一走 DeepSeek，不再区分 DashScope
      await apiBasePost(
        '/api/chat/agent',
        {
          message: inputText,
          stream: true,
          sessionId: sessionId,
          enableTranslation: enableTranslation.value,
          translationConfig: translationConfig.value,
          aiStyle: (user.preferences as any)?.aiStyle || 'balanced',
          history: historyForRequest,
          contexts: contextSnapshot,
          attachmentIds: attachmentSnapshot.map((item) => item.id),
          clientCapabilities: [...AI_AGENT_CLIENT_CAPABILITIES],
          locale: locale.value,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          responseType: 'text',
          signal: requestController.signal,
          onDownloadProgress: (progressEvent) => {
            const event = (progressEvent as any).event ?? progressEvent;
            const responseText = (event?.target as XMLHttpRequest | null)?.responseText ?? '';
            if (!responseText) return;

            const newText = responseText.slice(processedLength);
            if (!newText) return;

            processedLength = responseText.length;
            handleChunk(newText);
          },
        },
      );

      // 处理缓冲区剩余数据
      flushAiSseBuffer(buffer).forEach(handleData);

      // 后端结束不等于视觉输出结束；等逐帧队列排空后再切换为最终 Markdown，避免尾部突然跳出。
      await answerTypewriter.drain();

      // 后端流式返回错误帧：已有半截内容则保留并追加友好提示。
      if (streamError && thisRequestId === activeRequestId) {
        const errText = streamError || t('ai.errorMessage');
        const current = messages.value[currentMessageIndex];
        if (current) current.content = current.content ? `${current.content}\n\n${errText}` : errText;
      }
      contexts.value = [];
    } catch (error: any) {
      // 旧请求的异常，不再修改当前消息
      if (thisRequestId !== activeRequestId) return;

      if (axios.isCancel(error)) {
        // stopResponse 已处理消息标记，这里只需清理
      } else {
        console.error('请求失败:', error);
        await answerTypewriter.drain();
        const current = messages.value[currentMessageIndex];
        const errorText = t('ai.errorMessage');
        if (current) current.content = current.content ? `${current.content}\n\n${errorText}` : errorText;
      }
    } finally {
      // 仅最新请求才能更新状态，防止旧请求的 finally 提前关闭 loading
      if (thisRequestId !== activeRequestId) return;

      const wasLoading = isLoading.value;
      const currentMessage = messages.value[currentMessageIndex];
      const restoreViewport =
        wasLoading && currentMessage?.sources?.length ? freezeViewportForPostAnswerContent() : null;
      isLoading.value = false;
      if (abortController.value === requestController) abortController.value = null;
      if (activeAnswerTypewriter === answerTypewriter) activeAnswerTypewriter = null;
      if (wasLoading) {
        await nextTick();
        if (restoreViewport) restoreViewport();
        else scheduleScrollToBottom();
      }
    }

    if (!streamError && followUpAvailable && followUpRequestId) {
      void loadFollowUpRecommendations({
        requestId: followUpRequestId,
        messageIndex: currentMessageIndex,
        clientRequestId: thisRequestId,
      });
    }
  };

  async function loadFollowUpRecommendations({
    requestId,
    messageIndex,
    clientRequestId,
  }: {
    requestId: string;
    messageIndex: number;
    clientRequestId: number;
  }) {
    let suggestions: string[] = [];
    try {
      const result = await fetchAiFollowUps(requestId);
      suggestions = result.suggestions;
    } catch {
      // 动态生成失败时恢复当前页面的高价值固定问题，不弹全局错误打断阅读。
    }
    if (clientRequestId !== activeRequestId) return;
    const target = messages.value[messageIndex];
    if (!target || target.role !== 'assistant' || target !== messages.value[messages.value.length - 1]) return;
    const restoreViewport = freezeViewportForPostAnswerContent();
    target.recommendations = suggestions;
    target.recommendationReady = true;
    persistHistory();
    await nextTick();
    restoreViewport();
  }

  // 常见问题与回答后的推荐项是一键提问；附件提示词仍由 ChatInputSection 负责回填并允许修改。
  const handleRecommendationClick = createQuickQuestionDispatcher({
    isBusy: () => isLoading.value,
    setInput: (value) => {
      userInput.value = value;
    },
    afterInputChange: () => nextTick(),
    send: sendMessage,
  });

  // 编辑用户消息：把该条内容回填到输入框并聚焦，不自动发送（让用户改完再发）
  const handleEditMessage = (content: string, attachedContexts: AiResourceContext[] = []) => {
    userInput.value = content;
    contexts.value = attachedContexts.map((item) => ({ ...item }));
    nextTick(() => {
      chatInputRef.value?.focus();
    });
  };

  const handleConfirmationResolved = async (index: number, resolution: AiToolConfirmationResolution) => {
    const target = messages.value[index];
    if (!target || !resolution.summary) return;
    target.content = `${target.content}${target.content ? '\n\n' : ''}${resolution.summary}`;
    const sources = resolution.sources.filter(
      (source): source is AiSource =>
        Boolean(source) && typeof source === 'object' && typeof (source as AiSource).type === 'string',
    );
    if (sources.length) {
      const merged = [...(target.sources || []), ...sources];
      target.sources = merged.filter(
        (source, sourceIndex, all) =>
          all.findIndex((item) => item.type === source.type && item.id === source.id) === sourceIndex,
      );
    }
    if (resolution.toolName === 'save_attachment_to_cloud' && attachments.value.length) {
      try {
        const refreshed = await fetchAiAttachmentStatuses(attachments.value.map((attachment) => attachment.id));
        if (refreshed.length) attachments.value = refreshed;
      } catch {
        // 保存操作本身已经成功，状态刷新失败不应把确认结果改成失败；后续轮询/重进会恢复。
      }
    }
    persistHistory();
  };

  const handleInteractionResolved = (
    index: number,
    interaction: AiAgentInteraction,
    resolution: AiAgentInteractionResolution,
  ) => {
    const target = messages.value[index];
    if (!target) return;
    if (resolution.state === 'confirmation_required') {
      const confirmations = [...(target.confirmations || []), resolution.confirmation];
      target.confirmations = confirmations.filter(
        (confirmation, confirmationIndex, all) =>
          all.findIndex((item) => item.id === confirmation.id) === confirmationIndex,
      );
      promoteConversationInteractionToConfirmation(messages.value, index, interaction.id, resolution.confirmation.id);
      resetScrollState();
      return;
    }
    if (resolution.state === 'edit_required') {
      if (!isEditableAttachmentTool(resolution.toolName)) return;
      const opened = chatInputRef.value?.openAttachmentAction(resolution.toolName, resolution.args) || false;
      if (!opened) message.warning(t('ai.attachmentAction.attachmentUnavailable'));
      else resetScrollState();
      return;
    }
    if (resolution.state === 'resolved' && resolution.summary) {
      target.content = `${target.content}${target.content ? '\n\n' : ''}${resolution.summary}`;
    }
  };

  const handleInteractionSettled = (index: number, settlement: AiAgentInteractionSettlement) => {
    settleConversationInteraction(messages.value, index, settlement);
    persistHistory();
  };

  const handleConfirmationEdit = (confirmation: AiToolConfirmation) => {
    if (!isEditableAttachmentTool(confirmation.toolName)) return;
    const opened = chatInputRef.value?.openAttachmentAction(confirmation.toolName, confirmation.args) || false;
    if (!opened) {
      message.warning(t('ai.attachmentAction.attachmentUnavailable'));
      return;
    }
    resetScrollState();
  };

  const handleConfirmationSettled = (index: number, settlement: AiToolConfirmationSettlement) => {
    settleConversationConfirmation(messages.value, index, settlement);
    persistHistory();
  };

  // 重新生成：回到该 AI 回答对应的那轮提问，截断后用原问题重发（复用完整发送流程）
  const handleRegenerate = (index: number) => {
    if (isLoading.value) return; // 生成中不打断
    let userIdx = index - 1;
    while (userIdx >= 0 && messages.value[userIdx].role !== 'user') userIdx--;
    if (userIdx < 0) return;
    const userContent = messages.value[userIdx].content;
    const userContexts = messages.value[userIdx].contexts || [];
    messages.value.splice(userIdx); // 移除这轮 user + 其后所有消息，再用原问题重发
    userInput.value = userContent;
    contexts.value = userContexts.map((item) => ({ ...item }));
    sendMessage();
  };

  // 新消息、确认卡等块级内容出现时跟随一次；正文增量由 handleNewContent 逐帧调度。
  watch(
    () => messages.value.length,
    async (newLength, oldLength) => {
      if (newLength > oldLength && shouldFollowMessages.value) {
        await nextTick();
        scheduleScrollToBottom();
      }
    },
    { flush: 'post' },
  );

  // 进入生成态时把刚插入的用户消息和回答占位带入视口。
  watch(isLoading, async (newVal) => {
    if (newVal && shouldFollowMessages.value) {
      await nextTick();
      scheduleScrollToBottom();
    }
  });

  onBeforeUnmount(() => {
    activeAnswerTypewriter?.cancel();
    activeAnswerTypewriter = null;
    abortController.value?.abort();
    abortController.value = null;
    cancelScheduledScroll();
  });
</script>

<style scoped>
  /* 原有其他样式保持不变 */
  .ai-chat-container {
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    background: var(--background-color);
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
    padding: 0;
    box-sizing: border-box;
  }

  .chat-wrapper {
    width: 100%;
    max-width: 1200px;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--background-color);
    border-radius: 16px;
    overflow: hidden;
    container: ai-chat / inline-size;
  }

  .ai-message-action-stack {
    display: grid;
    width: min(680px, calc(100% - 44px));
    gap: 8px;
    margin: -10px 0 16px 44px;
  }

  .ai-message-action-stack :deep(.ai-interaction-card),
  .ai-message-action-stack :deep(.tool-confirmation-card) {
    width: 100%;
    margin: 0;
  }

  @container ai-chat (max-width: 520px) {
    .ai-message-action-stack {
      width: 100%;
      margin: 4px 0 14px;
    }
  }

  .messages-container {
    flex: 1;
    overflow-y: auto;
    overscroll-behavior-y: contain;
    overflow-anchor: none;
    padding: 0.75rem 1.5rem;
    position: relative;
    color: var(--text-color);
    scroll-behavior: auto;
  }

  .thinking-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem 0;
    color: #6b7280;
  }

  .typing-dots {
    display: flex;
    gap: 0.25rem;
    margin-right: 0.5rem;
  }

  .typing-dots span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #3b82f6;
    animation: typing 1.4s infinite ease-in-out;
  }

  .typing-dots span:nth-child(2) {
    animation-delay: 0.2s;
  }
  .typing-dots span:nth-child(3) {
    animation-delay: 0.4s;
  }

  @keyframes typing {
    0%,
    100% {
      transform: scale(1);
      opacity: 1;
    }
    50% {
      transform: scale(1.2);
      opacity: 0.7;
    }
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes slideInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes bounce {
    0%,
    20%,
    50%,
    80%,
    100% {
      transform: translateY(0);
    }
    40% {
      transform: translateY(-3px);
    }
    60% {
      transform: translateY(-2px);
    }
  }

  @media (max-width: 600px) {
    .ai-chat-container {
      padding: 0;
    }
    .chat-wrapper {
      height: 100%;
      border-radius: 0;
    }
    .messages-container {
      padding: 0.75rem 0.5rem;
    }
    .message-content {
      max-width: 85%;
    }
    .input-section {
      padding: 1rem;
    }
    .avatar {
      width: 2rem;
      height: 2rem;
      font-size: 1rem;
    }

    /* 移动端调整滚动提示位置 */
    .scroll-prompt {
      bottom: 80px;
      right: 15px;
    }
  }

  /* 深度思考样式 */
  .thoughts {
    margin-bottom: 1rem;
    padding: 0.5rem;
    line-height: 1.4;
    /* 夜间主题下使用更深的背景以提高对比度，白天主题保持浅色 */
    background: rgba(0, 0, 0, 0.25);
    border-radius: 0.5rem;
    border-left: 3px solid var(--primary-color);
  }

  .thoughts-header {
    font-weight: bold;
    color: var(--primary-color);
    margin-bottom: 0.5rem;
  }

  .thought {
    margin: 0.5rem 0;
    font-size: 0.9rem;
  }

  .reasoning {
    /* 夜间主题下使用高对比白色，白天主题使用深色以确保可读性 */
    color: rgba(255, 255, 255, 0.95);
    font-size: 0.85rem;
  }

  .rag {
    color: #007bff;
  }

  .observation {
    margin-top: 0.25rem;
    font-size: 0.8rem;
    color: #888;
  }

  @media (max-width: 480px) {
    .scroll-prompt {
      bottom: 70px;
      right: 10px;
    }
  }
</style>
