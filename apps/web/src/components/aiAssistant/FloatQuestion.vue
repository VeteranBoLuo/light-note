<template>
  <div
    v-if="!isClosed"
    class="float-question-container"
    :class="{ 'container-peek': isPeeked, 'float-question-container--open': isOpen || containerActive }"
  >
    <!-- 问答弹窗 -->
    <transition
      name="modal-slide"
      @after-leave="onModalLeave"
    >
      <div v-show="isOpen" class="question-modal glassmorphism">
        <!-- 拖拽手柄区域 -->
        <div class="modal-header drag-handle">
          <div class="header-content">
            <div class="title-section">
              <div class="ai-icon">🤖</div>
              <h3>{{ t('ai.title') }}</h3>
              <span class="status-dot"></span>
            </div>
            <div class="header-actions">
              <!-- 最小化按钮改为清空对话 -->
              <button class="action-btn minimize" @click="clearConversation" :title="t('ai.newConversation')">
                <span>➕</span>
              </button>
              <button class="action-btn close-btn" @click="minimize" :title="t('ai.close')">
                <span>❌</span>
              </button>
            </div>
          </div>
        </div>

        <!-- 内容区域 -->
        <div class="modal-content">
          <!-- 添加ref以便调用清空方法 -->
          <ChatContainer ref="aiAssistantRef" />
        </div>

        <!-- 底部装饰 -->
        <div class="modal-footer">
          <div class="footer-wave"></div>
        </div>
      </div>
    </transition>

    <!-- 悬浮按钮保持不变 -->
    <div
      class="float-button"
      :class="{
        'button-active': isOpen,
        'button-minimized': !isOpen,
      }"
      @click="toggleModal"
      v-click-log="{ module: 'AI助手', operation: '打开ai弹框' }"
      @mouseenter="handleButtonMouseEnter"
      @mouseleave="handleButtonMouseLeave"
    >
      <div class="button-inner">
        <div class="button-icon">
          <svg class="ai-svg-icon" viewBox="0 0 100 100">
            <circle
              class="orbit orbit-1"
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke="white"
              stroke-width="4"
              stroke-dasharray="20 230"
              stroke-linecap="round"
            />
            <circle
              class="orbit orbit-2"
              cx="50"
              cy="50"
              r="32"
              fill="none"
              stroke="white"
              stroke-width="4"
              stroke-dasharray="20 180"
              stroke-linecap="round"
            />
            <circle
              class="orbit orbit-3"
              cx="50"
              cy="50"
              r="24"
              fill="none"
              stroke="white"
              stroke-width="3"
              stroke-dasharray="10 140"
              stroke-linecap="round"
            />
            <circle class="core" cx="50" cy="50" r="10" fill="white" />
          </svg>
        </div>
        <div class="pulse-ring"></div>
        <div class="sparkle-container">
          <div class="sparkle" v-for="i in 3" :key="i" :style="sparkleStyle(i)"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ref, onMounted, onUnmounted, computed, defineAsyncComponent } from 'vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { useI18n } from 'vue-i18n';

  const ChatContainer = defineAsyncComponent(() => import('@/view/aiAssistant/ChatContainer.vue'));

  const { t } = useI18n();

  // 状态管理
  const isOpen = ref(false);
  const isClosed = ref(false);
  const isPeeked = ref(true);
  /** 容器保持激活状态直到动画播完（防止动画期间 z-index 掉落） */
  const containerActive = ref(false);
  let peekTimer: number | null = null;

  const aiAssistantRef = ref(null);

  // 悬浮按钮动画状态
  const isPulsing = ref(false);

  // 火花样式计算
  const sparkleStyle = (index: number) => ({
    animationDelay: `${index * 0.3}s`,
    left: `${20 + index * 20}%`,
  });

  // 切换弹窗
  const toggleModal = () => {
    if (isOpen.value) {
      minimize();
    } else {
      isOpen.value = true;
      containerActive.value = true;
      isPeeked.value = false;
    }
  };

  // 关闭弹窗（缩小到图标）
  const minimize = () => {
    isOpen.value = false;
    isPeeked.value = false;
    schedulePeek();
  };

  // 缩小动画播完后清理容器状态
  const onModalLeave = () => {
    containerActive.value = false;
  };

  // 新增：清空对话方法
  const clearConversation = () => {
    // 调用AiAssistant组件的清空方法
    if (aiAssistantRef.value && aiAssistantRef.value.clearHistory) {
      aiAssistantRef.value.clearHistory();
      message.success(t('ai.newChart'));
    }
  };

  // 按钮动画控制（保持不变）
  const startButtonPulse = () => {
    isPulsing.value = true;
  };

  const stopButtonPulse = () => {
    isPulsing.value = false;
  };

  const clearPeekTimer = () => {
    if (peekTimer) {
      clearTimeout(peekTimer);
      peekTimer = null;
    }
  };

  const schedulePeek = () => {
    if (isOpen.value) return;
    clearPeekTimer();
    peekTimer = window.setTimeout(() => {
      if (!isOpen.value) {
        isPeeked.value = true;
      }
    }, 2000);
  };

  const handleButtonMouseEnter = () => {
    startButtonPulse();
    clearPeekTimer();
    isPeeked.value = false;
  };

  const handleButtonMouseLeave = () => {
    stopButtonPulse();
    schedulePeek();
  };

  function shouldIgnoreEscape(event: KeyboardEvent) {
    return event.defaultPrevented || event.isComposing || event.keyCode === 229;
  }

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && isOpen.value && !shouldIgnoreEscape(e)) {
      minimize();
    }
  };

  // 生命周期（保持不变）
  onMounted(() => {
    // 预热智能助手 chunk，减少首次点击打开延迟;放到浏览器空闲时再拉,避免抢占首屏关键路径
    // (否则预渲染的 networkidle 会等它下载完并把这个大 chunk 烘焙进首屏 modulepreload)
    const warmChat = () => import('@/view/aiAssistant/ChatContainer.vue').catch(() => {});
    // 预渲染(无头浏览器 navigator.webdriver=true)时跳过预热:否则 networkidle 会等这次 import 完成,
    // 把 gzip 300KB+ 的 ChatContainer 烘焙进静态 landing 首屏 preload,拖累真实访客的 TBT/LCP。真实用户照常空闲预热。
    if (!(window as any).__PRERENDER__ && !navigator.webdriver) {
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(warmChat);
      } else {
        setTimeout(warmChat, 2000);
      }
    }
    document.addEventListener('keydown', handleKeydown);
    schedulePeek();
  });

  onUnmounted(() => {
    document.removeEventListener('keydown', handleKeydown);
    clearPeekTimer();
  });
</script>

<style scoped>
  .float-question-container {
    position: fixed;
    z-index: 100;
    bottom: 40px;
    right: 40px;
    transition: right 0.35s ease;
  }

  .float-question-container--open {
    z-index: 200000;
  }

  .container-peek {
    right: 0;
  }

  /* 悬浮按钮样式 */
  .float-button {
    width: 50px;
    height: 50px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow:
      0 10px 40px rgba(102, 126, 234, 0.3),
      inset 0 1px 0 rgba(255, 255, 255, 0.2);
    border: 2px solid rgba(255, 255, 255, 0.1);
    position: relative;
    overflow: hidden;
    transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  }

  .container-peek .float-button {
    transform: translateX(15px);
    width: 44px;
    height: 110px;
    border-radius: 22px 0 0 22px;
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-right: none;
    box-shadow:
      -5px 0 25px rgba(0, 0, 0, 0.1),
      inset 2px 0 2px rgba(255, 255, 255, 0.2);
  }

  /* 隐藏原有内容 */
  .container-peek .float-button .button-icon,
  .container-peek .float-button .pulse-ring,
  .container-peek .float-button .sparkle-container {
    opacity: 0;
    transition: opacity 0.2s;
  }

  /* 新的能量条装饰 */
  .container-peek .float-button::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 18px;
    transform: translate(-50%, -50%);
    width: 6px;
    height: 60px;
    border-radius: 10px;
    background: linear-gradient(180deg, #4facfe 0%, #00f2fe 100%);
    box-shadow: 0 0 15px rgba(0, 242, 254, 0.6);
    animation: neon-breath 2s ease-in-out infinite;
  }

  @keyframes neon-breath {
    0%,
    100% {
      height: 50px;
      opacity: 0.7;
      box-shadow: 0 0 15px rgba(0, 242, 254, 0.4);
      filter: hue-rotate(0deg);
    }
    50% {
      height: 80px;
      opacity: 1;
      box-shadow: 0 0 30px rgba(0, 242, 254, 0.8);
      filter: hue-rotate(30deg);
    }
  }

  .float-button::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
    transition: left 0.6s;
  }

  .float-button:hover::before {
    left: 100%;
  }

  .float-button:hover {
    transform: scale(1.15) rotate(5deg);
    box-shadow:
      0 15px 50px rgba(102, 126, 234, 0.4),
      0 0 30px rgba(255, 255, 255, 0.1);
  }

  .button-inner {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }

  .button-icon {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
    transition: all 0.3s ease;
  }

  .ai-svg-icon {
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  .orbit {
    transform-origin: 50% 50%;
    opacity: 0.9;
  }

  .orbit-1 {
    animation: spin 4s linear infinite;
  }
  .orbit-2 {
    animation: spin 5s linear infinite reverse;
  }
  .orbit-3 {
    animation: spin 3s linear infinite;
  }

  .core {
    transform-origin: 50% 50%;
    animation: core-breath 2s ease-in-out infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes core-breath {
    0%,
    100% {
      transform: scale(1);
      opacity: 0.8;
    }
    50% {
      transform: scale(1.3);
      opacity: 1;
      filter: drop-shadow(0 0 8px white);
    }
  }

  .float-button:hover .button-icon {
    transform: scale(1.15);
    filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.6));
  }

  /* 脉冲光环 */
  .pulse-ring {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    border: 2px solid rgba(255, 255, 255, 0.4);
    border-radius: 50%;
    animation: pulse 2s ease-in-out infinite;
    opacity: 0;
  }

  @keyframes pulse {
    0% {
      transform: scale(1);
      opacity: 1;
    }
    100% {
      transform: scale(1.5);
      opacity: 0;
    }
  }

  /* 闪烁星星 */
  .sparkle-container {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
  }

  .sparkle {
    position: absolute;
    width: 4px;
    height: 4px;
    background: white;
    border-radius: 50%;
    opacity: 0;
    animation: sparkle 3s ease-in-out infinite;
  }

  @keyframes sparkle {
    0%,
    100% {
      opacity: 0;
      transform: scale(0);
    }
    50% {
      opacity: 1;
      transform: scale(1);
    }
  }

  .button-active {
    background: linear-gradient(135deg, #f093fb, #f575a5, #f5576c, #f87b8a, #f093fb, #8fc0ff, #a0d4ff, #f093fb);
    background-size: 600% 600%;
    transform: scale(1.1);
    animation: gradient-flow 8s ease infinite;
  }

  @keyframes gradient-flow {
    0% {
      background-position: 0% 50%;
    }
    50% {
      background-position: 100% 50%;
    }
    100% {
      background-position: 0% 50%;
    }
  }

  .button-minimized {
    transform: scale(0.9);
    opacity: 0.8;
  }

  /* 弹窗样式 */
  .question-modal {
    position: fixed;
    width: 80vw;
    height: 90vh;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(20px) saturate(180%);
    border-radius: 20px;
    box-shadow:
      0 25px 50px rgba(0, 0, 0, 0.15),
      0 0 0 1px rgba(255, 255, 255, 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.4);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    z-index: 10000;
    transition:
      transform 0.1s ease,
      box-shadow 0.1s ease;
  }

  .glassmorphism {
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.3);
  }

  /* 头部样式 */
  .modal-header {
    padding: 12px 25px;
    background: linear-gradient(135deg, rgba(102, 126, 234, 0.9) 0%, rgba(118, 75, 162, 0.9) 100%);
    backdrop-filter: blur(10px);
    color: white;
    user-select: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  }

  .header-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .title-section {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .ai-icon {
    font-size: 24px;
    animation: float 3s ease-in-out infinite;
  }

  @keyframes float {
    0%,
    100% {
      transform: translateY(0px);
    }
    50% {
      transform: translateY(-5px);
    }
  }

  .status-dot {
    width: 8px;
    height: 8px;
    background: #4ade80;
    border-radius: 50%;
    animation: pulse-dot 2s ease-in-out infinite;
  }

  @keyframes pulse-dot {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  .header-actions {
    display: flex;
    gap: 8px;
  }

  .action-btn {
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.1);
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    backdrop-filter: blur(10px);
  }

  .action-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    transform: scale(1.1);
  }

  .close-btn:hover {
    background: rgba(239, 68, 68, 0.3);
  }

  /* 内容区域 */
  .modal-content {
    flex: 1;
    overflow: auto;
    padding: 0;
  }

  /* 底部装饰 */
  .modal-footer {
    height: 4px;
    background: linear-gradient(90deg, #667eea, #764ba2, #f093fb, #f5576c);
    background-size: 200% 100%;
    animation: wave 3s ease infinite;
  }

  @keyframes wave {
    0% {
      background-position: 0% 50%;
    }
    50% {
      background-position: 100% 50%;
    }
    100% {
      background-position: 0% 50%;
    }
  }

  .footer-wave {
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
    animation: shimmer 2s ease-in-out infinite;
  }

  @keyframes shimmer {
    0%,
    100% {
      transform: translateX(-100%);
    }
    50% {
      transform: translateX(100%);
    }
  }

  /* 动画效果 */
  .modal-slide-enter-active {
    transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .modal-slide-leave-active {
    transition: all 0.2s ease-out;
  }

  .modal-slide-enter-from {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.92);
  }

  .modal-slide-leave-to {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.97);
  }

  /* 响应式设计 */
  @media (max-width: 1024px) {
    .question-modal {
      width: 95vw;
      height: 80vh;
      left: 2.5vw !important;
      top: 10vh !important;
      transform: none !important;
    }

    .float-button {
      width: 60px;
      height: 60px;
      bottom: 20px;
      right: 20px;
    }

    .button-icon {
      font-size: 24px;
    }
  }

  @media (max-width: 600px) {
    .float-question-container {
      right: 10px;
      bottom: 0px;
    }
    .question-modal {
      width: 100vw;
      height: 100vh;
      border-radius: 0;
      left: 0 !important;
      top: 0 !important;
    }

    .float-button {
      width: 40px;
      height: 40px;
      bottom: 16px;
      right: 16px;
    }

    .modal-header {
      padding: 16px 20px;
    }
  }

  /* 拖拽时的视觉反馈 */
  .question-modal:active {
    transition: none;
    cursor: grabbing;
  }

  .drag-handle:active {
    cursor: grabbing;
  }
</style>
