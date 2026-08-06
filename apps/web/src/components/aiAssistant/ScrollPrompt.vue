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
  /* 零占位锚点：只浮动圆形按钮，不生成整行空白或背景条。 */
  .scroll-prompt {
    position: relative;
    width: 0;
    height: 0;
    min-height: 0;
    flex: 0 0 0;
    align-self: flex-end;
    margin-right: 12px;
    pointer-events: none;
    animation: slideInUp 0.3s ease;
  }

  .prompt-icon {
    position: absolute;
    bottom: 12px;
    right: 0;
    width: 36px;
    min-width: 36px;
    height: 36px;
    padding: 0;
    overflow: hidden;
    border: 0;
    border-radius: 50%;
    background: var(--card-background);
    color: var(--text-color);
    box-shadow: 0 4px 14px rgba(97, 92, 237, 0.18);
    pointer-events: auto;
  }

  .loading-spinner {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    border: 0;
    border-radius: 50%;
    transform-origin: center;
    pointer-events: none;
  }

  .prompt-icon.is-loading .loading-spinner {
    border: 2px solid rgba(97, 92, 237, 0.14);
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
