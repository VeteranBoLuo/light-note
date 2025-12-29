<template>
  <div class="b_btn" :style="{ border }" :class="[btnClass, sizeClass, danger]">
    <slot></slot>
  </div>
</template>

<script lang="ts" setup>
  import { computed, PropType } from 'vue';

  const props = defineProps({
    size: {
      type: String as PropType<'default' | 'small' | 'large'>,
      default: 'default',
    },
    type: {
      type: String as PropType<'primary' | 'danger' | 'success' | 'function'>,
      default: '',
    },
    danger: {
      type: Boolean,
      default: false,
    },
    border: {
      type: String,
      default: '',
    },
  });

  const btnClass = computed(() => {
    if (props.type === 'primary') {
      return 'primary_btn';
    } else if (props.type === 'success') {
      return 'success_btn';
    } else if (props.type === 'function') {
      return 'function_btn';
    } else {
      return 'default_btn';
    }
  });

  const sizeClass = computed(() => {
    if (props.size === 'small') {
      return 'small_btn';
    } else if (props.size === 'large') {
      return 'large_btn';
    } else {
      return '';
    }
  });
</script>

<style scoped lang="less">
  .b_btn {
    border-radius: 6px;
    white-space: nowrap;
    text-align: center;
    box-sizing: border-box;
    cursor: pointer;
    height: 32px;
    line-height: 32px;
    transition: color 0.2s;
    width: max-content;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 0 15px;
    font-size: 14px;
  }
  .primary_btn {
    background-color: #615ced;
    color: white;
    transition: all 0.3s;
    &:hover {
      background-color: #6b66ef;
    }
  }
  .danger {
    background-color: #fe2c55;
    color: white;
    transition: all 0.3s;
    &:hover {
      background-color: #ff7875;
    }
  }
  .success_btn {
    background-color: #ff5722;
    color: white;
    transition: all 0.3s;
    &:hover {
      background-color: #ff7432;
    }
  }
  .default_btn {
    color: var(--text-color);
    background-color: var(--primary-btn-bg-color);
    transition: all 0.3s;
    &:hover {
      background-color: var(--primary-btn-h-bg-color);
    }
  }

  .function_btn {
    background-color: #554dd5;
    color: white;
    transition: all 0.3s;
    &:hover {
      background-color: #6762ee;
    }
  }

  .small_btn {
    height: 24px;
    line-height: 24px;
    padding: 0 10px;
    font-size: 12px;
  }

  .large_btn {
    height: 40px;
    line-height: 40px;
    padding: 0 20px;
    font-size: 16px;
  }
</style>
