<template>
  <div
    v-if="enabled"
    class="mobile-app-shell"
    :class="{ 'is-keyboard-open': keyboardOpen, 'is-top-bar-hidden': !showTopBar }"
    :style="shellViewportStyle"
  >
    <MobileTopBar v-if="showTopBar" />
    <MobileResourceTabs v-if="showTopSwitcher" />
    <!--
      全站唯一的下拉刷新指示器,位置固定在顶栏正下方。

      为什么不放在内容区里:内容区顶边会随资源 Tab 的有无上下移动 —— 今日页没有 Tab,
      书签/笔记库/云空间/标签有 —— 同一个手势在不同模块弹出的高度就会差一个 Tab。
      挂在这个绝对定位的零高度槽上,所有页面都以顶栏底边为基准,位置完全一致。
    -->
    <div class="mobile-app-shell__refresh-slot">
      <MobilePullRefreshIndicator
        v-if="activePullIndicator"
        :distance="activePullIndicator.pullDistance.value"
        :refreshing="activePullIndicator.refreshing.value"
        :ready="activePullIndicator.ready.value"
        :visible="activePullIndicator.visible.value"
      />
    </div>
    <main class="mobile-app-shell__content">
      <slot />
    </main>
    <div
      v-if="showBottomNav"
      ref="bottomNavElement"
      class="mobile-app-shell__bottom-nav"
      :class="{ 'is-hidden': bottomNavHidden }"
      :aria-hidden="keyboardOpen ? 'true' : undefined"
      :inert="keyboardOpen || undefined"
    >
      <MobileBottomNav />
    </div>
    <MobileGlobalSearchOverlay />
  </div>
  <slot v-else />
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from 'vue';
  import { useRoute, useRouter } from 'vue-router';
  import MobileResourceTabs from '@/components/mobile/MobileResourceTabs.vue';
  import MobileBottomNav from '@/components/mobile/MobileBottomNav.vue';
  import MobileTopBar from '@/components/mobile/MobileTopBar.vue';
  import MobilePullRefreshIndicator from '@/components/mobile/MobilePullRefreshIndicator.vue';
  import { activePullIndicator } from '@/composables/useAndroidPullRefresh';
  import MobileGlobalSearchOverlay from '@/components/globalSearch/MobileGlobalSearchOverlay.vue';
  import { getMobileResourcePath } from '@/config/mobileNavigation';
  import { useMobileNavigationState } from '@/composables/useMobileNavigationState';

  const props = defineProps<{
    enabled: boolean;
    showTopBar: boolean;
    showTopSwitcher: boolean;
    showBottomNav: boolean;
  }>();

  const route = useRoute();
  const router = useRouter();
  const keyboardOpen = ref(false);
  const visibleViewportHeight = ref(0);
  const keyboardObscuredHeight = ref(0);
  const bottomNavElement = ref<HTMLElement | null>(null);
  const bottomNavFullHeight = ref(56);
  const { rememberResourceFromRoute, restoreResourceScroll, saveResourceScroll } = useMobileNavigationState();
  const restoreTimers = new Set<number>();
  const SCROLL_RESTORE_RETRY_DELAYS = [80, 240, 640, 1280] as const;
  const KEYBOARD_OPEN_THRESHOLD = 8;
  const KEYBOARD_CLOSE_THRESHOLD = 4;
  let removeBeforeGuard: (() => void) | undefined;
  let stableViewportHeight = 0;
  let stableViewportWidth = 0;
  let focusFrame = 0;
  let scrollRestoreRequestId = 0;

  const bottomNavVisibleHeight = computed(() =>
    keyboardOpen.value
      ? Math.max(0, bottomNavFullHeight.value - keyboardObscuredHeight.value)
      : bottomNavFullHeight.value,
  );
  const bottomNavHidden = computed(() => keyboardOpen.value && bottomNavVisibleHeight.value <= 1);
  const bottomNavOpacity = computed(() =>
    bottomNavFullHeight.value > 0 ? bottomNavVisibleHeight.value / bottomNavFullHeight.value : 0,
  );
  const shellViewportStyle = computed<CSSProperties>(() => {
    const style: CSSProperties = {};
    if (keyboardOpen.value && visibleViewportHeight.value > 0) {
      style['--mobile-visible-viewport-height'] = `${visibleViewportHeight.value}px`;
    }
    if (props.showBottomNav) {
      style['--mobile-bottom-nav-visible-height'] = `${bottomNavVisibleHeight.value}px`;
      style['--mobile-bottom-nav-opacity'] = String(bottomNavOpacity.value);
    }
    return style;
  });

  function isTextEntryFocused() {
    const activeElement = document.activeElement;
    if (!(activeElement instanceof HTMLElement)) return false;
    return (
      activeElement instanceof HTMLInputElement ||
      activeElement instanceof HTMLTextAreaElement ||
      activeElement.isContentEditable
    );
  }

  function updateKeyboardState() {
    const viewport = window.visualViewport;
    if (!viewport) {
      keyboardOpen.value = false;
      visibleViewportHeight.value = 0;
      keyboardObscuredHeight.value = 0;
      return;
    }
    const viewportHeight = Math.max(0, Math.round(viewport.height));
    const viewportWidth = Math.max(0, Math.round(viewport.width));
    const textEntryFocused = isTextEntryFocused();
    const wasKeyboardOpen = keyboardOpen.value;
    const widthChanged = stableViewportWidth > 0 && Math.abs(stableViewportWidth - viewportWidth) > 80;

    if (widthChanged || stableViewportHeight <= 0 || (!textEntryFocused && !wasKeyboardOpen)) {
      stableViewportWidth = viewportWidth;
      stableViewportHeight = widthChanged
        ? viewportHeight
        : Math.max(stableViewportHeight, viewportHeight, window.innerHeight);
    }

    const baselineHeight = Math.max(stableViewportHeight, viewportHeight, window.innerHeight);
    const obscuredHeight = baselineHeight - viewportHeight;
    const opening = textEntryFocused && obscuredHeight > KEYBOARD_OPEN_THRESHOLD;
    const stillClosing = wasKeyboardOpen && obscuredHeight > KEYBOARD_CLOSE_THRESHOLD;
    keyboardOpen.value = opening || stillClosing;
    visibleViewportHeight.value = keyboardOpen.value ? viewportHeight : 0;
    keyboardObscuredHeight.value = keyboardOpen.value ? Math.max(0, obscuredHeight) : 0;

    if (!keyboardOpen.value && !textEntryFocused) {
      stableViewportWidth = viewportWidth;
      stableViewportHeight = Math.max(viewportHeight, window.innerHeight);
    }
  }

  function scheduleKeyboardStateUpdate() {
    if (focusFrame) window.cancelAnimationFrame(focusFrame);
    focusFrame = window.requestAnimationFrame(() => {
      focusFrame = 0;
      updateKeyboardState();
    });
  }

  function resetKeyboardViewportState() {
    keyboardOpen.value = false;
    visibleViewportHeight.value = 0;
    keyboardObscuredHeight.value = 0;
    if (typeof window === 'undefined') return;
    if (focusFrame) {
      window.cancelAnimationFrame(focusFrame);
      focusFrame = 0;
    }
    const viewport = window.visualViewport;
    stableViewportWidth = Math.max(0, Math.round(viewport?.width || window.innerWidth));
    stableViewportHeight = Math.max(0, Math.round(viewport?.height || 0), window.innerHeight);
  }

  function syncPrimaryRootState() {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.lightNotePrimaryRoot = String(props.enabled && props.showBottomNav);
    document.documentElement.classList.toggle('light-note-keyboard-open', props.enabled && keyboardOpen.value);
  }

  function measureBottomNavHeight() {
    const navElement = bottomNavElement.value?.firstElementChild;
    const measuredHeight =
      (navElement instanceof HTMLElement ? navElement.getBoundingClientRect().height : 0) ||
      bottomNavElement.value?.scrollHeight ||
      0;
    if (measuredHeight > 1 && !keyboardOpen.value) bottomNavFullHeight.value = Math.round(measuredHeight);
  }

  function clearRestoreTimers() {
    scrollRestoreRequestId += 1;
    restoreTimers.forEach((timer) => window.clearTimeout(timer));
    restoreTimers.clear();
  }

  function scheduleScrollRestore(routeName: unknown) {
    clearRestoreTimers();
    const path = rememberResourceFromRoute(routeName);
    if (!path) return;
    const requestId = scrollRestoreRequestId;

    const retry = (retryIndex: number) => {
      if (requestId !== scrollRestoreRequestId || restoreResourceScroll(path)) return;
      const delay = SCROLL_RESTORE_RETRY_DELAYS[retryIndex];
      if (delay === undefined) return;
      const timer = window.setTimeout(() => {
        restoreTimers.delete(timer);
        retry(retryIndex + 1);
      }, delay);
      restoreTimers.add(timer);
    };

    nextTick(() => {
      window.requestAnimationFrame(() => {
        retry(0);
      });
    });
  }

  watch(
    () => route.fullPath,
    () => {
      if (props.enabled) scheduleScrollRestore(route.name);
    },
    { immediate: true },
  );

  watch(
    () => props.enabled,
    (enabled) => {
      // 详情页会临时卸下统一移动壳。若此时输入框仍处于聚焦或 visualViewport 的
      // 键盘收起事件晚到，旧的可视高度不能被下一次笔记库挂载继续复用。
      resetKeyboardViewportState();
      if (!enabled) return;
      nextTick(() => scheduleKeyboardStateUpdate());
    },
    { immediate: true },
  );

  watch(() => [props.enabled, props.showBottomNav, route.fullPath], syncPrimaryRootState, { immediate: true });
  watch(keyboardOpen, syncPrimaryRootState);
  watch(
    () => [props.enabled, props.showBottomNav],
    () => nextTick(measureBottomNavHeight),
    { immediate: true },
  );

  onMounted(() => {
    updateKeyboardState();
    window.visualViewport?.addEventListener('resize', scheduleKeyboardStateUpdate);
    window.visualViewport?.addEventListener('scroll', scheduleKeyboardStateUpdate);
    window.addEventListener('resize', scheduleKeyboardStateUpdate);
    document.addEventListener('focusin', scheduleKeyboardStateUpdate);
    document.addEventListener('focusout', scheduleKeyboardStateUpdate);
    nextTick(measureBottomNavHeight);
    removeBeforeGuard = router.beforeEach((_to, from) => {
      if (props.enabled) saveResourceScroll(getMobileResourcePath(from.name));
    });
  });

  onBeforeUnmount(() => {
    clearRestoreTimers();
    removeBeforeGuard?.();
    if (focusFrame) window.cancelAnimationFrame(focusFrame);
    window.visualViewport?.removeEventListener('resize', scheduleKeyboardStateUpdate);
    window.visualViewport?.removeEventListener('scroll', scheduleKeyboardStateUpdate);
    window.removeEventListener('resize', scheduleKeyboardStateUpdate);
    document.removeEventListener('focusin', scheduleKeyboardStateUpdate);
    document.removeEventListener('focusout', scheduleKeyboardStateUpdate);
    delete document.documentElement.dataset.lightNotePrimaryRoot;
    document.documentElement.classList.remove('light-note-keyboard-open');
  });
</script>

<style scoped lang="less">
  .mobile-app-shell {
    /* 顶栏总高。box-sizing: border-box,1px 分隔线已含在这 56px 内(实测 content 顶边=56)。 */
    --mobile-top-bar-height: 56px;
    --mobile-bottom-nav-height: calc(56px + env(safe-area-inset-bottom));

    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    color: var(--text-color);
    background: var(--surface-page-bg, var(--background-color));
    transition: height 48ms linear;
  }

  .mobile-app-shell.is-keyboard-open {
    height: var(--mobile-visible-viewport-height, 100%);
    max-height: 100%;
    will-change: height;
  }

  .mobile-app-shell.is-top-bar-hidden {
    --mobile-top-bar-height: 0px;
  }

  .mobile-app-shell__refresh-slot {
    position: absolute;
    top: var(--mobile-top-bar-height);
    left: 0;
    right: 0;
    height: 0;
    /*
     * 与资源 Tab 同层但 DOM 在其后 —— 下拉出来时盖在 Tab 上方；
     * 顶栏是 z-index 4，比这里高，所以收起状态(指示器 top: -42px)会被顶栏挡住，
     * 正好等于「藏在上面」，不需要额外的 overflow 裁剪。
     */
    z-index: 3;
    pointer-events: none;
  }

  .mobile-app-shell__content {
    position: relative;
    width: 100%;
    min-height: 0;
    flex: 1 1 auto;
    overflow: hidden;
  }

  .mobile-app-shell__content > :deep(*) {
    width: 100%;
    height: 100%;
    min-height: 0;
  }

  .mobile-app-shell__bottom-nav {
    width: 100%;
    height: var(--mobile-bottom-nav-visible-height, var(--mobile-bottom-nav-height));
    min-height: 0;
    flex: 0 0 var(--mobile-bottom-nav-visible-height, var(--mobile-bottom-nav-height));
    overflow: hidden;
    opacity: var(--mobile-bottom-nav-opacity, 1);
    transition:
      height 48ms linear,
      flex-basis 48ms linear,
      opacity 48ms linear;
    will-change: height, flex-basis, opacity;
  }

  .mobile-app-shell__bottom-nav.is-hidden {
    opacity: 0;
    pointer-events: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .mobile-app-shell,
    .mobile-app-shell__bottom-nav {
      transition: none;
    }
  }
</style>
