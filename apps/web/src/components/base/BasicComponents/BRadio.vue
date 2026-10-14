<template>
  <div
    v-if="vertical || variant === 'segment'"
    class="b-radio-options"
    :class="{ 'is-segment': variant === 'segment' }"
    role="radiogroup"
    :aria-label="ariaLabel"
  >
    <BButton
      v-for="(item, index) in options"
      :key="item.value"
      role="radio"
      :aria-checked="value === item.value"
      :tabindex="value === item.value || (!options.some((option) => option.value === value) && index === 0) ? 0 : -1"
      :disabled="disabled"
      :type="variant === 'segment' && value === item.value ? 'primary' : undefined"
      class="b-radio-option"
      :class="{ 'is-selected': value === item.value }"
      @click="radioClick(item.value)"
      @keydown="onKey($event, index)"
    >
      <span v-if="variant !== 'segment'" class="b-radio-option__indicator" aria-hidden="true" />
      <span class="b-radio-option__body"
        ><strong>{{ item.label }}</strong
        ><small v-if="item.description">{{ item.description }}</small></span
      >
    </BButton>
  </div>
  <div v-else class="bl-radio-group">
    <div
      class="bl-radio"
      v-for="(item, index) in options"
      :key="index"
      :class="{ 'element-primary': value === item.value }"
      @click="radioClick(item.value)"
    >
      {{ item.label }}
    </div>
  </div>
</template>

<script lang="ts" setup>
  import BButton from './BButton.vue';
  const props = withDefaults(
    defineProps<{
      value?: string;
      options?: { value: string; label: string; description?: string }[];
      vertical?: boolean;
      variant?: 'default' | 'segment';
      disabled?: boolean;
      ariaLabel?: string;
    }>(),
    { value: '', options: () => [], vertical: false, ariaLabel: '', variant: 'default', disabled: false },
  );
  function onKey(event: KeyboardEvent, index: number) {
    if (props.disabled || !props.options.length) return;
    const keys = ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const length = props.options.length;
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? length - 1
          : (index + (['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : -1) + length) % length;
    radioClick(props.options[next].value);
    const button = event.currentTarget as HTMLElement;
    (button.parentElement?.children[next] as HTMLElement)?.focus();
  }
  const emit = defineEmits(['update:value']);

  function radioClick(value) {
    if (props.disabled) return;
    emit('update:value', value);
  }
</script>

<style lang="less">
  .bl-radio-group {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-space-15, 15px);
  }
  .bl-radio {
    cursor: pointer;
    height: var(--ui-layout-30, 30px);
    line-height: var(--ui-layout-30, 30px);
    display: flex;
    align-items: center;
    box-sizing: border-box;
    padding: 0 var(--ui-space-10, 10px);
    width: max-content;
    border-radius: 4px;
    border: 1px solid #333333;
  }
</style>
<style scoped lang="less">
  .b-radio-options {
    display: grid;
    gap: var(--ui-space-8, 8px);
  }
  .b-radio-option.b_btn {
    display: flex;
    align-items: flex-start;
    justify-content: flex-start;
    gap: var(--ui-space-10, 10px);
    width: 100%;
    height: auto;
    padding: var(--ui-space-12, 12px);
    text-align: left;
    white-space: normal;
    border: 1px solid var(--surface-border-color);
    border-radius: 8px;
    background: transparent;
  }
  .b-radio-option.b_btn:not(.primary_btn) {
    color: var(--text-color);
  }
  .b-radio-option.b_btn:hover {
    background: var(--hover-background);
  }
  .b-radio-option.b_btn.is-selected {
    border-color: var(--primary-color);
  }
  .b-radio-option.b_btn:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }
  .b-radio-option__indicator {
    flex: 0 0 var(--ui-layout-16, 16px);
    width: var(--ui-layout-16, 16px);
    height: var(--ui-layout-16, 16px);
    box-sizing: border-box;
    border: 1px solid var(--desc-color);
    border-radius: 50%;
    margin-top: var(--ui-space-2, 2px);
  }
  .is-selected .b-radio-option__indicator {
    border: 5px solid var(--primary-color);
  }
  .b-radio-option__body {
    display: grid;
    gap: var(--ui-space-4, 4px);
    min-width: 0;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
  .b-radio-option__body strong {
    font-size: var(--ui-font-14, 14px);
    font-weight: 600;
  }
  .b-radio-option__body small {
    font-size: var(--ui-font-12, 12px);
    color: var(--desc-color);
  }
  .b-radio-options.is-segment {
    display: inline-grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(0, 1fr);
    gap: 0;
    width: max-content;
    max-width: 100%;
    box-sizing: border-box;
    padding: var(--ui-space-2, 2px);
    border: 1px solid var(--surface-border-color);
    border-radius: 8px;
    background: var(--hover-background);
  }
  .is-segment .b-radio-option.b_btn {
    align-items: center;
    justify-content: center;
    min-width: 0;
    min-height: var(--ui-control-32, 32px);
    padding: var(--ui-space-4, 4px) var(--ui-space-12, 12px);
    border-color: transparent;
    border-radius: 6px;
    text-align: center;
  }
  .is-segment .b-radio-option.b_btn.is-selected {
    border-color: var(--primary-color);
    background: var(--primary-color);
  }
  .is-segment .b-radio-option.b_btn:focus-visible {
    outline-offset: -2px;
  }
  .is-segment .b-radio-option.b_btn.is-selected:focus-visible {
    outline-color: currentColor;
  }
  .is-segment .b-radio-option__body strong {
    font-weight: 500;
  }
</style>
