<template>
  <div v-if="vertical" class="b-radio-options" role="radiogroup" :aria-label="ariaLabel">
    <BButton
      v-for="(item, index) in options"
      :key="item.value"
      role="radio"
      :aria-checked="value === item.value"
      :tabindex="value === item.value ? 0 : -1"
      class="b-radio-option"
      :class="{ 'is-selected': value === item.value }"
      @click="radioClick(item.value)"
      @keydown="onKey($event, index)"
    >
      <span class="b-radio-option__indicator" aria-hidden="true" />
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
      ariaLabel?: string;
    }>(),
    { value: '', options: () => [], vertical: false, ariaLabel: '' },
  );
  function onKey(event: KeyboardEvent, index: number) {
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
    emit('update:value', value);
  }
</script>

<style lang="less">
  .bl-radio-group {
    display: flex;
    flex-wrap: wrap;
    gap: 15px;
  }
  .bl-radio {
    cursor: pointer;
    height: 30px;
    line-height: 30px;
    display: flex;
    align-items: center;
    box-sizing: border-box;
    padding: 0 10px;
    width: max-content;
    border-radius: 4px;
    border: 1px solid #333333;
  }
</style>
<style scoped lang="less">
  .b-radio-options {
    display: grid;
    gap: 8px;
  }
  .b-radio-option.b_btn {
    display: flex;
    align-items: flex-start;
    justify-content: flex-start;
    gap: 10px;
    width: 100%;
    height: auto;
    padding: 12px;
    text-align: left;
    white-space: normal;
    border: 1px solid var(--surface-border-color);
    border-radius: 8px;
    background: transparent;
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
    flex: 0 0 16px;
    width: 16px;
    height: 16px;
    box-sizing: border-box;
    border: 1px solid var(--desc-color);
    border-radius: 50%;
    margin-top: 2px;
  }
  .is-selected .b-radio-option__indicator {
    border: 5px solid var(--primary-color);
  }
  .b-radio-option__body {
    display: grid;
    gap: 4px;
    min-width: 0;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
  .b-radio-option__body strong {
    font-size: 14px;
    font-weight: 600;
  }
  .b-radio-option__body small {
    font-size: 12px;
    color: var(--desc-color);
  }
</style>
