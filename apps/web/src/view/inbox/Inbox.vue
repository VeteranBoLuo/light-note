<template>
  <main
    class="inbox-page"
    :class="{
      'inbox-page--todo-focused': isTodoFocused,
      'inbox-page--mobile-todo': isMobileTodoPrimary,
      'inbox-page--mobile-resources': isMobileResourceInbox,
    }"
  >
    <!-- 待整理属于资源中心，顶栏与「全部资源」共用同一常驻搜索入口；
         待办是底部一级入口，继续使用共享顶栏（带 Logo）。 -->
    <ResourceCenterTopBar
      v-if="isMobileResourceInbox"
      :keyword="inbox.keyword"
      input-id="mobile-inbox-page-input"
      show-menu
      :selection-mode="resourceSelectionMode"
      :selected-count="selectedItems.length"
      :allow-batch="inbox.items.length > 0"
      :allow-sort="inbox.items.length > 0"
      :create-label="t('inbox.quickCapture')"
      @update:keyword="setMobileInboxKeyword"
      @submit="search"
      @back="leaveResourceInbox"
      @create="openCapture"
      @batch="enterResourceSelection"
      @sort="toggleMobileResourceSort"
      @filter="cycleMobileResourceFilter"
      @cancel-selection="leaveResourceSelection"
      @complete-selected="completeSelected"
      @delete-selected="confirmDelete(selectedItems, true)"
    />

    <header v-if="!bookmark.isMobile" class="inbox-hero">
      <div class="inbox-hero__heading">
        <div class="inbox-hero__title-row">
          <span class="inbox-hero__accent" aria-hidden="true"></span>
          <h1>{{ isTodoFocused ? t('inbox.todoPageTitle') : t('inbox.title') }}</h1>
        </div>
        <p>{{ isTodoFocused ? t('inbox.todoPageSubtitle') : t('inbox.subtitle') }}</p>
      </div>
      <BButton v-if="isTodoFocused && !isVisitorTodoReadOnly" type="primary" @click="openTodoEditor()">
        {{ t('inbox.createTodo') }}
      </BButton>
    </header>

    <ResourceCenterSectionNav
      v-if="!isTodoFocused && (!bookmark.isMobile || isMobileResourceInbox)"
      class="section-switcher"
    />

    <section class="inbox-toolbar" :class="{ 'inbox-toolbar--todo-primary': isMobileTodoPrimary }">
      <template v-if="isTodoFocused">
        <template v-if="isMobileTodoPrimary">
          <!-- 移动端待办不放第二个文本搜索框：查找待办统一走顶栏全局搜索，
               这里只保留状态、排序、视图等结构化筛选。 -->
          <BTabs
            v-if="todoView === 'list'"
            v-model:active-tab="todo.status"
            :options="todoStatusTabOptions"
            variant="pill"
            @change="changeTodoStatus"
          />
          <BSelect
            v-if="todo.items.length || pageLoading"
            class="mobile-todo-sort"
            v-model:value="todo.sort"
            :options="sortOptions"
            @change="search"
          />
        </template>
        <template v-else>
          <BTabs
            v-if="todoView === 'list'"
            v-model:active-tab="todo.status"
            :options="todoStatusTabOptions"
            variant="pill"
            @change="changeTodoStatus"
          />
          <div class="inbox-toolbar__right inbox-toolbar__right--todo">
            <BInput
              v-model:value="inbox.keyword"
              :placeholder="t('inbox.todoSearchPlaceholder')"
              clearable
              @enter="search"
            />
            <BSelect v-model:value="inbox.sort" :options="sortOptions" @change="search" />
          </div>
        </template>
      </template>
      <template v-else>
        <BTabs v-model:active-tab="inbox.filterType" :options="filterOptions" variant="pill" @change="changeFilter" />
        <div class="inbox-toolbar__right">
          <BInput
            v-if="!bookmark.isMobile"
            v-model:value="inbox.keyword"
            :placeholder="t('inbox.searchPlaceholder')"
            clearable
            @enter="search"
          />
          <BSelect v-model:value="inbox.sort" :options="sortOptions" @change="search" />
        </div>
      </template>
    </section>

    <!-- 快速创建输入行已移除:与「新建待办」编辑器重复,移动端顶栏加号与桌面主按钮足够覆盖创建入口。
         「批量选择」并入视图切换行,不再单独占一行;进入批量态后才展开完整操作条。 -->
    <section v-if="isTodoFocused" class="todo-workspace-toolbar">
      <BTabs
        v-model:active-tab="todoView"
        class="todo-workspace-toolbar__views"
        :options="todoViewOptions"
        variant="pill"
      />
      <BButton
        v-if="todoView === 'list' && !isVisitorTodoReadOnly && !todoSelectionMode && (todo.items.length || pageLoading)"
        class="todo-workspace-toolbar__select"
        size="small"
        @click="toggleTodoSelectionMode"
      >
        {{ t('inbox.todoBatchSelect') }}
      </BButton>
    </section>

    <section
      v-if="isTodoFocused && !isVisitorTodoReadOnly && todoView === 'list' && todoSelectionMode"
      class="todo-list-toolbar"
    >
      <BCheckbox
        :model-value="selectedTodoIds.length === todo.items.length"
        :indeterminate="selectedTodoIds.length > 0 && selectedTodoIds.length < todo.items.length"
        @update:model-value="toggleSelectAllTodos"
      >
        {{ t('inbox.selectedCount', { count: selectedTodoIds.length }) }}
      </BCheckbox>
      <div class="todo-list-toolbar__actions">
        <BButton
          v-if="todo.status !== 'completed'"
          size="small"
          type="primary"
          :loading="todoBatchMutating"
          :disabled="!selectedTodoIds.length"
          @click="completeSelectedTodos"
        >
          {{ t('inbox.completeSelected') }}
        </BButton>
        <BButton
          size="small"
          type="danger"
          :loading="todoBatchMutating"
          :disabled="!selectedTodoIds.length"
          @click="confirmDeleteSelectedTodos"
        >
          {{ t('inbox.deleteSelected') }}
        </BButton>
        <BButton size="small" @click="toggleTodoSelectionMode">{{ t('inbox.todoBatchCancel') }}</BButton>
      </div>
    </section>

    <section v-if="todoUndo" class="todo-undo-banner" role="status">
      <span>{{
        todoUndo.kind === 'delete'
          ? t('inbox.todoDeletedCount', { count: todoUndo.ids.length })
          : t('inbox.todoCompletedCount', { count: todoUndo.ids.length })
      }}</span>
      <BButton size="small" :loading="todoUndoing" @click="undoTodoAction">{{ t('common.undo') }}</BButton>
      <BButton size="small" :aria-label="t('common.close')" @click="clearTodoUndo">{{ t('common.close') }}</BButton>
    </section>

    <section
      v-if="inbox.filterType !== 'todo' && inbox.items.length && (!isMobileResourceInbox || resourceSelectionMode)"
      class="inbox-batch"
    >
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
      <div ref="scrollContainer" class="inbox-scroll" @scroll="handleInboxScroll">
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
            <BButton v-if="!(isTodoFocused && isVisitorTodoReadOnly)" type="primary" @click="handleEmptyStateAction">
              {{ emptyStateAction }}
            </BButton>
          </div>
          <TodoScheduleView
            v-else-if="isTodoFocused && todoView !== 'list'"
            ref="scheduleViewRef"
            :items="todo.items"
            :view="todoView"
            :swipe-enabled="bookmark.isMobile"
            :disabled="hasPendingOperation || todoBatchMutating || isVisitorTodoReadOnly"
            :read-only="isVisitorTodoReadOnly"
            :deleting-id="deletingTodoId"
            @edit="openTodoEditor"
            @delete="confirmDeleteTodo"
          />
          <div v-else-if="isTodoFocused" class="todo-group-list">
            <section v-for="group in todoGroupLists" :key="group.key" class="todo-group">
              <header>
                <strong>{{ t(`inbox.todoGroups.${group.key}`) }}</strong>
                <span>{{ group.items.length }}</span>
              </header>
              <div class="todo-group__items">
                <TodoItem
                  v-for="item in group.items"
                  :key="item.id"
                  :item="item"
                  :selectable="todoSelectionMode"
                  :selected="selectedTodoIds.includes(item.id)"
                  :disabled="hasPendingOperation || todoBatchMutating"
                  :read-only="isVisitorTodoReadOnly"
                  :deleting="deletingTodoId === item.id"
                  :swipe-enabled="bookmark.isMobile"
                  :swipe-open="openSwipeTodoId === item.id"
                  @swipe-start="beginTodoSwipe(item.id)"
                  @update:swipe-open="updateTodoSwipe(item.id, $event)"
                  @select="toggleTodoSelected(item.id, $event)"
                  @toggle-complete="toggleTodo(item, $event)"
                  @update-checklist="updateTodoChecklist(item, $event)"
                  @edit="openTodoEditor(item)"
                  @delete="confirmDeleteTodo(item)"
                  @add-to-calendar="openTodoCalendar(item)"
                  @snooze="snoozeTodoItem(item, $event)"
                  @update-priority="updateTodoPriority(item, $event)"
                />
              </div>
            </section>
          </div>
          <div v-else class="inbox-list">
            <!-- 资源中心只展示资源；待办由独立工作区承载。 -->
            <template v-for="action in actionItems" :key="action.key">
              <InboxItem
                v-if="action.actionType === 'resource'"
                :item="action.item"
                :selectable="!isMobileResourceInbox || resourceSelectionMode"
                :selected="inbox.selectedKeys.includes(inbox.resourceKey(action.item))"
                :completing="completingKey === inbox.resourceKey(action.item)"
                :deleting="deletingKey === inbox.resourceKey(action.item)"
                :disabled="hasPendingOperation"
                :selection-mode="resourceSelectionMode"
                :swipe-enabled="bookmark.isMobile"
                :swipe-open="openSwipeResourceKey === inbox.resourceKey(action.item)"
                @swipe-start="beginResourceSwipe(action.item)"
                @update:swipe-open="updateResourceSwipe(action.item, $event)"
                @select="toggleSelected(action.item, $event)"
                @open="openResource(action.item)"
                @complete="completeOne(action.item)"
                @delete="confirmDelete([action.item])"
              />
              <TodoItem
                v-else
                :item="action.item"
                :disabled="hasPendingOperation"
                :read-only="isVisitorTodoReadOnly"
                :deleting="deletingTodoId === action.item.id"
                :swipe-enabled="bookmark.isMobile"
                :swipe-open="openSwipeTodoId === action.item.id"
                @swipe-start="beginTodoSwipe(action.item.id)"
                @update:swipe-open="updateTodoSwipe(action.item.id, $event)"
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
  import { buildIcsFileName, buildTodoIcs, deliverIcsFile } from '@/utils/ics';
  import { bookmarkStore, inboxStore, todoStore, useUserStore } from '@/store';
  import type { InboxItem as InboxItemType } from '@/api/inboxApi';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import { recordOperation } from '@/api/commonApi';
  import { OPERATION_LOG_MAP } from '@/config/logMap';
  import { isMobileResourceInboxTab } from '@/config/mobileNavigation';
  import ResourceCenterSectionNav from '@/components/searchCenter/ResourceCenterSectionNav.vue';
  import ResourceCenterTopBar from '@/components/searchCenter/ResourceCenterTopBar.vue';
  import { getMobileResourceEntryPath } from '@/composables/useMobileNavigationState';
  import { batchDeleteSearchResources, clearGlobalSearchCache } from '@/api/search';
  import type {
    TodoChecklistItem,
    TodoFilterStatus,
    TodoItem as TodoItemType,
    TodoPriority,
    TodoSort,
  } from '@/api/todoApi';
  import { useMobileTopBar } from '@/composables/useMobileTopBar';
  import { todoGroupKey, todoSnoozeAt, type TodoGroupKey, type TodoSnoozePreset } from '@/utils/todoPlanning';
  import { updatePreference } from '@/utils/savePreference';

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
  const openSwipeTodoId = ref('');
  const openSwipeResourceKey = ref('');
  const scheduleViewRef = ref<{ closeSwipe: () => void } | null>(null);
  type TodoView = 'list' | 'agenda' | 'calendar';
  const normalizeTodoView = (value: unknown): TodoView => (value === 'agenda' || value === 'calendar' ? value : 'list');
  const todoView = ref<TodoView>(normalizeTodoView(user.preferences.todoView));
  const todoSelectionMode = ref(false);
  const resourceSelectionMode = ref(false);
  const selectedTodoIds = ref<string[]>([]);
  const todoBatchMutating = ref(false);
  const todoUndo = ref<{ kind: 'complete' | 'delete'; ids: string[] } | null>(null);
  const todoUndoing = ref(false);
  const todoGroupLists = ref<Array<{ key: TodoGroupKey; items: TodoItemType[] }>>([]);
  let todoUndoTimer = 0;
  const scrollContainer = ref<HTMLElement | null>(null);
  const showTopFade = ref(false);
  const showBottomFade = ref(false);
  let resizeObserver: ResizeObserver | null = null;

  const isMobileResourceInbox = computed(() => bookmark.isMobile && isMobileResourceInboxTab(route.query.tab));
  const isMobileTodoPrimary = computed(() => bookmark.isMobile && !isMobileResourceInbox.value);
  const isTodoFocused = computed(() => isMobileTodoPrimary.value || inbox.filterType === 'todo');
  const isVisitorTodoReadOnly = computed(() => user.role === 'visitor' && !user.visitorWorkspace);

  function resolveRequestedFilter(value: unknown) {
    const tab = String(value || '');
    if (tab === 'todo') return 'todo' as const;
    if (isMobileResourceInboxTab(tab)) return tab;
    return bookmark.isMobile ? ('todo' as const) : ('all' as const);
  }

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
    return inbox.filterType === 'todo' ? todo.loading : inbox.loading;
  });
  const pageLoadFailed = computed(() => {
    if (isMobileTodoPrimary.value) return todo.loadFailed;
    if (isMobileResourceInbox.value) return inbox.loadFailed;
    return inbox.filterType === 'todo' ? todo.loadFailed : inbox.loadFailed;
  });
  const isInboxGloballyEmpty = computed(() =>
    inbox.filterType === 'todo' ? todo.pendingTotal === 0 : inbox.pendingTotal === 0,
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
        count: inbox.pendingTotal,
      });
    }
    return t('inbox.typeEmptyDesc', {
      type: currentTypeLabel.value,
      count: inbox.pendingTotal,
    });
  });
  const emptyStateAction = computed(() => {
    if (inbox.filterType === 'all') return t('inbox.collectFirst');
    if (inbox.filterType === 'todo') return t('inbox.createTodo');
    return t('inbox.collectType', { type: currentTypeLabel.value });
  });

  const filterOptions = computed(() => {
    return [
      {
        key: 'all',
        label: t('inbox.all'),
        badge: inbox.pendingTotal,
      },
      { key: 'bookmark', label: t('inbox.bookmark'), badge: inbox.typeTotals.bookmark },
      { key: 'note', label: t('inbox.note'), badge: inbox.typeTotals.note },
      { key: 'file', label: t('inbox.file'), badge: inbox.typeTotals.file },
    ];
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
  // 桌面与移动端共用的待办状态切换页签(未完成/已完成/全部)。
  const todoStatusTabOptions = computed<Array<{ key: TodoFilterStatus; label: string; badge?: number }>>(() => [
    { key: 'pending', label: t('inbox.todoPending'), badge: todo.pendingTotal },
    { key: 'completed', label: t('inbox.todoCompleted') },
    { key: 'all', label: t('inbox.all') },
  ]);
  const todoViewOptions = computed(() => [
    { key: 'list', label: t('inbox.todoViewList') },
    { key: 'agenda', label: t('inbox.todoViewAgenda') },
    { key: 'calendar', label: t('inbox.todoViewCalendar') },
  ]);
  const actionItems = computed(() => {
    if (inbox.filterType === 'todo') {
      return todo.items.map((item) => ({ actionType: 'todo' as const, key: `todo:${item.id}`, item }));
    }
    const resources = inbox.items.map((item) => ({
      actionType: 'resource' as const,
      key: inbox.resourceKey(item),
      item,
    }));
    // 资源中心的“全部”只展示资源；待办拥有独立的列表 / 议程 / 日历工作区，避免跨域混排和误操作。
    return resources;
  });

  watch(
    () => user.id,
    async (id) => {
      todoView.value = normalizeTodoView(user.preferences.todoView);
      inbox.resetForOwner(id || 'visitor');
      todo.resetForOwner(id || 'visitor');
      resourceSelectionMode.value = false;
      syncRequestedMobileMode();
      await refreshList();
    },
  );

  onMounted(async () => {
    inbox.resetForOwner(user.id || 'visitor');
    todo.resetForOwner(user.id || 'visitor');
    resourceSelectionMode.value = false;
    if (bookmark.isMobile) syncRequestedMobileMode();
    else inbox.filterType = resolveRequestedFilter(route.query.tab);
    const requestedTodoId = String(route.query.todoId || '');
    if (isTodoFocused.value) todo.status = requestedTodoId ? 'all' : 'pending';
    await refreshList();
    await openRequestedTodo(requestedTodoId, { listReady: true });
    if (scrollContainer.value) {
      resizeObserver = new ResizeObserver(updateScrollFade);
      resizeObserver.observe(scrollContainer.value);
    }
  });
  onBeforeUnmount(() => {
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
    () => user.preferences.todoView,
    (view) => {
      const preferredView = normalizeTodoView(view);
      if (todoView.value !== preferredView) todoView.value = preferredView;
    },
  );
  watch(todoView, (view) => {
    openSwipeTodoId.value = '';
    void nextTick(() => {
      if (!scrollContainer.value) return;
      scrollContainer.value.scrollTop = 0;
      updateScrollFade();
    });
    if (view !== 'list' && todoSelectionMode.value) {
      todoSelectionMode.value = false;
      selectedTodoIds.value = [];
    }
    // 状态筛选(未完成/已完成/全部)只属于列表视图:议程/日历始终展示全量,
    // 用 preserveStatus 保住列表页签的选择,切回列表时按页签口径恢复。
    if (view !== 'list') {
      if (todo.effectiveStatus !== 'all') void todo.refreshList({ status: 'all', preserveStatus: true });
    } else if (todo.effectiveStatus !== todo.status) {
      void todo.refreshList({ status: todo.status });
    }
    if (user.preferences.todoView === view) return;
    updatePreference({ todoView: view }).catch(() => {
      message.warning(t('settings.saveFailed'));
    });
  });

  /**
   * 定位并打开指定待办。
   *
   * 从全局搜索点待办结果时组件通常已经挂载，只有路由 query 变化，
   * 因此不能只在 onMounted 里处理，否则地址变了却要刷新才弹出编辑框。
   */
  async function openRequestedTodo(todoId: string, options: { listReady?: boolean } = {}) {
    if (!todoId) return;
    let requestedTodo = todo.items.find((item) => item.id === todoId);
    if (!requestedTodo && !options.listReady) {
      // 目标可能是已完成待办，默认的「未完成」筛选会让它落在列表之外
      if (isMobileTodoPrimary.value || inbox.filterType === 'todo') todo.status = 'all';
      await refreshList();
      requestedTodo = todo.items.find((item) => item.id === todoId);
    }
    if (!requestedTodo) return;
    openTodoEditor(requestedTodo);
    const query = { ...route.query };
    delete query.todoId;
    void router.replace({ query });
  }

  watch(
    () => route.query.tab,
    async (tab, previousTab) => {
      if (tab === previousTab) return;
      const nextFilter = resolveRequestedFilter(tab);
      if (inbox.filterType === nextFilter) return;
      inbox.filterType = nextFilter;
      inbox.keyword = '';
      todo.keyword = '';
      // 带 todoId 进来时要能定位已完成待办，不能强制回到「未完成」
      if (nextFilter === 'todo') todo.status = route.query.todoId ? 'all' : 'pending';
      else {
        inbox.sort = 'newest';
        resourceSelectionMode.value = false;
        inbox.selectedKeys = [];
      }
      await refreshList(true);
    },
  );

  // 声明在 tab watch 之后：先完成视图切换，再定位并打开目标待办
  watch(
    () => route.query.todoId,
    (value) => {
      void openRequestedTodo(String(value || ''));
    },
  );

  function syncRequestedMobileMode() {
    if (!bookmark.isMobile) return;
    inbox.filterType = resolveRequestedFilter(route.query.tab);
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
  }

  function enterResourceSelection() {
    if (!isMobileResourceInbox.value) return;
    openSwipeResourceKey.value = '';
    resourceSelectionMode.value = true;
    inbox.selectedKeys = [];
  }

  function leaveResourceSelection() {
    openSwipeResourceKey.value = '';
    resourceSelectionMode.value = false;
    inbox.selectedKeys = [];
  }

  async function toggleMobileResourceSort() {
    if (!isMobileResourceInbox.value) return;
    inbox.sort = inbox.sort === 'newest' ? 'oldest' : 'newest';
    await refreshList(true);
  }

  async function cycleMobileResourceFilter() {
    if (!isMobileResourceInbox.value) return;
    const filters = ['all', 'bookmark', 'note', 'file'];
    const currentIndex = Math.max(0, filters.indexOf(inbox.filterType));
    inbox.filterType = filters[(currentIndex + 1) % filters.length] as any;
    await changeFilter();
  }

  useMobileTopBar(['inbox'], {
    // 待整理分区自画顶栏（返回 + 搜索 + 创建），待办分区仍用共享顶栏
    ownTopBar: () => isMobileResourceInbox.value,
    searchSourceType: 'todo',
    onAdd: () => {
      if (isMobileTodoPrimary.value) openTodoEditor();
      else openCapture();
    },
    addLabel: () => (isMobileTodoPrimary.value ? t('inbox.createTodo') : t('inbox.quickCapture')),
  });
  /**
   * 待整理顶栏的返回：回到来源页。
   *
   * 进入资源中心的路径很多（全局搜索的「查看全部」、我的 → 资源中心、今日 → 待整理摘要），
   * 固定目标必然在某些路径下把人送错地方；没有历史时兜底到资料区，
   * 因为资源中心本质是资料的统一视图。
   */
  function leaveResourceInbox() {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    void router.push(getMobileResourceEntryPath());
  }

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
      const inboxRefreshed = await inbox.refreshList();
      refreshed = inboxRefreshed;
      inboxCountsReady = inboxRefreshed || (await inbox.refreshCount());
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
    selectedTodoIds.value = selectedTodoIds.value.filter((id) => todo.items.some((item) => item.id === id));
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
  function toggleTodoSelected(id: string, selected: boolean) {
    selectedTodoIds.value = selected
      ? [...new Set([...selectedTodoIds.value, id])]
      : selectedTodoIds.value.filter((value) => value !== id);
  }
  function toggleTodoSelectionMode() {
    openSwipeTodoId.value = '';
    todoSelectionMode.value = !todoSelectionMode.value;
    if (!todoSelectionMode.value) selectedTodoIds.value = [];
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
  function handleInboxScroll() {
    openSwipeTodoId.value = '';
    openSwipeResourceKey.value = '';
    scheduleViewRef.value?.closeSwipe();
    updateScrollFade();
  }
  function beginTodoSwipe(id: string) {
    openSwipeResourceKey.value = '';
    openSwipeTodoId.value = id;
  }
  function updateTodoSwipe(id: string, open: boolean) {
    if (open) openSwipeTodoId.value = id;
    else if (openSwipeTodoId.value === id) openSwipeTodoId.value = '';
  }
  function beginResourceSwipe(item: InboxItemType) {
    openSwipeTodoId.value = '';
    openSwipeResourceKey.value = inbox.resourceKey(item);
  }
  function updateResourceSwipe(item: InboxItemType, open: boolean) {
    const key = inbox.resourceKey(item);
    if (open) openSwipeResourceKey.value = key;
    else if (openSwipeResourceKey.value === key) openSwipeResourceKey.value = '';
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
    openSwipeResourceKey.value = '';
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
        if (isMobileResourceInbox.value) leaveResourceSelection();
        await nextTick(updateScrollFade);
      }
    } finally {
      batchCompleting.value = false;
    }
  }
  function confirmDelete(items: InboxItemType[], batchAction = false) {
    if (!items.length || hasPendingOperation.value || blockGuestWrite('inbox-delete', t('inbox.guestPrompt'))) return;
    openSwipeResourceKey.value = '';
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
      if (isMobileResourceInbox.value && isBatch) leaveResourceSelection();
    } catch {
      message.error(t('inbox.deleteFailed'));
    } finally {
      batchDeleting.value = false;
      deletingKey.value = '';
    }
  }
  function openTodoEditor(item: TodoItemType | null = null) {
    if (isVisitorTodoReadOnly.value) return;
    openSwipeTodoId.value = '';
    scheduleViewRef.value?.closeSwipe();
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
    openSwipeTodoId.value = '';
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
    padding: 18px clamp(16px, 1.6vw, 40px) 24px;
    box-sizing: border-box;
    color: var(--text-color);
  }
  .inbox-page--todo-focused {
    --primary-color: var(--todo-accent-color, #0ea5e9);
  }
  .section-switcher {
    min-height: 34px;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    flex-shrink: 0;
    align-self: flex-start;
  }
  .inbox-hero {
    display: flex;
    justify-content: space-between;
    align-items: center;
    min-height: 54px;
    gap: 12px;
    margin: 0 0 14px;
    flex-shrink: 0;
  }
  .inbox-hero__heading {
    min-width: 0;
    flex: 1;
  }
  .inbox-hero__title-row {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 9px;
  }
  .inbox-hero__accent {
    width: 8px;
    height: 8px;
    flex: 0 0 auto;
    border-radius: 999px;
    background: var(--desc-color);
    box-shadow: 0 0 0 5px color-mix(in srgb, var(--desc-color) 10%, transparent);
  }
  .inbox-page--todo-focused .inbox-hero__accent {
    background: var(--todo-accent-color, #0ea5e9);
    box-shadow: 0 0 0 5px color-mix(in srgb, var(--todo-accent-color, #0ea5e9) 10%, transparent);
  }
  .todo-workspace-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
  }
  .todo-workspace-toolbar__views {
    flex-shrink: 0;
  }
  .todo-workspace-toolbar__select {
    flex-shrink: 0;
    margin-left: auto;
  }
  .todo-list-toolbar {
    min-height: 46px;
    margin-bottom: 10px;
    padding: 6px 10px;
    box-sizing: border-box;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 82%, transparent);
    border-radius: 12px;
    background: color-mix(in srgb, var(--primary-color) 2.5%, var(--background-color));
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-shrink: 0;
  }
  .todo-list-toolbar__actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
  }
  .todo-list-toolbar :deep(.b_btn) {
    min-height: 34px;
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
    padding: 8px 10px 22px;
  }
  .todo-group {
    display: grid;
    gap: 8px;
    padding: 12px;
    border: 1px solid color-mix(in srgb, var(--primary-color) 12%, var(--card-border-color));
    border-radius: 16px;
    background: color-mix(in srgb, var(--primary-color) 2.5%, var(--background-color));
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
  .inbox-hero h1 {
    min-width: 0;
    margin: 0;
    overflow: hidden;
    color: var(--text-color);
    font-size: clamp(22px, 2vw, 28px);
    font-weight: 750;
    line-height: 1.2;
    letter-spacing: -0.025em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .inbox-hero p {
    margin: 5px 0 0 17px;
    overflow: hidden;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.4;
    text-overflow: ellipsis;
    white-space: nowrap;
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
  .inbox-toolbar__right--todo {
    grid-template-columns: minmax(180px, 250px) 130px;
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
    .inbox-toolbar__right {
      width: 100%;
      grid-template-columns: minmax(0, 1fr) 130px auto;
    }
  }
  @media (max-width: 767px) {
    /* 视图切换与「批量选择」保持同一行,不再各占一行 */
    .todo-workspace-toolbar {
      align-items: center;
      gap: 8px;
    }
    .todo-workspace-toolbar__views {
      min-width: 0;
      flex: 1 1 auto;
    }
    .todo-workspace-toolbar__select {
      min-height: 36px;
    }
    .todo-list-toolbar {
      align-items: stretch;
      flex-wrap: wrap;
    }
    .todo-list-toolbar__actions {
      width: 100%;
      justify-content: flex-start;
      flex-wrap: wrap;
    }
    .todo-undo-banner {
      flex-wrap: wrap;
    }
    .inbox-page--mobile-todo {
      padding: 8px 10px 0;
    }

    /* 顶栏在 SearchCenter 里位于页面容器之外、天然贴边；这里它在 .inbox-page 之内，
       必须去掉上内边距并用负 margin 抵消左右，否则两个分区的顶栏会错位。 */
    .inbox-page--mobile-resources {
      padding: 0 12px;
    }

    .inbox-page--mobile-resources > .resource-center-topbar {
      margin: 0 -12px;
    }

    .inbox-page--mobile-resources .section-switcher {
      width: 100%;
      margin-top: 6px;
      margin-bottom: 8px;
    }

    .inbox-hero {
      align-items: center;
    }
    .inbox-hero h1 {
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
    .inbox-batch {
      align-items: flex-start;
      gap: 8px;
    }
    /* 「全选当前 N 项」被右侧按钮挤压后会断成两行，这里不允许它压缩换行 */
    .inbox-batch > :deep(.b-checkbox) {
      flex: 0 0 auto;
      white-space: nowrap;
    }
    .inbox-batch__actions {
      min-width: 0;
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
    /* 分组列表(列表视图)此前保留了桌面的水平内边距,导致卡片比上方工具条多缩进一截 */
    .inbox-page--mobile-todo .todo-group-list {
      gap: 12px;
      padding: 0 0 18px;
    }
  }
</style>
