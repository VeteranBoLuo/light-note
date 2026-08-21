<template>
  <div v-if="visible && text" class="note-tree-drop-feedback" :class="{ 'is-ready': ready }" role="status">
    {{ text }}
  </div>
</template>

<script lang="ts" setup>
  withDefaults(
    defineProps<{
      visible?: boolean;
      ready?: boolean;
      text?: string;
    }>(),
    {
      visible: false,
      ready: false,
      text: '',
    },
  );
</script>

<style lang="less" scoped>
  .note-tree-drop-feedback {
    position: absolute;
    z-index: 12;
    left: 50%;
    bottom: 18px;
    max-width: min(88%, 520px);
    padding: 8px 13px;
    transform: translateX(-50%);
    border: 1px solid var(--resource-note-color, #00a884);
    border-radius: 10px;
    color: var(--resource-note-color, #00a884);
    background: var(--menu-body-bg-color);
    box-shadow: var(--resource-card-shadow);
    font-size: 12px;
    font-weight: 650;
    pointer-events: none;

    &.is-ready {
      color: #fff;
      background: var(--resource-note-color, #00a884);
    }
  }

  :global(.note-tree-drag-image) {
    position: fixed;
    top: -1000px;
    left: -1000px;
    z-index: 800;
    max-width: 190px;
    padding: 7px 11px;
    overflow: hidden;
    border: 1px solid var(--resource-note-color, #00a884);
    border-radius: 9px;
    color: var(--resource-note-color, #00a884);
    background: var(--menu-body-bg-color, #fff);
    box-shadow: 0 8px 22px rgb(15 23 42 / 18%);
    font-size: 12px;
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
    pointer-events: none;
  }
</style>
