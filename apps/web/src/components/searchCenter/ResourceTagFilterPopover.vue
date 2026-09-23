<template>
  <BPopover
    v-model:open="open"
    class="resource-tag-filter"
    overlay-class-name="resource-tag-filter-overlay"
    trigger="click"
    placement="bottom-left"
  >
    <BButton
      class="resource-tag-filter__trigger"
      :class="{ 'is-active': selected.length > 0 }"
      :aria-label="t('resourceCenter.tagFilter')"
      aria-haspopup="listbox"
      :aria-expanded="open"
    >
      <span class="resource-tag-filter__trigger-icon" aria-hidden="true">
        <SvgIcon :src="icon.resource.tag" size="16" />
      </span>
      <span class="resource-tag-filter__trigger-copy">
        <strong>{{ triggerTitle }}</strong>
        <small>{{ triggerSummary }}</small>
      </span>
      <SvgIcon
        class="resource-tag-filter__trigger-chevron"
        :class="{ 'is-open': open }"
        :src="icon.noteTree.chevron"
        size="14"
        aria-hidden="true"
      />
    </BButton>

    <template #content>
      <section class="resource-tag-picker" :aria-label="t('resourceCenter.tagFilter')">
        <header class="resource-tag-picker__header">
          <span>
            <strong>{{ t('resourceCenter.tagFilter') }}</strong>
            <small>{{ t('resourceCenter.availableTagCount', { count: items.length }) }}</small>
          </span>
          <BButton v-if="selected.length" size="small" class="resource-tag-picker__clear" @click="emit('clear')">
            {{ t('common.clear') }}
          </BButton>
        </header>

        <BInput v-model:value="search" :placeholder="t('resourceCenter.tagSearchPlaceholder')" clearable>
          <template #prefix>
            <SvgIcon :src="icon.navigation.search" size="16" aria-hidden="true" />
          </template>
        </BInput>

        <div v-auto-scrollbar class="resource-tag-picker__list" role="listbox" aria-multiselectable="true">
          <BButton
            v-for="tag in filteredItems"
            :key="tag"
            class="resource-tag-picker__item"
            :class="{ 'is-selected': selected.includes(tag) }"
            role="option"
            :aria-selected="selected.includes(tag)"
            @click="emit('toggle', tag)"
          >
            <span class="resource-tag-picker__item-icon" aria-hidden="true">
              <SvgIcon :src="icon.resource.tag" size="15" />
            </span>
            <span class="resource-tag-picker__item-name">{{ tag }}</span>
            <span
              class="resource-tag-picker__check"
              :class="{ 'is-selected': selected.includes(tag) }"
              aria-hidden="true"
            >
              <SvgIcon :src="icon.filterPanel.check" size="13" />
            </span>
          </BButton>

          <div v-if="!filteredItems.length" class="resource-tag-picker__empty">
            {{ t('resourceCenter.noTagMatches') }}
          </div>
        </div>
      </section>
    </template>
  </BPopover>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';

  const props = defineProps<{
    items: string[];
    selected: string[];
  }>();

  const emit = defineEmits<{
    toggle: [tag: string];
    clear: [];
  }>();

  const { t } = useI18n();
  const open = ref(false);
  const search = ref('');

  const filteredItems = computed(() => {
    const keyword = search.value.trim().toLocaleLowerCase();
    return keyword ? props.items.filter((tag) => tag.toLocaleLowerCase().includes(keyword)) : props.items;
  });

  const triggerTitle = computed(() => {
    if (!props.selected.length) return t('resourceCenter.chooseTags');
    return t('resourceCenter.selectedTagCount', { count: props.selected.length });
  });

  const triggerSummary = computed(() => {
    if (!props.selected.length) return t('resourceCenter.availableTagCount', { count: props.items.length });
    const visibleNames = props.selected.slice(0, 2).join('、');
    return props.selected.length > 2 ? `${visibleNames}…` : visibleNames;
  });

  watch(open, (visible) => {
    if (!visible) {
      search.value = '';
    }
  });
</script>

<style scoped lang="less">
  .resource-tag-filter {
    width: 100%;
    min-width: 0;
  }

  .resource-tag-filter__trigger {
    width: 100%;
    min-width: 0;
    height: var(--ui-layout-48, 48px);
    padding: var(--ui-space-5, 5px) var(--ui-space-8, 8px);
    display: grid;
    grid-template-columns: var(--ui-layout-20, 20px) minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    border: 1px solid var(--search-border-color);
    border-radius: 11px;
    color: var(--text-color);
    background: var(--search-muted-bg);
    text-align: left;
  }

  .resource-tag-filter__trigger.is-active {
    border-color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 8%, var(--search-card-bg));
  }

  .resource-tag-filter__trigger-icon {
    width: var(--ui-layout-20, 20px);
    height: var(--ui-layout-20, 20px);
    display: grid;
    place-items: center;
    color: var(--resource-tag-color);
  }

  .resource-tag-filter__trigger-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-2, 2px);
    line-height: 1.2;
  }

  .resource-tag-filter__trigger-copy strong,
  .resource-tag-filter__trigger-copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .resource-tag-filter__trigger-copy strong {
    font-size: var(--ui-font-12, 12px);
  }

  .resource-tag-filter__trigger-copy small {
    color: var(--desc-color);
    font-size: var(--ui-font-10, 10px);
    font-weight: 500;
  }

  .resource-tag-filter__trigger-chevron {
    color: var(--desc-color);
    transition: transform 0.18s ease;
  }

  .resource-tag-filter__trigger-chevron.is-open {
    transform: rotate(180deg);
  }

  .resource-tag-picker {
    width: min(var(--ui-layout-310, 310px), calc(100vw - var(--ui-layout-32, 32px)));
    height: min(var(--ui-layout-360, 360px), calc(100vh - var(--ui-layout-32, 32px)));
    padding: var(--ui-space-12, 12px);
    box-sizing: border-box;
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    gap: var(--ui-space-10, 10px);
    overflow: hidden;
  }

  .resource-tag-picker__header {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-10, 10px);
  }

  .resource-tag-picker__header > span {
    min-width: 0;
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: var(--ui-space-4, 4px) var(--ui-space-8, 8px);
  }

  .resource-tag-picker__header strong {
    font-size: var(--ui-font-14, 14px);
  }

  .resource-tag-picker__header small {
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
  }

  .resource-tag-picker__clear {
    flex: 0 0 auto;
    border-radius: 8px;
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 8%, var(--search-card-bg));
  }

  .resource-tag-picker :deep(.input-container),
  .resource-tag-picker :deep(.b-input) {
    width: 100%;
  }

  .resource-tag-picker :deep(.b-input) {
    height: var(--ui-layout-38, 38px);
    border-radius: 10px;
    background: var(--search-muted-bg);
  }

  .resource-tag-picker__list {
    min-height: 0;
    padding-right: var(--ui-space-2, 2px);
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-2, 2px);
    overflow: hidden auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
  }

  .resource-tag-picker__item {
    width: 100%;
    min-width: 0;
    height: var(--ui-layout-34, 34px);
    min-height: var(--ui-layout-34, 34px);
    flex: 0 0 auto;
    padding: var(--ui-space-3, 3px) var(--ui-space-7, 7px);
    display: grid;
    grid-template-columns: var(--ui-layout-20, 20px) minmax(0, 1fr) var(--ui-layout-20, 20px);
    align-items: center;
    gap: var(--ui-space-8, 8px);
    border: 1px solid transparent;
    border-radius: 10px;
    color: var(--text-color);
    background: transparent;
    text-align: left;
    transition:
      border-color 0.16s ease,
      background-color 0.16s ease,
      color 0.16s ease;
  }

  .resource-tag-picker__item:hover,
  .resource-tag-picker__item:focus-visible,
  .resource-tag-picker__item.is-selected {
    border-color: color-mix(in srgb, var(--primary-color) 35%, var(--search-border-color));
    background: color-mix(in srgb, var(--primary-color) 8%, var(--search-card-bg));
  }

  .resource-tag-picker__item.is-selected {
    color: var(--primary-color);
  }

  .resource-tag-picker__item-icon {
    width: var(--ui-layout-20, 20px);
    height: var(--ui-layout-20, 20px);
    display: grid;
    place-items: center;
    color: var(--resource-tag-color);
  }

  .resource-tag-picker__item-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--ui-font-12, 12px);
  }

  .resource-tag-picker__check {
    width: var(--ui-layout-18, 18px);
    height: var(--ui-layout-18, 18px);
    display: grid;
    place-items: center;
    border: 1px solid var(--search-border-color);
    border-radius: 6px;
    color: transparent;
    background: var(--search-card-bg);
    transition:
      border-color 0.16s ease,
      color 0.16s ease,
      background-color 0.16s ease;
  }

  .resource-tag-picker__check.is-selected {
    border-color: var(--primary-color);
    color: #fff;
    background: var(--primary-color);
  }

  .resource-tag-picker__empty {
    min-height: var(--ui-layout-120, 120px);
    display: grid;
    place-items: center;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }

  :global(.b-popover-panel.resource-tag-filter-overlay) {
    border-color: var(--surface-border-color);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.1);
  }

  :global([data-theme='night'] .b-popover-panel.resource-tag-filter-overlay) {
    border-color: var(--surface-border-color);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
  }

  @media (max-width: 767px) {
    .resource-tag-picker__item {
      height: var(--ui-layout-44, 44px);
      min-height: var(--ui-layout-44, 44px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .resource-tag-filter__trigger-chevron,
    .resource-tag-picker__item,
    .resource-tag-picker__check {
      transition: none;
    }
  }
</style>
