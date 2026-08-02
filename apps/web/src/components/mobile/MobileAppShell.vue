<template>
  <div v-if="enabled" class="mobile-app-shell">
    <MobileTopBar />
    <MobileResourceTabs v-if="showTopSwitcher" />
    <main class="mobile-app-shell__content">
      <slot />
    </main>
    <MobileBottomNav v-if="showBottomNav && !keyboardOpen" />
    <MobileGlobalSearchOverlay />
  </div>
  <slot v-else />
</template>

<script setup lang="ts">
  import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useRoute } from 'vue-router';
  import MobileResourceTabs from '@/components/mobile/MobileResourceTabs.vue';
  import MobileBottomNav from '@/components/mobile/MobileBottomNav.vue';
  import MobileTopBar from '@/components/mobile/MobileTopBar.vue';
  import MobileGlobalSearchOverlay from '@/components/globalSearch/MobileGlobalSearchOverlay.vue';
  import { useMobileNavigationState } from '@/composables/useMobileNavigationState';

  const props = defineProps<{
    enabled: boolean;
    showTopSwitcher: boolean;
    showBottomNav: boolean;
  }>();

  const route = useRoute();
  const keyboardOpen = ref(false);
  const { rememberResourceFromRoute, resetResourceScroll } = useMobileNavigationState();
  const scrollResetTimers = new Set<number>();

  function updateKeyboardState() {
    const viewport = window.visualViewport;
    if (!viewport) {
      keyboardOpen.value = false;
      return;
    }
    const obscuredHeight = window.innerHeight - viewport.height;
    keyboardOpen.value = obscuredHeight > 120 || viewport.height / window.innerHeight < 0.75;
  }

  function syncPrimaryRootState() {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.lightNotePrimaryRoot = String(props.enabled && props.showBottomNav);
  }

  function clearScrollResetTimers() {
    scrollResetTimers.forEach((timer) => window.clearTimeout(timer));
    scrollResetTimers.clear();
  }

  function scheduleResourceScrollReset(routeName: unknown) {
    clearScrollResetTimers();
    const path = rememberResourceFromRoute(routeName);
    if (!path) return;
    nextTick(() => {
      window.requestAnimationFrame(() => {
        if (resetResourceScroll(path)) return;
        const timer = window.setTimeout(() => {
          resetResourceScroll(path);
          scrollResetTimers.delete(timer);
        }, 80);
        scrollResetTimers.add(timer);
      });
    });
  }

  watch(
    () => route.fullPath,
    () => {
      if (props.enabled) scheduleResourceScrollReset(route.name);
    },
    { immediate: true },
  );

  watch(() => [props.enabled, props.showBottomNav, route.fullPath], syncPrimaryRootState, { immediate: true });

  onMounted(() => {
    updateKeyboardState();
    window.visualViewport?.addEventListener('resize', updateKeyboardState);
    window.addEventListener('resize', updateKeyboardState);
  });

  onBeforeUnmount(() => {
    clearScrollResetTimers();
    window.visualViewport?.removeEventListener('resize', updateKeyboardState);
    window.removeEventListener('resize', updateKeyboardState);
    delete document.documentElement.dataset.lightNotePrimaryRoot;
  });
</script>

<style scoped lang="less">
  .mobile-app-shell {
    width: 100%;
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    color: var(--text-color);
    background: var(--surface-page-bg, var(--background-color));
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
