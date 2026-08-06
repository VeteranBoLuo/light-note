<template>
  <BDrawer
    :open="open"
    :title="sheetTitle"
    placement="bottom"
    height="auto"
    body-padding="10px 16px max(18px, env(safe-area-inset-bottom))"
    @close="emit('update:open', false)"
  >
    <div class="mobile-page-actions" :class="{ 'is-compact': compact }" role="menu" :aria-label="sheetTitle">
      <BButton
        v-for="action in actions"
        :key="action.key"
        class="mobile-page-actions__item"
        :class="{
          'is-danger': action.danger,
          'is-selected': action.selected,
          'has-divider': action.dividerBefore,
        }"
        :type="action.danger ? 'danger' : undefined"
        :disabled="action.disabled"
        :loading="action.loading"
        role="menuitem"
        @click="runAction(action)"
      >
        <span class="mobile-page-actions__icon" aria-hidden="true">
          <SvgIcon v-if="action.icon" :src="action.icon" size="19" />
        </span>
        <span class="mobile-page-actions__copy">
          <strong>{{ action.label }}</strong>
          <small v-if="action.description">{{ action.description }}</small>
        </span>
        <SvgIcon v-if="action.selected" :src="icon.filterPanel.check" size="18" aria-hidden="true" />
      </BButton>
    </div>
  </BDrawer>
</template>

<script lang="ts">
  export interface MobilePageActionItem {
    key: string;
    label: string;
    icon?: string;
    danger?: boolean;
    description?: string;
    dividerBefore?: boolean;
    selected?: boolean;
    disabled?: boolean;
    loading?: boolean;
  }
</script>

<script setup lang="ts">
  import { computed } from 'vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';

  const props = withDefaults(
    defineProps<{
      open: boolean;
      title?: string;
      objectTitle?: string;
      compact?: boolean;
      actions: MobilePageActionItem[];
    }>(),
    { title: '', objectTitle: '', compact: false },
  );
  const sheetTitle = computed(() => props.objectTitle || props.title);
  const emit = defineEmits<{
    'update:open': [open: boolean];
    action: [action: MobilePageActionItem];
  }>();

  function runAction(action: MobilePageActionItem) {
    if (action.disabled || action.loading) return;
    emit('update:open', false);
    emit('action', action);
  }
</script>

<style scoped lang="less">
  .mobile-page-actions {
    display: grid;
    gap: 4px;
  }
  .mobile-page-actions__item {
    position: relative;
    width: 100%;
    min-height: var(--mobile-sheet-item-height, 52px);
    justify-content: flex-start;
    gap: 10px;
    padding-inline: 14px;
    border: 1px solid transparent;
    border-radius: var(--mobile-control-radius, 10px);
    background: var(--workspace-panel-bg-color) !important;
    font-size: 15px;
  }

  .mobile-page-actions__item.has-divider {
    margin-top: 10px;
  }

  .mobile-page-actions__item.has-divider::before {
    position: absolute;
    right: 0;
    bottom: calc(100% + 5px);
    left: 0;
    height: 1px;
    background: var(--mobile-row-divider, var(--surface-divider-color));
    content: '';
  }

  .mobile-page-actions__item.is-selected {
    border-color: var(--primary-color);
    color: var(--primary-color);
    background: var(--mobile-selected-bg) !important;
    font-weight: 650;
  }

  .mobile-page-actions__item.is-danger {
    border-color: var(--mobile-sheet-danger-border);
    color: var(--danger-color);
    background: var(--mobile-sheet-danger-bg) !important;
  }

  .mobile-page-actions__icon {
    width: 22px;
    display: inline-flex;
    flex: 0 0 22px;
    justify-content: center;
  }

  .mobile-page-actions__copy {
    min-width: 0;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    align-items: flex-start;
    gap: 1px;
    line-height: 1.35;
    text-align: left;
    white-space: normal;
  }

  .mobile-page-actions__copy strong {
    font-size: 14px;
    font-weight: 600;
  }

  .mobile-page-actions__copy small {
    color: var(--desc-color);
    font-size: 12px;
    font-weight: 400;
  }

  .mobile-page-actions.is-compact .mobile-page-actions__item {
    min-height: 48px;
  }
</style>
