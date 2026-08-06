<template>
  <div class="mobile-sticky-action-bar" :class="{ 'is-above-navigation': aboveNavigation }" role="toolbar">
    <slot />
  </div>
</template>

<script setup lang="ts">
  withDefaults(defineProps<{ aboveNavigation?: boolean }>(), { aboveNavigation: true });
</script>

<style scoped lang="less">
  .mobile-sticky-action-bar {
    position: fixed;
    right: var(--mobile-page-gutter, 14px);
    bottom: max(12px, env(safe-area-inset-bottom));
    left: var(--mobile-page-gutter, 14px);
    z-index: 90;
    min-height: 60px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    padding: 8px;
    border: 1px solid var(--surface-border-color);
    border-radius: 16px;
    background: var(--card-background);
    box-shadow: var(--surface-raised-shadow);
  }

  .mobile-sticky-action-bar.is-above-navigation {
    bottom: calc(70px + env(safe-area-inset-bottom));
  }

  .mobile-sticky-action-bar :deep(.b_btn) {
    min-width: 0;
    min-height: var(--mobile-touch-size, 44px);
    flex: 1 1 0;
    border-radius: var(--mobile-control-radius, 10px);
  }
</style>
