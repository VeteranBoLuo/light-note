<template>
  <BButton class="gs-feature" :class="`is-${variant}`" @click="emit('open')">
    <span class="gs-feature__icon"><SvgIcon :src="feature.icon" size="16" aria-hidden="true" /></span>
    <span class="gs-feature__main">
      <span class="gs-feature__title">
        <span v-if="variant === 'match'" v-html="highlightKeyword(title, keyword)"></span>
        <span v-else>{{ title }}</span>
        <span v-if="variant === 'featured'" class="gs-feature__badge">{{ t('featureShortcut.newBadge') }}</span>
      </span>
      <span v-if="variant === 'featured'" class="gs-feature__sub">{{ description || defaultDescription }}</span>
      <span v-else class="gs-feature__sub">
        <i18n-t v-if="alias" keypath="featureShortcut.alias" tag="span">
          <template #alias><span v-html="highlightKeyword(alias, keyword)"></span></template>
        </i18n-t>
        <span v-if="alias"> · </span>{{ location }}
      </span>
    </span>
    <span class="gs-feature__go">
      {{ t(feature.mode === 'guide' ? 'featureShortcut.guide' : 'featureShortcut.open') }} ›
    </span>
  </BButton>
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
      /** match：搜索命中的功能；featured：最近上线，带「新」与一句话说明。 */
      variant?: 'match' | 'featured';
      keyword?: string;
      alias?: string | null;
      description?: string;
    }>(),
    { variant: 'match', keyword: '', alias: null, description: '' },
  );

  const emit = defineEmits<{ open: [] }>();
  const { t } = useI18n();
  const title = computed(() => t(`featureShortcut.items.${props.feature.key}.title`));
  const location = computed(() => t(`featureShortcut.items.${props.feature.key}.location`));
  const defaultDescription = computed(() => t(`featureShortcut.items.${props.feature.key}.description`));
</script>

<style scoped lang="less">
  .gs-feature.b_btn {
    width: 100%;
    height: auto;
    min-height: var(--ui-layout-54, 54px);
    padding: var(--ui-space-8, 8px) var(--ui-space-10, 10px);
    display: grid;
    grid-template-columns: var(--ui-layout-30, 30px) minmax(0, 1fr) max-content;
    align-items: center;
    gap: var(--ui-space-10, 10px);
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    color: var(--text-color);
    background: var(--card-background) !important;
    line-height: 1.4;
    text-align: left;
    white-space: normal;
  }

  .gs-feature + .gs-feature {
    margin-top: var(--ui-space-8, 8px);
  }

  .gs-feature__icon {
    width: var(--ui-layout-30, 30px);
    height: var(--ui-layout-30, 30px);
    display: grid;
    place-items: center;
    border-radius: 9px;
    color: var(--workspace-purple-text);
    background: var(--workspace-purple-selected);
  }

  .gs-feature__main {
    min-width: 0;
    display: grid;
    gap: var(--ui-space-2, 2px);
  }

  .gs-feature__title {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--ui-space-6, 6px);
    font-size: var(--ui-font-14, 14px);
    font-weight: 650;
  }

  .gs-feature__badge {
    flex-shrink: 0;
    padding: 0 var(--ui-space-6, 6px);
    border-radius: 999px;
    color: #fff;
    background: var(--primary-color);
    font-size: var(--ui-font-10, 10px);
    font-weight: 700;
    line-height: 1.6;
  }

  .gs-feature__sub {
    overflow: hidden;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .gs-feature__go {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    white-space: nowrap;
  }

  .gs-feature :deep(.gs-highlight) {
    padding: 0 var(--ui-space-1, 1px);
    border-radius: 3px;
    color: inherit;
    background: color-mix(in srgb, var(--primary-color) 25%, transparent);
  }
</style>
