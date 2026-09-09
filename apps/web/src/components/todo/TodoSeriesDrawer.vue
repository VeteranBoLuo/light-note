<template>
  <BDrawer
    :open="open"
    :title="t('inbox.todoSeriesDrawerTitle', { title: representative.title })"
    width="620px"
    :mobile-full-screen="true"
    body-padding="0"
    :mask-closable="true"
    @close="emit('update:open', false)"
  >
    <div class="todo-series-drawer__summary">
      <SvgIcon :src="icon.todo.repeat" size="16" aria-hidden="true" />
      <span>{{
        query
          ? t('todoWorkspace.seriesTotal', { count: page?.total || 0 })
          : t('inbox.todoSeriesDrawerSummary', { count: items.length })
      }}</span>
    </div>
    <template v-if="query">
      <div class="todo-series-drawer__filters">
        <BTabs
          v-model:active-tab="status"
          variant="pill"
          :options="[
            { key: 'pending', label: t('inbox.todoPending') },
            { key: 'completed', label: t('inbox.todoCompleted') },
          ]"
          :aria-label="t('inbox.todoStatusGroupLabel')"
        />
        <BSelect
          :value="wholeSeries ? 'all' : 'current'"
          @update:value="wholeSeries = $event === 'all'"
          :options="[
            { value: 'current', label: t('todoWorkspace.currentSeriesScope') },
            { value: 'all', label: t('todoWorkspace.wholeSeries') },
          ]"
          :aria-label="t('todoWorkspace.chooseScope')"
        />
      </div>
      <div class="todo-series-drawer__pages">
        <div v-if="page?.failed" class="todo-series-drawer__more" role="alert"
          ><BButton @click="loadPage(!page?.loaded)">{{ t('todoWorkspace.loadFailed') }}</BButton></div
        >
        <p v-if="page?.loaded && !page.items.length && !page.failed" class="todo-series-drawer__empty">{{
          t('todoWorkspace.empty')
        }}</p>
        <BLoading
          v-if="!page?.loaded && !page?.failed"
          inline
          :loading="true"
          :title="t('todoWorkspace.loadingNext')"
        />
        <BVirtualList
          v-if="open"
          :items="page?.items || []"
          dynamic-height
          :item-height="160"
          :gap="12"
          scroll-mode="ancestor"
          :loading="page?.loading"
          :paused="!open || !!page?.failed"
          :has-more="!!page?.nextCursor"
          @load-more="loadPage()"
        >
          <template #default="{ item }">
            <TodoItem
              :item="item"
              workspace
              series-detail
              :disabled="disabled"
              :deleting="deletingId === item.id"
              :selectable="selectable"
              :selected="selectedIds.includes(item.id)"
              @select="emit('select', item, $event)"
              @toggle-complete="emit('toggle-complete', item, $event)"
              @update-checklist="emit('update-checklist', item, $event)"
              @preview="openPreview(item)"
              @edit="openEditor(item, $event)"
              @organize="emit('organize', item)"
              @delete="emit('delete', item)"
              @add-to-calendar="emit('add-to-calendar', item)"
              @snooze="emit('snooze', item, $event)"
              @update-priority="emit('update-priority', item, $event)"
              @series-action="emit('series-action', item, $event)"
            />
          </template>
        </BVirtualList>
      </div>
    </template>
    <template v-else>
      <div class="todo-series-drawer__list">
        <section v-for="group in drawerGroups" :key="group.key" class="todo-series-drawer__section">
          <header>
            <strong>{{ t(`inbox.todoGroups.${group.key}`) }}</strong>
            <span>{{ group.items.length }}</span>
          </header>
          <TodoItem
            series-detail
            v-for="item in group.items"
            :key="item.id"
            :item="item"
            :disabled="disabled"
            :deleting="deletingId === item.id"
            @toggle-complete="emit('toggle-complete', item, $event)"
            @update-checklist="emit('update-checklist', item, $event)"
            @preview="openPreview(item)"
            @edit="openEditor(item, $event)"
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
    </template>
  </BDrawer>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { TodoChecklistItem, TodoItem as TodoItemType, TodoPriority, TodoSeriesAction } from '@/api/todoApi';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BVirtualList from '@/components/base/BasicComponents/BVirtualList.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import useTodoStore from '@/store/todo';
  import type { TodoSeriesQuery } from '@/api/todoApi';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import TodoItem from '@/components/todo/TodoItem.vue';
  import icon from '@/config/icon';
  import { compareTodoOccurrences, todoGroupKey, type TodoGroupKey, type TodoSnoozePreset } from '@/utils/todoPlanning';
  import { closeCurrentMobileOverlayThen } from '@/utils/mobileOverlayHistory';

  const props = withDefaults(
    defineProps<{
      open: boolean;
      query?: TodoSeriesQuery;
      selectable?: boolean;
      selectedIds?: string[];
      representative: TodoItemType;
      items: TodoItemType[];
      disabled?: boolean;
      deletingId?: string;
    }>(),
    {
      disabled: false,
      selectedIds: () => [],
      deletingId: '',
    },
  );
  const emit = defineEmits<{
    'update:open': [open: boolean];
    select: [item: TodoItemType, selected: boolean];
    organize: [item: TodoItemType];
    'toggle-complete': [item: TodoItemType, completed: boolean];
    'update-checklist': [item: TodoItemType, checklist: TodoChecklistItem[]];
    preview: [item: TodoItemType];
    edit: [item: TodoItemType, section?: 'checklist'];
    delete: [item: TodoItemType];
    'add-to-calendar': [item: TodoItemType];
    snooze: [item: TodoItemType, preset: TodoSnoozePreset];
    'update-priority': [item: TodoItemType, priority: TodoPriority];
    'series-action': [item: TodoItemType, action: TodoSeriesAction];
  }>();
  const { t } = useI18n();
  const todo = useTodoStore();
  const wholeSeries = ref(false);
  const status = ref<'pending' | 'completed'>('pending');
  const currentQuery = computed(() => ({ ...props.query!, wholeSeries: wholeSeries.value, status: status.value }));
  const pageKey = computed(() => JSON.stringify([todo.ownerId, currentQuery.value]));
  const page = computed(() => todo.seriesPages[pageKey.value]);
  function loadPage(reset = false) {
    if (!props.open || !props.query) return;
    void todo.loadSeriesPage(pageKey.value, currentQuery.value, reset);
  }
  watch(
    () => props.open,
    (open) => {
      if (open) {
        wholeSeries.value = false;
        status.value = 'pending';
      }
    },
  );
  watch(
    [() => props.open, pageKey, () => todo.requestId],
    ([open]) => {
      if (open && props.query) loadPage(true);
    },
    { immediate: true },
  );
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

  function openPreview(item: TodoItemType) {
    void closeCurrentMobileOverlayThen(
      () => emit('update:open', false),
      () => emit('preview', item),
    );
  }

  function openEditor(item: TodoItemType, section?: 'checklist') {
    void closeCurrentMobileOverlayThen(
      () => emit('update:open', false),
      () => emit('edit', item, section),
    );
  }

  watch([() => props.open, () => props.representative.seriesId], ([open]) => {
    if (open) visibleCount.value = PAGE_SIZE;
  });
</script>

<style scoped lang="less">
  .todo-series-drawer__filters {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    padding: 14px 18px 4px;
  }
  .todo-series-drawer__filters > .b-select {
    width: 145px;
  }
  .todo-series-drawer__pages {
    padding: 14px 18px 24px;
  }
  .todo-series-drawer__pages :deep(.todo-item) {
    border-radius: 10px;
    box-shadow: none;
  }
  @media (max-width: 767px) {
    .todo-series-drawer__filters {
      padding: 12px 14px 0;
    }
    .todo-series-drawer__pages {
      padding: 12px 14px 24px;
    }
    .todo-series-drawer__filters > .b-select {
      width: 130px;
    }
  }
  .todo-series-drawer__empty {
    padding: 18px;
    color: var(--desc-color);
  }
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
