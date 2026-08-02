<template>
  <MobileSwipeActions
    :actions="actions"
    :enabled="enabled"
    :open="open"
    :disabled="disabled"
    :allow-interactive-start="allowInteractiveStart"
    :action-width="84"
    legacy-delete-classes
    @swipe-start="emit('swipe-start')"
    @update:open="emit('update:open', $event)"
    @action="emit('delete')"
  >
    <slot></slot>
  </MobileSwipeActions>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import MobileSwipeActions, { type MobileSwipeActionItem } from './MobileSwipeActions.vue';
  import icon from '@/config/icon';

  const props = withDefaults(
    defineProps<{
      enabled?: boolean;
      open?: boolean;
      disabled?: boolean;
      loading?: boolean;
      allowInteractiveStart?: boolean;
      label: string;
    }>(),
    {
      enabled: false,
      open: false,
      disabled: false,
      loading: false,
      allowInteractiveStart: false,
    },
  );
  const emit = defineEmits<{
    'update:open': [open: boolean];
    'swipe-start': [];
    delete: [];
  }>();

  const actions = computed<MobileSwipeActionItem[]>(() => [
    {
      key: 'delete',
      label: props.label,
      icon: icon.table_delete,
      tone: 'danger',
      disabled: props.disabled,
      loading: props.loading,
    },
  ]);
</script>
