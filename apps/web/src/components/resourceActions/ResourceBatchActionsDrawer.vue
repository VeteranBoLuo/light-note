<template>
  <MobilePageActionsDrawer
    :open="open"
    :title="title"
    :actions="menuActions"
    @update:open="emit('update:open', $event)"
    @action="handleAction"
  />
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import MobilePageActionsDrawer, { type MobilePageActionItem } from '@/components/mobile/MobilePageActionsDrawer.vue';
  import { useProjectResourceAction } from '@/composables/useProjectResourceAction';
  import { useResourceSelectionStore, type SelectionModule } from '@/store/resourceSelection';
  import icon from '@/config/icon';

  const props = defineProps<{
    open: boolean;
    title: string;
    actions: MobilePageActionItem[];
    selectionModule: SelectionModule;
  }>();
  const emit = defineEmits<{
    'update:open': [open: boolean];
    action: [action: MobilePageActionItem];
  }>();
  const { t } = useI18n();
  const selection = useResourceSelectionStore();
  const { canJoinProject, joinProject } = useProjectResourceAction();
  const ownsSelection = computed(() => selection.module === props.selectionModule);
  const canJoinSelection = computed(
    () =>
      ownsSelection.value && canJoinProject.value && !selection.busy && !selection.query && selection.items.length > 0,
  );
  const menuActions = computed<MobilePageActionItem[]>(() => [
    ...(canJoinProject.value && ownsSelection.value
      ? [
          {
            key: 'joinProject',
            label: t('toolbox.project.join'),
            icon: icon.toolbox.research,
            disabled: !canJoinSelection.value,
          },
        ]
      : []),
    ...props.actions,
  ]);
  // MobilePageActionsDrawer waits for its history entry and exit animation before handing off.
  function handleAction(action: MobilePageActionItem) {
    if (action.key === 'joinProject') {
      if (canJoinSelection.value) joinProject(selection.items, 'resource_batch');
      return;
    }
    emit('action', action);
  }
</script>
