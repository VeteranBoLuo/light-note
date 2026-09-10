<template>
  <div class="input-container">
    <textarea
      ref="inputEl"
      v-if="type === 'textarea'"
      :id="id"
      :rows="rows"
      :maxlength="maxlength"
      :disabled="disabled"
      :readonly="readonly"
      class="b-textarea"
      :value="value"
      @input="handleInput"
      @scroll="$emit('scroll', $event)"
      @keydown="handleKeydown"
      @select="$emit('select', $event)"
      @compositionstart="$emit('compositionstart', $event)"
      @compositionend="$emit('compositionend', $event)"
      :style="{
        paddingLeft: hasPrefixSlot ? '30px' : '11px',
        paddingRight: hasSuffixSlot || showClearBtn ? '30px' : '11px',
      }"
      :autocomplete="autocomplete"
      :placeholder="computedPlaceholder"
      @focus="$emit('focus')"
      @focusout="$emit('focusout')"
    />
    <input
      ref="inputEl"
      v-else
      :id="id"
      class="b-input"
      :class="inputTheme"
      :value="value"
      :type="type"
      @input="handleInput"
      @keydown="handleKeydown"
      @select="$emit('select', $event)"
      @compositionstart="$emit('compositionstart', $event)"
      @compositionend="$emit('compositionend', $event)"
      :style="{
        paddingLeft: hasPrefixSlot ? '35px' : '11px',
        paddingRight: hasSuffixSlot || showClearBtn ? '35px' : '11px',
      }"
      :autocomplete="autocomplete"
      :maxlength="maxlength"
      :disabled="disabled"
      :readonly="readonly"
      :placeholder="placeholder"
      @change="handleChange"
      @focus="$emit('focus')"
      @blur="$emit('blur')"
      @focusout="$emit('focusout')"
    />
    <div v-if="hasPrefixSlot" class="prefix-icon">
      <slot name="prefix"> </slot>
    </div>
    <div v-if="hasSuffixSlot && !showClearBtn" class="suffix-icon">
      <slot name="suffix"> </slot>
    </div>
    <div v-if="showClearBtn" class="input-clear-btn" @click.stop="handleClear">✕</div>
  </div>
</template>

<script setup lang="ts">
  import { useSlots, computed, Ref, ref } from 'vue';
  import { useI18n } from 'vue-i18n';

  const { t } = useI18n();

  const props = withDefaults(
    defineProps<{
      id?: string;
      placeholder?: string;
      type?: string;
      autocomplete?: 'off' | 'on' | 'email' | 'username' | 'current-password' | 'new-password' | 'one-time-code';
      height?: string;
      theme?: 'al-day' | '';
      rows?: number;
      maxlength?: number | string;
      clearable?: boolean;
      submitOnEnter?: boolean;
      disabled?: boolean;
      readonly?: boolean;
    }>(),
    {
      id: () => Math.floor(Math.random() * 9000000).toString(),
      placeholder: '',
      type: 'text',
      autocomplete: 'off',
      height: '32px',
      theme: '',
      maxlength: '',
      clearable: false,
      submitOnEnter: false,
      rows: 4,
      disabled: false,
      readonly: false,
    },
  );
  const value: Ref<string | number | undefined> = defineModel('value');
  const emit = defineEmits([
    'input',
    'enter',
    'focus',
    'focusout',
    'blur',
    'change',
    'scroll',
    'keydown',
    'select',
    'compositionstart',
    'compositionend',
  ]);
  const inputEl = ref<HTMLInputElement | HTMLTextAreaElement | null>(null);

  // 获取插槽内容
  const slots = useSlots();

  // 计算属性来判断是否有内容传递给 prefix 插槽
  const hasPrefixSlot = computed(() => {
    return !!slots.prefix;
  });

  // 计算属性来判断是否有内容传递给 suffix 插槽
  const hasSuffixSlot = computed(() => {
    return !!slots.suffix;
  });

  // 计算属性来处理 placeholder，默认使用国际化文本
  const computedPlaceholder = computed(() => {
    return props.placeholder || t('placeholder.input');
  });

  function handleInput(event) {
    value.value = event.target.value;
    emit('input', event.target.value);
  }

  function handleChange(event: Event) {
    emit('change', (event.target as HTMLInputElement).value);
  }

  function handleEnter(event: KeyboardEvent) {
    if (event.isComposing || event.keyCode === 229) return;
    if (props.type === 'textarea') {
      if (!props.submitOnEnter || event.shiftKey) return;
      event.preventDefault();
    }
    emit('enter', event);
  }

  function handleKeydown(event: KeyboardEvent) {
    emit('keydown', event);
    if (event.defaultPrevented) return;
    if (event.key === 'Enter') handleEnter(event);
    else if (event.key === 'Escape') handleEscape(event);
  }

  function handleEscape(event: KeyboardEvent) {
    if (event.isComposing || event.keyCode === 229) event.stopPropagation();
  }

  function focus() {
    inputEl.value?.focus();
  }

  function select() {
    inputEl.value?.select();
  }

  defineExpose({ focus, select, inputEl });

  const inputTheme = computed(() => {
    if (props.theme) {
      return 'input-' + props.theme;
    }
    return '';
  });

  const showClearBtn = computed(() => props.clearable && !!value.value);

  function handleClear() {
    value.value = '';
    emit('input', '');
  }
</script>
<style lang="less" scoped>
  .input-container {
    width: 100%;
    position: relative;
    color: var(--text-color);
  }
  .b-input,
  .b-textarea {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid var(--bl-input-border-color);
    border-radius: 8px;
    color: var(--bl-input-color);
    background: var(--bl-input-bg-color);
    font-family: inherit;
    outline: none;
    transition:
      background-color 0.18s ease,
      border-color 0.18s ease,
      box-shadow 0.18s ease;

    &::placeholder {
      color: var(--desc-color);
      opacity: 1;
    }
    &:focus {
      outline: 1px solid var(--bl-input-focus-border-color);
      outline-offset: -1px;
      box-shadow: var(--bl-input-focus-shadow);
    }
    &:focus:not(:disabled):not(:read-only) {
      border-color: var(--bl-input-focus-border-color);
      background: var(--bl-input-focus-bg-color);
    }
    &:disabled {
      cursor: not-allowed;
      opacity: 0.72;
    }
  }
  .b-input {
    padding: 0 11px;
    height: v-bind(height);
  }
  .b-textarea {
    padding: 4px 11px;
  }
  @media (hover: hover) and (pointer: fine) {
    .b-input,
    .b-textarea {
      &:hover:not(:focus):not(:disabled):not(:read-only) {
        border-color: var(--bl-input-hover-border-color);
        background: var(--bl-input-hover-bg-color);
      }
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .b-input,
    .b-textarea {
      transition: none;
    }
  }

  .prefix-icon {
    position: absolute;
    left: 10px;
    top: 0;
    min-width: 16px;
    height: 100%;
    display: grid;
    place-items: center;
  }
  .suffix-icon {
    position: absolute;
    right: 10px;
    top: 0;
    min-width: 16px;
    height: 100%;
    display: grid;
    place-items: center;
  }
  input:-webkit-autofill,
  textarea:-webkit-autofill,
  select:-webkit-autofill {
    -webkit-text-fill-color: var(--text-color); //这个地方的颜色是字体颜色，可以根据实际情况修改
    transition: background-color 50000s ease-in-out 0s;
  }
  .input-clear-btn {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    cursor: pointer;
    font-size: 12px;
    color: var(--desc-color);
    transition:
      background 0.15s,
      color 0.15s;
    line-height: 1;
    z-index: 1;
  }
  .input-clear-btn:hover {
    background: var(--bl-input-noBorder-hover-bg-color);
    color: var(--text-color);
  }
</style>
