<template>
  <div v-if="interactive" class="mobile-list-row__item-shell" role="listitem" @click="emit('click')">
    <BButton
      class="mobile-list-row"
      :class="rowClasses"
      :aria-current="selected ? 'true' : undefined"
    >
      <span v-if="$slots.leading" class="mobile-list-row__leading"><slot name="leading" /></span>
      <span v-if="$slots.default" class="mobile-list-row__body"><slot /></span>
      <span v-else class="mobile-list-row__body">
        <strong class="mobile-list-row__title"><slot name="title" /></strong>
        <span v-if="$slots.subtitle" class="mobile-list-row__subtitle"><slot name="subtitle" /></span>
        <span v-if="$slots.meta" class="mobile-list-row__meta"><slot name="meta" /></span>
      </span>
      <span v-if="$slots.trailing" class="mobile-list-row__trailing"><slot name="trailing" /></span>
    </BButton>
  </div>
  <div v-else class="mobile-list-row" :class="rowClasses" role="listitem">
    <span v-if="$slots.leading" class="mobile-list-row__leading"><slot name="leading" /></span>
    <span v-if="$slots.default" class="mobile-list-row__body"><slot /></span>
    <span v-else class="mobile-list-row__body">
      <strong class="mobile-list-row__title"><slot name="title" /></strong>
      <span v-if="$slots.subtitle" class="mobile-list-row__subtitle"><slot name="subtitle" /></span>
      <span v-if="$slots.meta" class="mobile-list-row__meta"><slot name="meta" /></span>
    </span>
    <span v-if="$slots.trailing" class="mobile-list-row__trailing"><slot name="trailing" /></span>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';

  const props = withDefaults(
    defineProps<{ interactive?: boolean; selected?: boolean; complex?: boolean; accent?: string }>(),
    { interactive: false, selected: false, complex: false, accent: '' },
  );
  const emit = defineEmits<{ click: [] }>();
  const rowClasses = computed(() => ({
    'is-selected': props.selected,
    'is-complex': props.complex,
    'has-accent': Boolean(props.accent),
  }));
</script>

<style scoped lang="less">
  .mobile-list-row__item-shell {
    width: 100%;
    min-width: 0;
  }

  .mobile-list-row {
    --mobile-list-row-accent: v-bind(accent);

    width: 100%;
    height: auto;
    min-height: var(--mobile-row-min-height, 68px);
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: var(--mobile-row-padding-y, 12px) var(--mobile-row-padding-x, 14px);
    border: 0;
    border-radius: var(--mobile-row-radius, 0);
    color: var(--text-color);
    background: var(--card-background) !important;
    line-height: normal;
    text-align: left;
    white-space: normal;
  }

  .mobile-list-row.is-complex {
    min-height: 82px;
  }

  .mobile-list-row.has-accent {
    border-left: 4px solid var(--mobile-list-row-accent);
  }

  .mobile-list-row.is-selected {
    border-left: 4px solid var(--primary-color);
    color: var(--primary-color);
    background: var(--mobile-selected-bg) !important;
    font-weight: 650;
  }

  .mobile-list-row__leading,
  .mobile-list-row__trailing {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
  }

  .mobile-list-row__leading {
    width: 40px;
    justify-content: center;
  }

  .mobile-list-row__body {
    min-width: 0;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 4px;
  }

  .mobile-list-row__title,
  .mobile-list-row__subtitle,
  .mobile-list-row__meta {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .mobile-list-row__title {
    color: inherit;
    font-size: 15px;
    font-weight: 650;
    line-height: 1.35;
  }

  .mobile-list-row__subtitle,
  .mobile-list-row__meta {
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.35;
  }

  .mobile-list-row__trailing {
    margin-left: auto;
  }
</style>
