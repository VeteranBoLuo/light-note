<template>
  <BDrawer
    :open="open"
    :title="t('inbox.todoSeriesDrawerTitle', { title: representative.title })"
    width="620px"
    :mobile-full-screen="true"
    body-padding="0"
    @close="emit('update:open', false)"
  >
    <div class="todo-series-drawer__summary">
      <SvgIcon :src="icon.todo.repeat" size="16" aria-hidden="true" />
      <span>{{ t('inbox.todoSeriesDrawerSummary', { count: items.length }) }}</span>
    </div>
    <div class="todo-series-drawer__list">
      <section v-for="group in drawerGroups" :key="group.key" class="todo-series-drawer__section">
        <header>
          <strong>{{ t(`inbox.todoGroups.${group.key}`) }}</strong>
          <span>{{ group.items.length }}</span>
        </header>
        <TodoItem
          v-for="item in group.items"
          :key="item.id"
          :item="item"
          :disabled="disabled"
          :deleting="deletingId === item.id"
          @toggle-complete="emit('toggle-complete', item, $event)"
          @update-checklist="emit('update-checklist', item, $event)"
          @edit="emit('edit', item)"
          @delete="emit('delete', item)"
          @add-to-calendar="emit('add-to-calendar', item)"
          @snooze="emit('snooze', item, $event)"
          @update-priority="emit('update-priority', item, $event)"
          @series-action="emit('series-action', item, $event)"
        />
      </section>
    </div>
    <div v-if="visibleItems.length < items.length" class="todo-series-drawer__more">
      <BButton @click="visibleCount += PAGE_SIZE">
        {{ t('inbox.todoSeriesLoadMore', { count: items.length - visibleItems.length }) }}
      </BButton>
    </div>
  </BDrawer>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { TodoChecklistItem, TodoItem as TodoItemType, TodoPriority } from '@/api/todoApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import TodoItem from '@/components/todo/TodoItem.vue';
  import icon from '@/config/icon';
  import { compareTodoOccurrences, todoGroupKey, type TodoGroupKey, type TodoSnoozePreset } from '@/utils/todoPlanning';

  const props = withDefaults(
    defineProps<{
      open: boolean;
      representative: TodoItemType;
      items: TodoItemType[];
      disabled?: boolean;
      deletingId?: string;
    }>(),
    {
      disabled: false,
      deletingId: '',
    },
  );
  const emit = defineEmits<{
    'update:open': [open: boolean];
    'toggle-complete': [item: TodoItemType, completed: boolean];
    'update-checklist': [item: TodoItemType, checklist: TodoChecklistItem[]];
    edit: [item: TodoItemType];
    delete: [item: TodoItemType];
    'add-to-calendar': [item: TodoItemType];
    snooze: [item: TodoItemType, preset: TodoSnoozePreset];
    'update-priority': [item: TodoItemType, priority: TodoPriority];
    'series-action': [item: TodoItemType, action: 'skip' | 'pause' | 'resume' | 'stop'];
  }>();
  const { t } = useI18n();
  const PAGE_SIZE = 20;
  const visibleCount = ref(PAGE_SIZE);
  const orderedItems = computed(() => [...props.items].sort(compareTodoOccurrences));
  const visibleItems = computed(() => orderedItems.value.slice(0, visibleCount.value));
  const drawerGroups = computed(() => {
    const keys: TodoGroupKey[] = ['overdue', 'today', 'upcoming', 'later', 'noDate', 'completed'];
    return keys
      .map((key) => ({ key, items: visibleItems.value.filter((item) => todoGroupKey(item) === key) }))
      .filter((group) => group.items.length > 0);
  });

  watch([() => props.open, () => props.representative.seriesId], ([open]) => {
    if (open) visibleCount.value = PAGE_SIZE;
  });
</script>

<style scoped lang="less">
  .todo-series-drawer__summary {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 18px;
    border-bottom: 1px solid var(--surface-border-color, var(--card-border-color));
    color: var(--desc-color);
    background: var(--workspace-panel-bg-color, var(--hover-background));
  }

  .todo-series-drawer__list {
    display: grid;
    gap: 16px;
    padding: 14px;
  }

  .todo-series-drawer__section {
    display: grid;
    gap: 9px;
  }

  .todo-series-drawer__section > header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 2px;
    color: var(--desc-color);
    font-size: 12px;
  }

  .todo-series-drawer__more {
    display: flex;
    justify-content: center;
    padding: 0 14px 18px;
  }
</style>
