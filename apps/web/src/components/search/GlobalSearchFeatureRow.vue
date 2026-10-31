<template>
  <div
    class="gs-feature-row"
    :class="[`is-${variant}`, { 'is-active': active }]"
    :data-gs-nav="navIndex"
    @mousemove="emit('activate')"
  >
    <BButton class="gs-feature-row__open" @click="emit('open')">
      <span class="gs-feature-row__icon"><SvgIcon :src="feature.icon" size="16" aria-hidden="true" /></span>
      <span v-if="variant === 'match'" class="gs-feature-row__main">
        <span class="gs-feature-row__title" v-html="highlightKeyword(title, keyword)"></span>
        <i18n-t v-if="alias" keypath="featureShortcut.alias" tag="span" class="gs-feature-row__alias">
          <template #alias><span v-html="highlightKeyword(alias, keyword)"></span></template>
        </i18n-t>
        <span class="gs-feature-row__path">{{ location }}</span>
      </span>
      <span v-else class="gs-feature-row__main is-stacked">
        <span class="gs-feature-row__title-line">
          <span class="gs-feature-row__title">{{ title }}</span>
          <span class="gs-feature-row__badge">{{ t('featureShortcut.newBadge') }}</span>
        </span>
        <span class="gs-feature-row__desc">{{ description || defaultDescription }}</span>
      </span>
      <span class="gs-feature-row__action">
        <span v-if="date" class="gs-feature-row__date">{{ date }}</span>
        <span class="gs-feature-row__verb">{{ t(feature.mode === 'guide' ? 'featureShortcut.guide' : 'featureShortcut.open') }}</span>
        <kbd class="gs-feature-row__enter" aria-hidden="true">↵</kbd>
      </span>
    </BButton>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import type { FeatureShortcutDefinition } from '@/config/featureShortcuts';
  import { highlightKeyword } from '@/utils/globalSearchHighlight';

  const props = withDefaults(
    defineProps<{
      feature: FeatureShortcutDefinition;
      navIndex: number;
      active?: boolean;
      /** match：搜索命中的功能，单行；featured：最近上线，带「新」与一句话说明。 */
      variant?: 'match' | 'featured';
      keyword?: string;
      alias?: string | null;
      description?: string;
      date?: string;
    }>(),
    { active: false, variant: 'match', keyword: '', alias: null, description: '', date: '' },
  );

  const emit = defineEmits<{ open: []; activate: [] }>();
  const { t } = useI18n();
  const title = computed(() => t(`featureShortcut.items.${props.feature.key}.title`));
  const location = computed(() => t(`featureShortcut.items.${props.feature.key}.location`));
  const defaultDescription = computed(() => t(`featureShortcut.items.${props.feature.key}.description`));
</script>

<style scoped lang="less">
  .gs-feature-row {
    border-radius: 12px;
    background: transparent;
    transition: background 0.15s ease;
  }

  .gs-feature-row.is-active {
    background: color-mix(in srgb, var(--primary-color) 10%, transparent);
  }

  .gs-feature-row__open.b_btn {
    width: 100%;
    height: auto;
    min-height: var(--ui-layout-44, 44px);
    padding: var(--ui-space-6, 6px) var(--ui-space-9, 9px) var(--ui-space-6, 6px) var(--ui-space-7, 7px);
    display: grid;
    grid-template-columns: var(--ui-layout-28, 28px) minmax(0, 1fr) max-content;
    align-items: center;
    gap: var(--ui-space-10, 10px);
    border-radius: 12px;
    line-height: 1.45;
    text-align: left;
    white-space: normal;
    /* 行背景统一承载 hover / 键盘选中，避免 BButton 自身状态色只覆盖一部分。 */
    background: transparent !important;
  }

  .is-featured .gs-feature-row__open.b_btn {
    min-height: var(--ui-layout-54, 54px);
  }

  .gs-feature-row__icon {
    width: var(--ui-layout-28, 28px);
    height: var(--ui-layout-28, 28px);
    display: grid;
    place-items: center;
    border-radius: 8px;
    color: var(--workspace-purple-text);
    background: var(--workspace-purple-selected);
  }

  .is-featured .gs-feature-row__icon,
  .is-active .gs-feature-row__icon {
    background: var(--menu-body-bg-color, var(--card-background));
  }

  .gs-feature-row__main {
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: var(--ui-space-8, 8px);
  }

  .gs-feature-row__main.is-stacked {
    display: grid;
    gap: var(--ui-space-2, 2px);
  }

  .gs-feature-row__title-line {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--ui-space-6, 6px);
  }

  .gs-feature-row__title {
    flex-shrink: 0;
    overflow: hidden;
    color: var(--text-color);
    font-size: var(--ui-font-13, 13px);
    font-weight: 680;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .is-featured .gs-feature-row__title {
    flex-shrink: 1;
  }

  .gs-feature-row__alias,
  .gs-feature-row__path,
  .gs-feature-row__desc {
    overflow: hidden;
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .gs-feature-row__alias {
    flex-shrink: 0;
  }

  .gs-feature-row__path {
    min-width: 0;
  }

  .gs-feature-row__badge {
    flex-shrink: 0;
    padding: 0 var(--ui-space-6, 6px);
    border-radius: 999px;
    color: #fff;
    background: var(--primary-color);
    font-size: var(--ui-font-10, 10px);
    font-weight: 700;
    line-height: 1.6;
  }

  .gs-feature-row__action {
    display: flex;
    align-items: center;
    gap: var(--ui-space-6, 6px);
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
    white-space: nowrap;
  }

  .gs-feature-row__verb {
    padding: var(--ui-space-1, 1px) var(--ui-space-7, 7px);
    border: 1px solid var(--surface-border-color);
    border-radius: 999px;
    line-height: 1.5;
  }

  .is-active .gs-feature-row__verb {
    border-color: color-mix(in srgb, var(--primary-color) 45%, transparent);
    color: var(--workspace-purple-text);
  }

  .gs-feature-row__enter {
    visibility: hidden;
    padding: var(--ui-space-1, 1px) var(--ui-space-5, 5px);
    border: 1px solid var(--surface-border-color);
    border-radius: 6px;
    color: var(--desc-color);
    background: transparent;
    font-family: inherit;
    font-size: var(--ui-font-10, 10px);
  }

  .is-active .gs-feature-row__enter {
    visibility: visible;
  }

  .gs-feature-row :deep(.gs-highlight) {
    padding: 0 var(--ui-space-1, 1px);
    border-radius: 3px;
    color: inherit;
    background: color-mix(in srgb, var(--primary-color) 25%, transparent);
  }
</style>
