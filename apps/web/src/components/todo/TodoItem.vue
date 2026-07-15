<template>
  <article class="todo-item" :class="{ 'is-overdue': overdue, 'is-completed': item.status === 'completed' }">
    <div class="todo-item__body">
      <div class="todo-item__meta">
        <span>{{ t('inbox.todo') }}</span>
        <span class="todo-priority">{{ priorityLabel }}</span>
        <span v-if="item.dueAt" :class="{ overdue }">{{ dueLabel }}</span>
        <span v-if="reminderLabel" class="todo-reminder-label">{{ reminderLabel }}</span>
      </div>
      <BCheckbox
        class="todo-item__main-check"
        :model-value="item.status === 'completed'"
        :disabled="disabled"
        @update:model-value="$emit('toggle-complete', $event)"
      >
        <span class="todo-item__title">{{ item.title }}</span>
      </BCheckbox>
      <p v-if="item.description" class="todo-item__description">{{ item.description }}</p>
      <section v-if="item.checklist?.length" class="todo-checklist">
        <header class="todo-checklist__header">
          <span>{{ t('inbox.todoChecklist') }}</span>
          <span>{{
            t('inbox.todoChecklistProgress', { done: completedChecklistCount, total: item.checklist.length })
          }}</span>
        </header>
        <div class="todo-checklist__items">
          <BCheckbox
            v-for="check in item.checklist"
            :key="check.id"
            class="todo-checklist__item"
            :model-value="check.done"
            :disabled="disabled || item.status === 'completed'"
            @update:model-value="toggleChecklist(check.id, $event)"
          >
            <span :class="{ done: check.done }">{{ check.text }}</span>
          </BCheckbox>
        </div>
      </section>
    </div>
    <div class="todo-item__actions">
      <BButton size="small" :disabled="disabled" @click="$emit('edit')">{{ t('inbox.editTodo') }}</BButton>
      <BButton size="small" type="danger" :loading="deleting" :disabled="disabled" @click="$emit('delete')">
        {{ t('inbox.deleteTodo') }}
      </BButton>
    </div>
  </article>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import type { TodoChecklistItem, TodoItem } from '@/api/todoApi';

  const props = defineProps<{ item: TodoItem; disabled?: boolean; deleting?: boolean }>();
  const emit = defineEmits<{
    'toggle-complete': [completed: boolean];
    'update-checklist': [checklist: TodoChecklistItem[]];
    edit: [];
    delete: [];
  }>();
  const { t, locale } = useI18n();
  const overdue = computed(
    () =>
      props.item.status === 'pending' &&
      Boolean(props.item.dueAt) &&
      parseDate(props.item.dueAt as string).getTime() < Date.now(),
  );
  const priorityLabel = computed(() => t(`inbox.todoPriority${props.item.priority}`));
  const completedChecklistCount = computed(() => props.item.checklist.filter((check) => check.done).length);
  const dueLabel = computed(() => {
    if (!props.item.dueAt) return '';
    const date = parseDate(props.item.dueAt);
    if (!Number.isFinite(date.getTime())) return '';
    const value = new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
    return overdue.value ? t('inbox.todoOverdue', { time: value }) : t('inbox.todoDue', { time: value });
  });
  const reminderLabel = computed(() => {
    const reminder = props.item.reminder;
    if (!reminder) return '';
    const channelLabels = reminder.channels.map((channel) =>
      channel === 'email' ? t('inbox.todoReminderEmail') : t('inbox.todoReminderInApp'),
    );
    return reminder.mode === 'repeat'
      ? t('inbox.todoReminderRepeatSummary', { channels: channelLabels.join(' + ') })
      : t('inbox.todoReminderOnceSummary', { channels: channelLabels.join(' + ') });
  });

  function toggleChecklist(id: string, done: boolean) {
    emit(
      'update-checklist',
      props.item.checklist.map((item) => (item.id === id ? { ...item, done } : item)),
    );
  }
  function parseDate(value: string) {
    return new Date(String(value).replace(' ', 'T'));
  }
</script>

<style scoped lang="less">
  .todo-item {
    position: relative;
    overflow: hidden;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 18px;
    padding: 16px 18px;
    border: 1px solid color-mix(in srgb, var(--primary-color) 18%, var(--card-border-color));
    border-radius: 16px;
    background: linear-gradient(
      108deg,
      color-mix(in srgb, var(--primary-color) 6%, var(--background-color)),
      var(--background-color) 42%
    );
  }
  .todo-item::before {
    position: absolute;
    top: 12px;
    bottom: 12px;
    left: 0;
    width: 3px;
    border-radius: 0 4px 4px 0;
    content: '';
    background: linear-gradient(
      to bottom,
      transparent,
      var(--primary-color) 20%,
      var(--primary-color) 80%,
      transparent
    );
  }
  .todo-item.is-overdue {
    border-color: color-mix(in srgb, var(--danger-color, #e5484d) 38%, var(--card-border-color));
  }
  .todo-item.is-completed {
    opacity: 0.72;
  }
  .todo-item__body {
    min-width: 0;
  }
  .todo-item__meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-left: 30px;
    color: var(--desc-color);
    font-size: 12px;
  }
  .todo-item__meta > span:first-child {
    color: var(--primary-color);
    font-weight: 600;
  }
  .todo-item__meta .overdue {
    color: var(--danger-color, #e5484d);
  }
  .todo-reminder-label {
    color: var(--primary-color);
  }
  .todo-priority {
    padding: 0 6px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--primary-color) 10%, transparent);
  }
  .todo-item__main-check {
    align-items: flex-start;
    margin-top: 5px;
    padding: 2px 0;
  }
  .todo-item__main-check :deep(.b-checkbox__inner) {
    width: 19px;
    height: 19px;
    border-radius: 6px;
  }
  .todo-item__title {
    display: block;
    color: var(--text-color);
    font-size: 16px;
    font-weight: 600;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }
  .is-completed .todo-item__title {
    color: var(--desc-color);
    text-decoration: line-through;
  }
  .todo-item__description {
    margin: 5px 0 0 30px;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.6;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .todo-checklist {
    margin: 11px 0 0 30px;
    padding: 9px 10px 8px;
    border: 1px solid color-mix(in srgb, var(--primary-color) 10%, var(--card-border-color));
    border-radius: 11px;
    background: color-mix(in srgb, var(--primary-color) 4%, transparent);
  }
  .todo-checklist__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 4px 5px;
    color: var(--desc-color);
    font-size: 12px;
  }
  .todo-checklist__header > span:first-child {
    color: var(--text-color);
    font-weight: 600;
  }
  .todo-checklist__items {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .todo-checklist__item {
    width: 100%;
    box-sizing: border-box;
    border-radius: 7px;
    padding: 5px 4px;
  }
  .todo-checklist__item:hover {
    background: color-mix(in srgb, var(--primary-color) 6%, transparent);
  }
  .todo-checklist .done {
    text-decoration: line-through;
    color: var(--desc-color);
  }
  .todo-item__actions {
    align-self: center;
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
  }
  @media (max-width: 767px) {
    .todo-item {
      grid-template-columns: minmax(0, 1fr);
      padding: 13px;
    }
    .todo-item__actions {
      margin-left: 30px;
      justify-content: flex-start;
    }
    .todo-checklist {
      margin-right: 0;
    }
  }
</style>
