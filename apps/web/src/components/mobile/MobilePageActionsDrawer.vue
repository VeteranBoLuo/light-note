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
      <slot name="before-actions" :run-action="runAction" :pending="actionHandoffPending" />
      <BButton
        v-for="action in actions"
        :key="action.key"
        class="mobile-page-actions__item"
        :class="{
          'is-danger': action.danger,
          'is-selected': action.selected,
          'has-divider': action.dividerBefore,
          'has-description': Boolean(action.description),
        }"
        :type="action.danger ? 'danger' : undefined"
        :disabled="action.disabled || actionHandoffPending"
        :loading="action.loading"
        role="menuitem"
        @click="runAction(action)"
      >
        <span class="mobile-page-actions__icon" aria-hidden="true">
          <SvgIcon v-if="action.icon" :src="action.icon" size="20" />
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
  @import './mobilePageActions.less';
</style>
