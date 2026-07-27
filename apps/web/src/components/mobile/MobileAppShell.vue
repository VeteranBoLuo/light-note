<template>
  <div v-if="enabled" class="mobile-app-shell">
    <MobileTopBar />
    <MobileResourceTabs v-if="showTopSwitcher" />
    <main class="mobile-app-shell__content">
      <slot />
    </main>
    <MobileBottomNav v-if="showBottomNav && !keyboardOpen" />
  </div>
  <slot v-else />
</template>

<script setup lang="ts">
  import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useRoute, useRouter } from 'vue-router';
  import MobileResourceTabs from '@/components/mobile/MobileResourceTabs.vue';
  import MobileBottomNav from '@/components/mobile/MobileBottomNav.vue';
  import MobileTopBar from '@/components/mobile/MobileTopBar.vue';
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
  const { rememberResourceFromRoute, restoreResourceScroll, saveResourceScroll } = useMobileNavigationState();
  const restoreTimers = new Set<number>();
  let removeBeforeGuard: (() => void) | undefined;

  function updateKeyboardState() {
    const viewport = window.visualViewport;
    if (!viewport) {
      keyboardOpen.value = false;
      return;
    }
    const obscuredHeight = window.innerHeight - viewport.height;
    keyboardOpen.value = obscuredHeight > 120 || viewport.height / window.innerHeight < 0.75;
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

  onMounted(() => {
    updateKeyboardState();
    window.visualViewport?.addEventListener('resize', updateKeyboardState);
    window.addEventListener('resize', updateKeyboardState);
    removeBeforeGuard = router.beforeEach((_to, from) => {
      if (props.enabled) saveResourceScroll(getMobileResourcePath(from.name));
    });
  });

  onBeforeUnmount(() => {
    clearRestoreTimers();
    removeBeforeGuard?.();
    window.visualViewport?.removeEventListener('resize', updateKeyboardState);
    window.removeEventListener('resize', updateKeyboardState);
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
    min-height: 0;
  }
</style>
