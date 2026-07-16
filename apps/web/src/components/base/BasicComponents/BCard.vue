<template>
  <component
    :is="as"
    class="card-container"
    :class="[`card-container--${variant}`, { 'card-container--interactive': interactive }]"
    :style="cardStyle"
  >
    <div v-if="hasHeader" class="card-container-header">
      <div class="card-title">
        <slot name="title">
          <span>{{ title }}</span>
        </slot>
      </div>
      <div v-if="slots.extra" class="card-extra">
        <slot name="extra" />
      </div>
    </div>
    <slot />
  </component>
</template>

<script lang="ts" setup>
  import { computed, useSlots } from 'vue';

  type CardVariant = 'card' | 'panel' | 'raised';

  const props = withDefaults(
    defineProps<{
      title?: string;
      size?: string | number;
      variant?: CardVariant;
      as?: string;
      interactive?: boolean;
      padding?: string;
      radius?: string;
    }>(),
    {
      title: '',
      size: 14,
      variant: 'card',
      as: 'div',
      interactive: false,
      padding: '16px',
      radius: '14px',
    },
  );

  const slots = useSlots();
  const hasHeader = computed(() => Boolean(props.title || slots.title || slots.extra));
  const cardStyle = computed<Record<string, string>>(() => ({
    '--b-card-padding': props.padding,
    '--b-card-radius': props.radius,
    '--b-card-title-size': typeof props.size === 'number' ? `${props.size}px` : props.size,
  }));
</script>

<style scoped lang="less">
  .card-container {
    width: 100%;
    min-width: 0;
    padding: var(--b-card-padding);
    box-sizing: border-box;
    border: 1px solid var(--b-card-border-color, var(--surface-border-color, var(--card-border-color)));
    border-radius: var(--b-card-radius);
    color: var(--text-color);
  }

  .card-container--card {
    background: var(--b-card-background, var(--card-background, var(--background-color)));
    box-shadow: var(--b-card-shadow, var(--surface-card-shadow, none));
  }

  .card-container--panel {
    background: var(--b-card-background, var(--workspace-panel-bg-color));
    box-shadow: var(--b-card-shadow, none);
  }

  .card-container--raised {
    background: var(--b-card-background, var(--surface-raised-background, var(--card-background)));
    box-shadow: var(--b-card-shadow, var(--surface-raised-shadow, none));
  }

  .card-container--interactive {
    transition:
      border-color 0.18s ease,
      box-shadow 0.18s ease;
  }

  .card-container--interactive:hover,
  .card-container--interactive:focus-visible {
    box-shadow: var(--b-card-hover-shadow, var(--surface-hover-shadow, var(--surface-card-shadow, none)));
  }

  .card-container--interactive:focus-visible {
    outline: none;
  }

  .card-container-header {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }

  .card-title {
    min-width: 0;
    color: var(--text-color);
    font-size: var(--b-card-title-size);
    font-weight: 650;
    line-height: 1.45;
  }

  .card-extra {
    min-width: 0;
    flex: 0 0 auto;
  }
</style>
