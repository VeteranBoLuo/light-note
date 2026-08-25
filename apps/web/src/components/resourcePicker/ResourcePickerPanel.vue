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

    <div
      ref="resultsRef"
      class="resource-picker-panel__results auto-hide-scrollbar"
      :class="{ 'is-scrolling': scrolling }"
      role="listbox"
      @scroll="onScroll"
    >
      <BButton
        v-for="(item, index) in pinned"
        :key="`pinned:${item.type}:${item.id}`"
        class="resource-picker-panel__item"
        :class="{ 'is-active': index === activeIndex }"
        :disabled="resourceDisabled(item)"
        :aria-selected="index === activeIndex"
        @mousemove="activateFromPointer(index)"
        @click="emit('select', item)"
      >
        <span class="resource-picker-panel__pinned-tag">{{ t('ai.currentPage') }}</span>
        <span class="resource-picker-panel__copy">
          <span class="resource-picker-panel__title">{{ item.title }}</span>
        </span>
      </BButton>
      <template v-for="group in groups" :key="group.type">
        <div class="resource-picker-panel__group">{{ typeLabel(group.type) }}</div>
        <BButton
          v-for="entry in group.items"
          :key="`${entry.item.type}:${entry.item.id}`"
          class="resource-picker-panel__item"
          :class="{ 'is-active': entry.index === activeIndex }"
          :disabled="resourceDisabled(entry.item)"
          :aria-selected="entry.index === activeIndex"
          @mousemove="activateFromPointer(entry.index)"
          @click="emit('select', entry.item)"
        >
          <span class="resource-picker-panel__dot" :style="{ background: typeColor(entry.item.type) }" />
          <span class="resource-picker-panel__copy">
            <span class="resource-picker-panel__title">{{ entry.item.title }}</span>
            <small v-if="entry.item.path">{{ entry.item.path }}</small>
          </span>
        </BButton>
      </template>
      <template v-if="includeNoteScopes && scopeEntries.length">
        <div class="resource-picker-panel__group resource-picker-panel__group--scope">
          {{ t('ai.scope.directoryGroup') }}
        </div>
        <BButton
          v-for="entry in scopeEntries"
          :key="`scope:${entry.scope.id}`"
          class="resource-picker-panel__item resource-picker-panel__item--scope"
          :class="{ 'is-active': entry.index === activeIndex }"
          :disabled="scopeDisabled(entry.scope)"
          :aria-selected="entry.index === activeIndex"
          @mousemove="activateFromPointer(entry.index)"
          @click="emit('select-scope', entry.scope)"
        >
          <span class="resource-picker-panel__scope-icon" aria-hidden="true">
            <SvgIcon :src="icon.noteTree.root" size="15" />
          </span>
          <span class="resource-picker-panel__copy">
            <span class="resource-picker-panel__title">{{ entry.scope.title }}</span>
            <small v-if="entry.path">{{ entry.path }}</small>
            <small>
              {{
                t('ai.scope.branchDescription', {
                  count: entry.descendantCount,
                })
              }}
            </small>
          </span>
        </BButton>
      </template>
      <span v-if="loading && !flatOptions.length" class="resource-picker-panel__hint">{{ t('ai.searching') }}</span>
      <span v-else-if="!flatOptions.length" class="resource-picker-panel__hint">{{ t('ai.noContext') }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { RESOURCE_COLOR_CSS_VAR, type ResourceType } from '@/config/resourceColor';
  import {
    useResourcePickerSearch,
    type ResourcePickerItem,
    type ResourcePickerType,
  } from '@/composables/useResourcePickerSearch';
  import { useAutoHideScrollbar } from '@/composables/useAutoHideScrollbar';
  import type { AiScopeRef } from '@/types/aiScope';
  import { scrollNearestIntoContainer } from '@/utils/zoom';

  /**
   * 全站唯一的资源选择面板。
   * - showSearch=false(默认由 @ 使用):无搜索框,关键词由外部受控传入,桌面保持紧凑浮层宽度。
   * - showSearch=true:自带搜索框,供「添加资源」这类显式入口使用,铺满弹框内容区。
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
      /** 置顶快捷项(如「当前页面」),始终显示在结果最上方 */
      pinnedItems?: ResourcePickerItem[];
      /** AI 专用：在普通笔记结果之外追加同一根页面的目录范围结果。 */
      includeNoteScopes?: boolean;
      /** 已选择的单篇资源仍保留在列表中，但不可重复选择；目录入口仍可独立使用。 */
      selectedResourceKeys?: string[];
      /** 已选择的目录范围不可重复选择。 */
      selectedScopeKeys?: string[];
      /** 达到业务选择上限时只禁用对应类别，不影响另一类入口。 */
      resourcesDisabled?: boolean;
      scopesDisabled?: boolean;
    }>(),
    {
      keyword: '',
      showSearch: true,
      autoFocus: true,
      includeNoteScopes: false,
      selectedResourceKeys: () => [],
      selectedScopeKeys: () => [],
    },
  );
  const emit = defineEmits<{
    select: [value: ResourcePickerItem];
    'select-scope': [value: AiScopeRef];
    close: [];
    'results-count': [value: number];
  }>();

  const { t } = useI18n();
  const { scrolling, onScroll } = useAutoHideScrollbar();
  const innerKeyword = ref('');
  const keywordInputRef = ref<{ focus?: () => void } | null>(null);
  const resultsRef = ref<HTMLElement | null>(null);
  const { results, loading, activeIndex, search, searchNow, reset } = useResourcePickerSearch({
    allowedTypes: props.allowedTypes,
    perType: props.perType,
  });

  async function moveActive(offset: number) {
    const total = flatOptions.value.length;
    if (!total) return;
    activeIndex.value = (activeIndex.value + offset + total) % total;
    await nextTick();
    const container = resultsRef.value;
    const activeItem = container?.querySelector<HTMLElement>('.resource-picker-panel__item.is-active');
    if (container && activeItem) scrollNearestIntoContainer(container, activeItem, 'auto');
  }

  function activateFromPointer(index: number) {
    if (activeIndex.value !== index) activeIndex.value = index;
  }

  const typeLabel = (type: string) => t(`ai.sourceTypes.${type}`);
  const typeColor = (type: string) => {
    const cssVar = RESOURCE_COLOR_CSS_VAR[type as ResourceType];
    return cssVar ? `var(${cssVar})` : 'var(--desc-color)';
  };
  const selectedResourceKeySet = computed(() => new Set(props.selectedResourceKeys));
  const selectedScopeKeySet = computed(() => new Set(props.selectedScopeKeys));
  const resourceDisabled = (item: Pick<ResourcePickerItem, 'type' | 'id'>) =>
    props.resourcesDisabled === true || selectedResourceKeySet.value.has(`${item.type}:${item.id}`);
  const scopeDisabled = (item: Pick<AiScopeRef, 'type' | 'id'>) =>
    props.scopesDisabled === true || selectedScopeKeySet.value.has(`${item.type}:${item.id}`);

  // 置顶项跟随生效关键字过滤,占据键盘导航的前几个下标
  const pinned = computed(() => {
    const list = props.pinnedItems || [];
    const keyword = String((props.showSearch ? innerKeyword.value : props.keyword) || '')
      .trim()
      .toLowerCase();
    return list.filter(
      (item) =>
        item &&
        item.id &&
        (!keyword ||
          String(item.title || '')
            .toLowerCase()
            .includes(keyword)),
    );
  });

  // 结果已按类型顺序排好,这里只做切分;下标接在置顶项之后,供键盘线性导航
  const groups = computed(() => {
    const offset = pinned.value.length;
    const pinnedKeys = new Set(pinned.value.map((item) => `${item.type}:${item.id}`));
    const out: { type: string; items: { item: ResourcePickerItem; index: number }[] }[] = [];
    let index = offset;
    results.value.forEach((item) => {
      if (pinnedKeys.has(`${item.type}:${item.id}`)) return;
      const last = out[out.length - 1];
      const entry = { item, index };
      if (last && last.type === item.type) last.items.push(entry);
      else out.push({ type: item.type, items: [entry] });
      index += 1;
    });
    return out;
  });

  const flatItems = computed<ResourcePickerItem[]>(() => [
    ...pinned.value,
    ...groups.value.flatMap((group) => group.items.map((entry) => entry.item)),
  ]);

  const scopeEntries = computed(() => {
    if (!props.includeNoteScopes) return [];
    const candidates = [...pinned.value, ...results.value].filter((item) => item.type === 'note');
    const byId = new Map<string, ResourcePickerItem>();
    for (const item of candidates) {
      const previous = byId.get(item.id);
      // 搜索结果带权威路径/后代数，优先覆盖置顶项的轻量数据。
      if (!previous || Number(item.descendantCount || 0) >= Number(previous.descendantCount || 0)) {
        byId.set(item.id, item);
      }
    }
    return [...byId.values()].map((item, offset) => {
      const descendantCount = Math.max(0, Number(item.descendantCount || 0));
      return {
        index: flatItems.value.length + offset,
        path: String(item.path || ''),
        descendantCount,
        scope: {
          type: 'note_branch' as const,
          id: item.id,
          title: item.title,
          estimatedResourceCount: descendantCount + 1,
        },
      };
    });
  });

  const flatOptions = computed(() => [
    ...flatItems.value.map((item) => ({ kind: 'resource' as const, item })),
    ...scopeEntries.value.map((entry) => ({ kind: 'scope' as const, item: entry.scope })),
  ]);

  function chooseActive() {
    const option = flatOptions.value[activeIndex.value];
    if (!option) return;
    if (option.kind === 'scope') {
      if (!scopeDisabled(option.item)) emit('select-scope', option.item);
    } else if (!resourceDisabled(option.item)) {
      emit('select', option.item);
    }
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

  watch(
    () => flatOptions.value.length,
    (count) => emit('results-count', count),
    { immediate: true },
  );

  onBeforeUnmount(reset);

  defineExpose({ chooseActive, moveActive });
</script>

<style scoped lang="less">
  .resource-picker-panel {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: none;
    max-height: min(340px, calc(100vh - 140px));
    max-height: min(340px, calc(100dvh - 140px));
    padding: 0;
    box-sizing: border-box;
    overflow: hidden;
  }

  .resource-picker-panel.is-inline {
    width: 320px;
    max-width: min(360px, calc(100vw - 24px));
    padding: 6px;
  }

  .resource-picker-panel__results {
    display: grid;
    grid-auto-rows: max-content;
    align-content: start;
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

  /* 滚动条默认隐形,hover 或滚动中才显现,停止后淡出 */
  .auto-hide-scrollbar {
    scrollbar-width: thin;
    scrollbar-color: transparent transparent;
    transition: scrollbar-color 0.25s ease;
  }

  .auto-hide-scrollbar::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  .auto-hide-scrollbar::-webkit-scrollbar-thumb {
    border: 2px solid transparent;
    border-radius: 999px;
    background-clip: content-box;
    background-color: transparent;
    transition: background-color 0.25s ease;
  }

  .auto-hide-scrollbar:hover,
  .auto-hide-scrollbar.is-scrolling {
    scrollbar-color: color-mix(in srgb, var(--text-color) 26%, transparent) transparent;
  }

  .auto-hide-scrollbar:hover::-webkit-scrollbar-thumb,
  .auto-hide-scrollbar.is-scrolling::-webkit-scrollbar-thumb {
    background-color: color-mix(in srgb, var(--text-color) 26%, transparent);
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
    align-items: center;
    justify-content: flex-start;
    gap: 8px;
    padding: 7px 8px;
    overflow: hidden;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent !important;
    line-height: normal;
    text-align: left;

    &:hover {
      background: color-mix(in srgb, var(--primary-color) 10%, transparent) !important;
    }

    &.is-active {
      border-color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 10%, transparent) !important;
      color: var(--primary-color);
      font-weight: 600;
    }
  }

  .resource-picker-panel__group--scope {
    margin-top: 4px;
    border-top: 1px solid var(--surface-border-color);
  }

  .resource-picker-panel__item--scope {
    min-height: 62px;
    padding-top: 8px;
    padding-bottom: 8px;
  }

  .resource-picker-panel__pinned-tag {
    flex: 0 0 auto;
    color: var(--info-color, #1c7ed6);
    font-size: 12px;
    font-weight: 600;
  }

  .resource-picker-panel__dot {
    width: 6px;
    height: 6px;
    flex: 0 0 auto;
    border-radius: 50%;
  }

  .resource-picker-panel__scope-icon {
    display: inline-flex;
    width: 24px;
    height: 24px;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--resource-note-color);
    border-radius: 8px;
    color: var(--resource-note-color);
  }

  .resource-picker-panel__copy {
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-width: 0;
    min-height: 100%;
    gap: 3px;
    padding: 2px 0;
    text-align: left;
  }

  .resource-picker-panel__copy small {
    overflow: hidden;
    color: var(--desc-color);
    font-size: 11px;
    font-weight: 400;
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
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
