<template>
  <aside class="mobile-notice-strip" :class="`is-${tone}`" role="status">
    <SvgIcon v-if="icon" class="mobile-notice-strip__icon" :src="icon" size="18" aria-hidden="true" />
    <span class="mobile-notice-strip__copy">
      <strong v-if="title">{{ title }}</strong>
      <span v-if="description">{{ description }}</span>
      <slot />
    </span>
  </aside>
</template>

<script setup lang="ts">
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';

  withDefaults(
    defineProps<{ title?: string; description?: string; icon?: string; tone?: 'neutral' | 'warning' | 'danger' }>(),
    { title: '', description: '', icon: '', tone: 'neutral' },
  );
</script>

<style scoped lang="less">
  .mobile-notice-strip {
    min-height: 48px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: var(--mobile-control-radius, 10px);
    color: var(--text-color);
    background: var(--workspace-panel-bg-color);
  }

  .mobile-notice-strip.is-warning {
    border-color: var(--mobile-notice-warning-border);
    color: var(--mobile-notice-warning-fg);
    background: var(--mobile-notice-warning-bg);
  }

  .mobile-notice-strip.is-danger {
    border-color: var(--mobile-sheet-danger-border);
    color: var(--danger-color);
    background: var(--mobile-sheet-danger-bg);
  }

  .mobile-notice-strip__icon {
    flex: 0 0 auto;
  }

  .mobile-notice-strip__copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12px;
    line-height: 1.4;
  }

  .mobile-notice-strip__copy strong {
    color: inherit;
    font-size: 13px;
    font-weight: 650;
  }
</style>
