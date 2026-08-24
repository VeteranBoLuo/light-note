<template>
  <nav class="help-outline-list" :aria-label="title">
    <div class="help-outline-list__title">{{ title }}</div>
    <BButton
      v-for="heading in items"
      :key="heading.id"
      class="help-outline-list__item"
      :class="{ active: activeId === heading.id }"
      :style="{ paddingLeft: `${Math.max(heading.level - 1, 0) * 12 + 10}px` }"
      @click="emit('select', heading.id)"
    >
      <span class="help-outline-list__marker" aria-hidden="true"></span>
      <span class="text-hidden">{{ heading.text }}</span>
    </BButton>
  </nav>
</template>

<script setup lang="ts">
  import BButton from '@/components/base/BasicComponents/BButton.vue';

  defineProps<{
    title: string;
    items: readonly {
      id: string;
      text: string;
      level: number;
    }[];
    activeId?: string;
  }>();

  const emit = defineEmits<{
    select: [id: string];
  }>();
</script>

<style scoped lang="less">
  .help-outline-list {
    display: flex;
    min-width: 0;
    flex-direction: column;
  }

  .help-outline-list__title {
    padding: 0 10px 8px;
    color: var(--desc-color);
    font-size: 12px;
    font-weight: 700;
  }

  .help-outline-list__item.b_btn {
    width: 100%;
    min-width: 0;
    max-width: 100%;
    height: auto;
    min-height: 30px;
    justify-content: flex-start;
    gap: 7px;
    padding: 5px 10px;
    overflow: hidden;
    border: 0;
    border-radius: 6px;
    color: var(--catalog-color);
    background: transparent;
    font: inherit;
    font-size: 13px;
    line-height: 20px;
    text-align: left;
  }

  .help-outline-list__item.b_btn:hover,
  .help-outline-list__item.b_btn:focus-visible {
    background: var(--bl-input-noBorder-bg-color);
  }

  .help-outline-list__item.b_btn.active {
    color: var(--resource-bookmark-color);
    font-weight: 700;
  }

  .help-outline-list__item .text-hidden {
    display: block;
    min-width: 0;
    flex: 1 1 auto;
    text-align: left;
  }

  .help-outline-list__marker {
    width: 3px;
    height: 14px;
    flex: 0 0 auto;
    border-radius: 2px;
    background: transparent;
  }

  .help-outline-list__item.active .help-outline-list__marker {
    background: var(--resource-bookmark-color);
  }
</style>
