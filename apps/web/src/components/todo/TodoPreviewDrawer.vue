<template>
  <BDrawer
    :open="visible === true"
    :title="t('inbox.todoPreviewTitle')"
    :placement="bookmark.isMobile ? 'bottom' : 'right'"
    :mobile-full-screen="bookmark.isMobile"
    :mobile-centered-header="bookmark.isMobile"
    :close-icon="bookmark.isMobile ? icon.arrow_left : undefined"
    width="600px"
    height="100%"
    body-padding="0"
    :mask-closable="true"
    @close="close"
  >
    <template #header-actions>
      <BButton size="small" class="todo-preview__edit" :disabled="disabled" @click="openEditor">
        <SvgIcon v-if="!bookmark.isMobile" :src="icon.table_edit" size="13" aria-hidden="true" />
        <span>{{ t('inbox.editTodo') }}</span>
      </BButton>
    </template>

    <div v-auto-scrollbar class="todo-preview">
      <header class="todo-preview__hero">
        <div class="todo-preview__eyebrow">
          <span class="todo-preview__status" :class="`is-${item.status}`">
            <i aria-hidden="true"></i>
            {{ statusLabel }}
          </span>
          <span class="todo-preview__priority" :class="`is-priority-${item.priority}`">
            {{ priorityLabel }}
          </span>
        </div>
        <h2>{{ item.title }}</h2>
      </header>

      <section v-if="item.description" class="todo-preview__section todo-preview__description">
        <h3>{{ t('inbox.todoDescription') }}</h3>
        <p>{{ item.description }}</p>
      </section>

      <section v-if="item.checklist.length" class="todo-preview__section todo-preview__checklist">
        <header class="todo-preview__section-head">
          <h3>{{ t('inbox.todoChecklist') }}</h3>
          <span>{{
            t('inbox.todoChecklistProgress', { done: completedChecklistCount, total: item.checklist.length })
          }}</span>
        </header>
        <div class="todo-preview__checklist-items">
          <BCheckbox
            v-for="check in item.checklist"
            :key="check.id"
            :model-value="check.done"
            :disabled="disabled || item.status === 'completed'"
            @update:model-value="toggleChecklist(check.id, $event)"
          >
            <span :class="{ 'is-done': check.done }">{{ check.text }}</span>
          </BCheckbox>
        </div>
      </section>

      <section class="todo-preview__section todo-preview__schedule">
        <h3>
          <SvgIcon :src="icon.common.calendar" size="15" aria-hidden="true" />
          {{ t('inbox.todoPreviewSchedule') }}
        </h3>
        <dl>
          <div v-for="row in scheduleRows" :key="row.key">
            <dt>{{ row.label }}</dt>
            <dd>{{ row.value }}</dd>
          </div>
        </dl>
      </section>

      <section v-if="item.resourceRefs?.length" class="todo-preview__section todo-preview__resources">
        <div class="todo-preview__section-head">
          <h3>{{ t('inbox.todoResourceRefs', { count: item.resourceRefs.length }) }}</h3>
          <span>{{ t('inbox.todoPreviewResourceHint') }}</span>
        </div>
        <TodoResourceLinks :items="item.resourceRefs" :disabled="disabled" @open="openResourceRef" />
      </section>

      <footer class="todo-preview__meta">
        <span>{{ t('inbox.todoPreviewCreatedAt', { time: formatAbsolute(item.createdAt) }) }}</span>
        <span>{{ t('inbox.todoPreviewUpdatedAt', { time: formatAbsolute(item.updatedAt) }) }}</span>
      </footer>
    </div>
  </BDrawer>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import type { TodoChecklistItem, TodoItem, TodoResourceRefView } from '@/api/todoApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import TodoResourceLinks from '@/components/todo/TodoResourceLinks.vue';
  import icon from '@/config/icon';
  import { bookmarkStore } from '@/store';
  import { closeCurrentMobileOverlayThen } from '@/utils/mobileOverlayHistory';
  import { resolveResourceRoute } from '@/utils/resourceNavigation';
  import { formatTodoDateTime, normalizeTodoDateOnly, todoNextReminderAt } from '@/utils/todoPlanning';

  const props = withDefaults(
    defineProps<{
      item: TodoItem;
      disabled?: boolean;
    }>(),
    { disabled: false },
  );
  const visible = defineModel<boolean>('visible');
  const emit = defineEmits<{
    edit: [item: TodoItem];
    'update-checklist': [item: TodoItem, checklist: TodoChecklistItem[]];
    closed: [];
  }>();
  const { t, locale } = useI18n();
  const router = useRouter();
  const bookmark = bookmarkStore();

  const statusLabel = computed(() =>
    t(props.item.status === 'completed' ? 'inbox.todoCompleted' : 'inbox.todoPending'),
  );
  const priorityLabel = computed(() => t(`inbox.todoPriority${props.item.priority}`));
  const completedChecklistCount = computed(() => props.item.checklist.filter((check) => check.done).length);
  const scheduleRows = computed(() => {
    const rows: Array<{ key: string; label: string; value: string }> = [];
    if (props.item.startAt) {
      rows.push({ key: 'start', label: t('inbox.todoPreviewStartAt'), value: formatAbsolute(props.item.startAt) });
    }
    if (props.item.dueAt) {
      rows.push({ key: 'due', label: t('inbox.todoPreviewDueAt'), value: formatAbsolute(props.item.dueAt) });
    }
    const occurrenceDate = normalizeTodoDateOnly(props.item.occurrenceDate);
    if (occurrenceDate) {
      rows.push({
        key: 'occurrence',
        label: t('inbox.todoPreviewOccurrenceAt'),
        value: formatTodoDateTime(`${occurrenceDate}T00:00:00`, locale.value, {
          includeYear: true,
          includeTime: false,
        }),
      });
    }
    if (!props.item.startAt && !props.item.dueAt && !occurrenceDate) {
      rows.push({ key: 'schedule', label: t('inbox.todoPreviewTaskTime'), value: t('inbox.todoNoDate') });
    }
    const plan = planSummary();
    if (plan) rows.push({ key: 'plan', label: t('inbox.todoPreviewPlan'), value: plan });
    rows.push({
      key: 'reminder',
      label: t('inbox.todoPreviewReminder'),
      value: reminderSummary() || t('inbox.todoReminderNone'),
    });
    const nextReminderAt = todoNextReminderAt(props.item);
    if (nextReminderAt) {
      rows.push({
        key: 'next-reminder',
        label: t('inbox.todoPlanPreviewNextReminder'),
        value: formatAbsolute(nextReminderAt),
      });
    }
    return rows;
  });

  function formatAbsolute(value: string | null | undefined) {
    return formatTodoDateTime(value, locale.value, { includeYear: true }) || String(value || '');
  }

  function planSummary() {
    const series = props.item.series;
    if (series?.repeatMode === 'after_completion') {
      return t('inbox.todoSeriesAfterCompletionSummary', {
        interval: series.plan?.interval || 1,
        unit: t(`inbox.todoPlanUnit.${series.plan?.unit || 'day'}`),
      });
    }
    if (series) {
      return t(`inbox.todoRecurrenceSummary.${series.plan?.frequency || 'daily'}`, {
        interval: series.plan?.interval || 1,
      });
    }
    if (props.item.recurrence) {
      return t(`inbox.todoRecurrenceSummary.${props.item.recurrence.frequency}`, {
        interval: props.item.recurrence.interval,
      });
    }
    return '';
  }

  function reminderSummary() {
    const reminder = props.item.reminder;
    if (!reminder || reminder.mode === 'none') return '';
    const channels = (reminder.channels || [])
      .map((channel) => t(channel === 'email' ? 'inbox.todoReminderEmail' : 'inbox.todoReminderInApp'))
      .join(' + ');
    if (reminder.mode === 'repeat') return t('inbox.todoReminderRepeatSummary', { channels });
    if (reminder.mode === 'nudge') {
      return t('inbox.todoNudgeSummary', {
        channels,
        count: ('remainingCount' in reminder && reminder.remainingCount) || reminder.nudge?.maxCount || 0,
      });
    }
    return t('inbox.todoReminderOnceSummary', { channels });
  }

  function toggleChecklist(id: string, done: boolean) {
    emit(
      'update-checklist',
      props.item,
      props.item.checklist.map((check) => (check.id === id ? { ...check, done } : check)),
    );
  }

  function close() {
    visible.value = false;
    emit('closed');
  }

  function openEditor() {
    void closeCurrentMobileOverlayThen(
      () => (visible.value = false),
      () => emit('edit', props.item),
    );
  }

  function openResourceRef(resource: TodoResourceRefView) {
    const target = resolveResourceRoute(resource);
    if (!target) return;
    void closeCurrentMobileOverlayThen(
      () => (visible.value = false),
      () => router.push(target),
    );
  }
</script>

<style scoped lang="less">
  .todo-preview {
    min-height: 100%;
    display: grid;
    align-content: start;
    gap: 14px;
    padding: 20px 22px 28px;
    box-sizing: border-box;
    background: var(--page-background-color, var(--background-color));
  }

  :deep(.b_btn.todo-preview__edit) {
    gap: 5px;
    color: var(--primary-color);
  }

  .todo-preview__hero,
  .todo-preview__section {
    border: 1px solid var(--surface-border-color, var(--card-border-color));
    border-radius: 16px;
    background: var(--card-background, var(--background-color));
  }

  .todo-preview__hero {
    display: grid;
    gap: 12px;
    padding: 20px;
    border-top: 3px solid var(--todo-accent-color, var(--primary-color));
  }

  .todo-preview__hero h2 {
    margin: 0;
    color: var(--text-color);
    font-size: clamp(22px, 4vw, 30px);
    line-height: 1.3;
    overflow-wrap: anywhere;
  }

  .todo-preview__eyebrow {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 7px;
  }

  .todo-preview__status,
  .todo-preview__priority {
    display: inline-flex;
    min-height: 24px;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
    box-sizing: border-box;
    border: 1px solid var(--surface-border-color);
    border-radius: 999px;
    color: var(--desc-color);
    font-size: 11px;
    font-weight: 700;
  }

  .todo-preview__status i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--todo-accent-color, var(--primary-color));
  }

  .todo-preview__status.is-completed {
    border-color: var(--success-color, #1b8f55);
    color: var(--success-color, #1b8f55);
  }

  .todo-preview__status.is-completed i {
    background: var(--success-color, #1b8f55);
  }

  .todo-preview__priority.is-priority-2 {
    border-color: var(--danger-color, #d83c45);
    color: var(--danger-color, #d83c45);
  }

  .todo-preview__priority.is-priority-0 {
    border-color: var(--todo-accent-color, #0ea5e9);
    color: var(--todo-accent-color, #0ea5e9);
  }

  .todo-preview__section {
    display: grid;
    gap: 12px;
    padding: 17px 18px;
  }

  .todo-preview__section h3 {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: 0;
    color: var(--text-color);
    font-size: 14px;
    line-height: 1.4;
  }

  .todo-preview__description p {
    margin: 0;
    white-space: pre-wrap;
    color: var(--text-color);
    font-size: 14px;
    line-height: 1.75;
    overflow-wrap: anywhere;
  }

  .todo-preview__section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .todo-preview__section-head > span {
    color: var(--desc-color);
    font-size: 11px;
  }

  .todo-preview__checklist-items {
    display: grid;
    gap: 5px;
  }

  .todo-preview__checklist-items :deep(.b-checkbox) {
    width: 100%;
    min-height: 36px;
    box-sizing: border-box;
    padding: 7px 8px;
    border: 1px solid var(--surface-divider-color, var(--surface-border-color));
    border-radius: 9px;
  }

  .todo-preview__checklist-items .is-done {
    color: var(--desc-color);
    text-decoration: line-through;
  }

  .todo-preview__schedule dl {
    display: grid;
    gap: 0;
    margin: 0;
  }

  .todo-preview__schedule dl > div {
    display: grid;
    grid-template-columns: 112px minmax(0, 1fr);
    gap: 12px;
    padding: 10px 0;
    border-top: 1px solid var(--surface-divider-color, var(--surface-border-color));
  }

  .todo-preview__schedule dt {
    color: var(--desc-color);
    font-size: 12px;
  }

  .todo-preview__schedule dd {
    margin: 0;
    color: var(--text-color);
    font-size: 13px;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }

  .todo-preview__meta {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 8px 18px;
    padding: 0 3px;
    color: var(--desc-color);
    font-size: 11px;
  }

  @media (max-width: 767px) {
    .todo-preview {
      gap: 12px;
      padding: 14px 14px calc(24px + env(safe-area-inset-bottom));
    }

    .todo-preview__hero,
    .todo-preview__section {
      border-radius: 14px;
    }

    .todo-preview__hero {
      padding: 17px 16px;
    }

    .todo-preview__hero h2 {
      font-size: 23px;
    }

    .todo-preview__section {
      padding: 15px;
    }

    .todo-preview__schedule dl > div {
      grid-template-columns: 92px minmax(0, 1fr);
    }
  }
</style>
