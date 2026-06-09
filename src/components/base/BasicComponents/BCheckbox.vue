<template>
  <label
    class="b-checkbox"
    :class="{
      'is-checked': localChecked,
      'is-indeterminate': indeterminate,
      'is-disabled': disabled,
    }"
    @click="handleClick"
  >
    <span class="b-checkbox__input">
      <span class="b-checkbox__inner">
        <svg v-if="indeterminate" class="b-checkbox__icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        <svg v-else-if="localChecked" class="b-checkbox__icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="4 12 10 18 20 6" />
        </svg>
      </span>
    </span>
    <span v-if="$slots.default || label" class="b-checkbox__label">
      <slot>{{ label }}</slot>
    </span>
  </label>
</template>

<script setup lang="ts">
  import { ref, watch } from 'vue';

  const props = withDefaults(
    defineProps<{
      modelValue?: boolean;
      checked?: boolean;
      value?: string | number;
      label?: string;
      indeterminate?: boolean;
      disabled?: boolean;
    }>(),
    {
      modelValue: false,
      checked: false,
      indeterminate: false,
      disabled: false,
    },
  );

  const emit = defineEmits<{
    'update:modelValue': [value: boolean];
    'update:checked': [value: boolean];
    change: [value: boolean];
  }>();

  // 本地状态，乐观更新
  // 优先取 checked（显式绑定），再取 modelValue（v-model 兼容）
  const localChecked = ref(props.checked ?? props.modelValue);

  // 外部 prop 变化时同步：分别 watch checked 和 modelValue
  watch(
    () => props.checked,
    (val) => {
      localChecked.value = val;
    },
    { immediate: true },
  );
  watch(
    () => props.modelValue,
    (val) => {
      localChecked.value = val;
    },
    { immediate: true },
  );

  function handleClick() {
    if (props.disabled) return;
    const newVal = !localChecked.value;
    localChecked.value = newVal;
    emit('update:modelValue', newVal);
    emit('update:checked', newVal);
    emit('change', newVal);
  }
</script>

<style lang="less">
  .b-checkbox {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    padding: 4px;

    &.is-disabled {
      cursor: not-allowed;
      opacity: 0.45;
    }
  }

  .b-checkbox__input {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .b-checkbox__inner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--card-border-color);
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
    box-sizing: border-box;
    background: transparent;
  }

  .b-checkbox:hover .b-checkbox__inner {
    border-color: var(--primary-color);
  }

  .b-checkbox.is-checked .b-checkbox__inner {
    border-color: var(--primary-color);
    background: var(--primary-color);
  }

  .b-checkbox.is-indeterminate .b-checkbox__inner {
    border-color: var(--primary-color);
    background: var(--primary-color);
  }

  .b-checkbox__icon {
    color: #fff;
    display: block;
  }

  .b-checkbox__label {
    font-size: 14px;
    color: var(--text-color);
    line-height: 1.4;
  }

  [data-theme='night'] {
    .b-checkbox__inner {
      border-color: #6e6e77;
    }
  }
</style>
