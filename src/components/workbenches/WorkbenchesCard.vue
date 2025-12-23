<template>
  <div class="workbenches-card">
    <div>
      <b>{{ title }}</b>
      <div style="position: absolute; right: 10px;top: 10px">
        <slot name="rightHeader" />
      </div>
    </div>
    <div style="margin-top: 10px; flex: 1">
      <slot />
    </div>
  </div>
</template>

<script lang="ts" setup>
  defineProps<{ title?: string }>();
</script>

<style lang="less" scoped>
  .workbenches-card {
    position: relative;
    padding: 10px;
    box-shadow:
      0 0 5px 0 rgba(0, 0, 0, 0.02),
      0 2px 10px 0 rgba(0, 0, 0, 0.06),
      0 0 1px 0 rgba(0, 0, 0, 0.3);
    background-color: var(--menu-body-bg-color);
    height: 100%;
    width: 100%;
    border-radius: 12px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
  }
</style>
