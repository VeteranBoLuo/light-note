<template>
  <section
    class="document-outline"
    :class="{ 'is-contained-scroll': containedScroll }"
    :aria-label="t('toolboxProject.outline.title')"
  >
    <div v-if="items.length === 0" class="document-outline__empty">
      {{ t('toolboxProject.outline.empty') }}
    </div>
    <div v-else class="document-outline__list">
      <BButton
        v-for="item in items"
        :key="item.id"
        class="document-outline__item"
        :class="[`is-level-${item.level}`, { 'is-active': item.id === activeId }]"
        :aria-current="item.id === activeId ? 'location' : undefined"
        @click="emit('select', item)"
      >
        <span class="document-outline__marker" aria-hidden="true"></span>
        <span>{{ item.title }}</span>
      </BButton>
    </div>
  </section>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import type { ProductionDocumentOutlineItem } from '@/utils/productionDocumentOutline';

  withDefaults(defineProps<{ items: ProductionDocumentOutlineItem[]; activeId: string; containedScroll?: boolean }>(), {
    containedScroll: true,
  });
  const emit = defineEmits<{ select: [item: ProductionDocumentOutlineItem] }>();
  const { t } = useI18n();
</script>

<style scoped lang="less">
  .document-outline {
    height: 100%;
    min-height: 0;
  }
  .document-outline.is-contained-scroll .document-outline__list {
    height: 100%;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding-right: 3px;
  }
  .document-outline__empty {
    padding: 22px 10px;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.6;
    text-align: center;
  }
  .document-outline__item {
    width: 100%;
    height: auto;
    min-height: 36px;
    padding: 7px 9px;
    justify-content: flex-start;
    gap: 8px;
    border: 1px solid transparent !important;
    border-radius: 9px;
    background: transparent;
    color: var(--desc-color);
    line-height: 1.35;
    text-align: left;
  }
  .document-outline__item + .document-outline__item {
    margin-top: 2px;
  }
  .document-outline__item:hover,
  .document-outline__item:focus-visible {
    background: var(--primary-btn-bg-color);
    color: var(--text-color);
  }
  .document-outline__item.is-active {
    border-color: var(--primary-color) !important;
    background: var(--surface-selected-bg, var(--primary-btn-bg-color));
    color: var(--primary-color);
  }
  .document-outline__item.is-level-2 {
    padding-left: 19px;
  }
  .document-outline__item.is-level-3 {
    padding-left: 31px;
  }
  .document-outline__item > span:last-child {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .document-outline__marker {
    flex: 0 0 auto;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }
</style>
