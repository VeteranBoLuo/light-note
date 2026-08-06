<template>
  <section class="mobile-list-surface" role="list" :aria-label="ariaLabel || undefined">
    <slot />
  </section>
</template>

<script setup lang="ts">
  defineProps<{ ariaLabel?: string }>();
</script>

<style scoped lang="less">
  .mobile-list-surface {
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: var(--mobile-surface-radius, 16px);
    background: var(--card-background);
    box-shadow: none;
  }

  .mobile-list-surface :deep(> * + *) {
    border-top: 1px solid var(--mobile-row-divider, var(--surface-divider-color));
  }
</style>
