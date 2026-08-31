<template>
  <BDrawer
    :open="open"
    :title="sheetTitle"
    placement="bottom"
    height="auto"
    body-padding="10px 16px max(18px, env(safe-area-inset-bottom))"
    @close="emit('update:open', false)"
    @after-close="handleAfterClose"
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
        :disabled="action.disabled || actionHandoffPending"
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
  import { computed, onBeforeUnmount, ref } from 'vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { closeCurrentMobileOverlayThen } from '@/utils/mobileOverlayHistory';

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
  const actionHandoffPending = ref(false);
  let resolveVisualClose: (() => void) | null = null;

  function waitForVisualClose() {
    return new Promise<void>((resolve) => {
      resolveVisualClose = resolve;
    });
  }

  function handleAfterClose() {
    resolveVisualClose?.();
    resolveVisualClose = null;
  }

  async function runAction(action: MobilePageActionItem) {
    if (action.disabled || action.loading || actionHandoffPending.value) return;
    actionHandoffPending.value = true;
    const visuallyClosed = waitForVisualClose();
    try {
      // 抽屉与下一层弹框都使用移动端 history 占位。若同一轮先关抽屉再开弹框，
      // 抽屉异步触发的 history.back() 可能把刚注册的弹框一起弹掉，表现为弹框偶发闪退。
      // 路由切换还必须等抽屉 Teleport 子树完成退场，否则 Vue 会在切页卸载时与退场渲染竞争。
      await closeCurrentMobileOverlayThen(
        () => emit('update:open', false),
        async () => {
          await visuallyClosed;
          emit('action', action);
        },
      );
    } finally {
      actionHandoffPending.value = false;
    }
  }

  onBeforeUnmount(handleAfterClose);
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
