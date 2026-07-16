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
      @keydown.enter="handleEnter"
      @keydown.esc="handleEscape"
      :style="{
        paddingLeft: hasPrefixSlot ? '30px' : '11px',
        paddingRight: hasSuffixSlot ? '30px' : '11px',
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
      @keydown.enter="handleEnter"
      :style="{
        paddingLeft: hasPrefixSlot ? '35px' : '11px',
        paddingRight: hasSuffixSlot ? '35px' : '11px',
      }"
      :autocomplete="autocomplete"
      :maxlength="maxlength"
      :disabled="disabled"
      :readonly="readonly"
      :placeholder="placeholder"
      @change="$emit('change')"
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
      autocomplete?: 'off' | 'on' | 'new-password';
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
  const emit = defineEmits(['input', 'enter', 'focus', 'focusout', 'blur', 'change', 'scroll']);
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

  function handleEnter(event: KeyboardEvent) {
    if (event.isComposing || event.keyCode === 229) return;
    if (props.type === 'textarea') {
      if (!props.submitOnEnter || event.shiftKey) return;
      event.preventDefault();
    }
    emit('enter', event);
  }

  function handleEscape(event: KeyboardEvent) {
    if (event.isComposing || event.keyCode === 229) event.stopPropagation();
  }

  function focus() {
    inputEl.value?.focus();
  }

  defineExpose({ focus, inputEl });

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
  .b-input {
    border-radius: 6px;
    padding: 0 11px;
    height: v-bind(height);
    width: 100%;
    box-sizing: border-box;
    color: var(--bl-input-color);

    border-color: transparent !important;
    box-shadow: none !important;
    background: var(--bl-input-noBorder-bg-color);
    transition: background-color 0.3s;
    &:hover {
      background: var(--bl-input-noBorder-hover-bg-color);
    }
    &:focus-visible {
      background: var(--bl-input-noBorder-hover-bg-color);
    }
    outline: none;
    &:disabled {
      cursor: not-allowed;
      opacity: 0.72;
    }
  }
  .b-textarea {
    border: 1px solid #d9d9d9;
    border-radius: 6px;
    padding: 4px 11px;
    width: 100%;
    box-sizing: border-box;
    background-color: unset !important;
    color: var(--bl-input-color);
    font-family: '微软雅黑 Light', serif;
    &:focus {
      border: 1px solid var(--bl-input-border-h-color);
      box-shadow: 0 0 0 1px rgba(92, 90, 86, 0.1);
    }
    &:hover {
      border: 1px solid var(--bl-input-border-h-color);
    }
    &:active {
      border: 1px solid var(--bl-input-border-h-color);
    }
    outline: none;
    &:disabled {
      cursor: not-allowed;
      opacity: 0.72;
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
  .input-al-day {
    border: 1px solid var(--card-border-color) !important;
    background-color: var(--background-color) !important;
    color: var(--text-color) !important;
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
