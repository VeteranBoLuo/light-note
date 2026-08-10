<template>
  <div
    v-if="enabled"
    class="mobile-app-shell"
    :class="{ 'is-keyboard-open': keyboardOpen }"
    :style="shellViewportStyle"
  >
    <MobileTopBar />
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
    <MobileBottomNav v-if="showBottomNav && !keyboardOpen" />
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
    showTopSwitcher: boolean;
    showBottomNav: boolean;
  }>();

  const route = useRoute();
  const router = useRouter();
  const keyboardOpen = ref(false);
  const visibleViewportHeight = ref(0);
  const { rememberResourceFromRoute, restoreResourceScroll, saveResourceScroll } = useMobileNavigationState();
  const restoreTimers = new Set<number>();
  let removeBeforeGuard: (() => void) | undefined;
  let stableViewportHeight = 0;
  let stableViewportWidth = 0;
  let focusFrame = 0;

  const shellViewportStyle = computed<CSSProperties>(() =>
    keyboardOpen.value && visibleViewportHeight.value > 0
      ? ({ '--mobile-visible-viewport-height': `${visibleViewportHeight.value}px` } as CSSProperties)
      : {},
  );

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
      return;
    }
    const viewportHeight = Math.max(0, Math.round(viewport.height));
    const viewportWidth = Math.max(0, Math.round(viewport.width));
    const textEntryFocused = isTextEntryFocused();
    const widthChanged = stableViewportWidth > 0 && Math.abs(stableViewportWidth - viewportWidth) > 80;

    if (!textEntryFocused || widthChanged || stableViewportHeight <= 0) {
      stableViewportWidth = viewportWidth;
      stableViewportHeight = widthChanged
        ? viewportHeight
        : Math.max(stableViewportHeight, viewportHeight, window.innerHeight);
    }

    const baselineHeight = Math.max(stableViewportHeight, viewportHeight, window.innerHeight);
    const obscuredHeight = baselineHeight - viewportHeight;
    keyboardOpen.value =
      textEntryFocused && (obscuredHeight > 120 || (baselineHeight > 0 && viewportHeight / baselineHeight < 0.75));
    visibleViewportHeight.value = keyboardOpen.value ? viewportHeight : 0;
  }

  function scheduleKeyboardStateUpdate() {
    if (focusFrame) window.cancelAnimationFrame(focusFrame);
    focusFrame = window.requestAnimationFrame(() => {
      focusFrame = 0;
      updateKeyboardState();
    });
  }

  function syncPrimaryRootState() {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.lightNotePrimaryRoot = String(props.enabled && props.showBottomNav);
  }

  function clearRestoreTimers() {
    restoreTimers.forEach((timer) => window.clearTimeout(timer));
    restoreTimers.clear();
  }

  function scheduleScrollRestore(routeName: unknown) {
    clearRestoreTimers();
    const path = rememberResourceFromRoute(routeName);
    if (!path) return;
    nextTick(() => {
      window.requestAnimationFrame(() => {
        if (restoreResourceScroll(path)) return;
        const timer = window.setTimeout(() => {
          restoreResourceScroll(path);
          restoreTimers.delete(timer);
        }, 80);
        restoreTimers.add(timer);
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

  watch(() => [props.enabled, props.showBottomNav, route.fullPath], syncPrimaryRootState, { immediate: true });

  onMounted(() => {
    updateKeyboardState();
    window.visualViewport?.addEventListener('resize', updateKeyboardState);
    window.addEventListener('resize', updateKeyboardState);
    document.addEventListener('focusin', scheduleKeyboardStateUpdate);
    document.addEventListener('focusout', scheduleKeyboardStateUpdate);
    removeBeforeGuard = router.beforeEach((_to, from) => {
      if (props.enabled) saveResourceScroll(getMobileResourcePath(from.name));
    });
  });

  onBeforeUnmount(() => {
    clearRestoreTimers();
    removeBeforeGuard?.();
    if (focusFrame) window.cancelAnimationFrame(focusFrame);
    window.visualViewport?.removeEventListener('resize', updateKeyboardState);
    window.removeEventListener('resize', updateKeyboardState);
    document.removeEventListener('focusin', scheduleKeyboardStateUpdate);
    document.removeEventListener('focusout', scheduleKeyboardStateUpdate);
    delete document.documentElement.dataset.lightNotePrimaryRoot;
  });
</script>

<style scoped lang="less">
  .mobile-app-shell {
    /* 顶栏总高。box-sizing: border-box,1px 分隔线已含在这 56px 内(实测 content 顶边=56)。 */
    --mobile-top-bar-height: 56px;

    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    color: var(--text-color);
    background: var(--surface-page-bg, var(--background-color));
  }

  .mobile-app-shell.is-keyboard-open {
    height: var(--mobile-visible-viewport-height, 100%);
    max-height: 100%;
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
</style>
