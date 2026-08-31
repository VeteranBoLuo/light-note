<template>
  <section
    class="toolbox-resource-selector"
    :class="{ 'is-page-scroll': pageScroll }"
    :aria-label="t('toolbox.workbench.addResources')"
  >
    <div class="toolbox-resource-selector__header">
      <div class="toolbox-resource-selector__selection-meta">
        <strong>{{ t('toolbox.workbench.selectedResources') }}</strong>
        <span aria-live="polite">{{ t('toolbox.workbench.selectionCount', { count: totalCount, max }) }}</span>
      </div>
      <BButton
        v-if="modelValue.length"
        class="toolbox-resource-selector__clear"
        size="small"
        :disabled="disabled || branchLoading"
        @click="emit('update:modelValue', [])"
      >
        <SvgIcon :src="icon.toolbox.delete" size="14" aria-hidden="true" />
        {{ t('toolbox.workbench.clearSelected') }}
      </BButton>
    </div>

    <div
      v-auto-scrollbar
      class="toolbox-resource-selector__selected"
      :class="{ 'is-empty': !selectedGroups.length }"
      aria-live="polite"
    >
      <span v-if="!selectedGroups.length" class="toolbox-resource-selector__empty-selection">
        <SvgIcon :src="icon.toolbox.locate" size="16" aria-hidden="true" />
        {{ t('toolbox.workbench.selectHint') }}
      </span>
      <template v-else>
        <article v-for="group in selectedGroups" :key="group.key" class="toolbox-resource-selector__selected-item">
          <span class="toolbox-resource-selector__type" :class="`is-${group.type}`">
            <SvgIcon
              :src="group.isBranch ? icon.noteTree.root : resourceIcon(group.type)"
              size="15"
              aria-hidden="true"
            />
          </span>
          <span class="toolbox-resource-selector__selected-copy">
            <strong>{{ group.title }}</strong>
            <small v-if="group.isBranch">{{
              t('toolbox.workbench.branchSelectedCount', { count: group.count })
            }}</small>
            <small v-else>{{ t(`ai.sourceTypes.${group.type}`) }}</small>
          </span>
          <BButton
            :aria-label="t('toolbox.workbench.remove', { title: group.title })"
            :disabled="disabled || branchLoading"
            @click="removeGroup(group.resourceKeys)"
          >
            <SvgIcon :src="icon.toolbox.delete" size="15" />
          </BButton>
        </article>
      </template>
    </div>

    <div class="toolbox-resource-selector__filters" role="group" :aria-label="t('toolbox.workbench.typeFilter')">
      <BButton
        v-for="option in filterOptions"
        :key="option.value"
        size="small"
        :class="{ 'is-selected': activeType === option.value }"
        :aria-pressed="activeType === option.value"
        :disabled="disabled || branchLoading"
        @click="selectType(option.value)"
      >
        {{ option.label }}
      </BButton>
    </div>

    <div class="toolbox-resource-selector__picker">
      <BLoading
        v-if="branchLoading"
        class="toolbox-resource-selector__loading"
        inline
        loading
        :title="t('toolbox.workbench.branchLoading')"
      />
      <ResourcePickerPanel
        ref="resourcePickerRef"
        :allowed-types="pickerAllowedTypes"
        :selected-resource-keys="pickerSelectedKeys"
        :selected-scope-keys="selectedScopeKeys"
        :resources-disabled="totalCount >= max"
        :scopes-disabled="totalCount >= max"
        :disabled="disabled || branchLoading"
        :include-note-scopes="pickerAllowedTypes.includes('note')"
        :limit="8"
        :per-type="8"
        :single-type-page-size="40"
        :page-scroll="pageScroll"
        exhaustive-single-type
        fill
        :placeholder="t('toolbox.workbench.resourceSearchPlaceholder')"
        multi-select
        @select="add"
        @deselect="removeItem"
        @select-many="addMany"
        @select-scope="addNoteBranch"
        @deselect-scope="removeBranch"
        @scroll-position="handleResourceScroll"
      />
      <BButton
        v-if="showBackToTop"
        class="toolbox-resource-selector__back-top"
        size="small"
        :aria-label="t('toolbox.workbench.backToResourceTop')"
        @click="backToResourceTop"
      >
        <SvgIcon :src="icon.ai.scrollDown" size="15" aria-hidden="true" />
        {{ t('toolbox.workbench.backToResourceTop') }}
      </BButton>
    </div>
  </section>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { fetchNoteBranchItems } from '@/api/noteTree';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import ResourcePickerPanel from '@/components/resourcePicker/ResourcePickerPanel.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import {
    resourceItemKey,
    type ResourcePickerItem,
    type ResourcePickerType,
  } from '@/composables/useResourcePickerSearch';
  import type { AiScopeRef } from '@/types/aiScope';
  import {
    mergeToolboxNoteBranchSelection,
    removeToolboxSelectedResource,
    type ToolboxResourceSelectionGroup,
    type ToolboxSelectedResource,
  } from '@/utils/toolboxResourceSelection';
  import {
    resourceListBackToTopBehavior,
    shouldShowResourceListBackToTop,
    type ResourceListScrollAnchor,
    type ResourceListScrollPosition,
  } from '@/utils/resourceListScroll';

  type ResourceTypeFilter = 'all' | ResourcePickerType;
  interface SelectedDisplayGroup {
    key: string;
    type: ResourcePickerType;
    title: string;
    count: number;
    isBranch: boolean;
    resourceKeys: string[];
  }

  const props = withDefaults(
    defineProps<{
      modelValue: ToolboxSelectedResource[];
      allowedTypes?: ResourcePickerType[];
      max: number;
      externalCount?: number;
      existingResourceKeys?: string[];
      disabled?: boolean;
      pageScroll?: boolean;
    }>(),
    {
      allowedTypes: () => ['bookmark', 'note', 'file'],
      externalCount: 0,
      existingResourceKeys: () => [],
      disabled: false,
      pageScroll: true,
    },
  );
  const emit = defineEmits<{ 'update:modelValue': [value: ToolboxSelectedResource[]] }>();
  const { t } = useI18n();
  const activeType = ref<ResourceTypeFilter>('all');
  const resourcePickerRef = ref<InstanceType<typeof ResourcePickerPanel> | null>(null);
  const branchLoading = ref(false);
  const scrollAnchors = new Map<ResourceTypeFilter, ResourceListScrollAnchor | null>();
  const listScrollPosition = ref<ResourceListScrollPosition>({ top: 0, viewportHeight: 0 });
  const selectedKeys = computed(() => props.modelValue.map(resourceItemKey));
  const pickerSelectedKeys = computed(() => [...new Set([...props.existingResourceKeys, ...selectedKeys.value])]);
  const selectedScopeKeys = computed(() => [
    ...new Set(
      props.modelValue
        .map((item) => item.selectionGroup)
        .filter((group): group is ToolboxResourceSelectionGroup => group?.type === 'note_branch')
        .map((group) => `note_branch:${group.id}`),
    ),
  ]);
  const totalCount = computed(() => props.modelValue.length + Math.max(0, props.externalCount));
  const pickerAllowedTypes = computed<ResourcePickerType[]>(() =>
    activeType.value === 'all' ? [...props.allowedTypes] : [activeType.value],
  );
  const filterOptions = computed(() => [
    { value: 'all' as const, label: t('toolbox.workbench.allTypes') },
    ...props.allowedTypes.map((type) => ({ value: type, label: t(`ai.sourceTypes.${type}`) })),
  ]);
  const selectedGroups = computed<SelectedDisplayGroup[]>(() => {
    const groups: SelectedDisplayGroup[] = [];
    const groupIndex = new Map<string, SelectedDisplayGroup>();
    for (const item of props.modelValue) {
      const selectionGroup = item.selectionGroup;
      if (!selectionGroup) {
        groups.push({
          key: resourceItemKey(item),
          type: item.type,
          title: item.title,
          count: 1,
          isBranch: false,
          resourceKeys: [resourceItemKey(item)],
        });
        continue;
      }
      const key = `branch:${selectionGroup.id}`;
      const existing = groupIndex.get(key);
      if (existing) {
        existing.count += 1;
        existing.resourceKeys.push(resourceItemKey(item));
      } else {
        const group = {
          key,
          type: 'note' as const,
          title: selectionGroup.title,
          count: 1,
          isBranch: true,
          resourceKeys: [resourceItemKey(item)],
        };
        groups.push(group);
        groupIndex.set(key, group);
      }
    }
    return groups;
  });
  const showBackToTop = computed(() => !props.pageScroll && shouldShowResourceListBackToTop(listScrollPosition.value));

  function resourceIcon(type: ResourcePickerType) {
    if (type === 'bookmark') return icon.resource.bookmark;
    if (type === 'file') return icon.resource.file;
    return icon.resource.note;
  }

  function selectType(type: ResourceTypeFilter) {
    if (type === activeType.value) return;
    // 必须在更新 allowedTypes 之前捕获外层滚动位置。等子组件 watcher 再捕获时，
    // 旧列表可能已经卸载，浏览器会先把 scrollTop 夹到临时短页面的底部。
    if (props.pageScroll) resourcePickerRef.value?.beginPageScrollTransition();
    else {
      scrollAnchors.set(activeType.value, resourcePickerRef.value?.captureScrollAnchor?.() || null);
      resourcePickerRef.value?.prepareScrollAnchor?.(scrollAnchors.get(type) || null);
      listScrollPosition.value = { top: 0, viewportHeight: listScrollPosition.value.viewportHeight };
    }
    activeType.value = type;
  }

  function handleResourceScroll(position: ResourceListScrollPosition) {
    listScrollPosition.value = position;
  }

  function backToResourceTop() {
    const reducedMotion =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    resourcePickerRef.value?.scrollToTop(
      resourceListBackToTopBehavior({ position: listScrollPosition.value, reducedMotion }),
    );
  }

  function add(item: ResourcePickerItem) {
    if (props.disabled || totalCount.value >= props.max || selectedKeys.value.includes(resourceItemKey(item))) return;
    emit('update:modelValue', [...props.modelValue, item]);
  }

  function addMany(items: ResourcePickerItem[]) {
    if (props.disabled) return;
    const existing = new Set(selectedKeys.value);
    const additions = items.filter((item) => {
      const key = resourceItemKey(item);
      if (existing.has(key)) return false;
      existing.add(key);
      return true;
    });
    const remaining = Math.max(0, props.max - totalCount.value);
    const accepted = additions.slice(0, remaining);
    if (accepted.length) emit('update:modelValue', [...props.modelValue, ...accepted]);
    if (accepted.length < additions.length) message.warning(t('toolbox.workbench.batchReachedMax', { max: props.max }));
  }

  function removeItem(item: ResourcePickerItem) {
    if (props.disabled) return;
    emit('update:modelValue', removeToolboxSelectedResource(props.modelValue, item));
  }

  function removeGroup(keys: string[]) {
    if (props.disabled) return;
    const keySet = new Set(keys);
    emit(
      'update:modelValue',
      props.modelValue.filter((item) => !keySet.has(resourceItemKey(item))),
    );
  }

  function removeBranch(scope: AiScopeRef) {
    if (props.disabled) return;
    emit(
      'update:modelValue',
      props.modelValue.filter((item) => item.selectionGroup?.id !== scope.id),
    );
  }

  async function addNoteBranch(scope: AiScopeRef) {
    if (props.disabled || branchLoading.value || scope.type !== 'note_branch') return;
    branchLoading.value = true;
    try {
      const descendants = await fetchNoteBranchItems(scope.id);
      const result = mergeToolboxNoteBranchSelection({
        current: props.modelValue,
        scope,
        descendants,
        max: props.max,
        externalCount: props.externalCount,
      });
      if (result.status === 'already_selected') {
        message.info(t('toolbox.workbench.branchAlreadySelected'));
        return;
      }
      if (result.status === 'limit_exceeded') {
        message.warning(
          t('toolbox.workbench.branchTooLarge', {
            count: result.branchCount,
            max: props.max,
            remaining: Math.max(0, props.max - totalCount.value),
          }),
        );
        return;
      }
      emit('update:modelValue', result.items);
    } catch {
      message.error(t('toolbox.workbench.branchLoadFailed'));
    } finally {
      branchLoading.value = false;
    }
  }

  watch(
    () => props.allowedTypes.join(','),
    () => {
      if (activeType.value !== 'all' && !props.allowedTypes.includes(activeType.value)) selectType('all');
    },
  );
</script>

<style scoped lang="less">
  .toolbox-resource-selector {
    height: 100%;
    min-height: 0;
    display: grid;
    grid-template-rows: auto auto auto minmax(0, 1fr);
    gap: 12px;
  }
  .toolbox-resource-selector.is-page-scroll {
    height: auto;
    grid-template-rows: auto auto auto auto;
  }
  .toolbox-resource-selector__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .toolbox-resource-selector__selection-meta {
    display: grid;
    gap: 3px;
  }
  .toolbox-resource-selector__header strong {
    font-size: 15px;
  }
  .toolbox-resource-selector__header span {
    margin: 0;
    color: var(--desc-color);
    font-size: 12px;
  }
  .toolbox-resource-selector__clear {
    min-height: 27px;
    flex: 0 0 auto;
    gap: 5px;
    white-space: nowrap;
  }
  .toolbox-resource-selector__selected {
    width: 100%;
    height: clamp(84px, 10vh, 116px);
    box-sizing: border-box;
    min-width: 0;
    padding-right: 3px;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-auto-rows: 54px;
    align-content: start;
    gap: 8px;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .toolbox-resource-selector__selected.is-empty {
    padding: 0 12px;
    grid-template-columns: minmax(0, 1fr);
    align-items: center;
    align-content: center;
    border: 1px dashed var(--surface-border-color);
    border-radius: 11px;
    color: var(--desc-color);
    background: var(--surface-subtle-bg, var(--hover-background));
  }
  .toolbox-resource-selector__empty-selection {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 12px;
    line-height: 1.45;
  }
  .toolbox-resource-selector__empty-selection :deep(svg) {
    flex: 0 0 auto;
    color: var(--primary-color);
  }
  .toolbox-resource-selector__selected-item {
    width: 100%;
    min-width: 0;
    height: 54px;
    box-sizing: border-box;
    padding: 8px 8px 8px 10px;
    display: flex;
    align-items: center;
    gap: 9px;
    border: 1px solid var(--surface-border-color);
    border-radius: 11px;
    background: var(--card-background);
  }
  .toolbox-resource-selector__type {
    width: 29px;
    height: 29px;
    flex: 0 0 29px;
    display: grid;
    place-items: center;
    border-radius: 9px;
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 9%, transparent);
  }
  .toolbox-resource-selector__type.is-bookmark {
    color: var(--resource-bookmark-color, #f1883f);
  }
  .toolbox-resource-selector__type.is-file {
    color: var(--resource-file-color, #0b9f75);
  }
  .toolbox-resource-selector__selected-copy {
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  .toolbox-resource-selector__selected-copy strong {
    overflow: hidden;
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .toolbox-resource-selector__selected-copy small {
    color: var(--desc-color);
    font-size: 11px;
  }
  .toolbox-resource-selector__selected-item :deep(.b_btn) {
    width: 30px;
    height: 30px;
    margin-left: auto;
    padding: 0;
    color: var(--desc-color);
    background: transparent;
  }
  .toolbox-resource-selector__filters {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .toolbox-resource-selector__filters :deep(.b_btn) {
    min-height: 28px;
    padding: 0 11px;
    border: 1px solid var(--surface-border-color);
    border-radius: 999px;
    color: var(--desc-color);
    background: var(--card-background);
  }
  .toolbox-resource-selector__filters :deep(.b_btn.is-selected) {
    border-color: var(--primary-color);
    color: var(--primary-color);
    background: var(--card-background);
  }
  .toolbox-resource-selector__picker {
    position: relative;
    height: 100%;
    min-height: 286px;
    box-sizing: border-box;
    padding: 10px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--card-background);
  }
  .toolbox-resource-selector__back-top.b_btn {
    position: absolute;
    z-index: 4;
    right: 16px;
    bottom: 16px;
    min-height: 34px;
    padding: 0 11px;
    gap: 6px;
    border: 1px solid var(--primary-color);
    border-radius: 999px;
    color: var(--primary-color);
    background: var(--card-background);
    box-shadow: 0 8px 22px rgba(20, 24, 40, 0.14);
  }
  .toolbox-resource-selector__back-top :deep(svg) {
    transform: rotate(180deg);
  }
  .toolbox-resource-selector__picker > :deep(.resource-picker-panel) {
    min-height: 0;
    flex: 1;
  }
  .toolbox-resource-selector.is-page-scroll .toolbox-resource-selector__picker {
    height: auto;
    min-height: 0;
    overflow: visible;
  }
  .toolbox-resource-selector.is-page-scroll .toolbox-resource-selector__picker > :deep(.resource-picker-panel) {
    flex: none;
  }
  .toolbox-resource-selector__loading {
    min-height: 34px;
    margin-bottom: 4px;
    padding: 0 8px;
    border-bottom: 1px solid var(--surface-divider-color);
  }
  @media (max-width: 767px) {
    .toolbox-resource-selector__clear {
      min-height: 44px;
    }
    .toolbox-resource-selector__picker {
      min-height: 250px;
    }
    .toolbox-resource-selector__selected {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  @media (min-width: 768px) {
    .toolbox-resource-selector:not(.is-page-scroll) {
      gap: 8px;
    }
    .toolbox-resource-selector:not(.is-page-scroll) .toolbox-resource-selector__selection-meta {
      display: flex;
      align-items: baseline;
      gap: 8px;
    }
    .toolbox-resource-selector:not(.is-page-scroll) .toolbox-resource-selector__header strong {
      font-size: 13px;
    }
    .toolbox-resource-selector:not(.is-page-scroll) .toolbox-resource-selector__header span {
      font-size: 11px;
    }
    .toolbox-resource-selector:not(.is-page-scroll) .toolbox-resource-selector__selected {
      height: 54px;
      grid-auto-rows: 46px;
      gap: 6px;
    }
    .toolbox-resource-selector:not(.is-page-scroll) .toolbox-resource-selector__selected.is-empty {
      height: 54px;
    }
    .toolbox-resource-selector:not(.is-page-scroll) .toolbox-resource-selector__selected-item {
      height: 46px;
      padding: 6px 7px 6px 8px;
      gap: 7px;
    }
    .toolbox-resource-selector:not(.is-page-scroll) .toolbox-resource-selector__type {
      width: 26px;
      height: 26px;
      flex-basis: 26px;
      border-radius: 8px;
    }
    .toolbox-resource-selector:not(.is-page-scroll) .toolbox-resource-selector__selected-copy strong {
      font-size: 12px;
    }
    .toolbox-resource-selector:not(.is-page-scroll) .toolbox-resource-selector__selected-copy small {
      font-size: 10px;
    }
    .toolbox-resource-selector:not(.is-page-scroll) .toolbox-resource-selector__filters {
      gap: 4px;
    }
    .toolbox-resource-selector:not(.is-page-scroll) .toolbox-resource-selector__filters :deep(.b_btn) {
      min-height: 26px;
      padding: 0 9px;
    }
    .toolbox-resource-selector:not(.is-page-scroll) .toolbox-resource-selector__picker {
      min-height: 0;
      padding: 8px;
      border-radius: 12px;
    }
  }
  html.light-note-mobile-rendering .toolbox-resource-selector__type {
    background: var(--card-background);
    border: 1px solid currentColor;
  }
  html.light-note-mobile-rendering .toolbox-resource-selector__filters :deep(.b_btn.is-selected) {
    border-color: var(--primary-color);
    color: var(--primary-color);
  }
</style>
