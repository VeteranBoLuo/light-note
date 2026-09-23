<template>
  <transition name="gn">
    <div
      v-if="nudgeVisible"
      class="guest-nudge"
      role="status"
      @mouseenter="pauseNudgeTimer"
      @mouseleave="resumeNudgeTimer"
    >
      <BButton class="gn-close" :aria-label="t('common.close')" @click="hideGuestNudge">
        <SvgIcon :src="icon.common.close" size="16" aria-hidden="true" />
      </BButton>
      <div class="gn-main">
        <span class="gn-icon">
          <SvgIcon :src="icon.growth.lock" size="18" aria-hidden="true" />
        </span>
        <div class="gn-text">
          <div class="gn-title">{{ t('guest.previewTitle') }}</div>
          <div class="gn-desc">{{ nudgeContent || t('guest.previewContent') }}</div>
        </div>
      </div>
      <BButton class="gn-cta" type="primary" @click="register">{{ t('guest.registerNow') }}</BButton>
    </div>
  </transition>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import { bookmarkStore } from '@/store';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import {
    nudgeVisible,
    nudgeContent,
    nudgeSource,
    hideGuestNudge,
    pauseNudgeTimer,
    resumeNudgeTimer,
  } from '@/composables/guestNudge';

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
    right: var(--ui-space-20, 20px);
    bottom: var(--ui-space-20, 20px);
    z-index: 400;
    width: var(--ui-layout-300, 300px);
    max-width: calc(100vw - 32px);
    padding: var(--ui-space-15, 15px) var(--ui-space-16, 16px);
    border-radius: 14px;
    background: var(--card-background, #fff);
    border: 1px solid var(--card-border-color);
    box-shadow: 0 12px 40px -12px rgba(20, 24, 50, 0.35);
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-12, 12px);
  }
  .gn-close {
    position: absolute;
    top: var(--ui-space-8, 8px);
    right: var(--ui-space-8, 8px);
    width: var(--ui-control-30, 30px);
    min-width: var(--ui-control-30, 30px);
    height: var(--ui-control-30, 30px);
    padding: 0;
    background: transparent;
    border: none;
    color: var(--desc-color);
    touch-action: manipulation;
  }
  .gn-close:hover {
    background: var(--menu-item-h-bg-color);
  }
  .gn-main {
    display: flex;
    gap: var(--ui-space-11, 11px);
    align-items: flex-start;
    padding-right: var(--ui-space-22, 22px);
  }
  .gn-icon {
    display: inline-flex;
    width: var(--ui-layout-34, 34px);
    height: var(--ui-layout-34, 34px);
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    color: var(--primary-color);
    background: var(--primary-btn-bg-color);
    flex-shrink: 0;
  }
  .gn-text {
    min-width: 0;
  }
  .gn-title {
    font-size: var(--ui-font-14, 14px);
    font-weight: 700;
    color: var(--text-color);
    margin-bottom: var(--ui-space-4, 4px);
  }
  .gn-desc {
    font-size: var(--ui-font-12, 12px);
    line-height: 1.6;
    color: var(--desc-color);
  }
  .gn-cta {
    align-self: stretch;
    height: var(--ui-control-34, 34px);
    width: 100%;
    border-radius: 9px;
    font-size: var(--ui-font-13, 13px);
    font-weight: 600;
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
      left: 12px;
      right: 12px;
      bottom: calc(var(--mobile-shell-bottom-height, 0px) + 12px);
      width: auto;
      max-width: none;
      padding: 14px;
      border-radius: 16px;
      gap: 11px;
      box-shadow: 0 16px 36px -18px rgba(20, 24, 50, 0.38);
    }
    .gn-main {
      padding-right: 38px;
    }
    .gn-close {
      top: 3px;
      right: 3px;
      width: 44px;
      min-width: 44px;
      height: 44px;
    }
    .gn-title {
      font-size: 15px;
    }
    .gn-desc {
      font-size: 13px;
      line-height: 1.5;
    }
    .gn-cta {
      height: 38px;
    }
  }
</style>
