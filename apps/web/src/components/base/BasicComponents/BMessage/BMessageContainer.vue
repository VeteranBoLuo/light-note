<template>
  <Teleport to="body">
    <!--
      入场动画用纯 CSS animation,节点增删交回 Vue 核心 patch,不要再包 <TransitionGroup>。
      原实现用 TransitionGroup 做进出场,但在「手动 render() 挂载 + 自引用 Teleport」这套结构下,
      它的离场节点永远摘不掉:消息已从 messageState 移除,DOM 节点却留在屏幕上,而且一个卡住的
      节点会连带后续消息也移除不掉。表现就是提示层层堆积、`duration: 0` 的 loading 永久转圈
      (笔记导出 PDF 就是这条路径)。已验证与 HMR 无关,`:duration`、去掉 v-show、去掉 Teleport 均无效。
      代价是没有离场动画 —— 提示消失不需要动画,而"关不掉"是功能缺陷,优先保证它一定消失。
    -->
    <div class="b-message-container" v-show="messageState.messages.length > 0" aria-live="polite" aria-atomic="false">
      <div
        v-for="msg in messageState.messages"
        :key="msg.key || msg.id"
        :class="['b-message-item', `b-message-${msg.type}`, { 'is-leaving': msg.leaving }]"
        :role="msg.type === 'error' || msg.type === 'warning' ? 'alert' : 'status'"
        @click="dismissOnMobile(msg.id)"
      >
        <span class="b-message-icon" aria-hidden="true">
          <SvgIcon :src="messageIcons[msg.type]" size="17" :class="{ 'b-message-spin': msg.type === 'loading' }" />
        </span>
        <span class="b-message-content">{{ msg.content }}</span>
      </div>
    </div>
  </Teleport>
</template>

<script lang="ts" setup>
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import { messageState, removeMessage } from './messageState';

  const messageIcons = icon.message;

  function dismissOnMobile(id: number) {
    if (window.matchMedia?.('(max-width: 600px)').matches) removeMessage(id);
  }
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
    animation: b-message-in 0.24s cubic-bezier(0.34, 1.56, 0.64, 1);
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

  /* Loading spin animation */
  .b-message-spin {
    animation: b-message-spin 1s linear infinite;
  }

  @keyframes b-message-spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 600px) {
    /* 移动端使用紧凑 Snackbar，并始终避开底部导航和系统安全区。 */
    .b-message-container {
      top: auto;
      bottom: calc(var(--mobile-shell-bottom-height, env(safe-area-inset-bottom)) + 10px);
      width: max-content;
      max-width: calc(100vw - 24px);
      gap: 6px;
    }

    /* 写操作引导和被动浏览提示均占用底部安全区，消息统一叠在提示卡上方。 */
    body:has(.guest-nudge) .b-message-container {
      bottom: calc(var(--mobile-shell-bottom-height, env(safe-area-inset-bottom)) + 166px);
    }

    body:has(.guest-browse-nudge) .b-message-container {
      bottom: calc(var(--mobile-shell-bottom-height, env(safe-area-inset-bottom)) + 78px);
    }

    body:has(.guest-nudge):has(.guest-browse-nudge) .b-message-container {
      bottom: calc(var(--mobile-shell-bottom-height, env(safe-area-inset-bottom)) + 230px);
    }

    /* 原生下载进度浮层也占着底部,消息同样要叠在它上方(否则文字互相压住看不清) */
    body:has(.native-download-progress) .b-message-container {
      bottom: calc(var(--mobile-shell-bottom-height, env(safe-area-inset-bottom)) + 104px);
    }

    .b-message-item {
      width: max-content;
      min-width: min(180px, calc(100vw - 24px));
      max-width: calc(100vw - 24px);
      min-height: 44px;
      gap: 8px;
      padding: 7px 12px 7px 9px;
      border-radius: 12px;
      font-size: 13px;
      cursor: pointer;
      touch-action: manipulation;
    }

    .b-message-item::before {
      inset-block: 8px;
    }

    .b-message-icon {
      width: 26px;
      height: 26px;
      border-radius: 8px;
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

    .b-message-spin {
      animation-duration: 1.8s;
    }
  }
</style>
