<template>
  <Teleport to="body">
    <div
      class="b-message-container"
      v-show="messageState.messages.length > 0"
      aria-live="polite"
      aria-atomic="false"
    >
      <TransitionGroup name="b-message">
        <div
          v-for="msg in messageState.messages"
          :key="msg.key || msg.id"
          :class="['b-message-item', `b-message-${msg.type}`]"
          :role="msg.type === 'error' || msg.type === 'warning' ? 'alert' : 'status'"
        >
          <span class="b-message-icon" aria-hidden="true">
            <SvgIcon
              :src="messageIcons[msg.type]"
              size="17"
              :class="{ 'b-message-spin': msg.type === 'loading' }"
            />
          </span>
          <span class="b-message-content">{{ msg.content }}</span>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script lang="ts" setup>
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import { messageState } from './messageState';

  const messageIcons = icon.message;
</script>

<style lang="less">
  .b-message-container {
    position: fixed;
    top: max(14px, env(safe-area-inset-top));
    left: 50%;
    transform: translateX(-50%);
    z-index: 1200;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    pointer-events: none;
    width: max-content;
    max-width: min(520px, calc(100vw - 24px));
  }

  .b-message-item {
    --message-accent: var(--message-info-color, #615ced);
    position: relative;
    width: max-content;
    min-width: min(280px, calc(100vw - 24px));
    max-width: min(520px, calc(100vw - 24px));
    min-height: 48px;
    overflow: hidden;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 14px 9px 11px;
    border: 1px solid color-mix(in srgb, var(--message-accent) 18%, var(--card-border-color));
    border-radius: 12px;
    background: color-mix(
      in srgb,
      var(--message-accent) 4%,
      var(--message-surface-bg, var(--menu-body-bg-color, #ffffff))
    );
    box-shadow:
      0 18px 48px -24px var(--message-shadow-color),
      0 5px 16px -10px var(--message-shadow-color);
    -webkit-backdrop-filter: blur(14px);
    backdrop-filter: blur(14px);
    color: var(--text-color);
    font-size: 13.5px;
    line-height: 1.45;
    pointer-events: auto;
  }

  .b-message-item::before {
    content: '';
    position: absolute;
    inset: 7px auto 7px 0;
    width: 3px;
    border-radius: 0 999px 999px 0;
    background: var(--message-accent);
  }

  .b-message-icon {
    width: 30px;
    height: 30px;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 9px;
    color: var(--message-accent);
    background: color-mix(in srgb, var(--message-accent) 12%, transparent);
    line-height: 0;
  }

  .b-message-success {
    --message-accent: var(--message-success-color, #22a447);
  }

  .b-message-error {
    --message-accent: var(--message-error-color, #df3f46);
  }

  .b-message-warning {
    --message-accent: var(--message-warning-color, #d88900);
  }

  .b-message-info,
  .b-message-loading {
    --message-accent: var(--message-info-color, #615ced);
  }

  .b-message-content {
    min-width: 0;
    max-width: 100%;
    word-break: break-word;
    font-weight: 560;
  }

  /* Enter / leave animations */
  .b-message-enter-active {
    transition: all 0.24s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .b-message-leave-active {
    transition: all 0.2s ease-out;
  }

  .b-message-enter-from {
    opacity: 0;
    transform: translateY(-20px) scale(0.96);
  }

  .b-message-leave-to {
    opacity: 0;
    transform: translateY(-10px) scale(0.97);
  }

  /* Loading spin animation */
  .b-message-spin {
    animation: b-message-spin 1s linear infinite;
  }

  @keyframes b-message-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  @media (max-width: 600px) {
    .b-message-container {
      top: max(10px, env(safe-area-inset-top));
      width: calc(100vw - 20px);
      max-width: none;
    }

    .b-message-item {
      width: 100%;
      min-width: 0;
      max-width: none;
      padding-right: 12px;
      font-size: 13px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .b-message-enter-active,
    .b-message-leave-active {
      transition: opacity 0.15s ease;
    }

    .b-message-spin {
      animation-duration: 1.8s;
    }
  }
</style>
