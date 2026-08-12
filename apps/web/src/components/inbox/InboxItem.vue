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
        { 'inbox-item--selection': selectionMode, 'inbox-item--selected': selected },
      ]"
    >
      <BCheckbox
        v-if="selectable"
        :model-value="selected"
        :disabled="disabled"
        :aria-label="item.title || t('inbox.untitled')"
        @update:model-value="emit('select', $event)"
      />
      <span v-else class="inbox-item__select-placeholder" aria-hidden="true"></span>
      <div class="inbox-item__body" @click="handleBodyClick">
        <div class="inbox-item__meta">
          <span class="inbox-item__type">{{ t(`inbox.${item.resourceType}`) }}</span>
          <span>{{ formatTime(item.collectedAt) }}</span>
        </div>
        <h3 :title="item.title">{{ item.title || t('inbox.untitled') }}</h3>
        <p v-if="plainSummary">{{ plainSummary }}</p>
        <span v-if="item.resourceType === 'bookmark'" class="inbox-item__detail">{{ item.detail }}</span>
      </div>
      <div class="inbox-item__actions inbox-item__actions--desktop">
        <BButton size="small" @click="emit('open')">{{ t('inbox.organize') }}</BButton>
        <BButton size="small" type="primary" :loading="completing" :disabled="disabled" @click="emit('complete')">
          {{ t('inbox.complete') }}
        </BButton>
        <BButton size="small" type="danger" :loading="deleting" :disabled="disabled" @click="emit('delete')">
          {{ t('inbox.deleteResource') }}
        </BButton>
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
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import MobilePageActionsDrawer, {
    type MobilePageActionItem,
  } from '@/components/mobile/MobilePageActionsDrawer.vue';
  import MobileSwipeActions, { type MobileSwipeActionItem } from '@/components/mobile/MobileSwipeActions.vue';
  import icon from '@/config/icon';
  import type { InboxItem } from '@/api/inboxApi';

  const props = withDefaults(
    defineProps<{
      item: InboxItem;
      selected: boolean;
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
      label: t('inbox.organize'),
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
  .inbox-item {
    --type-color: #615ced;
    position: relative;
    overflow: hidden;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 14px;
    padding: 16px;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 82%, transparent);
    border-radius: 16px;
    background: linear-gradient(
      108deg,
      color-mix(in srgb, var(--type-color) 8%, var(--background-color)) 0%,
      var(--background-color) 26%,
      color-mix(in srgb, var(--type-color) 2%, var(--background-color)) 100%
    );
    transition:
      box-shadow 0.2s,
      transform 0.2s,
      border-color 0.2s;
    min-width: 0;
  }
  .inbox-item::before {
    position: absolute;
    top: 12px;
    bottom: 12px;
    left: 0;
    width: 3px;
    border-radius: 0 4px 4px 0;
    content: '';
    background: linear-gradient(to bottom, transparent, var(--type-color) 20%, var(--type-color) 80%, transparent);
  }
  .inbox-item:hover {
    border-color: color-mix(in srgb, var(--type-color) 26%, var(--card-border-color));
    box-shadow: 0 10px 28px rgba(28, 33, 66, 0.09);
    transform: translateY(-1px);
  }
  .inbox-item--note {
    --type-color: #2ecc71;
  }
  .inbox-item--file {
    --type-color: #f39c12;
  }
  .inbox-item__body {
    min-width: 0;
    cursor: pointer;
  }

  .inbox-item__select-placeholder {
    width: 18px;
    height: 18px;
    flex: 0 0 18px;
  }
  .inbox-item__meta {
    display: flex;
    gap: 8px;
    align-items: center;
    color: var(--desc-color);
    font-size: 12px;
  }
  .inbox-item__type {
    color: var(--type-color);
    font-weight: 600;
  }
  h3 {
    margin: 6px 0 4px;
    color: var(--text-color);
    font-size: 16px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  p {
    margin: 0;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.6;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .inbox-item__detail {
    display: block;
    margin-top: 5px;
    color: var(--desc-color);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .inbox-item__actions {
    display: flex;
    flex-wrap: nowrap;
    justify-content: flex-end;
    gap: 8px;
    min-width: max-content;
  }
  .inbox-item__actions--mobile {
    display: none;
  }
  .inbox-item--selected {
    border-color: color-mix(in srgb, var(--primary-color) 55%, var(--card-border-color));
  }
  @media (max-width: 767px) {
    .inbox-item {
      grid-template-columns: auto minmax(0, 1fr);
      align-items: start;
      padding: 13px;
    }
    .inbox-item__actions--desktop {
      display: none;
    }
    .inbox-item__actions--mobile {
      position: absolute;
      top: 8px;
      right: 8px;
      display: block;
    }
    .inbox-item__more {
      width: 36px;
      min-width: 36px;
      height: 36px;
      padding: 0;
      border-radius: 10px;
      color: var(--desc-color);
      background: transparent !important;
    }
    .inbox-item__body {
      padding-right: 34px;
    }
    .inbox-item--selection .inbox-item__body {
      padding-right: 0;
    }
  }

</style>
