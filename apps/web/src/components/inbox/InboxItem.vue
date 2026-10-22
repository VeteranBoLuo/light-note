<template>
  <MobileSwipeActions
    :actions="swipeActions"
    :enabled="swipeEnabled && !selectionMode"
    :open="swipeOpen"
    :disabled="disabled"
    @swipe-start="emit('swipe-start')"
    @update:open="emit('update:swipe-open', $event)"
    @action="handleSwipeAction"
  >
    <article
      :class="[
        'inbox-item',
        `inbox-item--${item.resourceType}`,
        {
          'inbox-item--selectable': selectable,
          'inbox-item--selection': selectionMode,
          'inbox-item--selected': selected,
        },
      ]"
    >
      <BCheckbox
        v-if="selectable"
        :model-value="selected"
        :disabled="disabled"
        :aria-label="item.title || t('inbox.untitled')"
        @update:model-value="emit('select', $event)"
      />
      <div
        :data-range-select="selectionMode ? 'primary' : undefined"
        class="inbox-item__body"
        role="button"
        :tabindex="disabled ? -1 : 0"
        :aria-disabled="disabled"
        :aria-pressed="selectionMode ? selected : inspected"
        :aria-label="item.title || t('inbox.untitled')"
        @click="handleBodyClick"
        @keydown.enter.prevent="handleBodyClick"
        @keydown.space.prevent="handleBodyClick"
      >
        <span class="inbox-item__icon" aria-hidden="true">
          <SvgIcon :src="icon.resource[item.resourceType]" size="18" />
        </span>
        <div class="inbox-item__content">
          <div class="inbox-item__heading">
            <h3 :title="item.title">{{ item.title || t('inbox.untitled') }}</h3>
            <BChip class="inbox-item__type" :tone="item.resourceType">{{ t(`inbox.${item.resourceType}`) }}</BChip>
          </div>
          <p v-if="plainSummary">{{ plainSummary }}</p>
          <span v-if="item.resourceType === 'bookmark'" class="inbox-item__detail">{{ item.detail }}</span>
          <time v-if="item.collectedAt" class="inbox-item__time" :datetime="item.collectedAt">
            {{ formatTime(item.collectedAt) }}
          </time>
        </div>
      </div>
      <div v-if="!selectionMode" class="inbox-item__actions inbox-item__actions--mobile" @click.stop>
        <BButton
          class="inbox-item__more"
          :aria-label="t('common.more')"
          :title="t('common.more')"
          @click="mobileMenuOpen = true"
        >
          <SvgIcon :src="icon.common.more" size="18" aria-hidden="true" />
        </BButton>
      </div>
    </article>
  </MobileSwipeActions>
  <MobilePageActionsDrawer
    v-model:open="mobileMenuOpen"
    :object-title="item.title || t('inbox.untitled')"
    :actions="mobileMenuActions"
    @action="handleMobileMenuAction"
  />
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import MobilePageActionsDrawer, { type MobilePageActionItem } from '@/components/mobile/MobilePageActionsDrawer.vue';
  import MobileSwipeActions, { type MobileSwipeActionItem } from '@/components/mobile/MobileSwipeActions.vue';
  import icon from '@/config/icon';
  import type { InboxItem } from '@/api/inboxApi';

  const props = withDefaults(
    defineProps<{
      item: InboxItem;
      selected: boolean;
      inspected?: boolean;
      completing?: boolean;
      deleting?: boolean;
      disabled?: boolean;
      selectable?: boolean;
      selectionMode?: boolean;
      swipeEnabled?: boolean;
      swipeOpen?: boolean;
    }>(),
    { selectable: true, selectionMode: false, swipeEnabled: false, swipeOpen: false },
  );
  const emit = defineEmits<{
    select: [selected: boolean];
    open: [];
    complete: [];
    delete: [];
    'swipe-start': [];
    'update:swipe-open': [open: boolean];
  }>();
  const { t, locale } = useI18n();
  const mobileMenuOpen = ref(false);
  const mobileMenuActions = computed<MobilePageActionItem[]>(() => [
    {
      key: 'open',
      label: t('common.detail'),
      icon: icon.common.more,
      disabled: props.disabled,
    },
    {
      key: 'complete',
      label: t('inbox.complete'),
      icon: icon.filterPanel.check,
      loading: props.completing,
      disabled: props.disabled,
    },
    {
      key: 'delete',
      label: t('inbox.deleteResource'),
      icon: icon.table_delete,
      danger: true,
      dividerBefore: true,
      loading: props.deleting,
      disabled: props.disabled,
    },
  ]);
  const swipeActions = computed<MobileSwipeActionItem[]>(() => [
    {
      key: 'complete',
      label: t('inbox.complete'),
      icon: icon.filterPanel.check,
      tone: 'success',
      loading: props.completing,
      disabled: props.disabled,
    },
    {
      key: 'delete',
      label: t('inbox.deleteResource'),
      icon: icon.table_delete,
      tone: 'danger',
      loading: props.deleting,
      disabled: props.disabled,
    },
  ]);
  const plainSummary = computed(() => {
    const node = document.createElement('div');
    node.innerHTML = props.item.summary || '';
    return (node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 180);
  });
  const formatTime = (value: string) =>
    value
      ? new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
      : '';

  function handleBodyClick() {
    if (props.disabled) return;
    if (props.selectionMode) emit('select', !props.selected);
    else emit('open');
  }

  function handleSwipeAction(action: MobileSwipeActionItem) {
    if (action.key === 'complete') emit('complete');
    else if (action.key === 'delete') emit('delete');
  }

  function handleMobileMenuAction(action: MobilePageActionItem) {
    if (action.key === 'open') emit('open');
    else if (action.key === 'complete') emit('complete');
    else if (action.key === 'delete') emit('delete');
  }
</script>

<style scoped lang="less">
  @import (reference) '@/assets/css/workspace-surfaces.less';

  .inbox-item {
    .workspace-content-surface();
    --type-color: var(--workspace-purple-text);
    position: relative;
    overflow: hidden;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: center;
    gap: var(--ui-space-8, 8px);
    padding: var(--ui-space-10, 10px) var(--ui-space-12, 12px);
    border: 1px solid var(--workspace-border);
    border-radius: 10px;
    transition:
      background-color 0.2s,
      border-color 0.2s;
    min-width: 0;
  }
  .inbox-item--selectable {
    grid-template-columns: auto minmax(0, 1fr);
  }
  .inbox-item--note {
    --type-color: var(--workspace-note-text);
  }
  .inbox-item--file {
    --type-color: var(--workspace-file-text);
  }
  .inbox-item__body {
    display: grid;
    grid-template-columns: var(--ui-layout-38, 38px) minmax(0, 1fr);
    align-items: center;
    gap: var(--ui-space-12, 12px);
    min-width: 0;
    cursor: pointer;
  }

  .inbox-item__icon {
    display: grid;
    place-items: center;
    width: var(--ui-layout-38, 38px);
    height: var(--ui-layout-38, 38px);
    border-radius: 11px;
    color: var(--type-color);
    background: var(--workspace-canvas);
  }

  .inbox-item__content {
    display: grid;
    gap: var(--ui-space-2, 2px);
    min-width: 0;
  }

  .inbox-item__body:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 4px;
    border-radius: 4px;
  }

  .inbox-item__body[aria-disabled='true'] {
    cursor: default;
  }

  .inbox-item__heading {
    display: flex;
    gap: var(--ui-space-8, 8px);
    align-items: center;
    min-width: 0;
  }
  .inbox-item .inbox-item__type {
    --b-chip-fg: var(--type-color);
    --b-chip-bg: var(--workspace-canvas);
    --b-chip-border: var(--workspace-border);
    font-weight: 500;
  }
  h3 {
    min-width: 0;
    margin: 0;
    color: var(--text-color);
    font-size: var(--ui-font-15, 15px);
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  p {
    margin: 0;
    color: var(--desc-color);
    font-size: var(--ui-font-13, 13px);
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .inbox-item__detail {
    display: block;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .inbox-item__time {
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
    line-height: 1.5;
  }
  .inbox-item__actions {
    display: flex;
    flex-wrap: nowrap;
    justify-content: flex-end;
    gap: var(--ui-space-8, 8px);
    min-width: max-content;
  }
  .inbox-item__actions--mobile {
    display: none;
  }
  .inbox-item.inbox-item--selected {
    border-color: var(--primary-color);
  }
  @media (hover: hover) and (pointer: fine) {
    .inbox-item:hover {
      background: var(--surface-card-hover-bg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .inbox-item {
      transition: none;
    }
  }
  @media (max-width: 767px) {
    .inbox-item {
      align-items: start;
    }
    .inbox-item__actions--mobile {
      position: absolute;
      top: 0;
      right: 0;
      display: block;
    }
    .inbox-item__more {
      width: var(--ui-control-44, 44px);
      min-width: var(--ui-control-44, 44px);
      height: var(--ui-control-44, 44px);
      padding: 0;
      border-radius: 10px;
      color: var(--desc-color);
      background: transparent !important;
    }
    .inbox-item__body {
      padding-right: var(--ui-space-34, 34px);
    }
    .inbox-item--selection .inbox-item__body {
      padding-right: 0;
    }
    p {
      -webkit-line-clamp: 2;
    }
  }
</style>
