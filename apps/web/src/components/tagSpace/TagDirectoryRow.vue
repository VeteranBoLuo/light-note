<template>
  <BButton
    class="tag-directory-row"
    :class="[`tag-directory-row--${tone}`, { 'is-active': active }]"
    :aria-current="active ? 'page' : undefined"
    :aria-label="ariaLabel || `${label}, ${count}`"
    :title="label"
    :disabled="disabled"
    @click="emit('activate')"
  >
    <span class="tag-directory-row__icon" aria-hidden="true">
      <SvgIcon :src="iconSrc || icon.resource.tag" :size="iconSize" />
    </span>
    <span class="tag-directory-row__label">{{ label }}</span>
    <strong class="tag-directory-row__count">{{ count }}</strong>
  </BButton>
</template>

<script setup lang="ts">
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';

  withDefaults(
    defineProps<{
      label: string;
      count: number | string;
      iconSrc?: string;
      iconSize?: number;
      active?: boolean;
      tone?: 'tag' | 'bookmark' | 'muted';
      ariaLabel?: string;
      disabled?: boolean;
    }>(),
    {
      iconSrc: '',
      iconSize: 16,
      active: false,
      tone: 'tag',
      ariaLabel: '',
      disabled: false,
    },
  );

  const emit = defineEmits<{
    activate: [];
  }>();
</script>

<style scoped lang="less">
  .tag-directory-row {
    --tag-directory-accent: var(--primary-color);
    --tag-directory-icon-color: var(--resource-tag-color, #ec4899);

    width: 100%;
    min-width: 0;
    min-height: 38px;
    height: auto;
    padding: 7px 8px;
    justify-content: flex-start;
    gap: 8px;
    border: 1px solid transparent;
    border-radius: 10px;
    color: var(--desc-color);
    background: transparent;
    line-height: 1.3;
    transition:
      color 0.18s ease,
      border-color 0.18s ease,
      background 0.18s ease;
  }

  .tag-directory-row--bookmark {
    --tag-directory-icon-color: var(--resource-bookmark-color, #615ced);
  }

  .tag-directory-row--muted {
    --tag-directory-icon-color: var(--desc-color);
  }

  .tag-directory-row:hover,
  .tag-directory-row:focus-visible {
    border-color: var(--surface-border-color);
    color: var(--text-color);
    background: var(--workspace-panel-bg-color);
  }

  .tag-directory-row.is-active {
    border-color: var(--tag-directory-accent);
    color: var(--tag-directory-accent);
    background: color-mix(in srgb, var(--tag-directory-accent) 8%, var(--card-background, transparent));
  }

  .tag-directory-row__icon {
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    border-radius: 7px;
    color: var(--tag-directory-icon-color);
    background: var(--workspace-panel-bg-color);
    overflow: hidden;
  }

  .tag-directory-row__label {
    min-width: 0;
    overflow: hidden;
    flex: 1;
    font-size: 12px;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tag-directory-row__count {
    flex: 0 0 auto;
    color: inherit;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  :global(html.light-note-mobile-rendering .tag-directory-row.is-active) {
    border-color: var(--tag-directory-accent);
    box-shadow: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .tag-directory-row {
      transition: none;
    }
  }
</style>
