<template>
  <section class="todo-matrix" :aria-label="t('inbox.todoMatrixLabel')">
    <p class="todo-matrix__guide">{{ t('inbox.todoMatrixGuide') }}</p>
    <section
      v-for="quadrant in quadrants"
      :key="quadrant.key"
      class="todo-matrix__quadrant"
      :class="`is-${quadrant.key}`"
    >
      <header class="todo-matrix__header">
        <div class="todo-matrix__heading">
          <span class="todo-matrix__dot" aria-hidden="true"></span>
          <strong>{{ t(`inbox.todoMatrixQuadrants.${quadrant.key}`) }}</strong>
        </div>
        <span class="todo-matrix__count" :aria-label="t('inbox.todoMatrixCount', { count: quadrant.items.length })">
          {{ quadrant.items.length }}
        </span>
      </header>
      <p class="todo-matrix__description">{{ t(`inbox.todoMatrixDescriptions.${quadrant.key}`) }}</p>

      <div v-if="quadrant.items.length" class="todo-matrix__items">
        <article
          v-for="item in quadrant.items"
          :key="item.id"
          class="todo-matrix-card"
          :class="{ 'is-completed': item.status === 'completed' }"
        >
          <BCheckbox
            class="todo-matrix-card__checkbox"
            :model-value="item.status === 'completed'"
            :disabled="disabled"
            :aria-label="t('inbox.todoSelect', { title: item.title })"
            @update:model-value="emit('toggle-complete', item, $event)"
          />
          <BButton
            class="todo-matrix-card__content"
            :disabled="disabled"
            :title="item.title"
            @click="emit('edit', item)"
          >
            <span class="todo-matrix-card__title">{{ item.title }}</span>
            <span class="todo-matrix-card__meta">
              <span class="todo-matrix-card__priority" :class="`is-priority-${item.priority}`">
                {{ t(`inbox.todoPriority${item.priority}`) }}
              </span>
              <span v-if="dueLabel(item)" class="todo-matrix-card__due" :class="{ 'is-overdue': isOverdue(item) }">
                {{ dueLabel(item) }}
              </span>
            </span>
          </BButton>
          <BButton
            class="todo-matrix-card__delete"
            type="danger"
            size="small"
            :disabled="disabled"
            :loading="deletingId === item.id"
            :aria-label="t('inbox.deleteTodo')"
            @click="emit('delete', item)"
          >
            {{ t('common.delete') }}
          </BButton>
        </article>
      </div>
      <p v-else class="todo-matrix__empty">{{ t('inbox.todoMatrixEmpty') }}</p>
    </section>
  </section>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { TodoItem } from '@/api/todoApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import { formatTodoDateTime, parseTodoDate } from '@/utils/todoPlanning';
  import { groupTodosByMatrix, TODO_MATRIX_QUADRANT_ORDER } from '@/utils/todoMatrix';

  const props = defineProps<{
    items: TodoItem[];
    disabled?: boolean;
    deletingId?: string;
  }>();
  const emit = defineEmits<{
    edit: [item: TodoItem];
    delete: [item: TodoItem];
    'toggle-complete': [item: TodoItem, completed: boolean];
  }>();
  const { t, locale } = useI18n();
  const matrixNow = ref(new Date());
  let midnightTimer = 0;

  const groupedItems = computed(() => groupTodosByMatrix(props.items, matrixNow.value));
  const quadrants = computed(() =>
    TODO_MATRIX_QUADRANT_ORDER.map((key) => ({
      key,
      items: groupedItems.value[key],
    })),
  );

  function isOverdue(item: TodoItem) {
    if (item.status !== 'pending' || !item.dueAt) return false;
    const dueAt = parseTodoDate(item.dueAt).getTime();
    return Number.isFinite(dueAt) && dueAt < matrixNow.value.getTime();
  }

  function dueLabel(item: TodoItem) {
    if (!item.dueAt) return '';
    const value = formatTodoDateTime(item.dueAt, locale.value, {
      relative: true,
      includeYear: false,
      now: matrixNow.value,
      relativeLabels: {
        today: t('inbox.todoToday'),
        tomorrow: t('inbox.todoTomorrow'),
      },
    });
    if (!value) return '';
    return isOverdue(item) ? t('inbox.todoOverdue', { time: value }) : t('inbox.todoDue', { time: value });
  }

  function scheduleNextDayRefresh() {
    const now = new Date();
    const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 100);
    midnightTimer = window.setTimeout(() => {
      matrixNow.value = new Date();
      scheduleNextDayRefresh();
    }, nextDay.getTime() - now.getTime());
  }

  onMounted(scheduleNextDayRefresh);
  onBeforeUnmount(() => window.clearTimeout(midnightTimer));
</script>

<style scoped lang="less">
  .todo-matrix {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    padding: 6px 2px 24px;
  }

  .todo-matrix__guide {
    grid-column: 1 / -1;
    margin: 0;
    padding: 10px 13px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--workspace-panel-bg-color);
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.6;
  }

  .todo-matrix__quadrant {
    --matrix-accent: var(--todo-matrix-other-not-urgent-accent);
    --matrix-border: var(--todo-matrix-other-not-urgent-border);
    --matrix-background: var(--todo-matrix-other-not-urgent-bg);
    min-width: 0;
    min-height: 230px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    padding: 13px;
    border: 1px solid var(--matrix-border);
    border-top: 4px solid var(--matrix-accent);
    border-radius: 17px;
    background: var(--matrix-background);
  }

  .todo-matrix__quadrant.is-importantUrgent {
    --matrix-accent: var(--todo-matrix-important-urgent-accent);
    --matrix-border: var(--todo-matrix-important-urgent-border);
    --matrix-background: var(--todo-matrix-important-urgent-bg);
  }

  .todo-matrix__quadrant.is-importantNotUrgent {
    --matrix-accent: var(--todo-matrix-important-not-urgent-accent);
    --matrix-border: var(--todo-matrix-important-not-urgent-border);
    --matrix-background: var(--todo-matrix-important-not-urgent-bg);
  }

  .todo-matrix__quadrant.is-otherUrgent {
    --matrix-accent: var(--todo-matrix-other-urgent-accent);
    --matrix-border: var(--todo-matrix-other-urgent-border);
    --matrix-background: var(--todo-matrix-other-urgent-bg);
  }

  .todo-matrix__header,
  .todo-matrix__heading {
    display: flex;
    align-items: center;
  }

  .todo-matrix__header {
    justify-content: space-between;
    gap: 10px;
  }

  .todo-matrix__heading {
    min-width: 0;
    gap: 7px;
  }

  .todo-matrix__heading strong {
    min-width: 0;
    color: var(--text-color);
    font-size: 14px;
    line-height: 1.35;
  }

  .todo-matrix__dot {
    width: 8px;
    height: 8px;
    flex: 0 0 auto;
    border-radius: 999px;
    background: var(--matrix-accent);
  }

  .todo-matrix__count {
    min-width: 24px;
    box-sizing: border-box;
    flex: 0 0 auto;
    padding: 2px 7px;
    border: 1px solid var(--matrix-border);
    border-radius: 999px;
    background: var(--card-background);
    color: var(--matrix-accent);
    font-size: 11px;
    line-height: 17px;
    text-align: center;
  }

  .todo-matrix__description {
    margin: 4px 0 11px 15px;
    color: var(--desc-color);
    font-size: 11px;
    line-height: 1.45;
  }

  .todo-matrix__items {
    display: grid;
    gap: 8px;
  }

  .todo-matrix__empty {
    min-height: 92px;
    margin: 0;
    display: grid;
    flex: 1;
    place-items: center;
    color: var(--desc-color);
    font-size: 12px;
    text-align: center;
  }

  .todo-matrix-card {
    min-width: 0;
    min-height: 58px;
    box-sizing: border-box;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 7px;
    padding: 7px 8px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--card-background);
  }

  .todo-matrix-card__checkbox {
    flex: 0 0 auto;
  }

  .todo-matrix-card :deep(.todo-matrix-card__content) {
    width: 100%;
    height: auto;
    min-height: 42px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 4px;
    padding: 2px 0;
    overflow: hidden;
    border-radius: 5px;
    background: transparent;
    color: var(--text-color);
    line-height: 1.35;
    text-align: left;
    white-space: normal;
  }

  .todo-matrix-card :deep(.todo-matrix-card__content:hover) {
    background: transparent;
  }

  .todo-matrix-card__title {
    width: 100%;
    overflow: hidden;
    color: var(--text-color);
    font-size: 13px;
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .todo-matrix-card__meta {
    width: 100%;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    overflow: hidden;
    color: var(--desc-color);
    font-size: 10px;
  }

  .todo-matrix-card__priority {
    flex: 0 0 auto;
    color: var(--desc-color);
  }

  .todo-matrix-card__priority.is-priority-2,
  .todo-matrix-card__due.is-overdue {
    color: var(--danger-color, #d83c45);
  }

  .todo-matrix-card__due {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .todo-matrix-card :deep(.todo-matrix-card__delete) {
    min-width: 42px;
    min-height: 32px;
    height: 32px;
    padding: 0 8px;
  }

  .todo-matrix-card.is-completed .todo-matrix-card__title {
    color: var(--disabled-text-color);
    text-decoration: line-through;
  }

  @media (max-width: 767px) {
    .todo-matrix {
      grid-template-columns: minmax(0, 1fr);
      gap: 14px;
      padding: 0 0 18px;
    }

    .todo-matrix__guide {
      grid-column: auto;
    }

    .todo-matrix__quadrant {
      min-height: 0;
      padding: 12px;
      border-radius: 16px;
    }

    .todo-matrix-card {
      min-height: 68px;
      padding: 8px;
    }

    .todo-matrix-card :deep(.todo-matrix-card__content),
    .todo-matrix-card :deep(.todo-matrix-card__delete) {
      min-height: 44px;
    }

    .todo-matrix-card :deep(.todo-matrix-card__delete) {
      height: 44px;
    }
  }
</style>
