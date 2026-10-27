<template>
  <Teleport to="body">
    <!-- 节点增删由 Vue patch 负责，纯 CSS 动画配合 messageState 的延迟移除，避免 Teleport 过渡残留。 -->
    <div class="b-message-container" v-show="messageState.messages.length > 0" aria-live="polite" aria-atomic="false">
      <div
        v-for="msg in messageState.messages"
        :key="msg.key || msg.id"
        :class="['b-message-item', `b-message-${msg.type}`, { 'is-leaving': msg.leaving }]"
        :role="msg.type === 'error' || msg.type === 'warning' ? 'alert' : 'status'"
        @click="dismissOnMobile(msg.id)"
      >
        <div v-if="msg.type === 'loading'" class="b-message-loading-content">
          <BLoading inline loading :title="msg.content" />
        </div>
        <template v-else>
          <span class="b-message-icon" aria-hidden="true">
            <SvgIcon :src="messageIcons[msg.type]" size="17" />
          </span>
          <span class="b-message-content">{{ msg.content }}</span>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<script lang="ts" setup>
  import BLoading from '../BLoading.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import { messageState, removeMessage } from './messageState';
  import { onBeforeUnmount, onMounted } from 'vue';

  const messageIcons = icon.message;
  const overlayBodyClasses = {
    '.guest-nudge': 'light-note-has-guest-nudge',
    '.guest-browse-nudge': 'light-note-has-guest-browse-nudge',
    '.native-download-progress': 'light-note-has-native-download-progress',
  } as const;
  let overlayObserver: MutationObserver | null = null;

  function syncOverlayBodyClasses() {
    for (const [selector, className] of Object.entries(overlayBodyClasses)) {
      document.body.classList.toggle(className, Boolean(document.body.querySelector(selector)));
    }
  }

  onMounted(() => {
    syncOverlayBodyClasses();
    overlayObserver = new MutationObserver(syncOverlayBodyClasses);
    overlayObserver.observe(document.body, { childList: true, subtree: true });
  });

  onBeforeUnmount(() => {
    overlayObserver?.disconnect();
    overlayObserver = null;
    Object.values(overlayBodyClasses).forEach((className) => document.body.classList.remove(className));
  });

  function dismissOnMobile(id: number) {
    if (window.matchMedia?.('(max-width: 600px)').matches) removeMessage(id);
  }
</script>

<style lang="less">
  .b-message-container {
    position: fixed;
    top: max(var(--ui-space-14, 14px), env(safe-area-inset-top));
    left: 50%;
    transform: translateX(-50%);
    z-index: 1200;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    pointer-events: none;
    width: max-content;
    max-width: min(var(--ui-layout-520, 520px), calc(100vw - var(--ui-space-24, 24px)));
  }

  .b-message-item {
    --message-accent: var(--message-info-color, #615ced);
    position: relative;
    width: max-content;
    max-width: min(var(--ui-layout-520, 520px), calc(100vw - var(--ui-space-24, 24px)));
    min-height: var(--ui-control-44, 44px);
    overflow: hidden;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: var(--ui-space-9, 9px);
    padding: var(--ui-space-10, 10px) var(--ui-space-12, 12px);
    border: 1px solid var(--workspace-border);
    border-radius: 10px;
    background: var(--message-surface-bg);
    box-shadow: 0 var(--ui-space-4, 4px) var(--ui-space-12, 12px) calc(-1 * var(--ui-space-4, 4px))
      var(--message-shadow-color);
    color: var(--text-color);
    font-size: var(--ui-font-13_5, 13.5px);
    line-height: 1.45;
    pointer-events: auto;
    animation: b-message-in 0.24s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .b-message-icon {
    width: var(--ui-layout-17, 17px);
    height: calc(1.45 * var(--ui-font-13_5, 13.5px));
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    align-self: flex-start;
    color: var(--message-accent);
    line-height: 0;
  }

  .b-message-loading-content {
    display: flex;
    min-width: 0;
  }

  .b-message-loading-content .b-loading-inline {
    min-height: 0;
    color: inherit;
    font: inherit;
  }

  .b-message-loading-content .b-loading-inline__indicator {
    flex-shrink: 0;
  }

  .b-message-loading-content .b-loading-inline__title {
    min-width: 0;
    overflow-wrap: anywhere;
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
    white-space: pre-line;
    font-weight: 400;
  }

  /* 进出场都用纯 CSS animation:节点一插入就播入场,标记 is-leaving 就播离场,不依赖 Vue 过渡钩子。
     离场期间节点仍在 messageState 里(见 messageState.ts 的 LEAVE_ANIMATION_MS),动画放完才被摘除。 */
  @keyframes b-message-in {
    from {
      opacity: 0;
      transform: translateY(-20px) scale(0.96);
    }
  }

  @keyframes b-message-in-from-bottom {
    from {
      opacity: 0;
      transform: translateY(20px) scale(0.96);
    }
  }

  @keyframes b-message-out {
    to {
      opacity: 0;
      transform: translateY(-10px) scale(0.97);
    }
  }

  @keyframes b-message-out-to-bottom {
    to {
      opacity: 0;
      transform: translateY(10px) scale(0.97);
    }
  }

  @keyframes b-message-fade-in {
    from {
      opacity: 0;
    }
  }

  @keyframes b-message-fade-out {
    to {
      opacity: 0;
    }
  }

  /* forwards 保住终态,避免动画结束到节点摘除之间闪回不透明 */
  .b-message-item.is-leaving {
    animation: b-message-out 0.2s ease-out forwards;
    pointer-events: none;
  }

  @media (max-width: 600px) {
    /* 移动端使用紧凑 Snackbar，并始终避开底部导航和系统安全区。 */
    .b-message-container {
      top: auto;
      bottom: calc(var(--mobile-shell-bottom-height, env(safe-area-inset-bottom)) + 10px);
      width: max-content;
      max-width: calc(100vw - var(--ui-space-24, 24px));
      gap: var(--ui-space-6, 6px);
    }

    /* 写操作引导和被动浏览提示均占用底部安全区，消息统一叠在提示卡上方。 */
    body.light-note-has-guest-nudge .b-message-container {
      bottom: calc(var(--mobile-shell-bottom-height, env(safe-area-inset-bottom)) + 166px);
    }

    body.light-note-has-guest-browse-nudge .b-message-container {
      bottom: calc(var(--mobile-shell-bottom-height, env(safe-area-inset-bottom)) + 78px);
    }

    body.light-note-has-guest-nudge.light-note-has-guest-browse-nudge .b-message-container {
      bottom: calc(var(--mobile-shell-bottom-height, env(safe-area-inset-bottom)) + 230px);
    }

    /* 原生下载进度浮层也占着底部,消息同样要叠在它上方(否则文字互相压住看不清) */
    body.light-note-has-native-download-progress .b-message-container {
      bottom: calc(var(--mobile-shell-bottom-height, env(safe-area-inset-bottom)) + 104px);
    }

    .b-message-item {
      width: max-content;
      max-width: calc(100vw - var(--ui-space-24, 24px));
      min-height: var(--ui-control-44, 44px);
      gap: var(--ui-space-8, 8px);
      padding: var(--ui-space-10, 10px) var(--ui-space-12, 12px);
      font-size: var(--ui-font-13, 13px);
      cursor: pointer;
      touch-action: manipulation;
    }

    .b-message-icon {
      height: calc(1.45 * var(--ui-font-13, 13px));
    }

    /* 只保留最新两条，避免连续操作时遮挡大块内容。 */
    .b-message-item:nth-last-child(n + 3) {
      display: none;
    }

    /* 底部弹出:进出场都改为从下方滑入/滑出 */
    .b-message-item {
      animation-name: b-message-in-from-bottom;
    }

    .b-message-item.is-leaving {
      animation-name: b-message-out-to-bottom;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .b-message-item {
      animation: b-message-fade-in 0.15s ease;
    }

    .b-message-item.is-leaving {
      animation: b-message-fade-out 0.15s ease forwards;
    }
  }
</style>
