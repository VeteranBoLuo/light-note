<template>
  <section class="today-actions" :aria-label="t('workbench.today.actionsTitle')">
    <div v-if="loading" class="today-actions__loading">
      <div v-for="index in 3" :key="`today-action-skeleton-${index}`" class="today-actions__skeleton-row">
        <span class="skeleton-block skeleton-row-icon"></span>
        <span class="skeleton-block skeleton-row-main"></span>
        <span class="skeleton-block skeleton-row-meta"></span>
      </div>
    </div>

    <template v-else>
      <div v-if="localTodos.length" class="today-actions__group">
        <header class="today-actions__group-head">
          <strong>{{ t('workbench.today.todoGroup') }}</strong>
          <span>{{ localTodos.length }}</span>
        </header>
        <div class="today-actions__rows">
          <article v-for="todo in localTodos" :key="todo.id" class="today-action-row">
            <BCheckbox
              class="today-action-row__check"
              :model-value="false"
              :disabled="mutatingTodoId === todo.id"
              :aria-label="t('workbench.today.completeTodo', { title: todo.title })"
              @update:model-value="completeTodo(todo)"
            />
            <div class="today-action-row__main">
              <span class="today-action-row__title">{{ todo.title }}</span>
              <span class="today-action-row__meta">
                <span v-if="todo.overdue" class="is-overdue">{{ t('workbench.today.overdueBadge') }}</span>
                <span :class="{ 'is-overdue': todo.overdue }">{{ todo.dueLabel }}</span>
              </span>
            </div>
            <div class="today-action-row__actions">
              <BButton size="small" :disabled="mutatingTodoId === todo.id" @click="snoozeTodo(todo)">
                {{ t('workbench.today.snoozeTomorrow') }}
              </BButton>
              <BButton size="small" :disabled="mutatingTodoId === todo.id" @click="editTodo(todo)">
                {{ t('inbox.editTodo') }}
              </BButton>
            </div>
          </article>
        </div>
      </div>

      <div v-if="localInbox.length" class="today-actions__group">
        <header class="today-actions__group-head">
          <strong>{{ t('workbench.today.inboxGroup') }}</strong>
          <span>{{ localInbox.length }}</span>
        </header>
        <div class="today-actions__rows">
          <article v-for="item in localInbox" :key="inboxKey(item)" class="today-action-row">
            <span class="today-action-row__icon" :class="`is-${item.resourceType}`" aria-hidden="true">
              <SvgIcon :src="resourceIcon(item.resourceType)" size="16" />
            </span>
            <div class="today-action-row__main">
              <span class="today-action-row__title">{{ item.title }}</span>
              <span class="today-action-row__meta">{{ formatCollectedAt(item.collectedAt) }}</span>
            </div>
            <div class="today-action-row__actions">
              <BButton size="small" :disabled="mutatingInboxKey === inboxKey(item)" @click="openInboxItem(item)">
                {{ t('inbox.organize') }}
              </BButton>
              <BButton
                size="small"
                :loading="mutatingInboxKey === inboxKey(item)"
                @click="completeInboxItem(item)"
              >
                {{ t('inbox.complete') }}
              </BButton>
            </div>
          </article>
        </div>
      </div>

      <div v-if="!localTodos.length && !localInbox.length" class="today-actions__empty">
        <strong>{{ t('workbench.today.allDoneTitle') }}</strong>
        <span>{{ t('workbench.today.allDoneDesc') }}</span>
      </div>
    </template>

    <TodoEditorModal v-model:visible="todoEditorVisible" :item="editingTodo" @saved="afterTodoSaved" />
  </section>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import TodoEditorModal from '@/components/todo/TodoEditorModal.vue';
  import icon from '@/config/icon';
  import { completeInbox, type InboxResourceType } from '@/api/inboxApi';
  import { completeTodo as completeTodoApi, snoozeTodo as snoozeTodoApi, type TodoItem } from '@/api/todoApi';
  import { inboxStore } from '@/store';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import { recordOperation } from '@/api/commonApi';
  import { todoSnoozeAt } from '@/utils/todoPlanning';

  interface WorkbenchInboxItem {
    resourceType: InboxResourceType;
    resourceId: string;
    title: string;
    collectedAt?: string;
  }

  interface TodayTodoRow extends TodoItem {
    overdue: boolean;
    dueLabel: string;
  }

  const props = defineProps<{
    overdueTodos: TodoItem[];
    dueTodayTodos: TodoItem[];
    inboxItems: WorkbenchInboxItem[];
    loading?: boolean;
  }>();
  const emit = defineEmits<{ refresh: [] }>();

  const { t, locale } = useI18n();
  const router = useRouter();
  const inbox = inboxStore();

  const removedTodoIds = ref<Set<string>>(new Set());
  const removedInboxKeys = ref<Set<string>>(new Set());
  const mutatingTodoId = ref('');
  const mutatingInboxKey = ref('');
  const todoEditorVisible = ref(false);
  const editingTodo = ref<TodoItem | null>(null);

  watch(
    () => [props.overdueTodos, props.dueTodayTodos, props.inboxItems],
    () => {
      removedTodoIds.value = new Set();
      removedInboxKeys.value = new Set();
    },
  );

  const localTodos = computed<TodayTodoRow[]>(() => {
    const seen = new Set<string>();
    return [...props.overdueTodos.map(markOverdue(true)), ...props.dueTodayTodos.map(markOverdue(false))].filter(
      (item) => {
        if (!item.id || seen.has(item.id) || removedTodoIds.value.has(item.id)) return false;
        seen.add(item.id);
        return true;
      },
    );
  });
  const localInbox = computed(() =>
    props.inboxItems.filter((item) => item.resourceId && !removedInboxKeys.value.has(inboxKey(item))),
  );

  function markOverdue(fromOverdueGroup: boolean) {
    return (item: TodoItem): TodayTodoRow => {
      const due = parseDate(item.dueAt);
      const overdue = fromOverdueGroup || (Boolean(due) && (due as Date).getTime() < Date.now());
      return { ...item, overdue, dueLabel: formatDueLabel(due) };
    };
  }

  function parseDate(value?: string | null) {
    if (!value) return null;
    const date = new Date(String(value).replace(' ', 'T'));
    return Number.isFinite(date.getTime()) ? date : null;
  }

  function formatDueLabel(date: Date | null) {
    if (!date) return '';
    const now = new Date();
    const time = new Intl.DateTimeFormat(locale.value, { hour: '2-digit', minute: '2-digit' }).format(date);
    if (date.toDateString() === now.toDateString()) return t('workbench.today.dueAt', { time });
    const day = new Intl.DateTimeFormat(locale.value, { month: '2-digit', day: '2-digit' }).format(date);
    return `${day} ${time}`;
  }

  function formatCollectedAt(value?: string) {
    const date = parseDate(value);
    if (!date) return '';
    const day = new Intl.DateTimeFormat(locale.value, { month: '2-digit', day: '2-digit' }).format(date);
    return t('workbench.today.collectedAt', { day });
  }

  function inboxKey(item: WorkbenchInboxItem) {
    return `${item.resourceType}:${item.resourceId}`;
  }

  function resourceIcon(type: InboxResourceType) {
    if (type === 'note') return icon.resource.note;
    if (type === 'file') return icon.resource.file;
    return icon.resource.bookmark;
  }

  async function completeTodo(item: TodayTodoRow) {
    if (blockGuestWrite('workbench-today-todo', t('inbox.guestPrompt'))) return;
    mutatingTodoId.value = item.id;
    try {
      const res = await completeTodoApi(item.id);
      if (res.status === 200) {
        removedTodoIds.value = new Set([...removedTodoIds.value, item.id]);
        recordOperation({ module: '工作台', operation: '今日行动完成待办' });
        message.success(t('workbench.today.todoCompleted'));
        void inbox.refreshCount();
      } else {
        message.error(t('workbench.today.actionFailed'));
      }
    } catch {
      message.error(t('workbench.today.actionFailed'));
    } finally {
      mutatingTodoId.value = '';
    }
  }

  async function snoozeTodo(item: TodayTodoRow) {
    if (blockGuestWrite('workbench-today-todo', t('inbox.guestPrompt'))) return;
    mutatingTodoId.value = item.id;
    try {
      const res = await snoozeTodoApi(item.id, todoSnoozeAt('tomorrow'));
      if (res.status === 200) {
        removedTodoIds.value = new Set([...removedTodoIds.value, item.id]);
        recordOperation({ module: '工作台', operation: '今日行动稍后待办' });
        message.success(t('inbox.todoSnoozed'));
      } else {
        message.error(t('inbox.todoSnoozeFailed'));
      }
    } catch {
      message.error(t('inbox.todoSnoozeFailed'));
    } finally {
      mutatingTodoId.value = '';
    }
  }

  function editTodo(item: TodayTodoRow) {
    recordOperation({ module: '工作台', operation: '今日行动编辑待办' });
    const { overdue: _overdue, dueLabel: _dueLabel, ...raw } = item;
    editingTodo.value = raw;
    todoEditorVisible.value = true;
  }

  function afterTodoSaved() {
    editingTodo.value = null;
    emit('refresh');
  }

  function openInboxItem(item: WorkbenchInboxItem) {
    recordOperation({ module: '工作台', operation: '今日行动打开待整理资源' });
    if (item.resourceType === 'bookmark') {
      router.push({ path: `/manage/editBookmark/${item.resourceId}`, query: { organize: 'inbox' } });
      return;
    }
    if (item.resourceType === 'note') {
      router.push({ path: `/noteLibrary/${item.resourceId}`, query: { organize: 'inbox' } });
      return;
    }
    router.push({ path: '/cloudSpace', query: { fileId: item.resourceId, fileName: item.title, organize: 'inbox' } });
  }

  async function completeInboxItem(item: WorkbenchInboxItem) {
    if (blockGuestWrite('workbench-today-inbox', t('inbox.guestPrompt'))) return;
    const key = inboxKey(item);
    mutatingInboxKey.value = key;
    try {
      const res = await completeInbox([{ resourceType: item.resourceType, resourceId: item.resourceId }]);
      if (res.status === 200) {
        removedInboxKeys.value = new Set([...removedInboxKeys.value, key]);
        recordOperation({ module: '工作台', operation: '今日行动完成整理' });
        message.success(t('workbench.today.inboxCompleted'));
        void inbox.refreshCount();
      } else {
        message.error(t('workbench.today.actionFailed'));
      }
    } catch {
      message.error(t('workbench.today.actionFailed'));
    } finally {
      mutatingInboxKey.value = '';
    }
  }
</script>

<style scoped lang="less">
  .today-actions {
    display: grid;
    gap: 12px;
  }

  .today-actions__group {
    border: 1px solid color-mix(in srgb, var(--primary-color) 16%, var(--card-border-color));
    border-radius: 14px;
    background: var(--menu-body-bg-color, var(--background-color));
    box-shadow: 0 10px 26px -24px color-mix(in srgb, var(--primary-color) 60%, transparent);
    overflow: hidden;
  }

  .today-actions__group-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--surface-divider-color, var(--card-border-color));
    font-size: 13px;

    strong {
      color: var(--text-color);
      font-weight: 600;
    }

    span {
      min-width: 20px;
      padding: 0 6px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--primary-color) 10%, transparent);
      color: var(--primary-color);
      font-size: 12px;
      text-align: center;
    }
  }

  .today-actions__rows {
    display: grid;
  }

  .today-action-row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 52px;
    padding: 8px 14px;
    box-sizing: border-box;

    & + .today-action-row {
      border-top: 1px solid var(--surface-divider-color, var(--card-border-color));
    }
  }

  .today-action-row__check {
    flex: 0 0 auto;
  }

  .today-action-row__icon {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    flex: 0 0 auto;
    border-radius: 8px;
    color: var(--resource-bookmark-color, var(--primary-color));
    background: color-mix(in srgb, var(--resource-bookmark-color, var(--primary-color)) 12%, transparent);

    &.is-note {
      color: var(--resource-note-color, var(--primary-color));
      background: color-mix(in srgb, var(--resource-note-color, var(--primary-color)) 12%, transparent);
    }

    &.is-file {
      color: var(--resource-file-color, var(--primary-color));
      background: color-mix(in srgb, var(--resource-file-color, var(--primary-color)) 12%, transparent);
    }
  }

  .today-action-row__main {
    display: grid;
    gap: 2px;
    min-width: 0;
    flex: 1 1 auto;
  }

  .today-action-row__title {
    color: var(--text-color);
    font-size: 14px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .today-action-row__meta {
    display: flex;
    gap: 8px;
    color: var(--desc-color);
    font-size: 12px;

    .is-overdue {
      color: var(--danger-color, #e5484d);
      font-weight: 600;
    }
  }

  .today-action-row__actions {
    display: flex;
    gap: 8px;
    flex: 0 0 auto;
  }

  /* 默认按钮在暗色主题下与行背景过近,补一圈描边保证可辨识。 */
  .today-action-row__actions :deep(.b_btn) {
    border: 1px solid color-mix(in srgb, var(--text-color) 16%, var(--card-border-color));
  }

  .today-actions__empty {
    display: grid;
    justify-items: center;
    gap: 4px;
    padding: 22px 14px;
    border: 1px dashed var(--card-border-color);
    border-radius: 14px;
    text-align: center;

    strong {
      color: var(--text-color);
      font-size: 14px;
    }

    span {
      color: var(--desc-color);
      font-size: 12px;
    }
  }

  .today-actions__loading {
    display: grid;
    gap: 8px;
  }

  .today-actions__skeleton-row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 48px;
    padding: 8px 14px;
    border: 1px solid var(--card-border-color);
    border-radius: 12px;
    box-sizing: border-box;
  }

  .skeleton-block {
    border-radius: 6px;
    background: color-mix(in srgb, var(--text-color) 8%, transparent);
    animation: today-skeleton-pulse 1.4s ease-in-out infinite;
  }

  .skeleton-row-icon {
    width: 24px;
    height: 24px;
    flex: 0 0 auto;
  }

  .skeleton-row-main {
    height: 14px;
    flex: 1 1 auto;
  }

  .skeleton-row-meta {
    width: 84px;
    height: 14px;
    flex: 0 0 auto;
  }

  @keyframes today-skeleton-pulse {
    0%,
    100% {
      opacity: 0.55;
    }

    50% {
      opacity: 1;
    }
  }

  @media (max-width: 767px) {
    .today-action-row {
      flex-wrap: wrap;
      padding: 10px 12px;
    }

    .today-action-row__main {
      flex: 1 1 calc(100% - 80px);
    }

    .today-action-row__actions {
      width: 100%;
      justify-content: flex-end;
    }
  }
</style>
