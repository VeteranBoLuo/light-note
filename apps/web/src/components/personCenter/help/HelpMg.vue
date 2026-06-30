<template>
  <div v-if="bookmark.isMobile" class="help-phone-container">
    <!-- 拖拽手柄区域 -->
    <div class="modal-header">
      <div class="header-content">
        <div class="title-section">
          <div class="ai-icon">🤖</div>
          <h3>{{ t('ai.title') }}</h3>
          <span class="status-dot"></span>
        </div>
        <div class="flex-justify-center-gap">
          <!-- 最小化按钮改为清空对话 -->
          <button class="action-btn minimize" @click="clearConversation" title="新的对话">
            <span>➕</span>
          </button>
          <button class="action-btn close-btn" @click="$router.back()" title="关闭">
            <span>❌</span>
          </button>
        </div>
      </div>
    </div>
    <!-- 内容区域 -->
    <ChatContainer class="help-container-body" ref="aiAssistantRef" />
    <!-- 底部装饰 -->
    <div class="modal-footer">
      <div class="footer-wave"></div>
    </div>
  </div>

  <Help v-else />
</template>

<script lang="ts" setup>
  import { bookmarkStore } from '@/store';
  import { defineAsyncComponent, ref } from 'vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { useI18n } from 'vue-i18n';

  const Help = defineAsyncComponent(() => import('@/components/personCenter/help/Help.vue'));
  const ChatContainer = defineAsyncComponent(() => import('@/view/aiAssistant/ChatContainer.vue'));

  const bookmark = bookmarkStore();
  const { t } = useI18n();
  const aiAssistantRef = ref(null);

  // 新增：清空对话方法
  const clearConversation = () => {
    // 调用AiAssistant组件的清空方法
    if (aiAssistantRef.value && aiAssistantRef.value.clearHistory) {
      aiAssistantRef.value.clearHistory();
      message.success(t('ai.newChart'));
    }
  };
</script>

<style lang="less" scoped>
  .help-phone-container {
    position: fixed;
    top: 0 !important;
  }
  .help-container-body {
    position: fixed;
    top: 60px;
  }
  .glassmorphism {
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.3);
  }

  /* 头部样式 */
  .modal-header {
    height: 55px;
    background: linear-gradient(135deg, rgba(102, 126, 234, 0.9) 0%, rgba(118, 75, 162, 0.9) 100%);
    backdrop-filter: blur(10px);
    color: white;
    user-select: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  }

  .header-content {
    padding: 0 10px;
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
</style>
