<template>
  <div class="resource-picker-panel" :class="{ 'is-inline': !showSearch }">
    <!-- @ 触发时不带搜索框:关键词直接来自输入框里 @ 后面的文字(与 Claude Code 的 @ 一致);
         显式按钮打开时才需要自己的搜索框 -->
    <BInput
      v-if="showSearch"
      ref="keywordInputRef"
      v-model:value="innerKeyword"
      class="resource-picker-panel__search"
      :placeholder="placeholder || t('ai.searchContext')"
      clearable
      @enter="chooseActive"
      @keydown.down.prevent="moveActive(1)"
      @keydown.up.prevent="moveActive(-1)"
      @keydown.esc="emit('close')"
    />

    <div class="resource-picker-panel__results" role="listbox">
      <template v-for="group in groups" :key="group.type">
        <div class="resource-picker-panel__group">{{ typeLabel(group.type) }}</div>
        <BButton
          v-for="entry in group.items"
          :key="`${entry.item.type}:${entry.item.id}`"
          class="resource-picker-panel__item"
          :class="{ 'is-active': entry.index === activeIndex }"
          :aria-selected="entry.index === activeIndex"
          @mouseenter="activeIndex = entry.index"
          @click="emit('select', entry.item)"
        >
          <span class="resource-picker-panel__dot" :style="{ background: typeColor(entry.item.type) }" />
          <span class="resource-picker-panel__title">{{ entry.item.title }}</span>
        </BButton>
      </template>
      <span v-if="loading && !results.length" class="resource-picker-panel__hint">{{ t('ai.searching') }}</span>
      <span v-else-if="!results.length" class="resource-picker-panel__hint">{{ t('ai.noContext') }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
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
   * 全站唯一的资源选择面板。
   * - showSearch=false(默认由 @ 使用):无搜索框,关键词由外部受控传入。
   * - showSearch=true:自带搜索框,供「添加资源」这类显式入口使用。
   * 结果按书签 / 笔记 / 文件分组展示,键盘导航跨组线性移动。
   */
  const props = withDefaults(
    defineProps<{
      allowedTypes?: ResourcePickerType[];
      /** 受控关键词(showSearch=false 时生效) */
      keyword?: string;
      showSearch?: boolean;
      perType?: number;
      autoFocus?: boolean;
      placeholder?: string;
    }>(),
    { keyword: '', showSearch: true, autoFocus: true },
  );
  const emit = defineEmits<{ select: [value: ResourcePickerItem]; close: [] }>();

  const { t } = useI18n();
  const innerKeyword = ref('');
  const keywordInputRef = ref<{ focus?: () => void } | null>(null);
  const { results, loading, activeIndex, search, searchNow, moveActive, reset } = useResourcePickerSearch({
    allowedTypes: props.allowedTypes,
    perType: props.perType,
  });

  const typeLabel = (type: string) => t(`ai.sourceTypes.${type}`);
  const typeColor = (type: string) => {
    const cssVar = RESOURCE_COLOR_CSS_VAR[type as ResourceType];
    return cssVar ? `var(${cssVar})` : 'var(--desc-color)';
  };

  // 结果已按类型顺序排好,这里只做切分并保留扁平下标供键盘导航使用
  const groups = computed(() => {
    const out: { type: string; items: { item: ResourcePickerItem; index: number }[] }[] = [];
    results.value.forEach((item, index) => {
      const last = out[out.length - 1];
      if (last && last.type === item.type) last.items.push({ item, index });
      else out.push({ type: item.type, items: [{ item, index }] });
    });
    return out;
  });

  function chooseActive() {
    const item = results.value[activeIndex.value];
    if (item) emit('select', item);
  }

  onMounted(async () => {
    if (props.showSearch) {
      innerKeyword.value = '';
      await nextTick();
      if (props.autoFocus) keywordInputRef.value?.focus?.();
    }
    // 打开即出结果,不必等用户输入
    void searchNow(props.showSearch ? innerKeyword.value : props.keyword || '');
  });

  watch(innerKeyword, (value) => {
    if (props.showSearch) search(String(value || ''));
  });
  watch(
    () => props.keyword,
    (value) => {
      if (!props.showSearch) search(String(value || ''));
    },
  );

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

  .resource-picker-panel.is-inline {
    padding: 6px;
  }

  .resource-picker-panel__results {
    display: grid;
    gap: 2px;
    min-height: 0;
    min-width: 0;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .resource-picker-panel:not(.is-inline) .resource-picker-panel__results {
    margin-top: 8px;
  }

  .resource-picker-panel__group {
    padding: 7px 8px 3px;
    color: var(--desc-color);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .resource-picker-panel__group:first-child {
    padding-top: 2px;
  }

  .resource-picker-panel__item {
    width: 100%;
    min-width: 0;
    max-width: 100%;
    height: auto;
    min-height: 30px;
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

  .resource-picker-panel__dot {
    width: 6px;
    height: 6px;
    flex: 0 0 auto;
    border-radius: 50%;
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
    padding: 16px 8px;
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
