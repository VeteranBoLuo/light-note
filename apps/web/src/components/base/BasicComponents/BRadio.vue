<template>
  <div class="bl-radio-group">
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
  const props = defineProps({
    value: {
      type: String,
      default: () => '',
    },
    options: {
      type: Array,
      default: () => [],
    },
  });
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