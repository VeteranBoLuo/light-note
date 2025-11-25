<template>
  <div class="ai-chat-container">
    <!-- 主聊天容器 -->
    <div class="chat-wrapper">
      <!-- 顶部标题栏 -->
      <header class="chat-header">
        <div class="header-content">
          <h1>AI智能助手</h1>
          <div class="header-controls">
            <span class="status" :class="{ online: isConnected }">
              {{ isConnected ? '在线' : '离线' }}
            </span>
            <button @click="clearHistory" class="clear-btn" :disabled="isLoading"> 清空对话 </button>
          </div>
        </div>
      </header>

      <!-- 消息区域 -->
      <main class="messages-container" ref="messagesContainer" @scroll="handleScroll">
        <div v-for="(message, index) in messages" :key="index" class="message" :class="message.role">
          <div class="message-content">
            <div class="avatar" :class="message.role">
              {{ message.role === 'user' ? '👤' : '🤖' }}
            </div>
            <div class="bubble">
              <div class="text" v-html="formatMessage(message.content)"></div>
              <div class="time">{{ formatTime(message.timestamp) }}</div>
            </div>
          </div>
        </div>

        <!-- 流式加载指示器 -->
        <div v-if="isLoading" class="thinking-indicator">
          <div class="typing-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <span>AI正在思考</span>
        </div>

        <!-- 智能滚动提示 -->
        <div v-if="showScrollPrompt" class="scroll-prompt" @click="scrollToBottom">
          <div class="prompt-content">
            <span>有新消息</span>
            <div class="prompt-arrow">↓</div>
          </div>
        </div>

        <!-- 回答完毕提示 -->
        <div v-if="showCompletionHint" class="completion-hint">
          <div class="hint-content">
            <span>回答完毕</span>
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
        <div class="input-hint">按 Enter 发送，Shift + Enter 换行</div>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ref, onMounted, nextTick, watch } from 'vue';

  interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }

  // 响应式数据
  const userInput = ref('');
  const messages = ref<ChatMessage[]>([]);
  const isLoading = ref(false);
  const isConnected = ref(true);
  const messagesContainer = ref<HTMLElement | null>(null);
  const textInput = ref<HTMLTextAreaElement | null>(null);

  // 智能滚动相关状态
  const autoScroll = ref(true);
  const showScrollPrompt = ref(false);
  const showCompletionHint = ref(false);
  const lastScrollTop = ref(0);
  const isUserScrolling = ref(false);

  // 流式输出控制
  const abortController = ref<AbortController | null>(null);
  let currentMessageIndex = -1;

  // 滚动阈值配置
  const SCROLL_THRESHOLD = 100; // 距离底部多少像素内算作"接近底部"
  const DEBOUNCE_DELAY = 150; // 防抖延迟

  // 初始化
  onMounted(() => {
    messages.value = [
      {
        role: 'assistant',
        content: '您好！我是AI助手，可以为您解答各种问题。',
        timestamp: new Date(),
      },
    ];
    adjustTextareaHeight();
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

  // 格式化消息
  const formatMessage = (content: string): string => {
    return content.replace(/\n/g, '<br>');
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

  // 滚动处理逻辑
  let scrollTimer: number | null = null;

  const handleScroll = () => {
    if (!messagesContainer.value) return;

    const { scrollTop, scrollHeight, clientHeight } = messagesContainer.value;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < SCROLL_THRESHOLD;

    // 检测滚动方向
    if (scrollTop < lastScrollTop.value) {
      // 用户向上滚动
      isUserScrolling.value = true;
      autoScroll.value = false;
    }

    // 如果滚动到底部附近，恢复自动滚动
    if (isNearBottom) {
      isUserScrolling.value = false;
      autoScroll.value = true;
      showScrollPrompt.value = false;
    }

    lastScrollTop.value = scrollTop;

    // 防抖处理
    if (scrollTimer) clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(() => {
      isUserScrolling.value = false;
    }, DEBOUNCE_DELAY);
  };

  // 滚动到底部
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    nextTick(() => {
      if (messagesContainer.value) {
        messagesContainer.value.scrollTo({
          top: messagesContainer.value.scrollHeight,
          behavior,
        });
        autoScroll.value = true;
        showScrollPrompt.value = false;
        isUserScrolling.value = false;
      }
    });
  };

  // 重置滚动状态
  const resetScrollState = () => {
    autoScroll.value = true;
    showScrollPrompt.value = false;
    isUserScrolling.value = false;
    nextTick(() => scrollToBottom('auto'));
  };

  // 检查是否需要显示滚动提示
  const checkScrollPrompt = () => {
    if (!messagesContainer.value || !isUserScrolling.value) return;

    const { scrollTop, scrollHeight, clientHeight } = messagesContainer.value;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < SCROLL_THRESHOLD;

    if (!isNearBottom && !showScrollPrompt.value) {
      showScrollPrompt.value = true;
    }
  };

  // 暂停响应
  const stopResponse = () => {
    if (abortController.value) {
      abortController.value.abort();
      abortController.value = null;
    }
    isLoading.value = false;
    showCompletionHint.value = true;
    setTimeout(() => {
      showCompletionHint.value = false;
    }, 3000);
  };

  // 发送消息（流式输出）
  const sendMessage = async () => {
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

    // 发送前滚动到底部
    if (autoScroll.value) {
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
        }),
        signal: abortController.value.signal,
      });

      if (!response.ok) throw new Error('请求失败');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('无法读取流数据');

      const decoder = new TextDecoder();
      let accumulatedContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ') && line.substring(6) !== '[DONE]') {
            try {
              const data = JSON.parse(line.substring(6));
              let content = '';
              if (data.choices?.[0]?.delta?.content) {
                content = data.choices[0].delta.content;
              } else if (data.output?.choices?.[0]?.message?.content) {
                content = data.output.choices[0].message.content;
              }

              if (content) {
                accumulatedContent += content;
                messages.value[currentMessageIndex].content = accumulatedContent;

                // 智能滚动检查
                checkScrollPrompt();
                if (autoScroll.value) {
                  nextTick(() => {
                    if (messagesContainer.value) {
                      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
                    }
                  });
                }
              }
            } catch (error) {
              console.log('解析数据块失败:', error);
            }
          }
        }
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        messages.value[currentMessageIndex].content += '（已暂停）';
      } else {
        messages.value[currentMessageIndex].content = '抱歉，暂时无法回应';
      }
    } finally {
      isLoading.value = false;
      abortController.value = null;

      // 显示回答完毕提示
      showCompletionHint.value = true;
      setTimeout(() => {
        showCompletionHint.value = false;
      }, 2000);
    }
  };

  // 监听消息变化
  watch(
    () => messages.value.length,
    () => {
      if (autoScroll.value) {
        nextTick(() => {
          scrollToBottom('auto');
        });
      }
    },
  );
</script>

<style scoped>
  .ai-chat-container {
    width: 100%;
    min-height: 100vh;
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
    height: calc(100vh - 40px);
    display: flex;
    flex-direction: column;
    background: white;
    border-radius: 16px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
    overflow: hidden;
  }

  /* 头部样式 */
  .chat-header {
    background: white;
    border-bottom: 1px solid #e1e5e9;
    padding: 1rem 1.5rem;
    flex-shrink: 0;
  }

  .header-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .chat-header h1 {
    margin: 0;
    font-size: 1.5rem;
    color: #2d3748;
    font-weight: 600;
  }

  .header-controls {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .status {
    padding: 0.25rem 0.75rem;
    border-radius: 1rem;
    font-size: 0.875rem;
    background: #e53e3e;
    color: white;
  }

  .status.online {
    background: #38a169;
  }

  .clear-btn {
    padding: 0.5rem 1rem;
    border: 1px solid #e2e8f0;
    border-radius: 0.375rem;
    background: white;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .clear-btn:hover:not(:disabled) {
    background: #f7fafc;
  }

  .clear-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* 消息容器 */
  .messages-container {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
    position: relative;
    scroll-behavior: smooth;
  }

  /* 消息样式 */
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

  .message.user .avatar {
    background: #3b82f6;
  }

  .message.assistant .avatar {
    background: #10b981;
  }

  .bubble {
    background: white;
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

  .time {
    font-size: 0.75rem;
    opacity: 0.7;
    margin-top: 0.5rem;
  }

  /* 智能滚动提示 */
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

  .prompt-content {
    background: white;
    padding: 0.75rem 1.5rem;
    border-radius: 2rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.875rem;
    color: #4b5563;
    cursor: pointer;
    transition: all 0.2s;
  }

  .prompt-content:hover {
    background: #f8fafc;
    transform: translateY(-1px);
  }

  .prompt-arrow {
    font-size: 1.2rem;
    animation: bounce 2s infinite;
  }

  /* 回答完毕提示 */
  .completion-hint {
    text-align: center;
    padding: 1rem;
    animation: fadeIn 0.3s ease;
  }

  .hint-content {
    display: inline-flex;
    align-items: center;
    gap: 0.75rem;
    background: #f1f5f9;
    padding: 0.75rem 1.5rem;
    border-radius: 2rem;
    font-size: 0.875rem;
    color: #64748b;
  }

  .hint-btn {
    padding: 0.25rem 0.75rem;
    border: 1px solid #3b82f6;
    border-radius: 1rem;
    background: white;
    color: #3b82f6;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .hint-btn:hover {
    background: #3b82f6;
    color: white;
  }

  /* 输入区域 */
  .input-section {
    background: white;
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
    border-color: #3b82f6;
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

  /* 动画 */
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

  /* 响应式设计 */
  @media (max-width: 768px) {
    .ai-chat-container {
      padding: 10px;
    }

    .chat-wrapper {
      height: calc(100vh - 20px);
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
  }

  @media (max-width: 480px) {
    .message-content {
      max-width: 90%;
    }

    .header-content {
      flex-direction: column;
      gap: 0.5rem;
      align-items: flex-start;
    }

    .header-controls {
      width: 100%;
      justify-content: space-between;
    }
  }
</style>
