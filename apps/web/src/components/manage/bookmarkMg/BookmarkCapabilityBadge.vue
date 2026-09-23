<template>
  <BTooltip :title="tooltip">
    <span
      class="bookmark-capability"
      :class="[`bookmark-capability--${type}`, { 'bookmark-capability--compact': compact }]"
      role="button"
      tabindex="0"
      :aria-label="tooltip"
      @click.stop="emit('click', $event)"
      @keydown.enter.prevent.stop="emit('click', $event)"
      @keydown.space.prevent.stop="emit('click', $event)"
    >
      <span class="bookmark-capability__icon" aria-hidden="true">
        <SvgIcon
          :src="type === 'snapshot' ? icon.bookmarkManage.snapshot : icon.ai.summary"
          :size="compact ? 14 : 13"
        />
      </span>
      <span v-if="!compact" class="bookmark-capability__label">{{ label }}</span>
    </span>
  </BTooltip>
</template>

<script setup lang="ts">
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';

  withDefaults(
    defineProps<{
      type: 'snapshot' | 'summary';
      label: string;
      tooltip: string;
      compact?: boolean;
    }>(),
    { compact: false },
  );

  const emit = defineEmits<{ click: [event: MouseEvent | KeyboardEvent] }>();
</script>

<style scoped lang="less">
  .bookmark-capability {
    --badge-color: var(--resource-bookmark-color);
    --badge-accent: var(--primary-color);
    display: inline-flex;
    align-items: center;
    gap: var(--ui-space-5, 5px);
    min-height: var(--ui-control-24, 24px);
    padding: var(--ui-space-2, 2px) var(--ui-space-9, 9px) var(--ui-space-2, 2px) var(--ui-space-5, 5px);
    border: 1px solid color-mix(in srgb, var(--badge-color) 24%, transparent);
    border-radius: 999px;
    color: var(--badge-color);
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--badge-color) 13%, var(--card-background, var(--background-color))),
      color-mix(in srgb, var(--badge-accent) 6%, var(--card-background, var(--background-color)))
    );
    box-shadow: inset 0 1px 0 color-mix(in srgb, white 13%, transparent);
    font-size: var(--ui-font-11, 11px);
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
    user-select: none;
    transition:
      transform 0.16s ease,
      border-color 0.16s ease,
      box-shadow 0.16s ease;

    &:hover,
    &:focus-visible {
      transform: translateY(-1px);
      border-color: color-mix(in srgb, var(--badge-color) 48%, transparent);
      box-shadow:
        inset 0 1px 0 color-mix(in srgb, white 16%, transparent),
        0 5px 12px color-mix(in srgb, var(--badge-color) 16%, transparent);
      outline: none;
    }

    &:active {
      transform: translateY(0) scale(0.96);
    }
  }

  .bookmark-capability--summary {
    --badge-color: var(--primary-color);
    --badge-accent: var(--resource-tag-color);
  }

  .bookmark-capability--compact {
    width: var(--ui-control-25, 25px);
    min-width: var(--ui-control-25, 25px);
    height: var(--ui-control-25, 25px);
    min-height: var(--ui-control-25, 25px);
    justify-content: center;
    padding: 0;
    border-radius: 8px;
  }

  .bookmark-capability__icon {
    display: inline-flex;
    width: var(--ui-layout-17, 17px);
    height: var(--ui-layout-17, 17px);
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    background: color-mix(in srgb, var(--badge-color) 12%, transparent);
    flex: none;
  }

  .bookmark-capability--compact .bookmark-capability__icon {
    width: var(--ui-layout-18, 18px);
    height: var(--ui-layout-18, 18px);
    background: transparent;
  }

  .bookmark-capability__label {
    letter-spacing: 0.01em;
  }

  html.light-note-mobile-rendering .bookmark-capability {
    border-color: var(--badge-color);
    background: var(--card-background);
    box-shadow: none;
  }
</style>
