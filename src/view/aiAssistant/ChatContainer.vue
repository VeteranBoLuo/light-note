<template>
  <div class="ai-chat-container">
    <!-- 主聊天容器 -->
    <div class="chat-wrapper">
      <!-- 消息区域 -->
      <main class="messages-container" ref="messagesContainer" @scroll="handleScroll">
        <ChatMessageItem
          v-for="(message, index) in messages"
          :key="index"
          :message="message"
          :has-answer-started="hasAnswerStarted"
        />
        <!-- 智能滚动提示  -->
        <ScrollPrompt
          v-if="showScrollToBottom"
          :is-loading="isLoading"
          @scroll-to-bottom-click="handleScrollToBottomClick"
        />

        <!-- 常见问题提示 -->
        <MainQuestionPrompt v-if="showRecommendation" @recommendation-click="handleRecommendationClick" />
      </main>

      <!-- 输入区域 -->
      <ChatInputSection
        v-model="userInput"
        :is-loading="isLoading"
        :use-internet-search="useInternetSearch"
        :enable-thinking="enableThinking"
        :enable-translation="enableTranslation"
        :translation-config="translationConfig"
        :is-mobile="bookmark.isMobileDevice"
        :send-fn="sendMessage"
        :stop-fn="stopResponse"
        :toggle-internet-search="toggleInternetSearch"
        :toggle-thinking="toggleThinking"
        @update:enable-translation="enableTranslation = $event"
        @update:translation-config="translationConfig = $event"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ref, onMounted, nextTick, watch } from 'vue';
  import { parse, Allow } from 'partial-json';
  import { bookmarkStore, useUserStore } from '@/store';
  import ChatMessageItem from '@/components/aiAssistant/ChatMessageItem.vue';
  import ChatInputSection from '@/components/aiAssistant/ChatInputSection.vue';
  import ScrollPrompt from '@/components/aiAssistant/ScrollPrompt.vue';
  import MainQuestionPrompt from '@/components/aiAssistant/MainQuestionPrompt.vue';
  import { useI18n } from 'vue-i18n';

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
  }

  // 响应式数据
  const userInput = ref('');
  const messages = ref<ChatMessage[]>([]);
  const isLoading = ref(false);
  const messagesContainer = ref<HTMLElement | null>(null);
  const useInternetSearch = ref(false);
  const enableThinking = ref(false);
  const enableTranslation = ref(false);
  const translationConfig = ref({ source: 'auto', target: 'en' });

  // 智能滚动相关状态 - 简化状态管理
  const autoScrollEnabled = ref(true); // 是否启用自动滚动
  const showScrollToBottom = ref(false);
  const showRecommendation = ref(true);

  // 新增：是否为程序触发的滚动
  const isProgrammaticScroll = ref(false);

  // 简化用户干预检测，只使用一个核心标志
  const userHasInterrupted = ref(false); // 用户是否手动干预了滚动
  const lastScrollTop = ref(0);
  const SCROLL_THRESHOLD = 200; // 距离底部200px时显示提示

  // 流式输出控制
  const abortController = ref<AbortController | null>(null);
  let currentMessageIndex = -1;

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
  onMounted(() => {
    messages.value = [
      {
        role: 'assistant',
        content: t('ai.greeting'),
        timestamp: new Date(),
        thoughts: [],
      },
    ];
    nextTick(() => {
      scrollToBottom('auto');
    });
  });

  // 切换联网搜索
  const toggleInternetSearch = () => {
    useInternetSearch.value = !useInternetSearch.value;
  };

  // 切换深度思考
  const toggleThinking = () => {
    enableThinking.value = !enableThinking.value;
  };

  // 监听翻译状态，当启用翻译时禁用联网和深度思考
  watch(enableTranslation, (newVal) => {
    if (newVal) {
      useInternetSearch.value = false;
      enableThinking.value = false;
    }
  });

  // 监听联网和深度思考状态，当启用时禁用翻译
  watch(useInternetSearch, (newVal) => {
    if (newVal) {
      enableTranslation.value = false;
    }
  });

  watch(enableThinking, (newVal) => {
    if (newVal) {
      enableTranslation.value = false;
    }
  });

  // 清空对话
  function clearHistory() {
    stopResponse();
    showRecommendation.value = false;
    sessionId = '';
    if (isLoading.value) return;
    messages.value = [
      {
        role: 'assistant',
        content: t('ai.greeting'),
        timestamp: new Date(),
        thoughts: [],
      },
    ];
    showRecommendation.value = true;
    resetScrollState();
  }

  // 重新设计滚动处理逻辑，确保用户手动滚动时立即取消自动滚动
  const handleScroll = () => {
    // 如果是程序触发的滚动，忽略处理
    if (isProgrammaticScroll.value) return;

    if (!messagesContainer.value) return;

    const { scrollTop, scrollHeight, clientHeight } = messagesContainer.value;
    const scrollPosition = scrollHeight - scrollTop - clientHeight;

    // 检测滚动方向 - 关键修改：不再需要距离阈值，直接判断方向
    const scrollDelta = scrollTop - lastScrollTop.value;
    lastScrollTop.value = scrollTop;
    // 用户向上滚动（无论距离多小）立即停止自动滚动
    if (scrollDelta < 0) {
      console.log('用户向上滚动，自动滚动已禁用');
      userHasInterrupted.value = true;
      autoScrollEnabled.value = false;
    } else {
      // 更新滚动提示状态
      if (scrollPosition <= SCROLL_THRESHOLD) {
        // 用户滚动到底部，恢复自动滚动
        autoScrollEnabled.value = true;
        userHasInterrupted.value = false;
        showScrollToBottom.value = false;
        console.log('用户滚动到底部，自动滚动已启用');
      }
    }
    if (scrollPosition > SCROLL_THRESHOLD) {
      showScrollToBottom.value = true;
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

    if (behavior === 'smooth') {
      container.scrollTo({
        top: targetScrollTop,
        behavior: 'smooth',
      });
      // 延迟重置标志，等待 smooth 动画完成（假设 300ms）
      setTimeout(() => {
        isProgrammaticScroll.value = false;
      }, 300);
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
    if (abortController.value) {
      abortController.value.abort();
      abortController.value = null;
    }
    isLoading.value = false;
  };

  let sessionId = '';
  // 重新设计打字机效果，确保内容完整且逐字显示
  const sendMessage = async () => {
    showRecommendation.value = false;
    // 每次开始新的提问时，重置自动滚动状态，确保本轮对话自动跟随到底部
    autoScrollEnabled.value = true;
    userHasInterrupted.value = false;
    showScrollToBottom.value = false;
    // 重置当前轮消息的思考状态，仅影响新创建的AI消息
    hasAnswerStarted.value = false;
    thinkingTyping = false;
    const inputText = userInput.value.trim();
    if (!inputText || isLoading.value) return;

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
    abortController.value = new AbortController();

    // 新增打字机效果相关变量
    const accumulatedContent = ref(''); // 累积的完整内容
    const displayedContent = ref(''); // 当前显示的内容（逐字增加）
    let typingTimer: number | null = null;
    let typewriterQueue: string[] = []; // 打字队列
    let isTyping = false; // 是否正在打字

    // 打字机效果函数
    const startTypewriter = async () => {
      if (isTyping) {
        return; // 如果正在打字，等待当前打字完成
      }

      isTyping = true;

      while (typewriterQueue.length > 0) {
        const textToType = typewriterQueue.shift();
        if (!textToType) continue;

        for (let i = 0; i < textToType.length; i++) {
          if (!isLoading.value) break; // 如果响应被停止，退出打字

          displayedContent.value += textToType[i];
          messages.value[currentMessageIndex].content = displayedContent.value;

          // 只有在用户没有干预时才自动滚动
          if (autoScrollEnabled.value && !userHasInterrupted.value) {
            await nextTick();
            scrollToBottom('smooth');
          }

          // 控制打字速度
          await new Promise((resolve) => {
            typingTimer = window.setTimeout(resolve, TYPING_SPEED);
          });
        }
      }

      isTyping = false;
    };
    // 处理新内容的函数
    const handleNewContent = (content: string) => {
      if (!content) return;

      accumulatedContent.value += content;
      typewriterQueue.push(content);

      // 如果没有正在打字，启动打字机
      if (!isTyping) {
        startTypewriter();
      }
    };

    try {
      const response = await fetch('/api/chat/receiveMessage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: inputText,
          stream: true,
          sessionId: sessionId,
          useInternetSearch: useInternetSearch.value, // 是否开启联网搜索
          enableThinking: enableThinking.value, // 是否开启深度思考
          enableTranslation: enableTranslation.value, // 是否开启翻译
          translationConfig: translationConfig.value, // 翻译配置
        }),
        signal: abortController.value.signal,
      });

      if (!response.ok) throw new Error(`请求失败: ${response.status}`);

      const reader = response.body?.getReader();
      if (!reader) throw new Error('无法读取流数据');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line) continue;

          if (line.startsWith('data:')) {
            const dataStr = line.slice(5).trim();

            if (dataStr === '[DONE]') {
              break;
            }

            if (!dataStr) continue;

            try {
              const parseJSONSafely = (str) => {
                try {
                  return JSON.parse(str);
                } catch (e) {
                  if (e instanceof SyntaxError) {
                    // 尝试使用partial-json解析不完整JSON
                    try {
                      return parse(str, Allow.ALL);
                    } catch (partialError) {
                      console.warn('Partial JSON解析也失败:', partialError);
                      return null;
                    }
                  }
                  throw e;
                }
              };

              const data = parseJSONSafely(dataStr);
              if (!data) continue;

              const content = data.output?.text || data.text || data.content || '';

              if (content && typeof content === 'string') {
                // 使用新的内容处理函数
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
              console.warn('解析数据失败，跳过数据块:', dataStr);
              continue;
            }
          }
        }
      }

      // 处理缓冲区剩余数据
      if (buffer.trim()) {
        const remainingLines = buffer.split('\n');
        for (const rawLine of remainingLines) {
          const line = rawLine.trim();
          if (line.startsWith('data:')) {
            const dataStr = line.slice(5).trim();
            if (dataStr && dataStr !== '[DONE]') {
              try {
                const data = JSON.parse(dataStr);
                const content = data.output?.text || data.text || data.content || '';
                if (content) {
                  handleNewContent(content);
                }
                // 缓冲区尾部同样遵循：答案一旦开始，就不再追加思考流
                if (!hasAnswerStarted.value && data.output?.thoughts && Array.isArray(data.output.thoughts)) {
                  const currentMsg = messages.value[currentMessageIndex];
                  if (currentMsg) {
                    currentMsg.thoughts = data.output.thoughts;
                    const reasoningParts = data.output.thoughts
                      .filter((t) => t.action_type === 'reasoning' && (t.thought || t.response))
                      .map((t) => (t.thought || t.response) as string);
                    if (reasoningParts.length) {
                      currentMsg.thinkingText = (currentMsg.thinkingText || '') + reasoningParts.join('');
                      startThinkingTypewriter();
                    }
                  }
                }
              } catch (e) {
                console.warn('最终数据解析失败:', dataStr);
              }
            }
          }
        }
      }

      // 等待打字机效果完成
      const waitForTypewriter = () => {
        return new Promise((resolve) => {
          const checkInterval = setInterval(() => {
            if (!isTyping && typewriterQueue.length === 0) {
              clearInterval(checkInterval);
              resolve(true);
            }
          }, 100);

          // 设置最大等待时间
          setTimeout(() => {
            clearInterval(checkInterval);
            resolve(true);
          }, 10000);
        });
      };

      await waitForTypewriter();

      // 最终检查，确保显示完整内容
      if (displayedContent.value !== accumulatedContent.value) {
        messages.value[currentMessageIndex].content = accumulatedContent.value;
        displayedContent.value = accumulatedContent.value;
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        // 清理打字机定时器
        if (typingTimer) {
          clearTimeout(typingTimer);
          typingTimer = null;
        }
        if (messages.value[currentMessageIndex]) {
          messages.value[currentMessageIndex].content += t('ai.responsePaused');
        }
      } else {
        console.error('请求失败:', error);
        messages.value[currentMessageIndex].content = t('ai.errorMessage');
      }
    } finally {
      // 清理资源
      if (typingTimer) {
        clearTimeout(typingTimer);
        typingTimer = null;
      }

      isLoading.value = false;
      abortController.value = null;
      showRecommendation.value = true;

      // 最终滚动
      await nextTick();
      console.log('Final autoScrollEnabled:', autoScrollEnabled.value, 'userHasInterrupted:', userHasInterrupted.value);
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
    padding: 20px;
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
    padding: 1.5rem;
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
      padding: 10px;
    }
    .chat-wrapper {
      height: calc(100vh - 100px);
      border-radius: 12px;
    }
    .messages-container {
      padding: 1rem;
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
