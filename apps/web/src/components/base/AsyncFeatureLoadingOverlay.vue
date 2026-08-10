<template>
  <Teleport to="body">
    <div class="async-feature-loading" role="status" aria-live="polite">
      <BLoading :loading="true" inline :title="t('common.loading')" />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';

  defineOptions({ inheritAttrs: false });
  const { t } = useI18n();
</script>

<style scoped lang="less">
  .async-feature-loading {
    position: fixed;
    z-index: 899;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    align-items: center;
    padding: 10px 16px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    color: var(--text-color);
    background: var(--card-background);
    box-shadow: var(--surface-card-shadow);
    pointer-events: none;
  }

  :global(html.light-note-mobile-rendering) .async-feature-loading {
    border-color: var(--surface-border-color);
    box-shadow: 0 8px 24px rgba(31, 35, 48, 0.14);
  }
</style>
