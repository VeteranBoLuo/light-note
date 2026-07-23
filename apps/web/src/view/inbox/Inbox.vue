<template>
  <main class="inbox-page">
    <ResourceCenterSectionNav class="section-switcher" />
    <header class="inbox-hero">
      <!-- 移动端/PWA standalone 无系统返回,此前该页是死胡同 -->
      <BButton v-if="bookmark.isMobile" class="inbox-back-btn" @click="router.back()">
        <SvgIcon :src="icon.arrow_left" size="16" />
      </BButton>
      <div>
        <h1>{{ t('inbox.title') }}</h1>
        <p>{{ t('inbox.subtitle') }}</p>
      </div>
    </header>

    <section class="inbox-toolbar">
      <BTabs v-model:active-tab="inbox.filterType" :options="filterOptions" variant="pill" @change="changeFilter" />
      <div class="inbox-toolbar__right" :class="{ 'has-status': inbox.filterType === 'todo' }">
        <BInput v-model:value="inbox.keyword" :placeholder="t('inbox.searchPlaceholder')" clearable @enter="search" />
        <BSelect v-model:value="inbox.sort" :options="sortOptions" @change="search" />
        <BSelect
          v-if="inbox.filterType === 'todo'"
          v-model:value="todo.status"
          :options="todoStatusOptions"
          @change="search"
        />
      </div>
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
              />
            </template>
          </div>
        </BLoading>
      </div>
    </section>
    <TodoEditorModal v-model:visible="todoEditorVisible" :item="editingTodo" @saved="afterTodoSaved" />
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
  import { bookmarkStore, inboxStore, todoStore, useUserStore } from '@/store';
  import type { InboxItem as InboxItemType } from '@/api/inboxApi';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import { recordOperation } from '@/api/commonApi';
  import { OPERATION_LOG_MAP } from '@/config/logMap';
  import ResourceCenterSectionNav from '@/components/searchCenter/ResourceCenterSectionNav.vue';
  import { batchDeleteSearchResources, clearGlobalSearchCache } from '@/api/search';
  import type { TodoChecklistItem, TodoItem as TodoItemType, TodoSort } from '@/api/todoApi';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';

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
  const updatingTodoId = ref('');
  const deletingTodoId = ref('');
  const scrollContainer = ref<HTMLElement | null>(null);
  const showTopFade = ref(false);
  const showBottomFade = ref(false);
  let resizeObserver: ResizeObserver | null = null;

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
  const pageLoading = computed(() => inbox.loading || todo.loading);
  const pageLoadFailed = computed(() =>
    inbox.filterType === 'todo'
      ? todo.loadFailed
      : inbox.filterType === 'all'
        ? inbox.loadFailed || todo.loadFailed
        : inbox.loadFailed,
  );
  const isInboxGloballyEmpty = computed(() => inbox.actionTotal === 0);
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
    if (inbox.filterType === 'todo') return t('inbox.todoEmptyDesc');
    if (isInboxGloballyEmpty.value) return t('inbox.emptyDesc');
    if (inbox.filterType === 'all') return t('inbox.filterEmptyDesc', { count: inbox.actionTotal });
    return t('inbox.typeEmptyDesc', {
      type: currentTypeLabel.value,
      count: inbox.actionTotal,
    });
  });
  const emptyStateAction = computed(() => {
    if (inbox.filterType === 'all') return t('inbox.collectFirst');
    if (inbox.filterType === 'todo') return t('inbox.createTodo');
    return t('inbox.collectType', { type: currentTypeLabel.value });
  });

  const filterOptions = computed(() => [
    { key: 'all', label: t('inbox.all'), badge: inbox.actionTotal },
    { key: 'bookmark', label: t('inbox.bookmark'), badge: inbox.typeTotals.bookmark },
    { key: 'note', label: t('inbox.note'), badge: inbox.typeTotals.note },
    { key: 'file', label: t('inbox.file'), badge: inbox.typeTotals.file },
    { key: 'todo', label: t('inbox.todo'), badge: todo.pendingTotal },
  ]);
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
  const actionItems = computed(() => {
    if (inbox.filterType === 'todo') {
      return todo.items.map((item) => ({ actionType: 'todo' as const, key: `todo:${item.id}`, item }));
    }
    const resources = inbox.items.map((item) => ({
      actionType: 'resource' as const,
      key: inbox.resourceKey(item),
      item,
    }));
    if (inbox.filterType !== 'all') return resources;
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
      await refreshList();
    },
  );

  onMounted(async () => {
    inbox.resetForOwner(user.id || 'visitor');
    todo.resetForOwner(user.id || 'visitor');
    const requestedTab = String(route.query.tab || '');
    if (['all', 'bookmark', 'note', 'file', 'todo'].includes(requestedTab)) inbox.filterType = requestedTab as any;
    await refreshList();
    const requestedTodoId = String(route.query.todoId || '');
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
  onBeforeUnmount(() => resizeObserver?.disconnect());

  watch(
    () => [inbox.items.length, todo.items.length, inbox.loading, todo.loading],
    () => nextTick(updateScrollFade),
  );

  function openCapture() {
    if (blockGuestWrite('inbox-capture', t('inbox.guestPrompt'))) return;
    recordOperation(OPERATION_LOG_MAP.inbox.openCapture);
    inbox.openQuickCapture(inbox.filterType === 'all' ? 'note' : inbox.filterType);
  }
  function handleEmptyStateAction() {
    if (inbox.filterType === 'todo') openTodoEditor();
    else openCapture();
  }
  async function changeFilter() {
    inbox.sort = inbox.filterType === 'todo' ? ('smart' as any) : 'newest';
    router.replace({ query: { ...route.query, tab: inbox.filterType === 'all' ? undefined : inbox.filterType } });
    await refreshList(true);
  }
  async function search() {
    await refreshList(true);
  }
  async function refreshList(resetScroll = false) {
    todo.keyword = inbox.keyword;
    if (inbox.filterType === 'todo') todo.sort = inbox.sort as TodoSort;
    let refreshed = false;
    let inboxCountsReady = false;
    if (inbox.filterType === 'todo') {
      refreshed = await todo.refreshList();
      inboxCountsReady = await inbox.refreshCount();
    } else if (inbox.filterType === 'all') {
      const [inboxRefreshed, todoRefreshed] = await Promise.all([
        inbox.refreshList(),
        todo.refreshList({ status: 'pending', keyword: inbox.keyword, preserveStatus: true }),
      ]);
      refreshed = inboxRefreshed && todoRefreshed;
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
    if (blockGuestWrite('todo-create', t('inbox.guestPrompt'))) return;
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
        message.success(completed ? t('inbox.todoCompletedSuccess') : t('inbox.todoReopenedSuccess'));
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
  async function removeTodo(item: TodoItemType) {
    deletingTodoId.value = item.id;
    try {
      if (await todo.remove(item)) {
        await inbox.refreshCount();
        message.success(t('inbox.todoDeleted'));
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
  }
</style>
