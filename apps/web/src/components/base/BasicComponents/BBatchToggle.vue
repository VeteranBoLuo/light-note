<template>
  <BButton
    class="b-batch-toggle"
    :class="[`b-batch-toggle--${size}`, { 'is-active': active }]"
    :size="size"
    :disabled="disabled"
    :loading="loading"
    :aria-pressed="active"
    :aria-label="active ? resolvedExitLabel : resolvedEnterLabel"
    @click="handleClick"
  >
    <SvgIcon
      class="b-batch-toggle__icon"
      :src="active ? icon.common.close : icon.common.batchSelect"
      :style="{ width: '1.25em', height: '1.25em' }"
      aria-hidden="true"
    />
    <span class="b-batch-toggle__labels" aria-hidden="true">
      <span :class="{ 'is-visible': !active }">{{ resolvedEnterLabel }}</span>
      <span :class="{ 'is-visible': active }">{{ resolvedExitLabel }}</span>
    </span>
  </BButton>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from './BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';

  const props = withDefaults(
    defineProps<{
      active: boolean;
      size?: 'small' | 'default' | 'large';
      disabled?: boolean;
      loading?: boolean;
      enterLabel?: string;
      exitLabel?: string;
    }>(),
    { size: 'default', disabled: false, loading: false },
  );
  const emit = defineEmits<{ click: [event: MouseEvent] }>();
  const { t } = useI18n();
  const resolvedEnterLabel = computed(() => props.enterLabel ?? t('common.batchActions'));
  const resolvedExitLabel = computed(() => props.exitLabel ?? t('common.exitBatch'));

  function handleClick(event: MouseEvent) {
    if (!props.disabled && !props.loading) emit('click', event);
  }
</script>

<style scoped lang="less">
  .b-batch-toggle.b_btn {
    --_batch-height: 36px;
    --_batch-font-size: 14px;
    --_batch-padding-x: 13px;
    --_batch-radius: 10px;
    position: relative;
    flex: 0 0 auto;
    gap: var(--batch-toggle-gap, 0.5em);
    height: var(--batch-toggle-height, var(--_batch-height));
    padding: 0 var(--batch-toggle-padding-x, var(--_batch-padding-x));
    border: 1px solid var(--surface-border-color);
    border-radius: var(--batch-toggle-radius, var(--_batch-radius));
    background: var(--primary-btn-bg-color);
    color: var(--text-color);
    box-shadow: var(--batch-toggle-shadow);
    font-size: var(--batch-toggle-font-size, var(--_batch-font-size));
    font-weight: 500;
    line-height: 1;
    transition:
      border-color 0.16s,
      background-color 0.16s,
      color 0.16s;

    &.b-batch-toggle--small {
      --_batch-height: 28px;
      --_batch-font-size: 12px;
      --_batch-padding-x: 10px;
      --_batch-radius: 8px;
    }

    &.b-batch-toggle--large {
      --_batch-height: 44px;
      --_batch-font-size: 16px;
      --_batch-padding-x: 16px;
      --_batch-radius: 12px;
    }

    &.is-active {
      border-color: var(--batch-toggle-accent);
      color: var(--batch-toggle-accent);
    }

    &:focus-visible {
      outline: 2px solid var(--batch-toggle-accent);
      outline-offset: 3px;
    }

    &:disabled {
      box-shadow: none;
      cursor: not-allowed;
    }

    &.loading .b-batch-toggle__icon {
      visibility: hidden;
    }

    :deep(.btn-spinner) {
      position: absolute;
      inset-inline-start: var(--batch-toggle-padding-x, var(--_batch-padding-x));
      width: 1.25em;
      height: 1.25em;
      box-sizing: border-box;
      margin: 0;
    }
  }

  .b-batch-toggle__icon {
    flex-shrink: 0;
  }

  // 两段文案共同撑开自然宽度，状态切换与不同语言都不会挤动相邻控件。
  .b-batch-toggle__labels {
    display: grid;

    > span {
      grid-area: 1 / 1;
      visibility: hidden;

      &.is-visible {
        visibility: visible;
      }
    }
  }

  @media (hover: hover) and (pointer: fine) {
    .b-batch-toggle.b_btn:not(:disabled):hover {
      background: var(--primary-btn-h-bg-color);
      border-color: var(--desc-color);

      &.is-active {
        border-color: var(--batch-toggle-accent);
      }
    }
  }

  @media (max-width: 767px) {
    .b-batch-toggle.b_btn {
      min-height: 44px;
    }
  }

  :global(html.light-note-mobile-rendering .b-batch-toggle.b_btn) {
    min-height: 44px;
    box-shadow: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .b-batch-toggle.b_btn {
      transition: none;
    }
  }
</style>
