<template>
  <article class="todo-item" :class="{ 'is-overdue': overdue, 'is-completed': item.status === 'completed' }">
    <BCheckbox
      :model-value="item.status === 'completed'"
      :disabled="disabled"
      @update:model-value="$emit('toggle-complete', $event)"
    />
    <div class="todo-item__body">
      <div class="todo-item__meta">
        <span>{{ t('inbox.todo') }}</span>
        <span class="todo-priority">{{ priorityLabel }}</span>
        <span v-if="item.dueAt" :class="{ overdue }">{{ dueLabel }}</span>
      </div>
      <h3>{{ item.title }}</h3>
      <p v-if="item.description">{{ item.description }}</p>
      <div v-if="item.checklist?.length" class="todo-checklist">
        <BCheckbox
          v-for="check in item.checklist"
          :key="check.id"
          :model-value="check.done"
          :disabled="disabled || item.status === 'completed'"
          @update:model-value="toggleChecklist(check.id, $event)"
        >
          <span :class="{ done: check.done }">{{ check.text }}</span>
        </BCheckbox>
      </div>
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
    () => props.item.status === 'pending' && Boolean(props.item.dueAt) && parseDate(props.item.dueAt as string).getTime() < Date.now(),
  );
  const priorityLabel = computed(() => t(`inbox.todoPriority${props.item.priority}`));
  const dueLabel = computed(() => {
    if (!props.item.dueAt) return '';
    const date = parseDate(props.item.dueAt);
    if (!Number.isFinite(date.getTime())) return '';
    const value = new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
    return overdue.value ? t('inbox.todoOverdue', { time: value }) : t('inbox.todoDue', { time: value });
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
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 14px;
    padding: 16px;
    border: 1px solid color-mix(in srgb, var(--primary-color) 18%, var(--card-border-color));
    border-radius: 16px;
    background: linear-gradient(108deg, color-mix(in srgb, var(--primary-color) 8%, var(--background-color)), var(--background-color) 34%);
  }
  .todo-item::before {
    position: absolute;
    top: 12px;
    bottom: 12px;
    left: 0;
    width: 3px;
    border-radius: 0 4px 4px 0;
    content: '';
    background: linear-gradient(to bottom, transparent, var(--primary-color) 20%, var(--primary-color) 80%, transparent);
  }
  .todo-item.is-overdue { border-color: color-mix(in srgb, var(--danger-color, #e5484d) 38%, var(--card-border-color)); }
  .todo-item.is-completed { opacity: 0.72; }
  .todo-item__body { min-width: 0; }
  .todo-item__meta { display: flex; flex-wrap: wrap; gap: 8px; color: var(--desc-color); font-size: 12px; }
  .todo-item__meta > span:first-child { color: var(--primary-color); font-weight: 600; }
  .todo-item__meta .overdue { color: var(--danger-color, #e5484d); }
  .todo-priority { padding: 0 6px; border-radius: 999px; background: color-mix(in srgb, var(--primary-color) 10%, transparent); }
  h3 { margin: 6px 0 4px; color: var(--text-color); font-size: 16px; }
  p { margin: 0; color: var(--desc-color); font-size: 13px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; }
  .todo-checklist { display: flex; flex-direction: column; align-items: flex-start; margin-top: 8px; }
  .todo-checklist .done { text-decoration: line-through; color: var(--desc-color); }
  .todo-item__actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
  @media (max-width: 767px) {
    .todo-item { grid-template-columns: auto minmax(0, 1fr); align-items: start; padding: 13px; }
    .todo-item__actions { grid-column: 2; }
  }
</style>
