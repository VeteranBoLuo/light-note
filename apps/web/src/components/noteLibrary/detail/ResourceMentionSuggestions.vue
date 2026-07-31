<template>
  <div class="resource-mention-suggestions" @mousedown.prevent>
    <div class="resource-mention-suggestions__heading">
      <span>{{ t('note.resourceMention.quickTitle') }}</span>
      <span v-if="query" class="resource-mention-suggestions__query">@{{ query }}</span>
    </div>
    <BLoading :loading="loading" inline :title="t('note.resourceMention.searching')" />
    <div v-if="!loading" class="resource-mention-suggestions__results" role="listbox">
      <BButton
        v-for="(item, index) in results"
        :key="`${item.type}:${item.id}`"
        class="resource-mention-suggestions__item"
        :class="{ 'is-active': index === activeIndex }"
        :aria-selected="index === activeIndex"
        @mouseenter="activeIndex = index"
        @click="choose(item)"
      >
        <span class="resource-mention-suggestions__type" :style="{ color: typeColor(item.type) }">
          {{ typeLabel(item.type) }}
        </span>
        <strong class="resource-mention-suggestions__title">{{ item.title }}</strong>
      </BButton>
      <div v-if="!results.length" class="resource-mention-suggestions__empty">
        {{ query.trim() ? t('note.resourceMention.empty') : t('note.resourceMention.emptyHint') }}
      </div>
    </div>
    <BButton class="resource-mention-suggestions__all" @click="$emit('open-full')">
      {{ t('note.resourceMention.openFull') }}
    </BButton>
  </div>
</template>

<script setup lang="ts">
  import { onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import { RESOURCE_COLOR_CSS_VAR, type ResourceType } from '@/config/resourceColor';
  import { useResourcePickerSearch } from '@/composables/useResourcePickerSearch';
  import type { ResourceRef, ResourceRefType } from '@/utils/noteResourceRefs';

  interface ResourceMentionItem extends ResourceRef {
    title: string;
  }

  const props = defineProps<{ query: string }>();
  const emit = defineEmits<{ select: [value: ResourceMentionItem]; 'open-full': [] }>();
  const { t } = useI18n();
  // 搜索/防抖/竞态/去重统一走公共内核;本组件只保留笔记侧的展示与键盘交互。
  const { results, loading, activeIndex, search, moveActive, reset } = useResourcePickerSearch({
    allowedTypes: ['bookmark', 'note', 'file'],
    limit: 8,
    debounceMs: 180,
  });

  const typeColor = (type: ResourceRefType) => {
    const cssVar = RESOURCE_COLOR_CSS_VAR[type as ResourceType];
    return cssVar ? `var(${cssVar})` : 'var(--desc-color)';
  };

  function typeLabel(type: ResourceRefType) {
    return t(`ai.sourceTypes.${type}`);
  }

  function choose(item: ResourceMentionItem) {
    emit('select', item);
  }

  function chooseActive() {
    const item = results.value[activeIndex.value];
    if (item) choose(item as ResourceMentionItem);
  }

  watch(() => props.query, (keyword) => search(String(keyword || '')), { immediate: true });

  onBeforeUnmount(reset);

  defineExpose({ chooseActive, moveActive });
</script>

<style scoped lang="less">
  .resource-mention-suggestions {
    width: min(340px, calc(100vw - 24px));
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    background: var(--card-background);
    box-shadow: var(--surface-raised-shadow);
  }

  .resource-mention-suggestions__heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 34px;
    padding: 0 10px;
    border-bottom: 1px solid var(--surface-border-color);
    color: var(--desc-color);
    font-size: 12px;
  }

  .resource-mention-suggestions__query {
    overflow: hidden;
    color: var(--primary-color);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .resource-mention-suggestions__results {
    display: grid;
    gap: 2px;
    max-height: min(288px, calc(100dvh - 160px));
    padding: 4px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  :deep(.resource-mention-suggestions__item.b_btn.default_btn) {
    width: 100%;
    min-height: 36px;
    height: auto;
    justify-content: flex-start;
    gap: 9px;
    padding: 4px 8px;
    line-height: 1.25;
    text-align: left;

    &.is-active,
    &:hover {
      background: color-mix(in srgb, var(--primary-color) 10%, var(--primary-btn-bg-color));
    }
  }

  /* 与全站统一的资源面板同一视觉:彩色类型标签 + 单行标题 */
  .resource-mention-suggestions__type {
    flex: 0 0 auto;
    font-size: 12px;
    font-weight: 600;
  }

  .resource-mention-suggestions__title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-color);
    font-size: 13px;
    font-weight: 500;
  }

  .resource-mention-suggestions__empty {
    padding: 20px 10px;
    color: var(--desc-color);
    text-align: center;
    font-size: 12px;
  }

  :deep(.resource-mention-suggestions__all.b_btn.default_btn) {
    width: 100%;
    min-height: 36px;
    justify-content: flex-start;
    border-top: 1px solid var(--surface-border-color);
    border-radius: 0;
    color: var(--primary-color);
    background: transparent;
    font-size: 12px;

    &:hover {
      background: color-mix(in srgb, var(--primary-color) 7%, var(--card-background));
    }
  }
</style>
