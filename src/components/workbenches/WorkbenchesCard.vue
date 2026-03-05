<template>
  <div class="workbenches-card">
    <div class="card-header">
      <b :class="['card-title', titleType && `card-title--${titleType}`]">{{ title }}</b>
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
  defineProps<{
    title?: string;
    titleType?: 'bookmark' | 'tag' | 'note' | 'file' | '';
  }>();
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

  .card-title {
    --title-accent: var(--noteType-hover-color);
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    line-height: 1.2;

    &::before {
      content: '';
      width: 6px;
      height: 6px;
      border-radius: 999px;
      background: var(--title-accent);
      box-shadow: 0 0 0 4px color-mix(in srgb, var(--title-accent) var(--workbench-accent-ring-alpha), transparent);
      flex-shrink: 0;
    }
  }

  .card-title--bookmark::before {
    --title-accent: var(--workbench-accent-bookmark-start);
  }

  .card-title--tag::before {
    --title-accent: var(--workbench-accent-tag-start);
  }

  .card-title--note::before {
    --title-accent: var(--workbench-accent-note-start);
  }

  .card-title--file::before {
    --title-accent: var(--workbench-accent-file-start);
  }

  .card-content {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
</style>
