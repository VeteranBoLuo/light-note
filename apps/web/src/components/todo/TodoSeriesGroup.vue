<template>
  <section class="todo-series-group" :class="{ 'is-selecting': selectable }">
    <TodoItem
      :item="representative"
      :selectable="selectable"
      :selected="selectedIds.includes(representative.id)"
      :disabled="disabled"
      :deleting="deletingId === representative.id"
      :swipe-enabled="swipeEnabled"
      :swipe-open="openSwipeId === representative.id"
      @swipe-start="emit('swipe-start', representative.id)"
      @update:swipe-open="emit('update-swipe-open', representative, $event)"
      @select="emit('select', representative, $event)"
      @toggle-complete="emit('toggle-complete', representative, $event)"
      @update-checklist="emit('update-checklist', representative, $event)"
      @edit="emit('edit', representative)"
      @delete="emit('delete', representative)"
      @add-to-calendar="emit('add-to-calendar', representative)"
      @snooze="emit('snooze', representative, $event)"
      @update-priority="emit('update-priority', representative, $event)"
      @series-action="emit('series-action', representative, $event)"
    />

    <BButton
      v-if="allSeriesItems.length > 1 && !selectable"
      class="todo-series-group__toggle"
      :aria-expanded="drawerOpen"
      :disabled="disabled"
      @click="openSeriesDrawer"
    >
      <SvgIcon :src="icon.todo.repeat" size="14" aria-hidden="true" />
      <span>{{ t('inbox.todoSeriesViewAll', { count: allSeriesItems.length }) }}</span>
    </BButton>

    <div v-if="selectable" class="todo-series-group__children">
      <TodoItem
        v-for="item in hiddenItems"
        :key="item.id"
        :item="item"
        :selectable="selectable"
        :selected="selectedIds.includes(item.id)"
        :disabled="disabled"
        :deleting="deletingId === item.id"
        :swipe-enabled="swipeEnabled"
        :swipe-open="openSwipeId === item.id"
        @swipe-start="emit('swipe-start', item.id)"
        @update:swipe-open="emit('update-swipe-open', item, $event)"
        @select="emit('select', item, $event)"
        @toggle-complete="emit('toggle-complete', item, $event)"
        @update-checklist="emit('update-checklist', item, $event)"
        @edit="emit('edit', item)"
        @delete="emit('delete', item)"
        @add-to-calendar="emit('add-to-calendar', item)"
        @snooze="emit('snooze', item, $event)"
        @update-priority="emit('update-priority', item, $event)"
        @series-action="emit('series-action', item, $event)"
      />
    </div>

    <TodoSeriesDrawer
      v-model:open="drawerOpen"
      :representative="representative"
      :items="allSeriesItems"
      :disabled="disabled"
      :deleting-id="deletingId"
      @toggle-complete="(item, completed) => emit('toggle-complete', item, completed)"
      @update-checklist="(item, checklist) => emit('update-checklist', item, checklist)"
      @edit="(item) => emit('edit', item)"
      @delete="(item) => emit('delete', item)"
      @add-to-calendar="(item) => emit('add-to-calendar', item)"
      @snooze="(item, preset) => emit('snooze', item, preset)"
      @update-priority="(item, priority) => emit('update-priority', item, priority)"
      @series-action="(item, action) => emit('series-action', item, action)"
    />
  </section>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { TodoChecklistItem, TodoItem as TodoItemType, TodoPriority } from '@/api/todoApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import TodoItem from '@/components/todo/TodoItem.vue';
  import TodoSeriesDrawer from '@/components/todo/TodoSeriesDrawer.vue';
  import type { TodoSnoozePreset } from '@/utils/todoPlanning';
  import icon from '@/config/icon';

  const props = withDefaults(
    defineProps<{
      seriesId: string;
      representative: TodoItemType;
      items: TodoItemType[];
      seriesItems?: TodoItemType[];
      disabled?: boolean;
      deletingId?: string;
      selectable?: boolean;
      selectedIds?: string[];
      swipeEnabled?: boolean;
      openSwipeId?: string;
    }>(),
    {
      disabled: false,
      deletingId: '',
      selectable: false,
      selectedIds: () => [],
      swipeEnabled: false,
      openSwipeId: '',
      seriesItems: () => [],
    },
  );
  const emit = defineEmits<{
    'swipe-start': [id: string];
    'update-swipe-open': [item: TodoItemType, open: boolean];
    select: [item: TodoItemType, selected: boolean];
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
  const drawerOpen = ref(false);
  const hiddenItems = computed(() => props.items.filter((item) => item.id !== props.representative.id));
  const allSeriesItems = computed(() => (props.seriesItems.length ? props.seriesItems : props.items));

  function openSeriesDrawer() {
    drawerOpen.value = true;
  }

  watch(
    () => props.seriesId,
    () => {
      drawerOpen.value = false;
    },
  );
</script>

<style scoped lang="less">
  .todo-series-group {
    overflow: hidden;
    border: 1px solid var(--surface-border-color, var(--card-border-color));
    border-radius: 15px;
    background: var(--card-background, var(--background-color));

    :deep(.todo-item) {
      border: 0;
      border-radius: 0;
    }
  }

  .todo-series-group__toggle {
    width: 100%;
    min-height: 36px;
    justify-content: center;
    gap: 6px;
    border: 0;
    border-top: 1px solid var(--surface-border-color, var(--card-border-color));
    border-radius: 0;
    color: var(--desc-color);
    background: var(--workspace-panel-bg-color, var(--hover-background));
  }

  .todo-series-group__children {
    border-top: 1px solid var(--surface-border-color, var(--card-border-color));

    :deep(.mobile-swipe-actions + .mobile-swipe-actions) {
      border-top: 1px solid var(--surface-border-color, var(--card-border-color));
    }
  }

  @media (max-width: 768px) {
    .todo-series-group__toggle {
      min-height: 40px;
    }
  }
</style>
