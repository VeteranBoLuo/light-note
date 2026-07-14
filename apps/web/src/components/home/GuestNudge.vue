<template>
  <transition name="gn">
    <div
      v-if="nudgeVisible"
      class="guest-nudge"
      role="status"
      @mouseenter="pauseNudgeTimer"
      @mouseleave="resumeNudgeTimer"
    >
      <button class="gn-close" aria-label="关闭" @click="hideGuestNudge">×</button>
      <div class="gn-main">
        <span class="gn-icon">🔒</span>
        <div class="gn-text">
          <div class="gn-title">{{ t('guest.previewTitle') }}</div>
          <div class="gn-desc">{{ nudgeContent || t('guest.previewContent') }}</div>
        </div>
      </div>
      <button class="gn-cta" @click="register">{{ t('guest.registerNow') }}</button>
    </div>
  </transition>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import { bookmarkStore } from '@/store';
  import { nudgeVisible, nudgeContent, nudgeSource, hideGuestNudge, pauseNudgeTimer, resumeNudgeTimer } from '@/composables/guestNudge';

  const { t } = useI18n();
  const bookmark = bookmarkStore();

  function register() {
    // 打开注册弹窗(openAuthModal 内部记 signup_open);用 nudgeSource 保持与撞墙场景同一归因来源
    bookmark.openAuthModal('注册', nudgeSource.value);
    hideGuestNudge();
  }
</script>

<style scoped lang="less">
  .guest-nudge {
    position: fixed;
    right: 20px;
    bottom: 20px;
    z-index: 3000;
    width: 300px;
    max-width: calc(100vw - 32px);
    padding: 14px 16px;
    border-radius: 14px;
    background: var(--card-background, #fff);
    border: 1px solid var(--card-border-color);
    box-shadow: 0 12px 40px -12px rgba(20, 24, 50, 0.35);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .gn-close {
    position: absolute;
    top: 6px;
    right: 10px;
    background: transparent;
    border: none;
    font-size: 18px;
    line-height: 1;
    color: var(--desc-color);
    cursor: pointer;
  }
  .gn-main {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }
  .gn-icon {
    font-size: 20px;
    line-height: 1.35;
    flex-shrink: 0;
  }
  .gn-title {
    font-size: 14px;
    font-weight: 700;
    color: var(--text-color);
    margin-bottom: 4px;
  }
  .gn-desc {
    font-size: 12px;
    line-height: 1.6;
    color: var(--desc-color);
  }
  .gn-cta {
    align-self: stretch;
    height: 34px;
    border: none;
    border-radius: 9px;
    background: var(--primary-color);
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .gn-cta:hover {
    opacity: 0.9;
  }
  /* 右下角滑入滑出 */
  .gn-enter-active,
  .gn-leave-active {
    transition:
      transform 0.28s cubic-bezier(0.22, 1, 0.36, 1),
      opacity 0.28s;
  }
  .gn-enter-from,
  .gn-leave-to {
    transform: translateY(16px);
    opacity: 0;
  }
  @media (max-width: 560px) {
    .guest-nudge {
      right: 12px;
      bottom: 12px;
      width: 280px;
      max-width: calc(100vw - 24px);
    }
  }
</style>
