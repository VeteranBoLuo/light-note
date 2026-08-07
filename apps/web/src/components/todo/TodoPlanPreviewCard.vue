<template>
  <BCard class="todo-plan-preview" padding="18px" radius="16px">
    <template #title>
      <span>{{ t('inbox.todoPlanPreview') }}</span>
    </template>
    <template #extra>
      <span v-if="loading" class="todo-plan-preview__loading">{{ t('common.loading') }}</span>
    </template>
    <div v-if="preview" class="todo-plan-preview__content">
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
        <div v-if="resources.length" class="todo-plan-preview__resources">
          <span>{{ t('inbox.todoResourceRefs', { count: resources.length }) }}</span>
          <div>
            <span v-for="resource in resources.slice(0, 3)" :key="`${resource.type}:${resource.id}`">
              {{ resource.title }}
            </span>
          </div>
        </div>
      </section>
      <section class="todo-plan-preview__schedule">
        <strong>{{ preview.displaySummary.title }}</strong>
        <p>{{ preview.displaySummary.range }}</p>
        <p v-if="preview.displaySummary.timing">{{ preview.displaySummary.timing }}</p>
        <p>{{ preview.displaySummary.reminder }}</p>
      </section>
      <dl>
        <div>
          <dt>{{ t('inbox.todoPlanPreviewTasks') }}</dt>
          <dd>{{ preview.occurrenceCount ?? `${preview.generatedNowCount}+` }}</dd>
        </div>
        <div>
          <dt>{{ t('inbox.todoPlanPreviewReminderJobs') }}</dt>
          <dd>{{ preview.reminderJobCount }}</dd>
        </div>
        <div>
          <dt>{{ t('inbox.todoPlanPreviewNextReminder') }}</dt>
          <dd>{{ preview.nextReminderAt || t('inbox.todoReminderNone') }}</dd>
        </div>
      </dl>
    </div>
    <div v-else class="todo-plan-preview__empty">
      <strong>{{ fallbackTitle }}</strong>
      <p>{{ error || t('inbox.todoPlanPreviewFillHint') }}</p>
    </div>
  </BCard>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import type { TodoChecklistItem, TodoPlanPreview, TodoPriority, TodoResourceRefView } from '@/api/todoApi';

  const props = withDefaults(
    defineProps<{
      preview?: TodoPlanPreview | null;
      loading?: boolean;
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
  const { t } = useI18n();
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

  .todo-plan-preview__loading {
    color: var(--primary-color);
    font-size: 12px;
  }

  .todo-plan-preview__content,
  .todo-plan-preview__empty {
    display: grid;
    gap: 12px;
  }

  .todo-plan-preview__empty > strong {
    font-size: 18px;
    line-height: 1.4;
  }

  .todo-plan-preview__task {
    display: grid;
    gap: 10px;
    padding: 13px;
    border: 1px solid var(--surface-border-color);
    border-radius: 13px;
    background: var(--workspace-panel-bg-color);
  }

  .todo-plan-preview__task-head,
  .todo-plan-preview__subhead {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }

  .todo-plan-preview__task-head > strong {
    min-width: 0;
    color: var(--text-color);
    font-size: 16px;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }

  .todo-plan-preview__priority {
    flex: 0 0 auto;
    padding: 2px 8px;
    border: 1px solid var(--surface-border-color);
    border-radius: 999px;
    color: var(--desc-color);
    background: var(--card-background);
    font-size: 11px;
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
    gap: 7px;
  }

  .todo-plan-preview__subhead > span,
  .todo-plan-preview__resources > span {
    color: var(--text-color);
    font-size: 12px;
    font-weight: 700;
  }

  .todo-plan-preview__subhead small,
  .todo-plan-preview__more {
    color: var(--desc-color);
    font-size: 11px;
  }

  .todo-plan-preview__checklist ul {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .todo-plan-preview__checklist li {
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr);
    align-items: start;
    gap: 7px;
    color: var(--text-color);
    font-size: 12px;
  }

  .todo-plan-preview__checklist li > span {
    display: grid;
    width: 14px;
    height: 14px;
    place-items: center;
    margin-top: 1px;
    border: 1px solid var(--surface-border-color);
    border-radius: 4px;
    color: #fff;
    font-size: 10px;
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
    gap: 5px;
  }

  .todo-plan-preview__resources > div > span {
    max-width: 100%;
    overflow: hidden;
    padding: 3px 7px;
    border-radius: 999px;
    background: var(--card-background);
    color: var(--desc-color);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .todo-plan-preview__schedule {
    padding: 2px 1px;
  }

  .todo-plan-preview__schedule > strong {
    color: var(--text-color);
    font-size: 16px;
    line-height: 1.4;
  }

  p {
    margin: 0;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.65;
  }

  dl {
    display: grid;
    gap: 10px;
    margin: 0;
    padding-top: 14px;
    border-top: 1px solid var(--surface-divider-color);
  }

  dl > div {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }

  dt {
    color: var(--desc-color);
    font-size: 12px;
  }

  dd {
    margin: 0;
    color: var(--text-color);
    font-size: 13px;
    font-weight: 650;
    text-align: right;
  }
</style>
