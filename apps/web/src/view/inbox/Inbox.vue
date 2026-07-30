<template>
  <main
    class="inbox-page"
    :class="{
      'inbox-page--mobile-todo': isMobileTodoPrimary,
      'inbox-page--mobile-resources': isMobileResourceInbox,
    }"
  >
    <ResourceCenterSectionNav v-if="!bookmark.isMobile || isMobileResourceInbox" class="section-switcher" />
    <header v-if="!bookmark.isMobile" class="inbox-hero">
      <div>
        <h1>{{ t('inbox.title') }}</h1>
        <p>{{ t('inbox.subtitle') }}</p>
      </div>
      <BButton type="primary" @click="openTodoEditor()">{{ t('inbox.createTodo') }}</BButton>
    </header>

    <section class="inbox-toolbar" :class="{ 'inbox-toolbar--todo-primary': isMobileTodoPrimary }">
      <template v-if="isMobileTodoPrimary">
        <BTabs
          v-model:active-tab="todo.status"
          :options="mobileTodoStatusOptions"
          variant="pill"
          @change="changeTodoStatus"
        />
        <BSelect class="mobile-todo-sort" v-model:value="todo.sort" :options="sortOptions" @change="search" />
      </template>
      <template v-else>
        <BTabs v-model:active-tab="inbox.filterType" :options="filterOptions" variant="pill" @change="changeFilter" />
        <div class="inbox-toolbar__right" :class="{ 'has-status': inbox.filterType === 'todo' }">
          <BInput
            v-if="!bookmark.isMobile"
            v-model:value="inbox.keyword"
            :placeholder="t('inbox.searchPlaceholder')"
            clearable
            @enter="search"
          />
          <BSelect v-model:value="inbox.sort" :options="sortOptions" @change="search" />
          <BSelect
            v-if="inbox.filterType === 'todo'"
            v-model:value="todo.status"
            :options="todoStatusOptions"
            @change="search"
          />
        </div>
      </template>
    </section>

    <section v-if="isTodoFocused" class="todo-workspace-toolbar">
      <form class="todo-quick-create" @submit.prevent="createQuickTodo">
        <BInput
          v-model:value="quickTodoTitle"
          :maxlength="200"
          :placeholder="t('inbox.todoQuickCreatePlaceholder')"
          @enter="createQuickTodo"
        />
        <BSelect v-model:value="quickTodoDue" :options="quickDueOptions" />
        <BSelect v-model:value="quickTodoPriority" :options="quickPriorityOptions" />
        <BButton type="primary" :loading="quickCreating" :disabled="!quickTodoTitle.trim()" @click="createQuickTodo">
          {{ t('inbox.todoQuickCreate') }}
        </BButton>
      </form>
      <BTabs v-model:active-tab="todoView" :options="todoViewOptions" variant="pill" />
    </section>

    <section v-if="isTodoFocused && todoView === 'list' && todo.status !== 'completed'" class="todo-priority-drops">
      <div v-for="priority in ([2, 1, 0] as const)" :key="priority" :class="`is-priority-${priority}`">
        <span>{{ t('inbox.todoDragToPriority', { priority: t(`inbox.todoPriority${priority}`) }) }}</span>
        <VueDraggable
          v-model="priorityDropLists[priority]"
          :group="{ name: 'todo-board', pull: false, put: true }"
          :data-priority="priority"
          class="todo-priority-drop-target"
          @add="handlePriorityDrop(priority)"
        />
      </div>
    </section>

    <section v-if="isTodoFocused && selectedTodoIds.length" class="inbox-batch todo-batch">
      <BCheckbox
        :model-value="selectedTodoIds.length === todo.items.length"
        :indeterminate="selectedTodoIds.length > 0 && selectedTodoIds.length < todo.items.length"
        @update:model-value="toggleSelectAllTodos"
      >
        {{ t('inbox.selectedCount', { count: selectedTodoIds.length }) }}
      </BCheckbox>
      <div class="inbox-batch__actions">
        <BButton
          v-if="todo.status !== 'completed'"
          size="small"
          type="primary"
          :loading="todoBatchMutating"
          @click="completeSelectedTodos"
        >
          {{ t('inbox.completeSelected') }}
        </BButton>
        <BButton size="small" type="danger" :loading="todoBatchMutating" @click="confirmDeleteSelectedTodos">
          {{ t('inbox.deleteSelected') }}
        </BButton>
      </div>
    </section>

    <section v-if="todoUndo" class="todo-undo-banner" role="status">
      <span>{{ todoUndo.kind === 'delete' ? t('inbox.todoDeletedCount', { count: todoUndo.ids.length }) : t('inbox.todoCompletedCount', { count: todoUndo.ids.length }) }}</span>
      <BButton size="small" :loading="todoUndoing" @click="undoTodoAction">{{ t('common.undo') }}</BButton>
      <BButton size="small" :aria-label="t('common.close')" @click="clearTodoUndo">{{ t('common.close') }}</BButton>
    </section>

    <section v-if="inbox.filterType !== 'todo' && inbox.items.length" class="inbox-batch">
      <BCheckbox
        :model-value="allItemsSelected"
        :indeterminate="someItemsSelected"
        @update:model-value="toggleSelectAll"
      >
        {{ t('inbox.selectAll', { count: inbox.items.length }) }}
      </BCheckbox>
      <div class="inbox-batch__actions">
        <span>{{ t('inbox.selectedCount', { count: selectedItems.length }) }}</span>
        <BButton
          size="small"
          type="primary"
          :disabled="!selectedItems.length || hasPendingOperation"
          :loading="batchCompleting"
          @click="completeSelected"
        >
          {{ t('inbox.completeSelected') }}
        </BButton>
        <BButton
          size="small"
          type="danger"
          :disabled="!selectedItems.length || hasPendingOperation"
          :loading="batchDeleting"
          @click="confirmDelete(selectedItems, true)"
        >
          {{ t('inbox.deleteSelected') }}
        </BButton>
      </div>
    </section>

    <section v-if="pageLoadFailed && actionItems.length" class="inbox-error-banner">
      <span>{{ t('inbox.loadFailedDesc') }}</span>
      <BButton size="small" @click="refreshList">{{ t('inbox.retry') }}</BButton>
    </section>

    <section class="inbox-content" :class="{ 'has-top-fade': showTopFade, 'has-bottom-fade': showBottomFade }">
      <div ref="scrollContainer" class="inbox-scroll" @scroll="updateScrollFade">
        <BLoading :loading="pageLoading" class="inbox-loading">
          <div v-if="!pageLoading && pageLoadFailed && actionItems.length === 0" class="inbox-empty inbox-error">
            <div class="inbox-empty__icon">!</div>
            <h2>{{ t('inbox.loadFailedTitle') }}</h2>
            <p>{{ t('inbox.loadFailedDesc') }}</p>
            <BButton type="primary" @click="refreshList">{{ t('inbox.retry') }}</BButton>
          </div>
          <div
            v-else-if="!pageLoading && actionItems.length === 0"
            class="inbox-empty"
            :class="{ 'inbox-empty--filtered': !isInboxGloballyEmpty || inbox.filterType === 'todo' }"
          >
            <div class="inbox-empty__icon">{{ isInboxGloballyEmpty ? '✓' : '0' }}</div>
            <h2>{{ emptyStateTitle }}</h2>
            <p>{{ emptyStateDesc }}</p>
            <BButton type="primary" @click="handleEmptyStateAction">{{ emptyStateAction }}</BButton>
          </div>
          <TodoScheduleView
            v-else-if="isTodoFocused && todoView !== 'list'"
            :items="todo.items"
            :view="todoView"
            @edit="openTodoEditor"
          />
          <div v-else-if="isTodoFocused" class="todo-group-list">
            <section v-for="group in todoGroupLists" :key="group.key" class="todo-group">
              <header>
                <strong>{{ t(`inbox.todoGroups.${group.key}`) }}</strong>
                <span>{{ group.items.length }}</span>
              </header>
              <VueDraggable
                v-model="group.items"
                :group="{ name: 'todo-board', pull: true, put: todo.status !== 'completed' }"
                :disabled="todo.status === 'completed'"
                :animation="180"
                handle=".todo-item__drag-handle"
                :data-group="group.key"
                class="todo-group__items"
                ghost-class="todo-drag-ghost"
                @end="handleTodoDragEnd"
              >
                <TodoItem
                  v-for="item in group.items"
                  :key="item.id"
                  :data-todo-id="item.id"
                  :item="item"
                  draggable
                  selectable
                  :selected="selectedTodoIds.includes(item.id)"
                  :disabled="hasPendingOperation || todoBatchMutating"
                  :deleting="deletingTodoId === item.id"
                  @select="toggleTodoSelected(item.id, $event)"
                  @toggle-complete="toggleTodo(item, $event)"
                  @update-checklist="updateTodoChecklist(item, $event)"
                  @edit="openTodoEditor(item)"
                  @delete="confirmDeleteTodo(item)"
                  @add-to-calendar="openTodoCalendar(item)"
                  @snooze="snoozeTodoItem(item, $event)"
                  @update-priority="updateTodoPriority(item, $event)"
                />
              </VueDraggable>
            </section>
          </div>
          <div v-else class="inbox-list">
            <template v-for="action in actionItems" :key="action.key">
              <InboxItem
                v-if="action.actionType === 'resource'"
                :item="action.item"
                :selected="inbox.selectedKeys.includes(inbox.resourceKey(action.item))"
                :completing="completingKey === inbox.resourceKey(action.item)"
                :deleting="deletingKey === inbox.resourceKey(action.item)"
                :disabled="hasPendingOperation"
                @select="toggleSelected(action.item, $event)"
                @open="openResource(action.item)"
                @complete="completeOne(action.item)"
                @delete="confirmDelete([action.item])"
              />
              <TodoItem
                v-else
                :item="action.item"
                :disabled="hasPendingOperation"
                :deleting="deletingTodoId === action.item.id"
                @toggle-complete="toggleTodo(action.item, $event)"
                @update-checklist="updateTodoChecklist(action.item, $event)"
                @edit="openTodoEditor(action.item)"
                @delete="confirmDeleteTodo(action.item)"
                @add-to-calendar="openTodoCalendar(action.item)"
                @snooze="snoozeTodoItem(action.item, $event)"
                @update-priority="updateTodoPriority(action.item, $event)"
              />
            </template>
          </div>
        </BLoading>
      </div>
    </section>
    <TodoEditorModal v-model:visible="todoEditorVisible" :item="editingTodo" @saved="afterTodoSaved" />
    <TodoCalendarModal
      v-model:visible="todoCalendarVisible"
      :item="calendarTodo"
      :exporting="exportingCalendar"
      @confirm="exportTodoCalendar"
    />
  </main>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import InboxItem from '@/components/inbox/InboxItem.vue';
  import TodoItem from '@/components/todo/TodoItem.vue';
  import TodoEditorModal from '@/components/todo/TodoEditorModal.vue';
  import TodoCalendarModal from '@/components/todo/TodoCalendarModal.vue';
  import TodoScheduleView from '@/components/todo/TodoScheduleView.vue';
  import { VueDraggable } from 'vue-draggable-plus';
  import { buildIcsFileName, buildTodoIcs, deliverIcsFile } from '@/utils/ics';
  import { bookmarkStore, inboxStore, todoStore, useUserStore } from '@/store';
  import type { InboxItem as InboxItemType } from '@/api/inboxApi';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import { recordOperation } from '@/api/commonApi';
  import { OPERATION_LOG_MAP } from '@/config/logMap';
  import { isMobileResourceInboxTab } from '@/config/mobileNavigation';
  import ResourceCenterSectionNav from '@/components/searchCenter/ResourceCenterSectionNav.vue';
  import { batchDeleteSearchResources, clearGlobalSearchCache } from '@/api/search';
  import type {
    TodoChecklistItem,
    TodoFilterStatus,
    TodoItem as TodoItemType,
    TodoPriority,
    TodoSort,
  } from '@/api/todoApi';
  import { useMobileTopBar } from '@/composables/useMobileTopBar';
  import {
    dueForTodoGroup,
    quickTodoDueAt,
    todoGroupKey,
    todoSnoozeAt,
    type TodoGroupKey,
    type TodoQuickDue,
    type TodoSnoozePreset,
  } from '@/utils/todoPlanning';

  const { t } = useI18n();
  const bookmark = bookmarkStore();
  const router = useRouter();
  const route = useRoute();
  const inbox = inboxStore();
  const todo = todoStore();
  const user = useUserStore();
  const completingKey = ref('');
  const deletingKey = ref('');
  const batchCompleting = ref(false);
  const batchDeleting = ref(false);
  const todoEditorVisible = ref(false);
  const editingTodo = ref<TodoItemType | null>(null);
  const calendarTodo = ref<TodoItemType | null>(null);
  const todoCalendarVisible = ref(false);
  const exportingCalendar = ref(false);
  const updatingTodoId = ref('');
  const deletingTodoId = ref('');
  const quickTodoTitle = ref('');
  const quickTodoDue = ref<TodoQuickDue>('today');
  const quickTodoPriority = ref<TodoPriority>(1);
  const quickCreating = ref(false);
  const todoView = ref<'list' | 'agenda' | 'calendar'>('list');
  const selectedTodoIds = ref<string[]>([]);
  const todoBatchMutating = ref(false);
  const todoUndo = ref<{ kind: 'complete' | 'delete'; ids: string[] } | null>(null);
  const todoUndoing = ref(false);
  const priorityDropLists = ref<Record<TodoPriority, TodoItemType[]>>({ 0: [], 1: [], 2: [] });
  const todoGroupLists = ref<Array<{ key: TodoGroupKey; items: TodoItemType[] }>>([]);
  let todoUndoTimer = 0;
  const scrollContainer = ref<HTMLElement | null>(null);
  const showTopFade = ref(false);
  const showBottomFade = ref(false);
  let resizeObserver: ResizeObserver | null = null;
  let mobileInboxSearchTimer = 0;

  const isMobileResourceInbox = computed(() => bookmark.isMobile && isMobileResourceInboxTab(route.query.tab));
  const isMobileTodoPrimary = computed(() => bookmark.isMobile && !isMobileResourceInbox.value);
  const isTodoFocused = computed(() => isMobileTodoPrimary.value || inbox.filterType === 'todo');

  const selectedItems = computed(() =>
    inbox.items.filter((item) => inbox.selectedKeys.includes(inbox.resourceKey(item))),
  );
  const allItemsSelected = computed(() => inbox.items.length > 0 && selectedItems.value.length === inbox.items.length);
  const someItemsSelected = computed(
    () => selectedItems.value.length > 0 && selectedItems.value.length < inbox.items.length,
  );
  const hasPendingOperation = computed(() =>
    Boolean(
      completingKey.value ||
      deletingKey.value ||
      batchCompleting.value ||
      batchDeleting.value ||
      updatingTodoId.value ||
      deletingTodoId.value,
    ),
  );
  const pageLoading = computed(() => {
    if (isMobileTodoPrimary.value) return todo.loading;
    if (isMobileResourceInbox.value) return inbox.loading;
    return inbox.loading || todo.loading;
  });
  const pageLoadFailed = computed(() => {
    if (isMobileTodoPrimary.value) return todo.loadFailed;
    if (isMobileResourceInbox.value) return inbox.loadFailed;
    return inbox.filterType === 'todo'
      ? todo.loadFailed
      : inbox.filterType === 'all'
        ? inbox.loadFailed || todo.loadFailed
        : inbox.loadFailed;
  });
  const isInboxGloballyEmpty = computed(() =>
    isMobileResourceInbox.value ? inbox.pendingTotal === 0 : inbox.actionTotal === 0,
  );
  const currentTypeLabel = computed(() =>
    inbox.filterType === 'all' ? t('inbox.all') : t(`inbox.${inbox.filterType}`),
  );
  const emptyStateTitle = computed(() => {
    if (inbox.filterType === 'todo') {
      return todo.status === 'completed' ? t('inbox.todoCompletedEmptyTitle') : t('inbox.todoEmptyTitle');
    }
    if (isInboxGloballyEmpty.value) return t('inbox.emptyTitle');
    if (inbox.filterType === 'all') return t('inbox.filterEmptyTitle');
    return t('inbox.typeEmptyTitle', { type: currentTypeLabel.value });
  });
  const emptyStateDesc = computed(() => {
    if (inbox.filterType === 'todo') {
      return isMobileTodoPrimary.value ? t('inbox.todoPrimaryEmptyDesc') : t('inbox.todoEmptyDesc');
    }
    if (isInboxGloballyEmpty.value) return t('inbox.emptyDesc');
    if (inbox.filterType === 'all') {
      return t('inbox.filterEmptyDesc', {
        count: isMobileResourceInbox.value ? inbox.pendingTotal : inbox.actionTotal,
      });
    }
    return t('inbox.typeEmptyDesc', {
      type: currentTypeLabel.value,
      count: isMobileResourceInbox.value ? inbox.pendingTotal : inbox.actionTotal,
    });
  });
  const emptyStateAction = computed(() => {
    if (inbox.filterType === 'all') return t('inbox.collectFirst');
    if (inbox.filterType === 'todo') return t('inbox.createTodo');
    return t('inbox.collectType', { type: currentTypeLabel.value });
  });

  const filterOptions = computed(() => {
    const resourceOptions = [
      {
        key: 'all',
        label: t('inbox.all'),
        badge: isMobileResourceInbox.value ? inbox.pendingTotal : inbox.actionTotal,
      },
      { key: 'bookmark', label: t('inbox.bookmark'), badge: inbox.typeTotals.bookmark },
      { key: 'note', label: t('inbox.note'), badge: inbox.typeTotals.note },
      { key: 'file', label: t('inbox.file'), badge: inbox.typeTotals.file },
    ];
    if (isMobileResourceInbox.value) return resourceOptions;
    return [...resourceOptions, { key: 'todo', label: t('inbox.todo'), badge: todo.pendingTotal }];
  });
  const sortOptions = computed(() =>
    inbox.filterType === 'todo'
      ? [
          { label: t('inbox.todoSmartSort'), value: 'smart' },
          { label: t('inbox.todoDueSort'), value: 'due' },
          { label: t('inbox.newest'), value: 'newest' },
          { label: t('inbox.oldest'), value: 'oldest' },
        ]
      : [
          { label: t('inbox.newest'), value: 'newest' },
          { label: t('inbox.oldest'), value: 'oldest' },
        ],
  );
  const todoStatusOptions = computed(() => [
    { label: t('inbox.all'), value: 'all' },
    { label: t('inbox.todoPending'), value: 'pending' },
    { label: t('inbox.todoCompleted'), value: 'completed' },
  ]);
  const mobileTodoStatusOptions = computed<Array<{ key: TodoFilterStatus; label: string; badge?: number }>>(() => [
    { key: 'pending', label: t('inbox.todoPending'), badge: todo.pendingTotal },
    { key: 'completed', label: t('inbox.todoCompleted') },
    { key: 'all', label: t('inbox.all') },
  ]);
  const todoViewOptions = computed(() => [
    { key: 'list', label: t('inbox.todoViewList') },
    { key: 'agenda', label: t('inbox.todoViewAgenda') },
    { key: 'calendar', label: t('inbox.todoViewCalendar') },
  ]);
  const quickDueOptions = computed(() => [
    { value: 'today', label: t('inbox.todoQuickToday') },
    { value: 'tomorrow', label: t('inbox.todoQuickTomorrow') },
    { value: 'week', label: t('inbox.todoQuickNextWeek') },
    { value: 'none', label: t('inbox.todoQuickNoDate') },
  ]);
  const quickPriorityOptions = computed(() =>
    [0, 1, 2].map((value) => ({ value, label: t(`inbox.todoPriority${value}`) })),
  );
  const actionItems = computed(() => {
    if (inbox.filterType === 'todo') {
      return todo.items.map((item) => ({ actionType: 'todo' as const, key: `todo:${item.id}`, item }));
    }
    const resources = inbox.items.map((item) => ({
      actionType: 'resource' as const,
      key: inbox.resourceKey(item),
      item,
    }));
    if (inbox.filterType !== 'all' || isMobileResourceInbox.value) return resources;
    const todos = todo.items.map((item) => ({ actionType: 'todo' as const, key: `todo:${item.id}`, item }));
    return [...resources, ...todos].sort(
      (left, right) => actionRank(left) - actionRank(right) || actionTime(right) - actionTime(left),
    );
  });

  watch(
    () => user.id,
    async (id) => {
      inbox.resetForOwner(id || 'visitor');
      todo.resetForOwner(id || 'visitor');
      syncRequestedMobileMode();
      await refreshList();
    },
  );

  onMounted(async () => {
    inbox.resetForOwner(user.id || 'visitor');
    todo.resetForOwner(user.id || 'visitor');
    const requestedTab = String(route.query.tab || '');
    if (bookmark.isMobile) {
      syncRequestedMobileMode();
    } else if (['all', 'bookmark', 'note', 'file', 'todo'].includes(requestedTab)) {
      inbox.filterType = requestedTab as any;
    }
    const requestedTodoId = String(route.query.todoId || '');
    if (isMobileTodoPrimary.value) todo.status = requestedTodoId ? 'all' : 'pending';
    await refreshList();
    const requestedTodo = requestedTodoId ? todo.items.find((item) => item.id === requestedTodoId) : null;
    if (requestedTodo) {
      openTodoEditor(requestedTodo);
      const query = { ...route.query };
      delete query.todoId;
      router.replace({ query });
    }
    if (scrollContainer.value) {
      resizeObserver = new ResizeObserver(updateScrollFade);
      resizeObserver.observe(scrollContainer.value);
    }
  });
  onBeforeUnmount(() => {
    window.clearTimeout(mobileInboxSearchTimer);
    resizeObserver?.disconnect();
    window.clearTimeout(todoUndoTimer);
  });

  watch(
    () => [inbox.items.length, todo.items.length, inbox.loading, todo.loading],
    () => {
      syncTodoGroups();
      void nextTick(updateScrollFade);
    },
  );
  watch(
    () => todo.items,
    () => syncTodoGroups(),
  );

  watch(
    () => route.query.tab,
    async (tab, previousTab) => {
      if (!bookmark.isMobile || tab === previousTab) return;
      const nextFilter = isMobileResourceInboxTab(tab) ? tab : 'todo';
      if (inbox.filterType === nextFilter) return;
      inbox.filterType = nextFilter;
      inbox.keyword = '';
      todo.keyword = '';
      if (nextFilter === 'todo') todo.status = 'pending';
      else inbox.sort = 'newest';
      await refreshList(true);
    },
  );

  function syncRequestedMobileMode() {
    if (!bookmark.isMobile) return;
    inbox.filterType = isMobileResourceInboxTab(route.query.tab) ? route.query.tab : 'todo';
    if (inbox.filterType === 'todo') {
      if (!route.query.todoId) todo.status = 'pending';
    } else {
      inbox.sort = 'newest';
    }
  }

  function openCapture() {
    if (blockGuestWrite('inbox-capture', t('inbox.guestPrompt'))) return;
    recordOperation(OPERATION_LOG_MAP.inbox.openCapture);
    inbox.openQuickCapture(inbox.filterType === 'all' ? 'note' : inbox.filterType);
  }

  function setMobileInboxKeyword(value: string) {
    inbox.keyword = value;
    window.clearTimeout(mobileInboxSearchTimer);
    mobileInboxSearchTimer = window.setTimeout(search, 220);
  }

  useMobileTopBar(['inbox'], {
    getSearchValue: () => inbox.keyword,
    setSearchValue: setMobileInboxKeyword,
    onSearchEnter: search,
    searchPlaceholder: () =>
      isMobileTodoPrimary.value ? t('inbox.todoSearchPlaceholder') : t('inbox.resourceSearchPlaceholder'),
    onAdd: () => {
      if (isMobileTodoPrimary.value) openTodoEditor();
      else openCapture();
    },
    addLabel: () => (isMobileTodoPrimary.value ? t('inbox.createTodo') : t('inbox.quickCapture')),
  });
  function handleEmptyStateAction() {
    if (isMobileTodoPrimary.value || inbox.filterType === 'todo') openTodoEditor();
    else openCapture();
  }
  async function changeFilter() {
    inbox.sort = inbox.filterType === 'todo' ? ('smart' as any) : 'newest';
    router.replace({
      query: {
        ...route.query,
        tab: isMobileResourceInbox.value ? inbox.filterType : inbox.filterType === 'all' ? undefined : inbox.filterType,
      },
    });
    await refreshList(true);
  }
  async function changeTodoStatus() {
    await refreshList(true);
  }
  async function search() {
    await refreshList(true);
  }
  async function refreshList(resetScroll = false) {
    todo.keyword = inbox.keyword;
    if (inbox.filterType === 'todo' && !isMobileTodoPrimary.value) todo.sort = inbox.sort as TodoSort;
    let refreshed = false;
    let inboxCountsReady = false;
    if (inbox.filterType === 'todo') {
      refreshed = await todo.refreshList();
      inboxCountsReady = await inbox.refreshCount();
    } else if (inbox.filterType === 'all') {
      if (isMobileResourceInbox.value) {
        const inboxRefreshed = await inbox.refreshList();
        refreshed = inboxRefreshed;
        inboxCountsReady = inboxRefreshed || (await inbox.refreshCount());
      } else {
        const [inboxRefreshed, todoRefreshed] = await Promise.all([
          inbox.refreshList(),
          todo.refreshList({ status: 'pending', keyword: inbox.keyword, preserveStatus: true }),
        ]);
        refreshed = inboxRefreshed && todoRefreshed;
        inboxCountsReady = inboxRefreshed || (await inbox.refreshCount());
      }
    } else {
      const inboxRefreshed = await inbox.refreshList();
      refreshed = inboxRefreshed;
      inboxCountsReady = inboxRefreshed || (await inbox.refreshCount());
    }
    if (inboxCountsReady) todo.pendingTotal = inbox.todoPendingTotal;
    await nextTick();
    if (resetScroll && scrollContainer.value) scrollContainer.value.scrollTop = 0;
    updateScrollFade();
    return refreshed;
  }
  function actionRank(action: any) {
    if (action.actionType !== 'todo') return 3;
    const due = action.item.dueAt ? parseServerDate(action.item.dueAt).getTime() : 0;
    if (due && due < Date.now()) return 0;
    if (due && new Date(due).toDateString() === new Date().toDateString()) return 1;
    return action.item.priority === 2 ? 2 : 3;
  }
  function actionTime(action: any) {
    const value = action.actionType === 'todo' ? action.item.updatedAt : action.item.collectedAt;
    return parseServerDate(value || 0).getTime() || 0;
  }
  function parseServerDate(value: string | number) {
    return new Date(typeof value === 'string' ? value.replace(' ', 'T') : value);
  }
  function syncTodoGroups() {
    const keys: TodoGroupKey[] =
      todo.status === 'completed'
        ? ['completed']
        : todo.status === 'all'
          ? ['overdue', 'today', 'upcoming', 'later', 'noDate', 'completed']
          : ['overdue', 'today', 'upcoming', 'later', 'noDate'];
    todoGroupLists.value = keys
      .map((key) => ({
        key,
        items: todo.items.filter((item) => todoGroupKey(item) === key),
      }))
      .filter((group) => group.items.length > 0);
    priorityDropLists.value = { 0: [], 1: [], 2: [] };
    selectedTodoIds.value = selectedTodoIds.value.filter((id) => todo.items.some((item) => item.id === id));
  }
  function dueForGroup(key: TodoGroupKey) {
    return dueForTodoGroup(key);
  }
  function orderedTodoPayload() {
    return todoGroupLists.value
      .flatMap((group) => group.items)
      .map((item) => ({ id: item.id, dueAt: item.dueAt || null, priority: item.priority }));
  }
  async function handleTodoDragEnd(event: any) {
    if (event?.to?.dataset?.priority !== undefined) return;
    const id = String(event?.item?.dataset?.todoId || '');
    const targetGroup = String(event?.to?.dataset?.group || '') as TodoGroupKey;
    const item = todoGroupLists.value.flatMap((group) => group.items).find((candidate) => candidate.id === id);
    if (!item || !targetGroup || targetGroup === 'completed') {
      syncTodoGroups();
      return;
    }
    const previousGroup = todoGroupKey(item);
    if (previousGroup !== targetGroup) item.dueAt = dueForGroup(targetGroup);
    if (!(await todo.reorder(orderedTodoPayload()))) {
      message.error(t('inbox.todoReorderFailed'));
      await todo.refreshList();
    }
  }
  async function handlePriorityDrop(priority: TodoPriority) {
    await nextTick();
    const item = priorityDropLists.value[priority][0];
    if (!item) return;
    item.priority = priority;
    const payload = todo.items.map((candidate) => ({
      id: candidate.id,
      dueAt: candidate.dueAt || null,
      priority: candidate.id === item.id ? priority : candidate.priority,
    }));
    if (!(await todo.reorder(payload))) message.error(t('inbox.todoReorderFailed'));
    priorityDropLists.value[priority] = [];
  }
  async function updateTodoPriority(item: TodoItemType, priority: TodoPriority) {
    if (item.priority === priority) return;
    const payload = todo.items.map((candidate) => ({
      id: candidate.id,
      dueAt: candidate.dueAt || null,
      priority: candidate.id === item.id ? priority : candidate.priority,
    }));
    if (!(await todo.reorder(payload))) message.error(t('inbox.todoReorderFailed'));
  }
  async function createQuickTodo() {
    const title = quickTodoTitle.value.trim();
    if (!title || quickCreating.value || blockGuestWrite('todo-create', t('inbox.guestPrompt'))) return;
    const dueAt = quickTodoDueAt(quickTodoDue.value);
    quickCreating.value = true;
    try {
      if (await todo.quickCreate(title, dueAt, quickTodoPriority.value)) {
        quickTodoTitle.value = '';
        message.success(t('inbox.todoSaved'));
      } else message.error(t('inbox.todoSaveFailed'));
    } finally {
      quickCreating.value = false;
    }
  }
  function toggleTodoSelected(id: string, selected: boolean) {
    selectedTodoIds.value = selected
      ? [...new Set([...selectedTodoIds.value, id])]
      : selectedTodoIds.value.filter((value) => value !== id);
  }
  function toggleSelectAllTodos(selected: boolean) {
    selectedTodoIds.value = selected ? todo.items.map((item) => item.id) : [];
  }
  async function completeSelectedTodos() {
    const ids = [...selectedTodoIds.value];
    if (!ids.length || todoBatchMutating.value) return;
    todoBatchMutating.value = true;
    try {
      if (await todo.batchComplete(ids)) {
        selectedTodoIds.value = [];
        showTodoUndo('complete', ids);
      } else message.error(t('inbox.todoSaveFailed'));
    } finally {
      todoBatchMutating.value = false;
    }
  }
  function confirmDeleteSelectedTodos() {
    const ids = [...selectedTodoIds.value];
    if (!ids.length || todoBatchMutating.value) return;
    Alert.alert({
      title: t('inbox.deleteTodo'),
      content: t('inbox.deleteTodoBatchConfirm', { count: ids.length }),
      okText: t('common.delete'),
      cancelText: t('common.cancel'),
      onOk: () => deleteSelectedTodos(ids),
    });
  }
  async function deleteSelectedTodos(ids: string[]) {
    todoBatchMutating.value = true;
    try {
      if (await todo.batchDelete(ids)) {
        selectedTodoIds.value = [];
        showTodoUndo('delete', ids);
      } else message.error(t('inbox.todoSaveFailed'));
    } finally {
      todoBatchMutating.value = false;
    }
  }
  function showTodoUndo(kind: 'complete' | 'delete', ids: string[]) {
    window.clearTimeout(todoUndoTimer);
    todoUndo.value = { kind, ids };
    todoUndoTimer = window.setTimeout(clearTodoUndo, 10_000);
  }
  function clearTodoUndo() {
    window.clearTimeout(todoUndoTimer);
    todoUndo.value = null;
  }
  async function undoTodoAction() {
    const action = todoUndo.value;
    if (!action || todoUndoing.value) return;
    todoUndoing.value = true;
    try {
      const succeeded =
        action.kind === 'delete' ? await todo.restoreMany(action.ids) : await todo.reopenMany(action.ids);
      if (succeeded) {
        message.success(t('inbox.todoUndoSuccess'));
        clearTodoUndo();
      } else message.warning(t('inbox.todoUndoFailed'));
    } finally {
      todoUndoing.value = false;
    }
  }
  async function snoozeTodoItem(item: TodoItemType, preset: TodoSnoozePreset) {
    if (await todo.snooze(item, todoSnoozeAt(preset))) message.success(t('inbox.todoSnoozed'));
    else message.error(t('inbox.todoSnoozeFailed'));
  }
  function updateScrollFade() {
    const element = scrollContainer.value;
    if (!element) {
      showTopFade.value = false;
      showBottomFade.value = false;
      return;
    }
    showTopFade.value = element.scrollTop > 3;
    showBottomFade.value = element.scrollTop + element.clientHeight < element.scrollHeight - 3;
  }
  function toggleSelected(item: InboxItemType, selected: boolean) {
    const key = inbox.resourceKey(item);
    inbox.selectedKeys = selected
      ? Array.from(new Set([...inbox.selectedKeys, key]))
      : inbox.selectedKeys.filter((value) => value !== key);
  }
  function toggleSelectAll(selected: boolean) {
    inbox.selectedKeys = selected ? inbox.items.map((item) => inbox.resourceKey(item)) : [];
  }
  function openResource(item: InboxItemType) {
    recordOperation(OPERATION_LOG_MAP.inbox.openResource);
    if (item.resourceType === 'bookmark') {
      router.push({ path: `/manage/editBookmark/${item.resourceId}`, query: { organize: 'inbox' } });
    } else if (item.resourceType === 'note') {
      router.push({ path: `/noteLibrary/${item.resourceId}`, query: { organize: 'inbox' } });
    } else {
      router.push({
        path: '/cloudSpace',
        query: { fileId: item.resourceId, fileName: item.title, organize: 'inbox' },
      });
    }
  }
  async function completeOne(item: InboxItemType) {
    if (hasPendingOperation.value || blockGuestWrite('inbox-complete', t('inbox.guestPrompt'))) return;
    completingKey.value = inbox.resourceKey(item);
    try {
      const completed = await inbox.complete([item]);
      if (completed) {
        recordOperation(OPERATION_LOG_MAP.inbox.completeOne);
        message.success(t('inbox.completedSuccess'));
        await nextTick(updateScrollFade);
      }
    } finally {
      completingKey.value = '';
    }
  }
  async function completeSelected() {
    if (hasPendingOperation.value || blockGuestWrite('inbox-complete', t('inbox.guestPrompt'))) return;
    const selected = [...selectedItems.value];
    if (!selected.length) return;
    batchCompleting.value = true;
    try {
      const completed = await inbox.complete(selected);
      if (completed) {
        recordOperation({ ...OPERATION_LOG_MAP.inbox.completeBatch, operation: `批量整理完成【${completed}项】` });
        message.success(t('inbox.completedCount', { count: completed }));
        await nextTick(updateScrollFade);
      }
    } finally {
      batchCompleting.value = false;
    }
  }
  function confirmDelete(items: InboxItemType[], batchAction = false) {
    if (!items.length || hasPendingOperation.value || blockGuestWrite('inbox-delete', t('inbox.guestPrompt'))) return;
    Alert.alert({
      title: t('inbox.deleteConfirmTitle'),
      content:
        items.length === 1
          ? t('inbox.deleteConfirmOne', { name: items[0].title || t('inbox.untitled') })
          : t('inbox.deleteConfirmBatch', { count: items.length }),
      okText: t('inbox.deleteConfirmOk'),
      cancelText: t('common.cancel'),
      onOk: () => deleteResources(items, batchAction),
    });
  }
  async function deleteResources(items: InboxItemType[], isBatch: boolean) {
    if (isBatch) batchDeleting.value = true;
    else deletingKey.value = inbox.resourceKey(items[0]);
    try {
      const res = await batchDeleteSearchResources(
        items.map((item) => ({ id: item.resourceId, type: item.resourceType })),
      );
      if (Number(res?.status) !== 200) {
        message.error(res?.msg || t('inbox.deleteFailed'));
        return;
      }
      const affected = Number(res?.data?.affectedItemCount || 0);
      if (!affected) {
        message.warning(res?.msg || t('inbox.deleteFailed'));
        return;
      }
      recordOperation({
        ...(isBatch ? OPERATION_LOG_MAP.inbox.deleteBatch : OPERATION_LOG_MAP.inbox.deleteOne),
        operation: isBatch
          ? `批量移入回收站【选中${items.length}项，删除${affected}项】`
          : `移入回收站【${items[0].title || '未命名资源'}】`,
      });
      clearGlobalSearchCache();
      message.success(t('inbox.deleteSuccess', { count: affected }));
      await refreshList();
    } catch {
      message.error(t('inbox.deleteFailed'));
    } finally {
      batchDeleting.value = false;
      deletingKey.value = '';
    }
  }
  function openTodoEditor(item: TodoItemType | null = null) {
    editingTodo.value = item;
    todoEditorVisible.value = true;
  }
  async function afterTodoSaved() {
    await refreshList();
  }
  async function toggleTodo(item: TodoItemType, completed: boolean) {
    if (hasPendingOperation.value || blockGuestWrite('todo-complete', t('inbox.guestPrompt'))) return;
    updatingTodoId.value = item.id;
    try {
      if (await todo.setCompleted(item, completed)) {
        await inbox.refreshCount();
        if (completed) showTodoUndo('complete', [item.id]);
        else message.success(t('inbox.todoReopenedSuccess'));
      } else message.error(t('inbox.todoSaveFailed'));
    } finally {
      updatingTodoId.value = '';
    }
  }
  async function updateTodoChecklist(item: TodoItemType, checklist: TodoChecklistItem[]) {
    if (hasPendingOperation.value) return;
    updatingTodoId.value = item.id;
    try {
      if (!(await todo.updateChecklist(item, checklist))) message.error(t('inbox.todoSaveFailed'));
    } finally {
      updatingTodoId.value = '';
    }
  }
  function confirmDeleteTodo(item: TodoItemType) {
    if (hasPendingOperation.value) return;
    Alert.alert({
      title: t('inbox.deleteTodo'),
      content: t('inbox.deleteTodoConfirm', { name: item.title }),
      okText: t('common.delete'),
      cancelText: t('common.cancel'),
      onOk: () => removeTodo(item),
    });
  }
  function openTodoCalendar(item: TodoItemType) {
    // 无截止时间无法生成日历事件：提示并引导进入编辑，而不是导出错误文件
    if (!item.dueAt) {
      Alert.alert({
        title: t('inbox.calendarModalTitle'),
        content: t('inbox.calendarNeedDueAt'),
        okText: t('inbox.editTodo'),
        cancelText: t('common.cancel'),
        onOk: () => openTodoEditor(item),
      });
      return;
    }
    calendarTodo.value = item;
    todoCalendarVisible.value = true;
  }
  async function exportTodoCalendar(alarmMinutesBefore: number | null) {
    if (exportingCalendar.value) return;
    const item = calendarTodo.value;
    if (!item?.dueAt) return;
    const content = buildTodoIcs(
      { id: item.id, title: item.title, description: item.description, dueAt: item.dueAt, updatedAt: item.updatedAt },
      {
        alarmMinutesBefore,
        alarmDescription: t('inbox.calendarAlarmDescription'),
        origin: window.location.origin,
      },
    );
    if (!content) {
      message.error(t('inbox.calendarExportFailed'));
      return;
    }
    const fileName = buildIcsFileName(item.title, t('inbox.calendarFileFallback'));
    exportingCalendar.value = true;
    try {
      // 移动端优先系统分享（可直达日历应用），取消分享不打扰也不记成功；桌面端直接下载
      const result = await deliverIcsFile(content, fileName, bookmark.isMobile);
      if (result === 'cancelled') return;
      todoCalendarVisible.value = false;
      calendarTodo.value = null;
      message.success(t(result === 'shared' ? 'inbox.calendarShared' : 'inbox.calendarDownloaded'));
      recordOperation(OPERATION_LOG_MAP.inbox.exportCalendar);
    } catch (error) {
      console.error('[TodoCalendar] export failed', error);
      message.error(t('inbox.calendarExportFailed'));
    } finally {
      exportingCalendar.value = false;
    }
  }
  async function removeTodo(item: TodoItemType) {
    deletingTodoId.value = item.id;
    try {
      if (await todo.remove(item)) {
        await inbox.refreshCount();
        showTodoUndo('delete', [item.id]);
      } else message.error(t('inbox.todoSaveFailed'));
    } finally {
      deletingTodoId.value = '';
    }
  }
</script>

<style scoped lang="less">
  .inbox-page {
    height: 100%;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    padding: 16px 24px;
    box-sizing: border-box;
    color: var(--text-color);
  }
  .section-switcher {
    margin-bottom: 12px;
    flex-shrink: 0;
    align-self: flex-start;
  }
  .inbox-hero {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 20px;
    margin: 0 0 18px;
    flex-shrink: 0;
  }
  .todo-workspace-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
  }
  .todo-quick-create {
    display: grid;
    grid-template-columns: minmax(220px, 1fr) 132px 108px auto;
    align-items: center;
    gap: 7px;
    min-width: 0;
    flex: 1;
  }
  .todo-priority-drops {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin-bottom: 10px;
  }
  .todo-priority-drops > div {
    position: relative;
    min-height: 38px;
    border: 1px dashed color-mix(in srgb, var(--primary-color) 30%, var(--card-border-color));
    border-radius: 10px;
    background: color-mix(in srgb, var(--primary-color) 3%, transparent);
  }
  .todo-priority-drops > div.is-priority-2 {
    border-color: color-mix(in srgb, var(--danger-color, #e5484d) 45%, var(--card-border-color));
  }
  .todo-priority-drops > div > span {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    pointer-events: none;
    color: var(--desc-color);
    font-size: 11px;
  }
  .todo-priority-drop-target {
    position: relative;
    z-index: 1;
    min-height: 38px;
  }
  .todo-batch {
    margin-bottom: 10px;
  }
  .todo-undo-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
    padding: 8px 10px;
    border: 1px solid color-mix(in srgb, var(--success-color, #2e8b57) 35%, var(--card-border-color));
    border-radius: 10px;
    background: color-mix(in srgb, var(--success-color, #2e8b57) 7%, var(--background-color));
    color: var(--text-color);
  }
  .todo-undo-banner > span {
    flex: 1;
  }
  .todo-group-list {
    display: grid;
    gap: 16px;
  }
  .todo-group {
    display: grid;
    gap: 8px;
  }
  .todo-group > header {
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--text-color);
  }
  .todo-group > header > span {
    min-width: 21px;
    padding: 2px 6px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--primary-color) 10%, transparent);
    color: var(--primary-color);
    font-size: 10px;
    text-align: center;
  }
  .todo-group__items {
    display: grid;
    min-height: 18px;
    gap: 10px;
  }
  .todo-drag-ghost {
    opacity: 0.42;
  }
  .inbox-back-btn {
    width: 34px;
    min-width: 34px;
    height: 34px;
    padding: 0;
    border-radius: 10px;
    flex: 0 0 auto;
  }
  h1 {
    margin: 0 0 6px;
    font-size: 28px;
  }
  .inbox-hero p {
    margin: 0;
    color: var(--desc-color);
  }
  .inbox-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 14px;
    margin-bottom: 14px;
    padding: 9px 10px;
    box-sizing: border-box;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 82%, transparent);
    border-radius: 14px;
    background: linear-gradient(
      112deg,
      color-mix(in srgb, var(--primary-color) 5%, var(--background-color)),
      color-mix(in srgb, var(--background-color) 98%, transparent)
    );
    box-shadow: 0 8px 24px rgba(28, 33, 66, 0.035);
    flex-shrink: 0;
  }
  .inbox-toolbar :deep(.tab-container) {
    min-width: 0;
    flex: 1;
  }
  .inbox-toolbar__right {
    display: grid;
    grid-template-columns: minmax(180px, 280px) 130px;
    gap: 8px;
    flex-shrink: 0;
  }
  .inbox-toolbar__right.has-status {
    grid-template-columns: minmax(180px, 250px) 130px 120px;
  }
  .inbox-batch {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    padding: 10px 14px;
    min-height: 44px;
    box-sizing: border-box;
    border: 1px solid color-mix(in srgb, var(--primary-color) 16%, transparent);
    border-radius: 12px;
    background: color-mix(in srgb, var(--primary-color) 7%, var(--background-color));
    flex-shrink: 0;
  }
  .inbox-batch__actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .inbox-batch__actions > span {
    color: var(--desc-color);
    font-size: 13px;
  }
  .inbox-error-banner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
    padding: 10px 14px;
    border-radius: 8px;
    color: var(--text-color);
    background: color-mix(in srgb, var(--danger-color, #e5484d) 10%, transparent);
    flex-shrink: 0;
  }
  .inbox-content {
    position: relative;
    min-height: 0;
    flex: 1;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 80%, transparent);
    border-radius: 18px;
    background: color-mix(in srgb, var(--background-color) 96%, var(--primary-color) 4%);
    box-shadow: 0 10px 34px rgba(28, 33, 66, 0.04);
  }
  .inbox-content::before,
  .inbox-content::after {
    position: absolute;
    left: 0;
    right: 0;
    z-index: 2;
    height: 44px;
    content: '';
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.18s ease;
  }
  .inbox-content::before {
    top: 0;
    background: linear-gradient(to bottom, var(--background-color), transparent);
  }
  .inbox-content::after {
    bottom: 0;
    background: linear-gradient(to top, var(--background-color), transparent);
  }
  .inbox-content.has-top-fade::before,
  .inbox-content.has-bottom-fade::after {
    opacity: 0.96;
  }
  .inbox-scroll {
    height: 100%;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior-y: contain;
    scrollbar-gutter: stable;
    -webkit-overflow-scrolling: touch;
  }
  .inbox-loading {
    min-height: 100%;
  }
  .inbox-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 10px 12px 22px;
  }
  .inbox-empty {
    min-height: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
  }
  .inbox-empty__icon {
    width: 54px;
    height: 54px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: #fff;
    background: #615ced;
    font-size: 24px;
  }
  .inbox-error .inbox-empty__icon {
    background: var(--danger-color, #e5484d);
  }
  .inbox-empty--filtered .inbox-empty__icon {
    border: 1px solid color-mix(in srgb, var(--primary-color) 24%, transparent);
    background: color-mix(in srgb, var(--primary-color) 10%, var(--background-color));
    color: var(--primary-color);
  }
  .inbox-empty h2 {
    margin: 14px 0 6px;
  }
  .inbox-empty p {
    color: var(--desc-color);
    margin: 0 0 16px;
  }
  @media (max-width: 900px) {
    .inbox-page {
      padding: 12px;
    }
    .inbox-toolbar {
      align-items: stretch;
      flex-direction: column;
    }
    .inbox-toolbar__right,
    .inbox-toolbar__right.has-status {
      width: 100%;
      grid-template-columns: minmax(0, 1fr) 130px 120px;
    }
  }
  @media (max-width: 767px) {
    .todo-workspace-toolbar {
      align-items: stretch;
      flex-direction: column;
    }
    .todo-quick-create {
      grid-template-columns: minmax(0, 1fr) 108px;
    }
    .todo-quick-create > :first-child {
      grid-column: 1 / -1;
    }
    .todo-priority-drops {
      grid-template-columns: 1fr;
    }
    .todo-priority-drop-target,
    .todo-priority-drops > div {
      min-height: 44px;
    }
    .todo-undo-banner {
      flex-wrap: wrap;
    }
    .inbox-page--mobile-todo {
      padding: 8px 10px 0;
    }

    .inbox-page--mobile-resources {
      padding: 6px 12px 0;
    }

    .inbox-page--mobile-resources .section-switcher {
      width: 100%;
      margin-bottom: 8px;
    }

    .inbox-hero {
      align-items: center;
    }
    h1 {
      font-size: 22px;
    }
    .inbox-toolbar {
      gap: 8px;
      padding: 8px;
      overflow: visible;
    }
    .inbox-toolbar--todo-primary {
      min-height: 48px;
      margin-bottom: 8px;
      padding: 6px;
      align-items: center;
      flex-direction: row;
      gap: 6px;
      border-radius: 12px;
    }
    .inbox-toolbar--todo-primary :deep(.tab-container) {
      min-width: 0;
      flex: 1 1 auto;
      overflow-x: auto;
      padding-bottom: 0;
    }
    .mobile-todo-sort {
      width: 104px;
      min-width: 104px;
      flex: 0 0 104px;
    }
    .inbox-toolbar :deep(.tab-container) {
      width: 100%;
      overflow-x: auto;
      padding-bottom: 2px;
      scrollbar-width: none;
    }
    .inbox-toolbar :deep(.tab-container::-webkit-scrollbar) {
      display: none;
    }
    .inbox-toolbar__right {
      grid-template-columns: 1fr 110px;
      margin-top: 0;
    }
    .inbox-toolbar__right.has-status {
      grid-template-columns: 1fr 1fr;
    }
    .inbox-toolbar__right.has-status > :first-child {
      grid-column: 1 / -1;
    }
    .inbox-batch {
      align-items: flex-start;
      gap: 8px;
    }
    .inbox-batch__actions {
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .inbox-batch__actions > span {
      width: 100%;
      text-align: right;
    }
    .inbox-list {
      padding: 8px 8px 18px;
    }
    .inbox-page--mobile-todo .inbox-content {
      border: 0;
      border-radius: 0;
      background: transparent;
      box-shadow: none;
    }
    .inbox-page--mobile-todo .inbox-list {
      gap: 8px;
      padding: 0 0 18px;
    }
  }
</style>
