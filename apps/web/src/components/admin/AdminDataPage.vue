<template>
  <div class="admin-data-page">
    <section class="admin-data-page__surface">
      <header class="admin-data-page__header">
        <div class="admin-data-page__title-block">
          <p v-if="eyebrow" class="admin-data-page__eyebrow">{{ eyebrow }}</p>
          <div class="admin-data-page__heading-row">
            <div class="admin-data-page__heading-copy">
              <h2 class="admin-data-page__title">{{ title }}</h2>
              <p v-if="subtitle" class="admin-data-page__subtitle">{{ subtitle }}</p>
            </div>
            <div v-if="$slots.actions" class="admin-data-page__actions">
              <slot name="actions" />
            </div>
          </div>
        </div>
      </header>

      <ul v-if="$slots.metrics" class="admin-data-page__metrics">
        <slot name="metrics" />
      </ul>

      <div
        v-if="$slots.toolbar || toolbarHint || $slots.summary || summaryCount !== undefined"
        class="admin-data-page__toolbar"
      >
        <div class="admin-data-page__toolbar-row">
          <div v-if="$slots.toolbar" class="admin-data-page__toolbar-main">
            <slot name="toolbar" />
          </div>
          <div v-if="$slots.summary || summaryCount !== undefined" class="admin-data-page__summary">
            <slot name="summary">
              {{ t('common.totalItems', { n: summaryCount }) }}
            </slot>
          </div>
        </div>
        <p v-if="toolbarHint" class="admin-data-page__toolbar-hint">{{ toolbarHint }}</p>
      </div>

      <div class="admin-data-page__table">
        <slot />
      </div>
    </section>
  </div>
</template>

<script lang="ts" setup>
  import { useI18n } from 'vue-i18n';

  defineProps<{
    eyebrow?: string;
    title: string;
    subtitle?: string;
    toolbarHint?: string;
    summaryCount?: number;
  }>();

  const { t } = useI18n();
</script>

<style lang="less" scoped>
  .admin-data-page {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    padding-bottom: 16px;
    box-sizing: border-box;
  }

  .admin-data-page__surface {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    padding: 12px 20px 20px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow: hidden;
    border-radius: 18px;
    background: var(--background-color);
    box-shadow: 0 10px 35px rgba(12, 19, 45, 0.08);
  }

  .admin-data-page__header {
    flex: 0 0 auto;
  }

  .admin-data-page__title-block,
  .admin-data-page__heading-copy {
    min-width: 0;
  }

  .admin-data-page__eyebrow {
    margin: 0 0 4px;
    color: var(--sub-text-color);
    font-size: 11px;
    line-height: 1.4;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .admin-data-page__heading-row {
    min-width: 0;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
  }

  .admin-data-page__title {
    margin: 0;
    color: var(--text-color);
    font-size: 22px;
    font-weight: 600;
    line-height: 1.3;
  }

  .admin-data-page__subtitle {
    margin: 2px 0 0;
    color: var(--sub-text-color);
    font-size: 12px;
    line-height: 1.5;
  }

  .admin-data-page__actions {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .admin-data-page__metrics {
    flex: 0 0 auto;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 10px;
    list-style: none;
  }

  .admin-data-page__metrics :deep(.admin-stat-card) {
    min-width: 0;
    min-height: 76px;
    padding: 10px 12px;
    box-sizing: border-box;
    color: var(--text-color);
    border: 1px solid color-mix(in srgb, var(--primary-color) 16%, var(--card-border-color, rgba(82, 115, 255, 0.16)));
    border-radius: 12px;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--primary-color) 8%, var(--card-background, var(--background-color))),
      var(--card-background, var(--background-color))
    );
  }

  .admin-data-page__metrics :deep(.admin-stat-label) {
    color: var(--sub-text-color);
    font-size: 11px;
    line-height: 1.4;
    text-transform: uppercase;
  }

  .admin-data-page__metrics :deep(.admin-stat-value) {
    display: block;
    margin: 2px 0;
    color: var(--text-color);
    font-size: 19px;
    line-height: 1.25;
  }

  .admin-data-page__metrics :deep(.admin-stat-hint) {
    color: var(--sub-text-color);
    font-size: 11px;
    line-height: 1.4;
  }

  .admin-data-page__toolbar {
    flex: 0 0 auto;
    min-width: 0;
  }

  .admin-data-page__toolbar-row {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .admin-data-page__toolbar-main {
    min-width: 0;
    flex: 1;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .admin-data-page__summary {
    flex: 0 0 auto;
    color: var(--sub-text-color);
    font-size: 12px;
    white-space: nowrap;
  }

  .admin-data-page__toolbar-hint {
    margin: 4px 0 0;
    color: var(--sub-text-color);
    font-size: 11px;
    line-height: 1.4;
  }

  .admin-data-page__table {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  @media (max-width: 960px) {
    .admin-data-page {
      padding-bottom: 0;
    }

    .admin-data-page__surface {
      height: auto;
      min-height: 100%;
      padding: 16px;
      overflow: visible;
    }

    .admin-data-page__heading-row,
    .admin-data-page__toolbar-row,
    .admin-data-page__toolbar-main {
      align-items: stretch;
      flex-direction: column;
    }

    .admin-data-page__metrics {
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    }

    .admin-data-page__summary {
      white-space: normal;
    }

    .admin-data-page__table {
      min-height: 360px;
    }
  }
</style>
