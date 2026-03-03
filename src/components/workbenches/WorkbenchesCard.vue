<template>
  <div class="workbenches-card">
    <div class="card-header">
      <b>{{ title }}</b>
      <div style="position: absolute; right: 10px; top: 10px">
        <slot name="rightHeader" />
      </div>
    </div>
    <div class="card-content">
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
    box-shadow: var(--ant-table-boxShadow);
    background-color: var(--menu-body-bg-color);
    color: var(--text-color);
    height: 100%;
    width: 100%;
    border-radius: 12px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow: hidden;
  }

  .card-header {
    flex-shrink: 0;
  }

  .card-content {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
</style>
