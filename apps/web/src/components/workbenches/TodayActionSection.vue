<template>
  <section
    class="today-actions"
    :class="{ 'today-actions--contained': contained, 'today-actions--compact-empty': compactEmpty }"
    :aria-label="t('workbench.today.actionsTitle')"
  >
    <header v-if="showHeader" class="today-actions__header">
      <div class="today-actions__heading">
        <strong>{{ t('workbench.today.actionsTitle') }}</strong>
        <span>{{ t('workbench.today.actionsHint') }}</span>
      </div>
    </header>

    <div v-if="loading" class="today-actions__content today-actions__loading">
      <div class="today-actions__skeleton-group">
        <div class="today-actions__skeleton-head">
          <span class="skeleton-block skeleton-group-title"></span>
          <span class="skeleton-block skeleton-group-count"></span>
        </div>
        <div class="today-actions__skeleton-rows">
          <div
            v-for="index in contained ? 5 : 3"
            :key="`today-action-skeleton-${index}`"
            class="today-actions__skeleton-row"
          >
            <span class="skeleton-block skeleton-row-icon"></span>
            <span class="skeleton-row-copy">
              <span class="skeleton-block skeleton-row-title"></span>
              <span class="skeleton-block skeleton-row-subtitle"></span>
            </span>
            <span class="skeleton-row-actions">
              <span class="skeleton-block skeleton-row-button"></span>
              <span class="skeleton-block skeleton-row-button skeleton-row-button--wide"></span>
            </span>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="today-actions__content">
      <div v-if="localTodos.length" class="today-actions__group">
        <header class="today-actions__group-head">
          <strong>{{ t('workbench.today.todoGroup') }}</strong>
          <span>{{ todoCount }}</span>
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
              <!-- 重复待办不会被顺延(会打乱周期)，按钮就不能也叫「明天再看」，否则又是一个
                   承诺了做不到的事的按钮 —— 它对这类待办只推提醒 -->
              <BButton size="small" :disabled="mutatingTodoId === todo.id" @click="snoozeTodo(todo)">
                {{
                  isRecurringTodo(todo) ? t('workbench.today.snoozeReminderOnly') : t('workbench.today.snoozeTomorrow')
                }}
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
          <span>{{ inboxCount }}</span>
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
                v-if="!compactActions"
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
    </div>

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
  import {
    completeTodo as completeTodoApi,
    previewTodoPlanUpdateV2,
    snoozeTodo as snoozeTodoApi,
    updateTodo as updateTodoApi,
    updateTodoPlanV2,
    type TodoItem,
  } from '@/api/todoApi';
  import { inboxStore } from '@/store';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import { recordOperation } from '@/api/commonApi';
  import { todoSnoozeAt } from '@/utils/todoPlanning';
  import { generateUUID } from '@/utils/common';
  import { normalizeCurrentTodoPlanDraft } from '@/components/todo/todoDraftNormalizer';

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

  const props = withDefaults(
    defineProps<{
      /**
       * 权威总数。明细数组是被服务端上限截断的（待整理最多 3 条、待办最多 7 条），
       * 用它的 length 当分组数量会让计数停在上限上不再变化。
       * 不传时回落到数组长度，保持旧调用方行为。
       */
      todoTotal?: number;
      inboxTotal?: number;
      overdueTodos: TodoItem[];
      dueTodayTodos: TodoItem[];
      inboxItems: WorkbenchInboxItem[];
      loading?: boolean;
      showHeader?: boolean;
      contained?: boolean;
      compactEmpty?: boolean;
      compactActions?: boolean;
    }>(),
    { showHeader: true, contained: false, compactEmpty: false, compactActions: false },
  );
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

  /**
   * 分组数量用权威总数减去本轮本地已处理的条数。
   *
   * 明细被服务端上限截断，直接用数组长度会让数字停在上限；
   * 而只用权威总数又会在本地完成一条后不减少——两者结合才既准确又即时。
   */
  function resolveGroupCount(total: number | undefined, removed: number, visible: number) {
    if (total == null) return visible;
    return Math.max(visible, total - removed);
  }

  const todoCount = computed(() =>
    resolveGroupCount(props.todoTotal, removedTodoIds.value.size, localTodos.value.length),
  );
  const inboxCount = computed(() =>
    resolveGroupCount(props.inboxTotal, removedInboxKeys.value.size, localInbox.value.length),
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

  function isRecurringTodo(item: TodoItem) {
    return Boolean(item.recurrence || item.seriesId);
  }

  async function postponeV2SingleTodo(item: TodoItem, targetAt: string) {
    const draft = normalizeCurrentTodoPlanDraft(item, { dueAt: targetAt });
    const preview = await previewTodoPlanUpdateV2(item.id, 'current', draft);
    if (preview.status !== 200 || !preview.data?.previewHash) return preview;
    return updateTodoPlanV2(
      item.id,
      'current',
      {
        ...draft,
        previewHash: String(preview.data.previewHash),
        idempotencyKey: generateUUID(),
      },
      { silent: true },
    );
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
        emit('refresh');
      } else {
        message.error(t('workbench.today.actionFailed'));
      }
    } catch {
      message.error(t('workbench.today.actionFailed'));
    } finally {
      mutatingTodoId.value = '';
    }
  }

  /**
   * 工作台的「明天再看」是「这件事今天不做了」，所以要顺延 dueAt，而不是只推提醒。
   *
   * 原来复用了待办页的「稍后提醒」接口，它只改 todo_reminders.scheduled_at；
   * 而今日区是按 dueAt 判逾期的，于是逾期待办点完照旧赖在这里（乐观移除后一刷新就回来），
   * 今天到期的那种则会在明天变成逾期再冒出来。待办页的「稍后提醒」语义本来就是提醒，那边不动。
   *
   * 重复待办例外：v1 会按当前 dueAt 推算下一项，v2 则已有独立的系列日程；
   * 都不能从工作台偷偷移动当前截止时间并改变系列语义。因此重复待办只推提醒、条目留在今日区。
   * v2 单任务修改日期时必须走计划预览和“当前项”更新，保证提醒 Job 与日期同步重算。
   */
  async function snoozeTodo(item: TodayTodoRow) {
    if (blockGuestWrite('workbench-today-todo', t('inbox.guestPrompt'))) return;
    mutatingTodoId.value = item.id;
    const targetAt = todoSnoozeAt('tomorrow');
    const recurring = isRecurringTodo(item);
    try {
      const res = recurring
        ? await snoozeTodoApi(item.id, targetAt, { silent: true })
        : Number(item.planVersion || 1) === 2
          ? await postponeV2SingleTodo(item, targetAt)
          : await updateTodoApi(item.id, { dueAt: targetAt }, { silent: true });
      if (res.status === 200) {
        // 只有真的顺延了截止时间才从今日区移除；重复待办仍属于今天，留着才和提示一致
        if (!recurring) removedTodoIds.value = new Set([...removedTodoIds.value, item.id]);
        recordOperation({
          module: '工作台',
          operation: recurring ? '今日行动推迟提醒(重复待办)' : '今日行动顺延待办到明天',
        });
        message.success(recurring ? t('workbench.today.snoozeRecurringHint') : t('workbench.today.snoozedToTomorrow'));
        emit('refresh');
      } else {
        message.error(res.msg || t('inbox.todoSnoozeFailed'));
      }
    } catch (error: any) {
      message.error(error?.message || t('inbox.todoSnoozeFailed'));
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
      router.push({
        path: `/noteLibrary/${item.resourceId}`,
        query: { organize: 'inbox', from: router.currentRoute.value.fullPath },
      });
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
        emit('refresh');
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
    min-width: 0;
  }

  .today-actions__content {
    display: grid;
    gap: 12px;
    min-width: 0;
  }

  /* 桌面工作台使用单一紧凑外框；条目在 contained 模式下采用明确行高，
     让 5 条摘要完整显示且不产生内部滚动。 */
  .today-actions--contained {
    width: 100%;
    min-height: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 0;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--primary-color) 16%, var(--card-border-color));
    border-radius: 14px;
    background: var(--menu-body-bg-color, var(--background-color));
  }

  .today-actions--contained .today-actions__content {
    flex: 1 1 auto;
    display: block;
    overflow: visible;
  }

  .today-actions--contained .today-actions__group {
    border: 0;
    border-radius: 0;
    box-shadow: none;
  }

  .today-actions--contained .today-actions__group + .today-actions__group {
    border-top: 0;
  }

  .today-actions--contained .today-actions__group-head {
    padding-block: 8px;
    border-bottom: 0;
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--primary-color) 5%, var(--menu-body-bg-color, var(--background-color))) 0%,
      color-mix(in srgb, var(--primary-color) 2%, var(--menu-body-bg-color, var(--background-color))) 68%,
      var(--menu-body-bg-color, var(--background-color)) 100%
    );
  }

  .today-actions--contained .today-action-row {
    height: 48px;
    min-height: 48px;
    padding-block: 5px;
  }

  .today-actions--contained .today-actions__empty {
    min-height: 100%;
    box-sizing: border-box;
    align-content: center;
    border: 0;
    border-radius: 0;
  }

  .today-actions--contained .today-actions__loading {
    padding: 0;
    box-sizing: border-box;
  }

  .today-actions__header {
    display: flex;
    align-items: baseline;
    padding: 0 2px 1px;
  }

  .today-actions__heading {
    display: grid;
    gap: 3px;
  }

  .today-actions__header strong {
    color: var(--text-color);
    font-size: 15px;
    font-weight: 700;
  }

  .today-actions__header span {
    color: var(--desc-color);
    font-size: 12px;
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

  /* 默认按钮的灰底在浅色下像原生 button、在暗色下又与行背景糊在一起。
     统一改用主题色淡染 + 同色系描边:两个主题都自适应,也与站内 chip 语言一致。 */
  .today-action-row__actions :deep(.b_btn) {
    border: 1px solid color-mix(in srgb, var(--primary-color) 20%, transparent);
    background: color-mix(in srgb, var(--primary-color) 7%, transparent) !important;
    color: var(--primary-color);
    font-weight: 500;
  }
  .today-action-row__actions :deep(.b_btn:hover) {
    border-color: color-mix(in srgb, var(--primary-color) 34%, transparent);
    background: color-mix(in srgb, var(--primary-color) 13%, transparent) !important;
  }

  .today-actions__empty {
    display: grid;
    justify-items: center;
    gap: 4px;
    min-width: 0;
    padding: 22px 14px;
    box-sizing: border-box;
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

  .today-actions--compact-empty .today-actions__empty {
    padding: 10px 12px;
    grid-template-columns: minmax(0, 1fr);
    justify-items: start;
    gap: 3px;
    text-align: left;

    span {
      min-width: 0;
      line-height: 1.45;
      overflow-wrap: anywhere;
    }
  }

  .today-actions__loading {
    display: block;
  }

  .today-actions__skeleton-group {
    overflow: hidden;
    border: 1px solid var(--card-border-color);
    border-radius: 14px;
    background: var(--menu-body-bg-color, var(--background-color));
  }

  .today-actions--contained .today-actions__skeleton-group {
    border: 0;
    border-radius: 0;
  }

  .today-actions__skeleton-head {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 33px;
    padding: 8px 14px;
    box-sizing: border-box;
    border-bottom: 1px solid var(--surface-divider-color, var(--card-border-color));
  }

  .skeleton-group-title {
    width: 52px;
    height: 12px;
  }

  .skeleton-group-count {
    width: 24px;
    height: 18px;
    border-radius: 999px;
  }

  .today-actions__skeleton-row {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 48px;
    padding: 5px 14px;
    box-sizing: border-box;
  }

  .today-actions__skeleton-row + .today-actions__skeleton-row {
    border-top: 1px solid var(--surface-divider-color, var(--card-border-color));
  }

  .skeleton-block {
    border-radius: 6px;
    background: color-mix(in srgb, var(--text-color) 8%, transparent);
    animation: today-skeleton-pulse 1.4s ease-in-out infinite;
  }

  .skeleton-row-icon {
    width: 28px;
    height: 28px;
    flex: 0 0 auto;
  }

  .skeleton-row-copy {
    min-width: 0;
    flex: 1 1 auto;
    display: grid;
    gap: 5px;
  }

  .skeleton-row-title {
    width: min(58%, 460px);
    height: 12px;
  }

  .skeleton-row-subtitle {
    width: min(22%, 150px);
    height: 9px;
  }

  .skeleton-row-actions {
    display: flex;
    gap: 8px;
    flex: 0 0 auto;
  }

  .skeleton-row-button {
    width: 48px;
    height: 24px;
    border-radius: 6px;
  }

  .skeleton-row-button--wide {
    width: 66px;
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
    /* 内容与操作保持同一行：换行会让每张卡片凭空高出一整行、右侧留下大片空白，
       也让左侧的图标和标题看起来贴在卡片上部。按钮改用紧凑尺寸腾出标题宽度。 */
    .today-action-row {
      min-height: 56px;
      padding: 9px 12px;
      gap: 8px;
    }

    .today-action-row__meta {
      gap: 6px;
      overflow: hidden;
      white-space: nowrap;
    }

    .today-action-row__actions {
      gap: 6px;
    }

    .today-action-row__actions :deep(.b_btn) {
      height: 30px;
      min-height: 30px;
      padding: 0 9px;
      font-size: 12px;
    }
  }
</style>
