<template>
  <div class="reference-summary">
    <BChip :tone="type === 'todo' ? 'neutral' : type" size="medium" :class="{ 'is-todo': type === 'todo' }">
      <span class="reference-summary__identity">
        <SvgIcon :src="type === 'todo' ? icon.todoWorkspace.checkSquare : icon.resource[type]" size="15" aria-hidden="true" />
        {{ typeLabel }}
      </span>
    </BChip>
    <h3>{{ title }}</h3>
    <p class="reference-summary__status" :class="{ 'is-unavailable': unavailable }" role="status">
      <span aria-hidden="true" class="reference-summary__dot"></span>
      {{ status }}
    </p>
  </div>
</template>

<script setup lang="ts">
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import type { ResourceRefType } from '@/utils/noteResourceRefs';

  defineProps<{
    type: ResourceRefType;
    typeLabel: string;
    title: string;
    status: string;
    unavailable?: boolean;
  }>();
</script>

<style scoped lang="less">
  .reference-summary {
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;

    .is-todo {
      --b-chip-fg: var(--chip-todo-fg);
      --b-chip-bg: var(--chip-todo-bg);
      --b-chip-border: var(--chip-todo-border);
    }

    h3 {
      margin: 0;
      color: var(--text-color);
      font-size: 19px;
      font-weight: 600;
      line-height: 1.5;
      overflow-wrap: anywhere;
    }
  }

  .reference-summary__identity {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .reference-summary__status {
    align-self: stretch;
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin: 4px 0 0;
    padding-top: 14px;
    border-top: 1px solid var(--border-color);
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.6;
    overflow-wrap: anywhere;

    &.is-unavailable {
      color: var(--error-color);
    }
  }

  .reference-summary__dot {
    flex: 0 0 5px;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: currentColor;
  }
</style>
