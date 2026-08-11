<template>
  <section
    class="note-detail-loading-state"
    :class="`note-detail-loading-state--${variant}`"
    :role="error ? 'alert' : 'status'"
    :aria-live="error ? 'assertive' : 'polite'"
    :aria-label="error ? t('noteDetail.loadFailedTitle') : t('noteDetail.loadingTitle')"
  >
    <div v-if="error" class="note-detail-loading-state__error">
      <h2>{{ t('noteDetail.loadFailedTitle') }}</h2>
      <p>{{ t('noteDetail.loadFailedDescription') }}</p>
      <BButton type="primary" @click="emit('retry')">{{ t('noteDetail.retryLoad') }}</BButton>
    </div>
    <template v-else>
      <span class="sr-only">{{ t('noteDetail.loadingDescription') }}</span>
      <div v-if="variant === 'page'" class="note-detail-loading-state__header">
        <span class="skeleton skeleton--back"></span>
        <span class="skeleton skeleton--heading"></span>
        <span class="skeleton skeleton--action"></span>
      </div>
      <div class="note-detail-loading-state__body">
        <span class="skeleton skeleton--title"></span>
        <span class="skeleton skeleton--line skeleton--line-wide"></span>
        <span class="skeleton skeleton--line"></span>
        <span class="skeleton skeleton--line skeleton--line-short"></span>
        <span class="skeleton skeleton--block"></span>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';

  defineOptions({ inheritAttrs: false });

  withDefaults(
    defineProps<{
      variant?: 'page' | 'editor';
      error?: boolean;
    }>(),
    {
      variant: 'editor',
      error: false,
    },
  );

  const emit = defineEmits<{
    retry: [];
  }>();
  const { t } = useI18n();
</script>

<style scoped lang="less">
  .note-detail-loading-state {
    width: 100%;
    min-height: 280px;
    box-sizing: border-box;
    color: var(--font-color);
    background: var(--background-color);
  }

  .note-detail-loading-state--page {
    min-height: calc(100vh - 64px);
  }

  .note-detail-loading-state__header {
    height: 64px;
    padding: 0 24px;
    display: flex;
    align-items: center;
    gap: 18px;
    border-bottom: 1px solid var(--surface-divider-color);
  }

  .note-detail-loading-state__body {
    width: min(920px, calc(100% - 48px));
    margin: 0 auto;
    padding: 42px 0;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .skeleton {
    display: block;
    border-radius: 8px;
    background: var(--surface-muted-bg, #eef0f4);
    animation: note-detail-skeleton-pulse 1.35s ease-in-out infinite;
  }

  .skeleton--back {
    width: 34px;
    height: 34px;
    border-radius: 50%;
  }

  .skeleton--heading {
    width: 152px;
    height: 22px;
  }

  .skeleton--action {
    width: 82px;
    height: 32px;
    margin-left: auto;
  }

  .skeleton--title {
    width: min(360px, 58%);
    height: 34px;
    margin-bottom: 12px;
  }

  .skeleton--line {
    width: 76%;
    height: 16px;
  }

  .skeleton--line-wide {
    width: 94%;
  }

  .skeleton--line-short {
    width: 52%;
  }

  .skeleton--block {
    width: 100%;
    height: 132px;
    margin-top: 12px;
  }

  .note-detail-loading-state__error {
    min-height: 320px;
    padding: 40px 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    text-align: center;
  }

  .note-detail-loading-state__error h2 {
    margin: 0 0 10px;
    font-size: 20px;
  }

  .note-detail-loading-state__error p {
    max-width: 420px;
    margin: 0 0 20px;
    color: var(--desc-color);
    line-height: 1.65;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @keyframes note-detail-skeleton-pulse {
    0%,
    100% {
      opacity: 0.58;
    }
    50% {
      opacity: 1;
    }
  }

  @media (max-width: 768px) {
    .note-detail-loading-state--page {
      min-height: calc(100vh - 56px);
    }

    .note-detail-loading-state__header {
      height: 54px;
      padding: 0 16px;
      gap: 12px;
    }

    .note-detail-loading-state__body {
      width: calc(100% - 32px);
      padding: 28px 0;
      gap: 15px;
    }

    .skeleton--title {
      width: 64%;
      height: 28px;
    }

    .skeleton--block {
      height: 112px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .skeleton {
      animation: none;
      opacity: 0.78;
    }
  }
</style>
