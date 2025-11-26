<template>
  <div v-if="!isClosed" class="float-question-container">
    <!-- 问答弹窗 -->
    <transition name="modal-slide">
      <div v-if="isOpen" v-show="!isMinimized" class="question-modal glassmorphism" @click.stop>
        <!-- 拖拽手柄区域 -->
        <div class="modal-header drag-handle">
          <div class="header-content">
            <div class="title-section">
              <div class="ai-icon">🤖</div>
              <h3>轻笺智能助手</h3>
              <span class="status-dot"></span>
            </div>
            <div class="header-actions">
              <button class="action-btn minimize" @click="minimize" title="最小化">
                <span>−</span>
              </button>
              <button class="action-btn close-btn" @click="closeModal" title="关闭">
                <span>×</span>
              </button>
            </div>
          </div>
        </div>

        <!-- 内容区域 -->
        <div class="modal-content">
          <AiAssistant />
        </div>

        <!-- 底部装饰 -->
        <div class="modal-footer">
          <div class="footer-wave"></div>
        </div>
      </div>
    </transition>

    <!-- 悬浮按钮 -->
    <div
      class="float-button"
      :class="{
        'button-active': isOpen,
        'button-minimized': isMinimized,
      }"
      @click="toggleModal"
      @mouseenter="startButtonPulse"
      @mouseleave="stopButtonPulse"
    >
      <div class="button-inner">
        <span class="button-icon">💬</span>
        <div class="pulse-ring"></div>
        <div class="sparkle-container">
          <div class="sparkle" v-for="i in 3" :key="i" :style="sparkleStyle(i)"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ref, onMounted, onUnmounted, computed } from 'vue';
  import AiAssistant from '@/view/aiAssistant/AiAssistant.vue';

  // 状态管理
  const isOpen = ref(false);
  const isClosed = ref(false);
  const isMinimized = ref(true);

  // 悬浮按钮动画状态
  const isPulsing = ref(false);

  // 火花样式计算
  const sparkleStyle = (index: number) => ({
    animationDelay: `${index * 0.3}s`,
    left: `${20 + index * 20}%`,
  });

  // 切换弹窗显示
  const toggleModal = () => {
    if (isMinimized.value) {
      isMinimized.value = false;
      isOpen.value = true;
    } else {
      isOpen.value = !isOpen.value;
    }
  };

  // 最小化
  const minimize = () => {
    isMinimized.value = true;
  };

  // 关闭弹窗
  const closeModal = () => {
    isOpen.value = false;
    isMinimized.value = true;
  };

  // 关闭整个组件
  const closeComponent = () => {
    isClosed.value = true;
  };

  // 按钮动画控制
  const startButtonPulse = () => {
    isPulsing.value = true;
  };

  const stopButtonPulse = () => {
    isPulsing.value = false;
  };

  // 键盘事件处理
  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && isOpen.value) {
      minimize();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'm') {
      e.preventDefault();
      toggleModal();
    }
  };

  // 生命周期
  onMounted(() => {
    document.addEventListener('keydown', handleKeydown);
  });

  onUnmounted(() => {
    document.removeEventListener('keydown', handleKeydown);
  });
</script>

<style scoped>
  .float-question-container {
    position: fixed;
    z-index: 99999;
    bottom: 40px;
    right: 40px;
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
    font-size: 28px;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
    transition: transform 0.3s ease;
  }

  .float-button:hover .button-icon {
    transform: scale(1.1);
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

  /* 按钮状态 */
  .button-active {
    background: linear-gradient(135deg, #f093fb 0%, #f5576c 50%, #4facfe 100%);
    transform: scale(1.1);
    animation: glow 2s ease-in-out infinite alternate;
  }

  @keyframes glow {
    from {
      box-shadow:
        0 10px 40px rgba(245, 87, 108, 0.3),
        inset 0 1px 0 rgba(255, 255, 255, 0.2);
    }
    to {
      box-shadow:
        0 15px 50px rgba(245, 87, 108, 0.5),
        0 0 40px rgba(255, 255, 255, 0.3);
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
    padding: 20px 25px;
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
  .modal-slide-enter-active,
  .modal-slide-leave-active {
    transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  }

  .modal-slide-enter-from {
    opacity: 0;
  }

  .modal-slide-leave-to {
    opacity: 0;
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
