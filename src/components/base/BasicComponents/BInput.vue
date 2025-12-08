<template>
  <div class="input-container">
    <textarea
      v-if="type === 'textarea'"
      :id="id"
      :rows="rows"
      class="b-textarea"
      :value="value"
      @input="handleInput"
      @enter="$emit('enter')"
      :style="{
        paddingLeft: hasPrefixSlot ? '30px' : '11px',
        paddingRight: hasSuffixSlot ? '30px' : '11px',
      }"
      :autocomplete="autocomplete"
      :placeholder="placeholder"
      @focus="$emit('focus')"
      @focusout="$emit('focusout')"
    />
    <input
      v-else
      :id="id"
      class="b-input"
      :class="inputTheme"
      :value="value"
      :type="type"
      @input="handleInput"
      @keydown.enter="$emit('enter')"
      :style="{
        paddingLeft: hasPrefixSlot ? '35px' : '11px',
        paddingRight: hasSuffixSlot ? '35px' : '11px',
      }"
      :autocomplete="autocomplete"
      :maxlength="maxlength"
      :placeholder="placeholder"
      @change="$emit('change')"
      @focus="$emit('focus')"
      @blur="$emit('blur')"
      @focusout="$emit('focusout')"
    />
    <div v-if="hasPrefixSlot" class="prefix-icon">
      <slot name="prefix"> </slot>
    </div>
    <div v-if="hasSuffixSlot" class="suffix-icon">
      <slot name="suffix"> </slot>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { useSlots, computed, Ref } from 'vue';
  import { gt } from '@/utils/global.ts';

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
    }>(),
    {
      id: () => Math.floor(Math.random() * 9000000).toString(),
      placeholder: gt('placeholder.input'),
      type: 'text',
      autocomplete: 'off',
      height: '32px',
      theme: '',
      maxlength: '',
      rows: 4,
    },
  );
  const value: Ref<string | number | undefined> = defineModel('value');
  const emit = defineEmits(['input', 'enter', 'focus', 'focusout', 'blur', 'change']);

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

  function handleInput(event) {
    value.value = event.target.value;
    emit('input', event.target.value);
  }

  const inputTheme = computed(() => {
    if (props.theme) {
      return 'input-' + props.theme;
    }
    return '';
  });
</script>
<style lang="less" scoped>
  .input-container {
    width: 100%;
    position: relative;
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
  }
  .b-textarea {
    border: 1px solid #d9d9d9;
    border-radius: 6px;
    padding: 4px 11px;
    width: 100%;
    box-sizing: border-box;
    background-color: var(--bl-input-bg-color);
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
    border: 1px solid #d9d9d9 !important;
    background-color: #ffffff !important;
    color: rgb(0, 0, 0) !important;
  }
</style>
