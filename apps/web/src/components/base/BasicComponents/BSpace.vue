<template>
  <div class="space-body">
    <slot></slot>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue';

  const props = defineProps({
    size: {
      type: Number,
      default: 10,
    },
    wrap: {
      type: Boolean,
      default: false,
    },
  });

  const gap = computed(() => {
    return props.size + 'px';
  });
  const isWrap = computed(() => {
    return props.wrap ? 'wrap' : '';
  });
</script>

<style lang="less">
  .space-body {
    width: max-content;
    flex-wrap: v-bind(isWrap);
    display: flex;
    align-items: center;
    gap: v-bind(gap);
  }
</style>
