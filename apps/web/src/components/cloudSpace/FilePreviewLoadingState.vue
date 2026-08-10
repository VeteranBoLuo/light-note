<template>
  <Teleport to="body">
    <section class="file-preview-loading-state" role="status" aria-live="polite" :aria-label="t('cloudSpace.previewPanel.loading')">
      <header class="file-preview-loading-state__header">
        <span class="skeleton skeleton--badge"></span>
        <span class="skeleton skeleton--name"></span>
        <span class="skeleton skeleton--action"></span>
      </header>
      <div class="file-preview-loading-state__content">
        <span class="sr-only">{{ t('cloudSpace.previewPanel.loading') }}</span>
        <div class="file-preview-loading-state__document">
          <span class="skeleton skeleton--title"></span>
          <span class="skeleton skeleton--line skeleton--line-wide"></span>
          <span class="skeleton skeleton--line"></span>
          <span class="skeleton skeleton--line skeleton--line-short"></span>
          <span class="skeleton skeleton--block"></span>
        </div>
      </div>
    </section>
  </Teleport>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';

  defineOptions({ inheritAttrs: false });
  const { t } = useI18n();
</script>

<style scoped lang="less">
  .file-preview-loading-state {
    position: fixed;
    z-index: 10001;
    inset: 0;
    display: grid;
    grid-template-rows: 58px minmax(0, 1fr);
    color: var(--font-color);
    background: var(--background-color);
  }

  .file-preview-loading-state__header {
    padding: 0 20px;
    display: flex;
    align-items: center;
    gap: 12px;
    border-bottom: 1px solid var(--surface-divider-color);
    background: var(--surface-page-bg, var(--background-color));
  }

  .file-preview-loading-state__content {
    min-height: 0;
    padding: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    background: var(--surface-subtle-bg, #f5f6f8);
  }

  .file-preview-loading-state__document {
    width: min(760px, 88vw);
    height: min(620px, 76vh);
    padding: 52px 58px;
    display: flex;
    flex-direction: column;
    gap: 18px;
    box-sizing: border-box;
    border: 1px solid var(--surface-divider-color);
    border-radius: 14px;
    background: var(--background-color);
  }

  .skeleton {
    display: block;
    border-radius: 8px;
    background: var(--surface-muted-bg, #e9ebef);
    animation: file-preview-skeleton-pulse 1.35s ease-in-out infinite;
  }

  .skeleton--badge {
    width: 42px;
    height: 24px;
  }

  .skeleton--name {
    width: min(260px, 38vw);
    height: 18px;
  }

  .skeleton--action {
    width: 32px;
    height: 32px;
    margin-left: auto;
  }

  .skeleton--title {
    width: 48%;
    height: 32px;
    margin-bottom: 18px;
  }

  .skeleton--line {
    width: 78%;
    height: 16px;
  }

  .skeleton--line-wide {
    width: 96%;
  }

  .skeleton--line-short {
    width: 58%;
  }

  .skeleton--block {
    width: 100%;
    height: 180px;
    margin-top: 16px;
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

  @keyframes file-preview-skeleton-pulse {
    0%,
    100% {
      opacity: 0.58;
    }
    50% {
      opacity: 1;
    }
  }

  @media (max-width: 768px) {
    .file-preview-loading-state {
      grid-template-rows: 52px minmax(0, 1fr);
    }

    .file-preview-loading-state__header {
      padding: 0 14px;
    }

    .file-preview-loading-state__content {
      padding: 16px;
    }

    .file-preview-loading-state__document {
      width: 100%;
      height: 72vh;
      padding: 34px 24px;
      border-radius: 12px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .skeleton {
      animation: none;
      opacity: 0.78;
    }
  }
</style>
