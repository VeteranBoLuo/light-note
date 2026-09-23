<template>
  <div class="community-message-skeleton" role="status" :aria-label="label">
    <span v-for="index in 4" :key="index" :class="{ 'is-own': index % 3 === 0 }" aria-hidden="true"></span>
  </div>
</template>
<script setup lang="ts">
  defineProps<{ label: string }>();
</script>
<style scoped>
  .community-message-skeleton {
    position: absolute;
    inset: 0;
    z-index: 3;
    align-content: start;
    padding: var(--ui-space-18, 18px) clamp(var(--ui-space-14, 14px), 3vw, var(--ui-space-32, 32px)) var(--ui-space-22, 22px);
    box-sizing: border-box;
    display: grid;
    gap: var(--ui-space-18, 18px);
    overflow: hidden;
    background: var(--card-background);
  }
  .community-message-skeleton span {
    width: min(var(--ui-layout-420, 420px), 72%);
    height: var(--ui-layout-72, 72px);
    border: 1px solid var(--surface-border-color);
    border-radius: 16px;
    background: var(--workspace-panel-bg-color);
  }
  .community-message-skeleton span.is-own {
    justify-self: end;
  }
</style>
