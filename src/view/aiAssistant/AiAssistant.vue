<template>
  <div class="ai-chat-container">
    <!-- 主聊天容器 -->
    <div class="chat-wrapper">
      <!-- 消息区域 -->
      <main class="messages-container" ref="messagesContainer" @scroll="handleScroll">
        <div v-for="(message, index) in messages" :key="index" class="message" :class="message.role">
          <div class="message-content">
            <div class="avatar" :class="message.role">
              <img v-if="message.role !== 'user'" src="/favicon.svg" title="首页" width="25" height="25" alt="" />
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
            <div class="bubble">
              <!-- 修改：使用Markdown渲染 -->
              <div class="text" v-html="formatMessage(message)"></div>
              <div class="time">{{ formatTime(message.timestamp) }}</div>
            </div>
          </div>
        </div>
        <!-- 智能滚动提示  -->
        <div v-if="showScrollToBottom" class="scroll-prompt" @click="handleScrollToBottomClick">
          <div class="prompt-icon">
            <div
              class="loading-spinner"
              :style="{
                borderTop: isLoading ? '2px solid #3b82f6' : '',
              }"
            >
            </div>
            <span class="both-center">⌵</span>
          </div>
        </div>

        <!-- 轻笺推荐提示 -->
        <div v-if="showRecommendation" class="recommendation-container">
          <div class="recommendation-title">轻笺小提示</div>
          <div class="recommendation-list">
            <div
              v-for="(item, index) in recommendationItems"
              :key="index"
              class="recommendation-item"
              @click="handleRecommendationClick(item)"
            >
              {{ item }}
            </div>
          </div>
        </div>
      </main>

      <!-- 输入区域 -->
      <footer class="input-section">
        <div class="input-container">
          <textarea
            v-model="userInput"
            @keydown.enter.exact.prevent="sendMessage"
            @keydown.shift.enter="handleNewLine"
            placeholder="输入您的问题..."
            :disabled="isLoading"
            rows="1"
            ref="textInput"
            class="text-input"
            @input="adjustTextareaHeight"
          ></textarea>
          <div class="input-actions">
            <button
              @click="isLoading ? stopResponse() : sendMessage()"
              :disabled="!userInput.trim() && !isLoading"
              class="send-btn"
              :class="{ stop: isLoading }"
            >
              {{ isLoading ? '暂停' : '发送' }}
            </button>
          </div>
        </div>
        <div v-if="!bookmark.isMobile" class="input-hint">按 Enter 发送，Shift + Enter 换行</div>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ref, onMounted, nextTick, watch } from 'vue';
  import { bookmarkStore, useUserStore } from '@/store';
  import icon from '@/config/icon.ts';

  // 引入Markdown解析库和安全防护
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';
  import hljs from 'highlight.js';
  import 'highlight.js/styles/github.css';
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

  // 修复：简化用户干预检测，只使用一个核心标志
  const userHasInterrupted = ref(false); // 用户是否手动干预了滚动
  const lastScrollTop = ref(0);
  const SCROLL_THRESHOLD = 200; // 距离底部200px时显示提示

  // 流式输出控制
  const abortController = ref<AbortController | null>(null);
  let currentMessageIndex = -1;

  // 推荐提示
  const recommendationItems = ref(['如何创建一个书签？', '云空间模块有什么用？', '如何关联书签和标签？']);

  // 防抖相关
  let scrollTimeout: number | null = null;

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
        content: '您好！我是轻笺助手，专为效率控设计的书签管理专家。有什么问题需要我帮忙解答吗？',
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
  const clearHistory = () => {
    showRecommendation.value = false;
    if (isLoading.value) return;
    messages.value = [
      {
        role: 'assistant',
        content: '对话已清空',
        timestamp: new Date(),
      },
    ];
    resetScrollState();
  };

  // 修复：重新设计滚动处理逻辑，确保用户手动滚动时立即取消自动滚动
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
      showScrollToBottom.value = userHasInterrupted.value;
    }
  };

  // 修复：增强防抖逻辑，避免频繁触发
  const optimizedHandleScroll = () => {
    if (scrollTimeout) {
      clearTimeout(scrollTimeout);
    }
    scrollTimeout = window.setTimeout(handleScroll, 50);
  };

  // 修复：简化自动滚动函数，确保在用户干预时不执行自动滚动
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
  // 修复：彻底重写发送消息函数，确保滚动逻辑正确
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
    // 修复：发送新消息时，只有用户没有干预才自动滚动
    if (!userHasInterrupted.value) {
      await nextTick();
      scrollToBottom('auto');
    }

    // 创建中止控制器
    abortController.value = new AbortController();

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

      if (!response.ok) throw new Error('请求失败');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('无法读取流数据');

      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedContent = '';

      const UPDATE_INTERVAL = 16;
      let pendingUpdate = '';

      // 修复：流式输出时的更新逻辑，充分尊重用户干预状态
      const processUpdate = () => {
        if (!pendingUpdate) return;

        const char = pendingUpdate[0];
        if (char) {
          accumulatedContent += char;
          pendingUpdate = pendingUpdate.substring(1);
          messages.value[currentMessageIndex].content = accumulatedContent;

          // 只有在用户没有干预时才自动滚动
          if (autoScrollEnabled.value && !userHasInterrupted.value) {
            nextTick(() => {
              if (messagesContainer.value && !userHasInterrupted.value) {
                messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
              }
            });
          }
        }
      };

      let isStreamComplete = false;
      const updateTimer = setInterval(processUpdate, UPDATE_INTERVAL);

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          isStreamComplete = true;
          break;
        }

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
              isStreamComplete = true;
              break;
            }

            if (!dataStr) continue;

            try {
              const data = JSON.parse(dataStr);
              const content = data.output?.text || data.text || '';

              if (content && typeof content === 'string') {
                pendingUpdate += content;
              }

              // 提取并更新 session_id
              if (data.output?.session_id) {
                sessionId = data.output.session_id;
              }
            } catch (e) {
              console.warn('解析数据失败，跳过该数据块:', dataStr);
              continue;
            }
          }
        }

        if (isStreamComplete) break;
      }

      // 处理流结束
      if (buffer.trim() && buffer.includes('data:')) {
        const remainingLines = buffer.split('\n');
        for (const rawLine of remainingLines) {
          const line = rawLine.trim();
          if (line.startsWith('data:')) {
            const dataStr = line.slice(5).trim();
            if (dataStr && dataStr !== '[DONE]') {
              try {
                const data = JSON.parse(dataStr);
                const content = data.output?.text || data.text || '';
                if (content) {
                  pendingUpdate += content;
                }
              } catch (e) {
                console.warn('最终数据解析失败:', dataStr);
              }
            }
          }
        }
      }

      // 等待所有内容处理完成
      await new Promise((resolve) => {
        const checkPending = setInterval(() => {
          if (!pendingUpdate) {
            clearInterval(checkPending);
            clearInterval(updateTimer);
            resolve(true);
          }
        }, 100);

        setTimeout(() => {
          clearInterval(checkPending);
          clearInterval(updateTimer);
          resolve(true);
        }, 3000);
      });
    } catch (error: any) {
      if (error.name === 'AbortError') {
        messages.value[currentMessageIndex].content += '（已暂停）';
      } else {
        console.error('请求失败:', error);
        messages.value[currentMessageIndex].content = '抱歉，暂时无法回应';
      }
    } finally {
      isLoading.value = false;
      abortController.value = null;
      showRecommendation.value = true;

      // 修复：消息发送完成后，只有用户没有干预才最终滚动到底部
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

  // 修复：简化消息监听逻辑，避免冲突
  watch(
    () => messages.value.length,
    async (newLength, oldLength) => {
      if (newLength > oldLength && autoScrollEnabled.value && !userHasInterrupted.value) {
        await nextTick();
        scrollToBottom('smooth');
      }
    },
    { flush: 'post' },
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
  /* 智能滚动提示 - 重新设计为浮动定位，不占用布局空间 */
  .scroll-prompt {
    position: sticky;
    bottom: 1rem;
    left: 0;
    right: 0;
    display: flex;
    justify-content: center;
    z-index: 10;
    animation: slideInUp 0.3s ease;
  }

  .prompt-icon {
    font-size: 1.1rem;
    position: relative;
    cursor: pointer;
  }

  .loading-spinner {
    width: 25px;
    height: 25px;
    border: 2px solid transparent;
    background-color: white;
    box-shadow: 0 1px 16px rgba(0, 0, 0, 0.2);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .prompt-text {
    font-weight: 500;
  }

  .prompt-content.loading .prompt-text {
    color: #3b82f6;
  }

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

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
    background: #10b981;
  }

  .bubble {
    background: var(--menu-container-bg-color);
    padding: 1rem 1.25rem;
    border-radius: 1.125rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    max-width: 100%;
  }

  .message.user .bubble {
    background: #3b82f6;
    color: white;
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

  .recommendation-container {
    padding: 1.5rem 1.5rem 0.5rem;
    background: var(--menu-container-bg-color);
    border-radius: 16px;
    margin: 0 1.5rem 1rem;
    border: 1px solid #dbeafe;
    box-shadow: 0 2px 8px rgba(16, 185, 129, 0.1);
  }

  .recommendation-title {
    font-size: 0.875rem;
    color: #10b981;
    font-weight: 600;
    margin-bottom: 0.75rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .recommendation-title::before {
    content: '🔖';
  }

  .recommendation-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .recommendation-item {
    background: white;
    padding: 0.5rem 1rem;
    border-radius: 1rem;
    font-size: 0.875rem;
    color: #4b5563;
    border: 1px solid #e2e8f0;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  }

  .recommendation-item:hover {
    background: #f0f9ff;
    color: #10b981;
    border-color: #3b82f6;
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
