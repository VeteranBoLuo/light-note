<template>
  <span v-if="reminderState.kind !== 'none'" class="todo-reminder-text" :class="`is-${reminderState.kind}`">
    <span>{{ t('todoWorkspace.reminderLabel') }}{{ ' ' }}</span>
    <TodoTimeText v-if="reminderTime" :text="reminderTime" />
    <span v-if="reminderState.kind !== 'next'" class="todo-reminder-text__state"
      >{{ reminderTime ? ' ' : '' }}{{ t(`todoWorkspace.reminderState.${reminderState.kind}`) }}</span
    >
  </span>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import type { TodoItem } from '@/api/todoApi';
  import { useTodoReminderPresentation } from '@/composables/useTodoReminderPresentation';
  import TodoTimeText from './TodoTimeText.vue';

  const props = defineProps<{ item: TodoItem }>();
  const { t } = useI18n();
  const { reminderState, reminderTime } = useTodoReminderPresentation(() => props.item);
</script>

<style scoped>
  .todo-reminder-text {
    min-width: 0;
    max-width: 100%;
    color: var(--desc-color);
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .is-past .todo-reminder-text__state {
    color: var(--chip-pending-fg);
  }
  .todo-reminder-text__state {
    white-space: nowrap;
  }
</style>
