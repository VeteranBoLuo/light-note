<template>
  <div class="scroll-prompt">
    <BButton
      class="prompt-icon"
      :class="{ 'is-loading': isLoading }"
      :title="t('ai.scrollToBottom')"
      :aria-label="t('ai.scrollToBottom')"
      @click="$emit('scrollToBottomClick')"
      v-click-log="{ module: 'AI助手', operation: '滚动到底部' }"
    >
      <span class="loading-spinner" aria-hidden="true"></span>
      <SvgIcon class="both-center" :src="icon.ai.scrollDown" size="17" aria-hidden="true" />
    </BButton>
  </div>
</template>
<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';

  const { t } = useI18n();

  defineProps<{
    isLoading: boolean;
  }>();

  defineEmits(['scrollToBottomClick']);
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
    position: relative;
    width: 36px;
    min-width: 36px;
    height: 36px;
    padding: 0;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--text-color) 10%, transparent);
    border-radius: 50%;
    background: var(--card-background);
    color: var(--text-color);
    box-shadow: 0 1px 16px color-mix(in srgb, var(--text-color) 18%, transparent);
  }

  .loading-spinner {
    position: absolute;
    inset: 0;
    border: 2px solid transparent;
    border-radius: 50%;
  }

  .prompt-icon.is-loading .loading-spinner {
    border-top-color: var(--primary-color);
    animation: spin 1s linear infinite;
  }

  .both-center {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
    pointer-events: none;
  }

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  @media (pointer: coarse) {
    .prompt-icon {
      width: 44px;
      min-width: 44px;
      height: 44px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .scroll-prompt,
    .prompt-icon.is-loading .loading-spinner {
      animation: none;
    }
  }
</style>
