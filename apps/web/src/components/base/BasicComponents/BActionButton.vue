<template>
  <BTooltip :title="tooltip" @click.stop>
    <span
      class="b-action-button"
      :class="[`b-action-button--${action}`, { 'b-action-button--with-label': label }]"
      role="button"
      tabindex="0"
      :aria-label="tooltip"
      @click="emit('click')"
      @keydown.enter.prevent.stop="emit('click')"
      @keydown.space.prevent.stop="emit('click')"
    >
      <SvgIcon :src="action === 'edit' ? icon.table_edit : icon.table_delete" size="17" />
      <span v-if="label" class="b-action-button__label">{{ label }}</span>
    </span>
  </BTooltip>
</template>

<script setup lang="ts">
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';

  withDefaults(
    defineProps<{
      action: 'edit' | 'delete';
      tooltip: string;
      label?: string;
    }>(),
    { label: '' },
  );

  const emit = defineEmits<{ click: [] }>();
</script>

<style scoped lang="less">
  .b-action-button {
    --action-color: var(--primary-color);
    display: inline-flex;
    width: 30px;
    height: 30px;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    border: 1px solid transparent;
    border-radius: 9px;
    color: var(--action-color);
    background: transparent;
    cursor: pointer;
    user-select: none;
    transition:
      color 0.16s ease,
      background 0.16s ease,
      border-color 0.16s ease,
      box-shadow 0.16s ease,
      transform 0.16s ease;

    &:hover,
    &:focus-visible {
      color: var(--action-color);
      background: color-mix(in srgb, var(--action-color) 10%, var(--background-color));
      border-color: color-mix(in srgb, var(--action-color) 24%, transparent);
      box-shadow: 0 4px 10px color-mix(in srgb, var(--action-color) 12%, transparent);
      transform: translateY(-1px);
      outline: none;
    }

    &:active {
      transform: translateY(0) scale(0.95);
    }
  }

  .b-action-button--delete {
    --action-color: var(--danger-color, #f0445e);
  }

  .b-action-button--with-label {
    width: auto;
    min-width: 30px;
    padding: 0 9px;
    gap: 5px;
    font-size: 12px;
    font-weight: 600;
  }

  .b-action-button__label {
    line-height: 1;
  }
</style>
