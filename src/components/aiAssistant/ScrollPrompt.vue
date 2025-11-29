<template>
  <div class="scroll-prompt" @click="$emit('scrollToBottomClick')">
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
</template>
<script setup lang="ts">
  const props = defineProps<{
    isLoading: boolean;
  }>();

  const emit = defineEmits(['scrollToBottomClick']);
</script>

<style scoped lang="less">
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
    color: #343434;
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
</style>
