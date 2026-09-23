<template>
  <div class="space-body">
    <slot></slot>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue';
  import { useUiDensity } from '@/composables/useUiDensity';
  const { dimension } = useUiDensity();

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
    return dimension(props.size, 'space') + 'px';
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
