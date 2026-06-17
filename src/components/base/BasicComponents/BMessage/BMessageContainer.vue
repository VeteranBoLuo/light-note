<template>
  <Teleport to="body">
    <div class="b-message-container" v-show="messageState.messages.length > 0">
      <TransitionGroup name="b-message">
        <div
          v-for="msg in messageState.messages"
          :key="msg.key || msg.id"
          :class="['b-message-item', `b-message-${msg.type}`]"
        >
          <span class="b-message-icon" v-html="icons[msg.type]"></span>
          <span class="b-message-content">{{ msg.content }}</span>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script lang="ts" setup>
  import { messageState } from './messageState';

  const icons: Record<string, string> = {
    success: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    error: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    warning: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    info: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
    loading: `<svg class="b-message-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>`,
  };
</script>

<style lang="less">
  .b-message-container {
    position: fixed;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 999999;
    display: flex;
    flex-direction: column;
    align-items: center;
    pointer-events: none;
    max-width: 90vw;
  }

  .b-message-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 16px;
    border-radius: 8px;
    background: var(--background-color);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12), 0 0 1px rgba(0, 0, 0, 0.08);
    color: var(--text-color);
    font-size: 14px;
    line-height: 1.5;
    margin-bottom: 8px;
    pointer-events: auto;
    border: 1px solid var(--card-border-color);
  }

  .b-message-icon {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    line-height: 0;
  }

  .b-message-success .b-message-icon {
    color: #52c41a;
  }

  .b-message-error .b-message-icon {
    color: #ff4d4f;
  }

  .b-message-warning .b-message-icon {
    color: #faad14;
  }

  .b-message-info .b-message-icon {
    color: #615ced;
  }

  .b-message-loading .b-message-icon {
    color: #615ced;
  }

  .b-message-content {
    word-break: break-word;
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
</style>
