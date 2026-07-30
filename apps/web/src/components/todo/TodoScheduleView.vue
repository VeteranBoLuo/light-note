<template>
  <section class="todo-schedule-view">
    <header v-if="view === 'calendar'" class="todo-calendar-head">
      <BButton :aria-label="t('inbox.todoPreviousMonth')" @click="moveMonth(-1)">
        <SvgIcon :src="icon.arrow_left" size="15" aria-hidden="true" />
      </BButton>
      <strong>{{ monthLabel }}</strong>
      <BButton :aria-label="t('inbox.todoNextMonth')" @click="moveMonth(1)">
        <SvgIcon :src="icon.arrow_right" size="15" aria-hidden="true" />
      </BButton>
    </header>

    <div v-if="view === 'calendar'" class="todo-calendar-grid">
      <span v-for="label in weekdayLabels" :key="label" class="todo-calendar-weekday">{{ label }}</span>
      <div
        v-for="day in calendarDays"
        :key="day.key"
        class="todo-calendar-day"
        :class="{ 'is-outside': !day.currentMonth, 'is-today': day.today }"
      >
        <span>{{ day.date.getDate() }}</span>
        <BButton
          v-for="item in day.items.slice(0, 3)"
          :key="item.id"
          class="todo-calendar-item"
          :class="`is-priority-${item.priority}`"
          :title="item.title"
          @click="$emit('edit', item)"
        >
          {{ item.title }}
        </BButton>
        <small v-if="day.items.length > 3">{{ t('inbox.todoMoreInDay', { count: day.items.length - 3 }) }}</small>
      </div>
    </div>

    <div v-else class="todo-agenda">
      <article v-for="entry in agendaItems" :key="entry.item.id" class="todo-agenda-item">
        <time :datetime="entry.item.dueAt || undefined">
          <strong>{{ entry.day }}</strong>
          <span>{{ entry.time }}</span>
        </time>
        <BButton class="todo-agenda-card" @click="$emit('edit', entry.item)">
          <span :class="`is-priority-${entry.item.priority}`"></span>
          <strong>{{ entry.item.title }}</strong>
          <small>{{ t(`inbox.todoPriority${entry.item.priority}`) }}</small>
        </BButton>
      </article>
      <p v-if="!agendaItems.length" class="todo-schedule-empty">{{ t('inbox.todoScheduleEmpty') }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import type { TodoItem } from '@/api/todoApi';

  const props = defineProps<{ items: TodoItem[]; view: 'agenda' | 'calendar' }>();
  defineEmits<{ edit: [item: TodoItem] }>();
  const { t, locale } = useI18n();
  const visibleMonth = ref(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  const parseDate = (value: string) => new Date(String(value).replace(' ', 'T'));
  const monthLabel = computed(() =>
    new Intl.DateTimeFormat(locale.value, { year: 'numeric', month: 'long' }).format(visibleMonth.value),
  );
  const weekdayLabels = computed(() => {
    const formatter = new Intl.DateTimeFormat(locale.value, { weekday: 'short' });
    const monday = new Date(2026, 0, 5);
    return Array.from({ length: 7 }, (_, index) =>
      formatter.format(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index)),
    );
  });
  const calendarDays = computed(() => {
    const first = visibleMonth.value;
    const mondayOffset = (first.getDay() + 6) % 7;
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - mondayOffset);
    const todayKey = dateKey(new Date());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
      const key = dateKey(date);
      return {
        key,
        date,
        currentMonth: date.getMonth() === first.getMonth(),
        today: key === todayKey,
        items: props.items.filter((item) => item.dueAt && dateKey(parseDate(item.dueAt)) === key),
      };
    });
  });
  const agendaItems = computed(() =>
    props.items
      .filter((item) => item.dueAt && Number.isFinite(parseDate(item.dueAt).getTime()))
      .sort((left, right) => parseDate(left.dueAt as string).getTime() - parseDate(right.dueAt as string).getTime())
      .map((item) => {
        const date = parseDate(item.dueAt as string);
        return {
          item,
          day: new Intl.DateTimeFormat(locale.value, { month: 'short', day: 'numeric', weekday: 'short' }).format(date),
          time: new Intl.DateTimeFormat(locale.value, { hour: '2-digit', minute: '2-digit' }).format(date),
        };
      }),
  );

  function dateKey(date: Date) {
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  }
  function moveMonth(step: number) {
    visibleMonth.value = new Date(visibleMonth.value.getFullYear(), visibleMonth.value.getMonth() + step, 1);
  }
</script>

<style scoped lang="less">
  .todo-calendar-head {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin-bottom: 10px;
  }
  .todo-calendar-head :deep(.b_btn) {
    min-width: 36px;
    height: 36px;
    padding: 0;
  }
  .todo-calendar-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 5px;
  }
  .todo-calendar-weekday {
    padding: 5px;
    color: var(--desc-color);
    font-size: 11px;
    text-align: center;
  }
  .todo-calendar-day {
    min-height: 104px;
    padding: 6px;
    border: 1px solid var(--surface-border-color, var(--card-border-color));
    border-radius: 10px;
    background: var(--background-color);
  }
  .todo-calendar-day > span {
    display: block;
    margin-bottom: 4px;
    color: var(--desc-color);
    font-size: 11px;
  }
  .todo-calendar-day.is-outside {
    opacity: 0.42;
  }
  .todo-calendar-day.is-today {
    border-color: var(--primary-color);
  }
  .todo-calendar-item {
    display: block;
    width: 100%;
    height: auto;
    min-height: 24px;
    margin: 3px 0;
    padding: 3px 5px;
    overflow: hidden;
    border-left: 3px solid var(--primary-color);
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .todo-calendar-item.is-priority-2,
  .todo-agenda-card > span.is-priority-2 {
    border-color: var(--danger-color, #e5484d);
    background: var(--danger-color, #e5484d);
  }
  .todo-calendar-item.is-priority-0,
  .todo-agenda-card > span.is-priority-0 {
    border-color: var(--desc-color);
    background: var(--desc-color);
  }
  .todo-calendar-day small {
    color: var(--desc-color);
    font-size: 9px;
  }
  .todo-agenda {
    display: grid;
    gap: 8px;
    padding: 10px 14px 22px;
    box-sizing: border-box;
  }
  .todo-agenda-item {
    display: grid;
    grid-template-columns: 110px minmax(0, 1fr);
    gap: 10px;
    align-items: stretch;
  }
  .todo-agenda-item time {
    display: grid;
    align-content: center;
    color: var(--desc-color);
    font-size: 11px;
  }
  .todo-agenda-card {
    width: 100%;
    min-height: 48px;
    justify-content: flex-start;
    gap: 8px;
  }
  .todo-agenda-card > span {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--primary-color);
  }
  .todo-agenda-card small {
    margin-left: auto;
    color: var(--desc-color);
  }
  .todo-schedule-empty {
    padding: 28px;
    color: var(--desc-color);
    text-align: center;
  }
  @media (max-width: 767px) {
    .todo-calendar-grid {
      min-width: 700px;
    }
    .todo-schedule-view {
      overflow-x: auto;
    }
    .todo-agenda-item {
      grid-template-columns: 86px minmax(0, 1fr);
    }
    .todo-agenda {
      padding: 8px 10px 18px;
    }
  }
</style>
