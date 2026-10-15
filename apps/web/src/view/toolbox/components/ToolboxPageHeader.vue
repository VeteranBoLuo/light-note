<template>
  <header
    class="toolbox-page-header"
    :class="[`is-${presentation?.accent || 'violet'}`, { 'has-native-back': nativeMobileBack }]"
  >
    <div class="toolbox-page-header__identity">
      <BButton
        class="toolbox-page-header__back"
        type="text"
        icon-only
        :aria-label="backLabel || t('toolbox.back')"
        :title="backLabel || t('toolbox.back')"
        @click="emit('back')"
        ><SvgIcon :src="icon.toolbox.back" size="16" aria-hidden="true"
      /></BButton>
      <span class="toolbox-page-header__icon" aria-hidden="true"
        ><SvgIcon :src="presentation?.icon || icon.toolbox.home" size="30"
      /></span>
      <div class="toolbox-page-header__copy">
        <span class="toolbox-page-header__category">{{
          category || (presentation ? t(`toolbox.category.${presentation.category}`) : t('toolbox.title'))
        }}</span>
        <div class="toolbox-page-header__title">
          <h1>{{ title || (presentation ? t(`toolbox.tool.${toolId}.name`) : t('toolbox.title')) }}</h1>
          <slot name="meta" />
        </div>
      </div>
    </div>
    <div v-if="$slots.actions" class="toolbox-page-header__actions"><slot name="actions" /></div>
  </header>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { ToolboxToolId } from '@lightnote/shared/toolbox-protocol';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { TOOLBOX_PRESENTATION } from '@/config/toolbox';

  const props = withDefaults(
    defineProps<{
      toolId?: string;
      title?: string;
      category?: string;
      backLabel?: string;
      /** The app shell already provides the back action on these mobile routes. */
      nativeMobileBack?: boolean;
    }>(),
    { nativeMobileBack: true },
  );
  const emit = defineEmits<{ back: [] }>();
  const { t } = useI18n();
  const presentation = computed(() => TOOLBOX_PRESENTATION[props.toolId as ToolboxToolId]);
</script>

<style scoped lang="less">
  @import (reference) '../toolboxPresentation.less';

  .toolbox-page-header {
    .toolbox-tool-accent();
    position: relative;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--ui-space-12, 12px);
    min-width: 0;
    min-height: var(--ui-layout-72, 72px);
    padding: var(--ui-space-10, 10px) var(--ui-space-14, 14px) var(--ui-space-10, 10px) var(--ui-space-12, 12px);
    box-sizing: border-box;
    border: 1px solid var(--surface-border-color);
    border-radius: 17px;
    background: var(--surface-raised-background);
    box-shadow: var(--surface-card-shadow);
    color: var(--text-color);
    overflow: hidden;
  }
  .toolbox-page-header::before {
    position: absolute;
    inset: 0 auto 0 0;
    width: var(--ui-space-3, 3px);
    background: var(--tool-accent);
    content: '';
  }
  .toolbox-page-header__identity {
    flex: 1 1 var(--ui-layout-240, 240px);
    display: flex;
    align-items: center;
    min-width: 0;
    gap: var(--ui-space-12, 12px);
  }
  .toolbox-page-header__back.b_btn {
    flex: 0 0 var(--ui-control-32, 32px);
    width: var(--ui-control-32, 32px);
    height: var(--ui-control-32, 32px);
    padding: 0;
    border-color: transparent;
    background: transparent;
    box-shadow: none;
    color: var(--desc-color);
  }
  .toolbox-page-header__back.b_btn:hover,
  .toolbox-page-header__back.b_btn:focus-visible {
    color: var(--primary-color);
    background: var(--hover-background);
  }
  .toolbox-page-header__icon {
    flex: 0 0 var(--ui-layout-42, 42px);
    height: var(--ui-layout-42, 42px);
    display: grid;
    place-items: center;
    border: 1px solid var(--surface-border-color);
    border-color: color-mix(in srgb, var(--tool-accent) 24%, var(--surface-border-color));
    border-radius: 12px;
    color: var(--tool-accent);
    background: var(--card-background);
  }
  .toolbox-page-header__copy {
    min-width: 0;
  }
  .toolbox-page-header__category {
    color: var(--tool-accent);
    font-size: var(--ui-font-9, 9px);
    font-weight: 700;
    overflow-wrap: anywhere;
  }
  .toolbox-page-header__title {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--ui-space-8, 8px);
  }
  h1 {
    min-width: 0;
    margin: var(--ui-space-2, 2px) 0 0;
    font-size: var(--ui-font-20, 20px);
    line-height: 1.35;
    font-weight: 760;
    letter-spacing: -0.025em;
    overflow-wrap: anywhere;
  }
  .toolbox-page-header__actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: var(--ui-space-8, 8px);
    max-width: 100%;
    min-width: 0;
    margin-left: auto;
  }
  @media (max-width: 767px) {
    .has-native-back .toolbox-page-header__back {
      display: none;
    }
    .toolbox-page-header__identity {
      flex-basis: var(--ui-layout-180, 180px);
      gap: var(--ui-space-8, 8px);
    }
    .toolbox-page-header__back.b_btn {
      flex-basis: var(--ui-control-44, 44px);
      width: var(--ui-control-44, 44px);
      height: var(--ui-control-44, 44px);
    }
    .toolbox-page-header__icon {
      flex-basis: var(--ui-layout-32, 32px);
      height: var(--ui-layout-32, 32px);
    }
    h1 {
      font-size: var(--ui-font-18, 18px);
    }
    .toolbox-page-header__actions {
      justify-content: flex-start;
      margin-left: 0;
    }
  }
</style>
