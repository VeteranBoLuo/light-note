<template>
  <BCard class="todo-plan-preview" padding="var(--ui-space-18, 18px)" radius="16px">
    <template #title>
      <span>{{ t('inbox.todoPlanPreview') }}</span>
    </template>
    <template #extra>
      <span v-if="loading" class="todo-plan-preview__loading">{{ t('common.loading') }}</span>
    </template>
    <div class="todo-plan-preview__content">
      <section v-if="task?.title" class="todo-plan-preview__task">
        <div class="todo-plan-preview__task-head">
          <strong>{{ task.title }}</strong>
          <span class="todo-plan-preview__priority" :class="`is-priority-${task.priority ?? 1}`">
            {{ t(`inbox.todoPriority${task.priority ?? 1}`) }}
          </span>
        </div>
        <p v-if="task.description" class="todo-plan-preview__description">{{ task.description }}</p>
        <div v-if="previewChecklist.length" class="todo-plan-preview__checklist">
          <div class="todo-plan-preview__subhead">
            <span>{{ t('inbox.todoChecklist') }}</span>
            <small>{{
              t('inbox.todoChecklistProgress', { done: checklistDone, total: previewChecklist.length })
            }}</small>
          </div>
          <ul>
            <li v-for="item in visibleChecklist" :key="item.id" :class="{ 'is-done': item.done }">
              <span aria-hidden="true">{{ item.done ? '✓' : '' }}</span>
              <b>{{ item.text }}</b>
            </li>
          </ul>
          <small v-if="hiddenChecklistCount" class="todo-plan-preview__more">
            {{ t('inbox.todoPlanPreviewMoreItems', { count: hiddenChecklistCount }) }}
          </small>
        </div>
        <div v-if="organization" class="todo-plan-preview__organization">
          <span>{{ t('todoWorkspace.list') }}：{{ organization.listName || t('todoWorkspace.unassigned') }}</span>
          <div><ResourceTagChip v-for="tag in organization.tags" :key="tag.id" :tag="tag" /></div>
        </div>
        <div v-if="resources.length" class="todo-plan-preview__resources">
          <span>{{ t('inbox.todoResourceRefs', { count: resources.length }) }}</span>
          <div>
            <span v-for="resource in resources.slice(0, 3)" :key="`${resource.type}:${resource.id}`">
              {{ resource.title }}
            </span>
          </div>
        </div>
      </section>
      <p v-if="error" class="todo-plan-preview__error" role="alert">{{ error }}</p>
      <section v-if="preview" class="todo-plan-preview__schedule">
        <strong>{{ preview.displaySummary.title }}</strong>
        <p>{{ preview.displaySummary.range }}</p>
        <p v-if="preview.displaySummary.timing"
          >{{ preview.displaySummary.timing
          }}<strong v-if="dueNextDay" class="todo-plan-preview__next-day">
            · {{ t('todoWorkspace.dueNextDay') }}</strong
          ></p
        >
        <p v-if="hasReminder && !isOnce">{{
          preview.displaySummary.reminderSchedule || preview.displaySummary.reminder
        }}</p>
      </section>
      <dl v-if="preview">
        <div>
          <dt>{{ t('inbox.todoPlanPreviewTasks') }}</dt>
          <dd>{{ preview.occurrenceCount ?? `${preview.generatedNowCount}+` }}</dd>
        </div>
        <div v-if="!hasReminder">
          <dt>{{ t('inbox.todoPlanPreviewReminder') }}</dt>
          <dd>{{ t('inbox.todoReminderNone') }}</dd>
        </div>
        <template v-else>
          <div>
            <dt>{{ t(ongoing ? 'inbox.todoPlanPreviewReminderDuration' : 'inbox.todoPlanPreviewReminderJobs') }}</dt>
            <dd>{{
              ongoing
                ? stopLabel
                : reminderCount == null
                  ? '—'
                  : t('inbox.todoPlanPreviewReminderCount', { count: reminderCount }, reminderCount)
            }}</dd>
          </div>
          <div v-if="channels.length">
            <dt>{{ t('inbox.todoPlanPreviewChannels') }}</dt>
            <dd>{{ channels.join(locale.startsWith('zh') ? '、' : ', ') }}</dd>
          </div>
          <div v-if="preview.nextReminderAt">
            <dt>{{ t(isOnce ? 'inbox.todoPlanPreviewReminderTime' : 'inbox.todoPlanPreviewNextReminder') }}</dt>
            <dd>{{ preview.nextReminderAt }}</dd>
          </div>
        </template>
      </dl>
      <div v-if="!preview" class="todo-plan-preview__empty">
        <strong>{{ fallbackTitle }}</strong>
        <p v-if="!error">{{ t('inbox.todoPlanPreviewFillHint') }}</p>
      </div>
    </div>
  </BCard>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import ResourceTagChip from '@/components/tag/ResourceTagChip.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import type { TodoChecklistItem, TodoPlanPreview, TodoPriority, TodoResourceRefView } from '@/api/todoApi';

  const props = withDefaults(
    defineProps<{
      preview?: TodoPlanPreview | null;
      loading?: boolean;
      dueNextDay?: boolean;
      organization?: { listName: string; tags: Array<{ id: string; name: string }> };
      error?: string;
      independent?: boolean;
      task?: {
        title: string;
        description?: string;
        priority?: TodoPriority;
        checklist?: TodoChecklistItem[];
      };
      resources?: TodoResourceRefView[];
    }>(),
    { preview: null, loading: false, error: '', independent: false, task: undefined, resources: () => [] },
  );
  const { t, locale } = useI18n();
  const reminder = computed(() => props.preview?.normalizedPlan?.reminder);
  const hasReminder = computed(() =>
    reminder.value ? reminder.value.mode !== 'none' : Boolean(props.preview?.reminderJobCount),
  );
  const isOnce = computed(
    () =>
      reminder.value?.mode === 'once' ||
      (reminder.value?.mode === 'once_per_instance' && props.preview?.normalizedPlan?.plan.type === 'once'),
  );
  const ongoing = computed(
    () =>
      Boolean(props.preview?.reminderIsOngoing) ||
      (props.preview?.normalizedPlan?.plan.type !== 'once' &&
        props.preview?.normalizedPlan?.plan.end?.mode === 'never'),
  );
  const reminderCount = computed(() => props.preview?.reminderMomentCount);
  const channels = computed(() =>
    (reminder.value?.channels || []).map((channel) =>
      t(channel === 'in_app' ? 'inbox.todoReminderInApp' : 'inbox.todoReminderEmail'),
    ),
  );
  const stopLabel = computed(() => {
    const stop = reminder.value?.mode === 'repeat' ? reminder.value.repeat?.stop.type : null;
    if (stop === 'manual') return t('inbox.todoReminderStopManual');
    if (stop === 'completion' || stop === 'completion_or_due') return t('inbox.todoReminderStopCompletion');
    return t('inbox.todoPlanReminderOngoing');
  });
  const previewChecklist = computed(() => (props.task?.checklist || []).filter((item) => item.text.trim()));
  const visibleChecklist = computed(() => previewChecklist.value.slice(0, 4));
  const hiddenChecklistCount = computed(() =>
    Math.max(0, previewChecklist.value.length - visibleChecklist.value.length),
  );
  const checklistDone = computed(() => previewChecklist.value.filter((item) => item.done).length);
  const fallbackTitle = computed(() =>
    props.independent ? t('inbox.todoIndependentPreviewFallback') : t('inbox.todoSinglePreviewFallback'),
  );
</script>

<style scoped lang="less">
  .todo-plan-preview {
    --b-card-border-color: var(--surface-divider-color);
    --b-card-shadow: none;
  }

  .todo-plan-preview__organization {
    display: grid;
    gap: var(--ui-space-8, 8px);
    font-size: var(--ui-font-12, 12px);
    color: var(--desc-color);
  }
  .todo-plan-preview__organization > div {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-space-6, 6px);
  }
  .todo-plan-preview__error {
    color: var(--error-color);
  }
  .todo-plan-preview__next-day {
    font-size: inherit;
    color: var(--primary-color);
  }
  .todo-plan-preview__loading {
    color: var(--primary-color);
    font-size: var(--ui-font-12, 12px);
  }

  .todo-plan-preview__content,
  .todo-plan-preview__empty {
    display: grid;
    gap: var(--ui-space-12, 12px);
  }

  .todo-plan-preview__empty > strong {
    font-size: var(--ui-font-18, 18px);
    line-height: 1.4;
  }

  .todo-plan-preview__task {
    display: grid;
    gap: var(--ui-space-10, 10px);
    padding: var(--ui-space-13, 13px);
    border: 1px solid var(--surface-border-color);
    border-radius: 13px;
    background: var(--workspace-panel-bg-color);
  }

  .todo-plan-preview__task-head,
  .todo-plan-preview__subhead {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--ui-space-10, 10px);
  }

  .todo-plan-preview__task-head > strong {
    min-width: 0;
    color: var(--text-color);
    font-size: var(--ui-font-16, 16px);
    line-height: 1.45;
    overflow-wrap: anywhere;
  }

  .todo-plan-preview__priority {
    flex: 0 0 auto;
    padding: var(--ui-space-2, 2px) var(--ui-space-8, 8px);
    border: 1px solid var(--surface-border-color);
    border-radius: 999px;
    color: var(--desc-color);
    background: var(--card-background);
    font-size: var(--ui-font-11, 11px);
    font-weight: 700;
  }

  .todo-plan-preview__priority.is-priority-2 {
    border-color: var(--danger-color, #d83c45);
    color: var(--danger-color, #d83c45);
  }

  .todo-plan-preview__priority.is-priority-0 {
    border-color: var(--todo-accent-color, #0ea5e9);
    color: var(--todo-accent-color, #0ea5e9);
  }

  .todo-plan-preview__description {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .todo-plan-preview__checklist,
  .todo-plan-preview__resources,
  .todo-plan-preview__schedule {
    display: grid;
    gap: var(--ui-space-7, 7px);
  }

  .todo-plan-preview__subhead > span,
  .todo-plan-preview__resources > span {
    color: var(--text-color);
    font-size: var(--ui-font-12, 12px);
    font-weight: 700;
  }

  .todo-plan-preview__subhead small,
  .todo-plan-preview__more {
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
  }

  .todo-plan-preview__checklist ul {
    display: grid;
    gap: var(--ui-space-6, 6px);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .todo-plan-preview__checklist li {
    display: grid;
    grid-template-columns: var(--ui-layout-16, 16px) minmax(0, 1fr);
    align-items: start;
    gap: var(--ui-space-7, 7px);
    color: var(--text-color);
    font-size: var(--ui-font-12, 12px);
  }

  .todo-plan-preview__checklist li > span {
    display: grid;
    width: var(--ui-layout-14, 14px);
    height: var(--ui-layout-14, 14px);
    place-items: center;
    margin-top: var(--ui-space-1, 1px);
    border: 1px solid var(--surface-border-color);
    border-radius: 4px;
    color: #fff;
    font-size: var(--ui-font-10, 10px);
    line-height: 1;
  }

  .todo-plan-preview__checklist li.is-done > span {
    border-color: var(--todo-accent-color, #0ea5e9);
    background: var(--todo-accent-color, #0ea5e9);
  }

  .todo-plan-preview__checklist li.is-done > b {
    color: var(--desc-color);
    text-decoration: line-through;
  }

  .todo-plan-preview__checklist b {
    font-weight: 500;
    overflow-wrap: anywhere;
  }

  .todo-plan-preview__resources > div {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-space-5, 5px);
  }

  .todo-plan-preview__resources > div > span {
    max-width: 100%;
    overflow: hidden;
    padding: var(--ui-space-3, 3px) var(--ui-space-7, 7px);
    border-radius: 999px;
    background: var(--card-background);
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .todo-plan-preview__schedule {
    padding: var(--ui-space-2, 2px) var(--ui-space-1, 1px);
  }

  .todo-plan-preview__schedule > strong {
    color: var(--text-color);
    font-size: var(--ui-font-16, 16px);
    line-height: 1.4;
  }

  p {
    margin: 0;
    color: var(--desc-color);
    font-size: var(--ui-font-13, 13px);
    line-height: 1.65;
  }

  dl {
    display: grid;
    gap: var(--ui-space-10, 10px);
    margin: 0;
    padding-top: var(--ui-space-14, 14px);
    border-top: 1px solid var(--surface-divider-color);
  }

  dl > div {
    display: flex;
    justify-content: space-between;
    gap: var(--ui-space-12, 12px);
  }

  dt {
    flex-shrink: 0;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }

  dd {
    min-width: 0;
    overflow-wrap: anywhere;
    margin: 0;
    color: var(--text-color);
    font-size: var(--ui-font-13, 13px);
    font-weight: 650;
    text-align: right;
  }
</style>
