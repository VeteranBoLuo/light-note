<template>
  <BDrawer
    :open="open"
    :title="title"
    placement="bottom"
    height="auto"
    body-padding="10px 16px max(18px, env(safe-area-inset-bottom))"
    @close="emit('update:open', false)"
  >
    <div class="mobile-page-actions" role="menu" :aria-label="title">
      <BButton
        v-for="action in actions"
        :key="action.key"
        class="mobile-page-actions__item"
        :type="action.danger ? 'danger' : undefined"
        :disabled="action.disabled"
        :loading="action.loading"
        role="menuitem"
        @click="runAction(action)"
      >
        <SvgIcon v-if="action.icon" :src="action.icon" size="19" aria-hidden="true" />
        <span>{{ action.label }}</span>
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
    disabled?: boolean;
    loading?: boolean;
  }
</script>

<script setup lang="ts">
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';

  defineProps<{
    open: boolean;
    title: string;
    actions: MobilePageActionItem[];
  }>();
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
    gap: 8px;
  }
  .mobile-page-actions__item {
    width: 100%;
    min-height: 48px;
    justify-content: flex-start;
    gap: 11px;
    padding-inline: 14px;
    border-radius: 12px;
    font-size: 15px;
  }
</style>
