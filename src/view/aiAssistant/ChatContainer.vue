<template>
  <div class="ai-chat-container">
    <!-- 主聊天容器 -->
    <div class="chat-wrapper">
      <!-- 消息区域 -->
      <main class="messages-container" ref="messagesContainer" @scroll="handleScroll">
        <div v-for="(message, index) in messages" :key="index" class="message" :class="message.role">
          <div class="message-content">
            <div class="avatar" :class="message.role">
              <img
                v-if="message.role !== 'user'"
                src="/favicon.svg"
                :title="t('ai.homeTitle')"
                width="25"
                height="25"
                alt=""
              />
              <div
                class="navigation-icon"
                style="
                  margin-left: 5px;
                  display: flex;
                  align-items: center;
                  clip-path: circle(50% at 50% 50%);
                  cursor: pointer;
                "
                v-else
              >
                <svg-icon size="32" :src="user.headPicture || icon.navigation.user" class="dom-hover" />
              </div>
            </div>
            <div class="bubble" v-if="message.content">
              <!-- 修改：使用Markdown渲染 -->
              <div class="text" v-html="formatMessage(message)"></div>
              <div class="time">{{ formatTime(message.timestamp) }}</div>
            </div>
            <ReplyLoading v-else />
          </div>
        </div>
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
      <footer class="input-section">
        <div class="input-container">
          <textarea
            v-model="userInput"
            @keydown.enter.exact.prevent="sendMessage"
            @keydown.shift.enter="handleNewLine"
            :placeholder="t('ai.inputPlaceholder')"
            :disabled="isLoading"
            rows="1"
            ref="textInput"
            class="text-input"
            @input="adjustTextareaHeight"
          ></textarea>
          <div class="input-actions">
            <button
              @click="isLoading ? stopResponse() : sendMessage()"
              v-click-log="{ module: 'AI助手', operation: isLoading ? '暂停' : '发送' }"
              :disabled="!userInput.trim() && !isLoading"
              class="send-btn"
              :class="{ stop: isLoading }"
            >
              {{ isLoading ? t('ai.pause') : t('ai.send') }}
            </button>
          </div>
        </div>
        <div v-if="!bookmark.isMobileDevice" class="input-hint">{{ t('ai.inputHint') }}</div>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ref, onMounted, nextTick, watch } from 'vue';
  import { parse, Allow } from 'partial-json';
  import { bookmarkStore, useUserStore } from '@/store';
  import icon from '@/config/icon.ts';

  // 引入Markdown解析库和安全防护
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';
  import hljs from 'highlight.js';
  import 'highlight.js/styles/github.css';
  import ReplyLoading from '@/components/aiAssistant/ReplyLoading.vue';
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
  }

  // 响应式数据
  const userInput = ref('');
  const messages = ref<ChatMessage[]>([]);
  const isLoading = ref(false);
  const messagesContainer = ref<HTMLElement | null>(null);
  const textInput = ref<HTMLTextAreaElement | null>(null);

  // 智能滚动相关状态 - 简化状态管理
  const autoScrollEnabled = ref(true); // 是否启用自动滚动
  const showScrollToBottom = ref(false);
  const showRecommendation = ref(true);

  // 简化用户干预检测，只使用一个核心标志
  const userHasInterrupted = ref(false); // 用户是否手动干预了滚动
  const lastScrollTop = ref(0);
  const SCROLL_THRESHOLD = 200; // 距离底部200px时显示提示

  // 流式输出控制
  const abortController = ref<AbortController | null>(null);
  let currentMessageIndex = -1;

  // 推荐提示

  // 配置Markdown解析器
  const configureMarkdownParser = () => {
    marked.setOptions({
      highlight: function (code, lang) {
        const language = hljs.getLanguage(lang) ? lang : 'plaintext';
        return hljs.highlight(code, { language }).value;
      },
      breaks: true,
      gfm: true,
      smartLists: true,
      smartypants: true,
    });
  };

  // 初始化
  onMounted(() => {
    configureMarkdownParser();
    messages.value = [
      {
        role: 'assistant',
        content: t('ai.greeting'),
        timestamp: new Date(),
      },
    ];
    adjustTextareaHeight();
    nextTick(() => {
      scrollToBottom('auto');
    });
  });

  // 调整输入框高度
  const adjustTextareaHeight = () => {
    if (textInput.value) {
      textInput.value.style.height = 'auto';
      textInput.value.style.height = Math.min(textInput.value.scrollHeight, 120) + 'px';
    }
  };

  // 处理换行
  const handleNewLine = () => {
    userInput.value += '\n';
    nextTick(adjustTextareaHeight);
  };

  // 消息格式化函数
  const formatMessage = (message: ChatMessage): string => {
    if (message.role === 'user') {
      return message.content.replace(/\n/g, '<br>');
    }

    try {
      const rawHtml = marked.parse(message.content) as string;
      const cleanHtml = DOMPurify.sanitize(rawHtml, {
        ALLOWED_TAGS: [
          'h1',
          'h2',
          'h3',
          'h4',
          'h5',
          'h6',
          'p',
          'br',
          'strong',
          'em',
          'u',
          's',
          'ul',
          'ol',
          'li',
          'blockquote',
          'code',
          'pre',
          'a',
          'img',
          'table',
          'thead',
          'tbody',
          'tr',
          'th',
          'td',
        ],
        ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'target', 'class'],
      });
      return cleanHtml;
    } catch (error) {
      console.error('Markdown解析错误:', error);
      return message.content.replace(/\n/g, '<br>');
    }
  };

  // 格式化时间
  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

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
      },
    ];
    showRecommendation.value = true;
    resetScrollState();
  }

  // 重新设计滚动处理逻辑，确保用户手动滚动时立即取消自动滚动
  const handleScroll = () => {
    if (!messagesContainer.value) return;

    const { scrollTop, scrollHeight, clientHeight } = messagesContainer.value;
    const scrollPosition = scrollHeight - scrollTop - clientHeight;

    // 检测滚动方向 - 关键修改：不再需要距离阈值，直接判断方向
    const scrollDelta = scrollTop - lastScrollTop.value;
    lastScrollTop.value = scrollTop;
    // 用户向上滚动（无论距离多小）立即停止自动滚动
    if (scrollDelta < 0) {
      userHasInterrupted.value = true;
      autoScrollEnabled.value = false;
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

    const container = messagesContainer.value;
    const targetScrollTop = container.scrollHeight - container.clientHeight;

    if (behavior === 'smooth') {
      container.scrollTo({
        top: targetScrollTop,
        behavior: 'smooth',
      });
    } else {
      // 立即滚动
      container.scrollTop = targetScrollTop;
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
  // 彻底重写发送消息函数，确保滚动逻辑正确
  // 重新设计打字机效果，确保内容完整且逐字显示
  const sendMessage = async () => {
    showRecommendation.value = false;
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
    };
    messages.value.push(aiMessage);
    currentMessageIndex = messages.value.length - 1;

    userInput.value = '';
    isLoading.value = true;
    adjustTextareaHeight();
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
    const TYPING_SPEED = 10; // 打字速度（毫秒/字符）

    // 打字机效果函数[6,7](@ref)
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

          // 控制打字速度[5](@ref)
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

  .message {
    margin-bottom: 1.5rem;
    animation: fadeIn 0.3s ease;
  }

  .message-content {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    max-width: 70%;
  }

  .message.user .message-content {
    margin-left: auto;
    flex-direction: row-reverse;
  }

  .avatar {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.2rem;
    flex-shrink: 0;
  }

  .message.assistant .avatar {
    background: #7b79d3;
  }

  .bubble {
    background: var(--menu-container-bg-color);
    padding: 1rem 1.25rem;
    border-radius: 1.125rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    max-width: 100%;
  }

  .message.user .bubble {
    background: var(--ai-user-background-color);
    color: var(--text-color);
    border-bottom-right-radius: 0.25rem;
  }

  .message.assistant .bubble {
    border-bottom-left-radius: 0.25rem;
  }

  .text {
    line-height: 1.5;
    word-wrap: break-word;
  }

  .text h1,
  .text h2,
  .text h3,
  .text h4,
  .text h5,
  .text h6 {
    margin-top: 1.2em;
    margin-bottom: 0.6em;
    color: #2d3748;
    font-weight: 600;
  }

  .text h1 {
    font-size: 1.5em;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 0.3em;
  }

  .text h2 {
    font-size: 1.3em;
  }
  .text h3 {
    font-size: 1.1em;
  }

  .text pre {
    background: #f6f8fa;
    border: 1px solid #e1e5e9;
    border-radius: 6px;
    padding: 12px;
    overflow-x: auto;
    margin: 1em 0;
  }

  .text code {
    background: #f1f3f4;
    padding: 2px 6px;
    border-radius: 3px;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    font-size: 0.9em;
  }

  .text pre code {
    background: none;
    padding: 0;
  }

  .text ul,
  .text ol {
    padding-left: 1.5em;
    margin: 1em 0;
  }

  .text li {
    margin: 0.3em 0;
  }

  .text blockquote {
    border-left: 4px solid #e2e8f0;
    padding-left: 1em;
    margin: 1em 0;
    color: #4a5568;
    font-style: italic;
  }

  .text table {
    border-collapse: collapse;
    width: 100%;
    margin: 1em 0;
  }

  .text th,
  .text td {
    border: 1px solid #e2e8f0;
    padding: 8px 12px;
    text-align: left;
  }

  .text th {
    background: #f7fafc;
    font-weight: 600;
  }

  .text a {
    color: #3b82f6;
    text-decoration: none;
  }

  .text a:hover {
    text-decoration: underline;
  }

  .time {
    font-size: 0.75rem;
    opacity: 0.7;
    margin-top: 0.5rem;
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

  .input-section {
    background: var(--background-color);
    border-top: 1px solid #e1e5e9;
    padding: 1.5rem;
    flex-shrink: 0;
  }

  .input-container {
    display: flex;
    gap: 0.75rem;
    align-items: flex-end;
  }

  .text-input {
    flex: 1;
    border: 1px solid #d1d5db;
    color: var(--text-color);
    background-color: var(--menu-container-bg-color);
    border-radius: 0.75rem;
    padding: 0.75rem 1rem;
    font-size: 1rem;
    line-height: 1.5;
    resize: none;
    outline: none;
    transition: all 0.2s;
    max-height: 120px;
    font-family: inherit;
  }

  .text-input:focus {
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .text-input::placeholder {
    color: #9ca3af;
  }

  .input-actions {
    display: flex;
    gap: 0.5rem;
  }

  .send-btn {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 0.75rem;
    background: #3b82f6;
    color: white;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
    min-width: 80px;
  }

  .send-btn:hover:not(:disabled) {
    background: #2563eb;
  }
  .send-btn.stop {
    background: #dc2626;
  }
  .send-btn.stop:hover:not(:disabled) {
    background: #b91c1c;
  }
  .send-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .input-hint {
    text-align: center;
    font-size: 0.75rem;
    color: #6b7280;
    margin-top: 0.5rem;
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
    .bubble {
      padding: 0.75rem 1rem;
    }
    /* 移动端调整滚动提示位置 */
    .scroll-prompt {
      bottom: 80px;
      right: 15px;
    }
  }

  @media (max-width: 480px) {
    .scroll-prompt {
      bottom: 70px;
      right: 10px;
    }
  }
</style>
