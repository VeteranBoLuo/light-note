<template>
  <transition name="nudge-slide">
    <div v-if="visible" class="guest-browse-nudge">
      <span class="guest-browse-nudge__text">{{ $t('home.guestNudgeText') }}</span>
      <button class="guest-browse-nudge__cta" @click="register">{{ $t('home.freeRegister') }}</button>
      <button class="guest-browse-nudge__close" :aria-label="$t('common.close')" @click="dismiss">×</button>
    </div>
  </transition>
</template>

<script setup lang="ts">
  import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue';
  import { bookmarkStore, useUserStore } from '@/store';

  // 游客被动浏览软触发:停留够久或滚动够多后,一次会话弹一次注册软邀请,把「看完就走」的游客接进转化闭环
  const SESSION_KEY = 'ln_browse_nudge';
  const DWELL_MS = 18000;
  const SCROLL_THRESHOLD = 800;

  const user = useUserStore();
  const bookmark = bookmarkStore();
  const show = ref(false);
  const isGuest = computed(() => !user.visitorWorkspace && (!user.id || user.role === 'visitor'));
  const visible = computed(() => show.value && isGuest.value);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let bindScrollTimer: ReturnType<typeof setTimeout> | null = null;
  let scrollEl: HTMLElement | null = null;

  function seen() {
    try {
      return sessionStorage.getItem(SESSION_KEY) === '1';
    } catch {
      return false;
    }
  }
  function mark() {
    try {
      sessionStorage.setItem(SESSION_KEY, '1');
    } catch {
      /* 隐私模式忽略 */
    }
  }

  function trigger() {
    if (show.value || !isGuest.value || seen()) return;
    cleanup();
    show.value = true;
  }
  function onScroll() {
    if (scrollEl && scrollEl.scrollTop > SCROLL_THRESHOLD) trigger();
  }
  function cleanup() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (bindScrollTimer) {
      clearTimeout(bindScrollTimer);
      bindScrollTimer = null;
    }
    if (scrollEl) scrollEl.removeEventListener('scroll', onScroll);
    scrollEl = null;
  }
  function setupTriggers() {
    cleanup();
    if (!isGuest.value || seen()) return;
    timer = setTimeout(trigger, DWELL_MS);
    // ViewPanel 渲染后再拿滚动容器
    bindScrollTimer = setTimeout(() => {
      bindScrollTimer = null;
      if (!isGuest.value || seen()) return;
      scrollEl = document.getElementById('view-panel');
      scrollEl?.addEventListener('scroll', onScroll, { passive: true });
    }, 0);
  }
  function dismiss() {
    show.value = false;
    mark();
  }
  function register() {
    mark();
    show.value = false;
    // 打开注册弹窗(openAuthModal 内部记 signup_open,source=browse_nudge)
    bookmark.openAuthModal('注册', 'browse_nudge');
  }

  watch(isGuest, (guest) => {
    show.value = false;
    if (guest) setupTriggers();
    else cleanup();
  });

  onMounted(setupTriggers);
  onBeforeUnmount(cleanup);
</script>

<style lang="less" scoped>
  .guest-browse-nudge {
    position: fixed;
    left: 50%;
    bottom: 24px;
    transform: translateX(-50%);
    z-index: 400;
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: calc(100vw - 32px);
    padding: 10px 12px 10px 18px;
    border-radius: 999px;
    background: var(--background-color);
    color: var(--text-color);
    border: 1px solid var(--card-border-color);
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18);
  }
  .guest-browse-nudge__text {
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .guest-browse-nudge__cta {
    flex: 0 0 auto;
    border: 0;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    color: #fff;
    background: #615ced;
    padding: 6px 14px;
    border-radius: 999px;
    transition: opacity 0.2s;
  }
  .guest-browse-nudge__cta:hover {
    opacity: 0.9;
  }
  .guest-browse-nudge__close {
    flex: 0 0 auto;
    border: 0;
    background: transparent;
    cursor: pointer;
    color: var(--text-color);
    opacity: 0.5;
    font-size: 18px;
    line-height: 1;
  }
  .guest-browse-nudge__close:hover {
    opacity: 0.85;
  }
  .nudge-slide-enter-active,
  .nudge-slide-leave-active {
    transition:
      transform 0.3s ease,
      opacity 0.3s ease;
  }
  .nudge-slide-enter-from,
  .nudge-slide-leave-to {
    transform: translate(-50%, 140%);
    opacity: 0;
  }
</style>
