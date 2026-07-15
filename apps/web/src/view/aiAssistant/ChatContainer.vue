<template>
  <div class="ai-chat-container">
    <!-- 主聊天容器 -->
    <div class="chat-wrapper">
      <!-- 消息区域 -->
      <main
        class="messages-container"
        ref="messagesContainer"
        @scroll="handleScroll"
        @wheel.passive="handleUserInteraction"
        @touchstart.passive="handleUserInteraction"
        @pointerdown.passive="handleUserInteraction"
      >
        <template v-for="(message, index) in messages" :key="index">
          <ChatMessageItem
            :message="message"
            :has-answer-started="hasAnswerStarted"
            @edit="handleEditMessage"
            @regenerate="() => handleRegenerate(index)"
          />
          <AiToolStatusList v-if="message.toolEvents?.length" :items="message.toolEvents" />
          <AiSourceCards v-if="message.sources?.length" :sources="message.sources" />
          <AiToolConfirmationCard
            v-for="confirmation in message.confirmations || []"
            :key="confirmation.id"
            :confirmation="confirmation"
            @resolved="(summary, sources) => handleConfirmationResolved(index, summary, sources)"
          />
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
        @update:enable-translation="enableTranslation = $event"
        @update:translation-config="translationConfig = $event"
        @update:contexts="contexts = $event"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, onMounted, nextTick, watch } from 'vue';
  import { bookmarkStore, useUserStore } from '@/store';
  import ChatMessageItem from '@/components/aiAssistant/ChatMessageItem.vue';
  import ChatInputSection from '@/components/aiAssistant/ChatInputSection.vue';
  import ScrollPrompt from '@/components/aiAssistant/ScrollPrompt.vue';
  import MainQuestionPrompt from '@/components/aiAssistant/MainQuestionPrompt.vue';
  import AiToolConfirmationCard from '@/components/aiAssistant/AiToolConfirmationCard.vue';
  import AiSourceCards, { type AiSource } from '@/components/aiAssistant/AiSourceCards.vue';
  import AiToolStatusList, { type AiToolStatusItem } from '@/components/aiAssistant/AiToolStatusList.vue';
  import type { AiResourceContext } from '@/components/aiAssistant/AiContextPicker.vue';
  import { useI18n } from 'vue-i18n';
  import axios from 'axios';
  import { apiBasePost } from '@/http/request';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { consumeAiSseChunk, flushAiSseBuffer, type AiSseEvent } from '@/utils/aiSse';

  const { t } = useI18n();

  defineExpose({
    clearHistory,
  });
  const bookmark = bookmarkStore();

  const user = useUserStore();

  interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    thoughts?: any[];
    thinkingText?: string; // 当前消息完整的思考过程文本
    thinkingDisplay?: string; // 当前消息用于展示的思考文本（打字机效果）
    confirmations?: Array<{
      token: string;
      id: string;
      sessionId: string;
      toolName: string;
      args: Record<string, unknown>;
      expiresIn: number;
      riskLevel?: 'low' | 'medium' | 'high';
      preview?: { title?: string; target?: string; impact?: string };
    }>;
    sources?: AiSource[];
    toolEvents?: AiToolStatusItem[];
  }

  // 响应式数据
  const userInput = ref('');
  const messages = ref<ChatMessage[]>([]);
  const isLoading = ref(false);
  const messagesContainer = ref<HTMLElement | null>(null);
  const chatInputRef = ref<{ focus: () => void } | null>(null);
  const enableTranslation = ref(false);
  const translationConfig = ref({ source: 'auto', target: 'zh' });
  const contexts = ref<AiResourceContext[]>([]);

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

  // 智能滚动相关状态 - 简化状态管理
  const autoScrollEnabled = ref(true); // 是否启用自动滚动
  const showScrollToBottom = ref(false);
  const usedQuestions = computed(() =>
    messages.value.filter((message) => message.role === 'user').map((message) => message.content.trim()),
  );
  const conversationRound = computed(() => usedQuestions.value.length);
  const showRecommendation = computed(() => {
    if (isLoading.value || !messages.value.length) return false;
    return messages.value[messages.value.length - 1]?.role === 'assistant';
  });

  // 新增：是否为程序触发的滚动
  const isProgrammaticScroll = ref(false);
  let programmaticResetTimer: number | null = null;

  // 简化用户干预检测，只使用一个核心标志
  const userHasInterrupted = ref(false); // 用户是否手动干预了滚动
  const lastScrollTop = ref(0);
  const SCROLL_THRESHOLD = 200; // 距离底部200px时显示提示

  // 流式输出控制
  const abortController = ref<AbortController | null>(null);
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

        // 思考打字时，如果未被用户干预且允许自动滚动，则跟随到底部
        if (autoScrollEnabled.value && !userHasInterrupted.value) {
          await nextTick();
          scrollToBottom('smooth');
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
        .filter((m) => m.content) // 跳过生成中的空占位
        .map((m) => ({
          role: m.role,
          content: m.content,
          sources: m.sources || [],
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
      messages.value = data.messages.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp), thoughts: [] }));
      if (data.sessionId) sessionId = data.sessionId; // 尽力续用服务端记忆(Redis 30min 后失效则当新会话)
      return true;
    } catch {
      return false;
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
    }
    nextTick(() => {
      scrollToBottom('auto');
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
  function clearHistory() {
    stopResponse();
    sessionId = '';
    longChatHinted.value = false;
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
  }

  // 重新设计滚动处理逻辑，确保用户手动滚动时立即取消自动滚动
  const handleScroll = () => {
    if (!messagesContainer.value) return;
    // 程序触发的平滑滚动动画帧不处理，防止误判为用户行为
    if (isProgrammaticScroll.value) return;

    const { scrollTop, scrollHeight, clientHeight } = messagesContainer.value;
    const scrollPosition = scrollHeight - scrollTop - clientHeight;

    // 检测滚动方向 - 关键修改：不再需要距离阈值，直接判断方向
    const scrollDelta = scrollTop - lastScrollTop.value;
    lastScrollTop.value = scrollTop;
    // 用户向上滚动（无论距离多小）立即停止自动滚动
    if (scrollDelta < 0) {
      userHasInterrupted.value = true;
      autoScrollEnabled.value = false;
      isProgrammaticScroll.value = false;
    } else {
      // 更新滚动提示状态
      if (scrollPosition <= SCROLL_THRESHOLD) {
        // 用户滚动到底部，恢复自动滚动
        autoScrollEnabled.value = true;
        userHasInterrupted.value = false;
        showScrollToBottom.value = false;
      }
    }
    if (scrollPosition > SCROLL_THRESHOLD) {
      showScrollToBottom.value = true;
    }
  };

  // 用户交互时立即取消自动滚动（用于移动端与平滑滚动冲突）
  const handleUserInteraction = () => {
    if (!autoScrollEnabled.value && userHasInterrupted.value) return;
    userHasInterrupted.value = true;
    autoScrollEnabled.value = false;
    isProgrammaticScroll.value = false;
    if (programmaticResetTimer) {
      clearTimeout(programmaticResetTimer);
      programmaticResetTimer = null;
    }
  };

  // 设置是否显示跳转底部图标
  function checkScrollPosition() {
    if (!messagesContainer.value) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainer.value;
    const scrollPosition = scrollHeight - scrollTop - clientHeight;
    if (scrollPosition > SCROLL_THRESHOLD) {
      showScrollToBottom.value = true;
    }
  }

  // 简化自动滚动函数，确保在用户干预时不执行自动滚动
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (!messagesContainer.value || userHasInterrupted.value) {
      return; // 用户干预时不再自动滚动
    }

    isProgrammaticScroll.value = true; // 标记为程序滚动
    const container = messagesContainer.value;
    const targetScrollTop = container.scrollHeight - container.clientHeight;

    // 移动端优先使用即时滚动，避免惯性与自动滚动冲突
    const finalBehavior: ScrollBehavior = bookmark.isMobile ? 'auto' : behavior;

    if (finalBehavior === 'smooth') {
      container.scrollTo({
        top: targetScrollTop,
        behavior: 'smooth',
      });
      if (programmaticResetTimer) {
        clearTimeout(programmaticResetTimer);
      }
      // 延迟重置标志，等待 smooth 动画完成
      programmaticResetTimer = window.setTimeout(() => {
        isProgrammaticScroll.value = false;
        programmaticResetTimer = null;
      }, 600);
    } else {
      // 立即滚动
      container.scrollTop = targetScrollTop;
      // 立即重置（同步滚动）
      isProgrammaticScroll.value = false;
    }
  };

  // 处理点击跳转到底部
  const handleScrollToBottomClick = () => {
    // 用户点击滚动按钮，明确要求回到底部，重置干预状态
    userHasInterrupted.value = false;
    autoScrollEnabled.value = true;
    showScrollToBottom.value = false;
    scrollToBottom('smooth');
  };

  // 重置滚动状态
  const resetScrollState = () => {
    autoScrollEnabled.value = true;
    userHasInterrupted.value = false;
    showScrollToBottom.value = false;
    nextTick(() => scrollToBottom('auto'));
  };

  // 暂停响应
  const stopResponse = () => {
    if (!isLoading.value) return; // 已完成的消息不加暂停标记
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
    if (currentMsg?.role === 'assistant') {
      const suffix = t('ai.responsePaused');
      if (!currentMsg.content || currentMsg.content === '') {
        currentMsg.content = suffix;
      } else if (!currentMsg.content.endsWith(suffix)) {
        currentMsg.content += suffix;
      }
    }
    isLoading.value = false;
  };

  let sessionId = '';
  watch(
    () => user.id,
    (nextId, previousId) => {
      if (nextId === previousId) return;
      stopResponse();
      activeRequestId += 1;
      sessionId = '';
      currentMessageIndex = -1;
      contexts.value = [];
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
      }
    },
  );
  const longChatHinted = ref(false); // 超长对话「新建会话」提示只弹一次(每段会话)
  // 重新设计打字机效果，确保内容完整且逐字显示
  const sendMessage = async () => {
    // 每次开始新的提问时，重置自动滚动状态，确保本轮对话自动跟随到底部
    autoScrollEnabled.value = true;
    userHasInterrupted.value = false;
    showScrollToBottom.value = false;
    // 重置当前轮消息的思考状态，仅影响新创建的AI消息
    hasAnswerStarted.value = false;
    thinkingTyping = false;
    const inputText = userInput.value.trim();
    if (!inputText) return;

    // 标记当前请求序号，防止旧请求的 finally 提前关闭 loading
    const thisRequestId = ++activeRequestId;

    // 如果上一个请求未完全清理，补刀（stopFn 已处理大部分情况）
    if (abortController.value) {
      abortController.value.abort();
      abortController.value = null;
    }

    // 会话上下文快照:本轮问题「之前」的完整对话(显示多少发多少,保证 AI 记得的=你看得到的)。
    // 后端会按预算截最近部分兜底。此处在推入本轮问题前取,故不含当前这句。
    const historyForRequest = messages.value
      .filter((m) => m.content && (m.role === 'user' || m.role === 'assistant'))
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
    };
    messages.value.push(aiMessage);
    currentMessageIndex = messages.value.length - 1;

    userInput.value = '';
    isLoading.value = true;
    userHasInterrupted.value = false;

    if (!userHasInterrupted.value) {
      await nextTick();
      scrollToBottom('auto');
    }

    // 创建中止控制器
    const requestController = new AbortController();
    abortController.value = requestController;

    let streamError: string | null = null; // 后端流式返回的错误帧(data.error)，流结束后统一处理
    // 服务端已经按 token 流式输出，前端直接渲染增量；不再叠加第二层逐字打字机。
    const handleNewContent = async (content: string) => {
      if (!content) return;
      if (activeRequestId !== thisRequestId) return;
      if (requestController.signal.aborted) return;
      const current = messages.value[currentMessageIndex];
      if (!current) return;
      current.content += content;
      if (autoScrollEnabled.value && !userHasInterrupted.value) {
        await nextTick();
        scrollToBottom('smooth');
      }
    };

    try {
      let buffer = '';
      let processedLength = 0;

      const handleData = (data: AiSseEvent) => {
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

          const content = data.output?.text || data.text || data.content || '';

          if (content && typeof content === 'string') {
            // 使用新的内容处理函数
            void handleNewContent(content);
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
          contexts: contexts.value,
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

      // 后端流式返回错误帧：已有半截内容则保留并追加友好提示。
      if (streamError && thisRequestId === activeRequestId) {
        const errText = t('ai.errorMessage');
        const current = messages.value[currentMessageIndex];
        current.content = current.content ? `${current.content}\n\n${errText}` : errText;
      }
      contexts.value = [];
    } catch (error: any) {
      // 旧请求的异常，不再修改当前消息
      if (thisRequestId !== activeRequestId) return;

      if (axios.isCancel(error)) {
        // stopResponse 已处理消息标记，这里只需清理
      } else {
        console.error('请求失败:', error);
        messages.value[currentMessageIndex].content = t('ai.errorMessage');
      }
    } finally {
      // 仅最新请求才能更新状态，防止旧请求的 finally 提前关闭 loading
      if (thisRequestId !== activeRequestId) return;

      isLoading.value = false;
      if (abortController.value === requestController) abortController.value = null;
      // 最终滚动
      await nextTick();
      if (autoScrollEnabled.value && !userHasInterrupted.value) {
        scrollToBottom('smooth');
      }
    }
  };

  // 处理推荐点击
  const handleRecommendationClick = (item: string) => {
    userInput.value = item;
    nextTick(() => {
      sendMessage();
    });
  };

  // 编辑用户消息：把该条内容回填到输入框并聚焦，不自动发送（让用户改完再发）
  const handleEditMessage = (content: string) => {
    userInput.value = content;
    nextTick(() => {
      chatInputRef.value?.focus();
    });
  };

  const handleConfirmationResolved = (index: number, summary: string, sources: AiSource[] = []) => {
    const target = messages.value[index];
    if (!target || !summary) return;
    target.content = `${target.content}${target.content ? '\n\n' : ''}${summary}`;
    if (sources.length) target.sources = [...(target.sources || []), ...sources];
    persistHistory();
  };

  // 重新生成：回到该 AI 回答对应的那轮提问，截断后用原问题重发（复用完整发送流程）
  const handleRegenerate = (index: number) => {
    if (isLoading.value) return; // 生成中不打断
    let userIdx = index - 1;
    while (userIdx >= 0 && messages.value[userIdx].role !== 'user') userIdx--;
    if (userIdx < 0) return;
    const userContent = messages.value[userIdx].content;
    messages.value.splice(userIdx); // 移除这轮 user + 其后所有消息，再用原问题重发
    userInput.value = userContent;
    sendMessage();
  };

  // 简化消息监听逻辑，避免冲突
  watch(
    () => messages.value,
    async (newLength, oldLength) => {
      checkScrollPosition();
      if (newLength > oldLength && autoScrollEnabled.value && !userHasInterrupted.value) {
        await nextTick();
        scrollToBottom('smooth');
      }
    },
    { flush: 'post', deep: true },
  );

  // 监听isLoading状态，在生成内容时保持自动滚动（尊重用户干预）
  watch(isLoading, async (newVal) => {
    if (newVal && !userHasInterrupted.value) {
      await nextTick();
      scrollToBottom('auto');
    }
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
  }

  .messages-container {
    flex: 1;
    overflow-y: auto;
    padding: 0.75rem 1.5rem;
    position: relative;
    color: var(--text-color);
    scroll-behavior: smooth;
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
