<template>
  <div class="resource-picker-panel">
    <BInput
      ref="keywordInputRef"
      v-model:value="keyword"
      class="resource-picker-panel__search"
      :placeholder="placeholder || t('ai.searchContext')"
      clearable
      @enter="chooseActive"
      @keydown.down.prevent="moveActive(1)"
      @keydown.up.prevent="moveActive(-1)"
      @keydown.esc="emit('close')"
    />

    <div class="resource-picker-panel__results" role="listbox">
      <BButton
        v-for="(item, index) in results"
        :key="`${item.type}:${item.id}`"
        class="resource-picker-panel__item"
        :class="{ 'is-active': index === activeIndex }"
        :aria-selected="index === activeIndex"
        @mouseenter="activeIndex = index"
        @click="emit('select', item)"
      >
        <span class="resource-picker-panel__type" :style="{ color: typeColor(item.type) }">
          {{ typeLabel(item.type) }}
        </span>
        <strong class="resource-picker-panel__title">{{ item.title }}</strong>
      </BButton>
      <span v-if="loading && !results.length" class="resource-picker-panel__hint">{{ t('ai.searching') }}</span>
      <span v-else-if="!results.length" class="resource-picker-panel__hint">{{ t('ai.noContext') }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import { RESOURCE_COLOR_CSS_VAR, type ResourceType } from '@/config/resourceColor';
  import {
    useResourcePickerSearch,
    type ResourcePickerItem,
    type ResourcePickerType,
  } from '@/composables/useResourcePickerSearch';

  /**
   * 全站统一的资源选择面板:上方搜索框 + 下方紧凑单行列表(类型标签 + 标题)。
   * 只负责「搜什么、显示什么、选中哪个」,选中后写到哪里由各业务适配器决定。
   */
  const props = withDefaults(
    defineProps<{
      allowedTypes?: ResourcePickerType[];
      initialKeyword?: string;
      limit?: number;
      autoFocus?: boolean;
      placeholder?: string;
    }>(),
    { initialKeyword: '', limit: 20, autoFocus: true },
  );
  const emit = defineEmits<{ select: [value: ResourcePickerItem]; close: [] }>();

  const { t } = useI18n();
  const keyword = ref('');
  const keywordInputRef = ref<{ focus?: () => void } | null>(null);
  const { results, loading, activeIndex, search, searchNow, moveActive, reset } = useResourcePickerSearch({
    allowedTypes: props.allowedTypes,
    limit: props.limit,
  });

  const typeLabel = (type: string) => t(`ai.sourceTypes.${type}`);
  const typeColor = (type: string) => {
    const cssVar = RESOURCE_COLOR_CSS_VAR[type as ResourceType];
    return cssVar ? `var(${cssVar})` : 'var(--desc-color)';
  };

  function chooseActive() {
    const item = results.value[activeIndex.value];
    if (item) emit('select', item);
  }

  onMounted(async () => {
    keyword.value = props.initialKeyword || '';
    await nextTick();
    if (props.autoFocus) keywordInputRef.value?.focus?.();
    // 打开即出结果,不必等用户输入
    void searchNow(keyword.value);
  });

  watch(keyword, (value) => search(String(value || '')));
  onBeforeUnmount(reset);

  defineExpose({ chooseActive, moveActive });
</script>

<style scoped lang="less">
  .resource-picker-panel {
    display: flex;
    flex-direction: column;
    width: 320px;
    max-width: min(360px, calc(100vw - 24px));
    max-height: min(340px, calc(100dvh - 140px));
    padding: 10px;
    box-sizing: border-box;
    overflow: hidden;
  }

  .resource-picker-panel__results {
    display: grid;
    gap: 4px;
    min-height: 0;
    min-width: 0;
    margin-top: 8px;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .resource-picker-panel__item {
    width: 100%;
    min-width: 0;
    max-width: 100%;
    height: auto;
    min-height: 34px;
    justify-content: flex-start;
    gap: 8px;
    padding: 5px 8px;
    overflow: hidden;
    border-radius: 8px;
    background: transparent !important;
    text-align: left;

    &.is-active,
    &:hover {
      background: color-mix(in srgb, var(--primary-color) 10%, transparent) !important;
    }
  }

  .resource-picker-panel__type {
    flex: 0 0 auto;
    font-size: 12px;
    font-weight: 600;
  }

  .resource-picker-panel__title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-color);
    font-size: 13px;
    font-weight: 500;
  }

  .resource-picker-panel__hint {
    padding: 18px 8px;
    color: var(--desc-color);
    font-size: 12px;
    text-align: center;
  }

  @media (max-width: 767px) {
    .resource-picker-panel {
      width: 100%;
      max-width: none;
    }
  }
</style>
