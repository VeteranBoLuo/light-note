<template>
  <div class="flex-align-center-gap tab-container">
    <div
      class="dom-hover tab"
      v-for="tab in resolvedOptions"
      :key="tab.key ?? tab.label"
      :class="{ 'is-active': activeValue === (tab.key ?? tab.label) }"
      @click="tabChange(tab)"
    >
      {{ tab.label }}
    </div>
    <div class="underline"></div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, nextTick, watch } from 'vue';

  export interface TabItem {
    label: string;
    key?: string;
  }

  const emit = defineEmits(['change']);
  const props = withDefaults(
    defineProps<{
      options: (string | TabItem)[];
    }>(),
    {
      options: () => [],
    },
  );

  const activeTab = defineModel<string>('activeTab');

  const resolvedOptions = computed<TabItem[]>(() =>
    props.options.map((opt) => (typeof opt === 'string' ? { label: opt } : opt)),
  );

  const activeValue = computed(() => {
    const active = activeTab.value;
    if (active == null) return '';
    const matched = resolvedOptions.value.find(
      (t) => t.key === active || t.label === active,
    );
    return matched ? (matched.key ?? matched.label) : active;
  });

  function tabChange(tab: string | TabItem) {
    const resolved = typeof tab === 'string'
      ? resolvedOptions.value.find((t) => (t.key ?? t.label) === tab)
      : tab;
    if (!resolved) return;
    const value = resolved.key ?? resolved.label;
    activeTab.value = value;
    const tabs = document.querySelectorAll('.tab');
    const underline: HTMLElement = document.querySelector('.underline');
    const index = resolvedOptions.value.indexOf(resolved);
    if (tabs[index]) {
      const tabWidth = tabs[index].offsetWidth;
      const tabPosition = tabs[index].offsetLeft;
      underline.style.width = `${tabWidth}px`;
      underline.style.left = `${tabPosition}px`;
    }
    emit('change', value);
  }

  watch(
    () => activeTab.value,
    (val) => {
      if (val) {
        nextTick(() => {
          tabChange(val);
        });
      }
    },
    {
      immediate: true,
    },
  );
</script>

<style scoped lang="less">
  .tab-container {
    position: relative;
    border-bottom: 1px solid var(--card-border-color);
    padding-bottom: 5px;
    margin-bottom: 10px;
    display: flex;
    gap: 24px;
  }

  .tab {
    font-size: 14px;
    cursor: pointer;
    padding: 4px 0;
    color: var(--desc-color);
    transition: color 0.2s;
    white-space: nowrap;

    &.is-active {
      color: var(--text-color);
      font-weight: 500;
    }
  }
  .underline {
    position: absolute;
    bottom: 0;
    left: 0;
    height: 2px;
    background-color: #615ced;
    transition:
      left 0.3s ease,
      width 0.3s ease;
  }
</style>
