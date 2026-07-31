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

    <p v-if="!scheduledItems.length" class="todo-schedule-empty">{{ t('inbox.todoScheduleEmpty') }}</p>

    <div v-if="view === 'calendar'" class="todo-calendar-grid">
      <span v-for="label in weekdayLabels" :key="label" class="todo-calendar-weekday">{{ label }}</span>
      <div
        v-for="day in calendarDays"
        :key="day.key"
        class="todo-calendar-day"
        :class="{
          'is-outside': !day.currentMonth,
          'is-today': day.today,
          'is-selected': day.key === selectedDayKey,
          'has-items': day.items.length > 0,
        }"
        @click="selectDay(day)"
      >
        <span>{{ day.date.getDate() }}</span>
        <BButton
          v-for="item in day.items.slice(0, 3)"
          :key="item.id"
          class="todo-calendar-item"
          :class="[`is-priority-${item.priority}`, todoStateClass(item)]"
          :title="calendarItemTitle(item)"
          @click="$emit('edit', item)"
        >
          <span class="todo-calendar-item__main">
            <time :datetime="item.dueAt || undefined">{{ dueTime(item) }}</time>
            <strong>{{ item.title }}</strong>
          </span>
          <span class="todo-calendar-item__meta">
            <small :class="todoStateClass(item)">{{ todoStateLabel(item) }}</small>
            <small>{{ t(`inbox.todoPriority${item.priority}`) }}</small>
          </span>
        </BButton>
        <small v-if="day.items.length > 3">{{ t('inbox.todoMoreInDay', { count: day.items.length - 3 }) }}</small>
      </div>
    </div>

    <!-- 选中某天后就地展开当天全部待办:窄屏格子放不下标题,不该逼用户开编辑弹框才知道是什么 -->
    <section v-if="view === 'calendar' && selectedDay" class="todo-calendar-daylist">
      <header>
        <strong>{{ selectedDayLabel }}</strong>
        <span>{{ t('inbox.todoDayCount', { count: selectedDay.items.length }) }}</span>
      </header>
      <p v-if="!selectedDay.items.length" class="todo-calendar-daylist__empty">
        {{ t('inbox.todoDayEmpty') }}
      </p>
      <BButton
        v-for="item in selectedDay.items"
        :key="item.id"
        class="todo-calendar-dayitem"
        :class="todoStateClass(item)"
        @click="$emit('edit', item)"
      >
        <span class="todo-calendar-dayitem__priority" :class="`is-priority-${item.priority}`"></span>
        <span class="todo-calendar-dayitem__content">
          <strong>{{ item.title }}</strong>
          <span class="todo-calendar-dayitem__meta">
            <small>{{ dueTime(item) }}</small>
            <small :class="todoStateClass(item)">{{ todoStateLabel(item) }}</small>
          </span>
        </span>
      </BButton>
    </section>

    <div v-else class="todo-agenda">
      <article v-for="entry in agendaItems" :key="entry.item.id" class="todo-agenda-item">
        <time :datetime="entry.item.dueAt || undefined">
          <strong>{{ entry.day }}</strong>
          <span>{{ entry.time }}</span>
        </time>
        <BButton
          class="todo-agenda-card"
          :class="todoStateClass(entry.item)"
          @click="$emit('edit', entry.item)"
        >
          <span class="todo-agenda-card__priority" :class="`is-priority-${entry.item.priority}`"></span>
          <span class="todo-agenda-card__content">
            <strong>{{ entry.item.title }}</strong>
            <span class="todo-agenda-card__meta">
              <small :class="todoStateClass(entry.item)">{{ todoStateLabel(entry.item) }}</small>
              <small>{{ t(`inbox.todoPriority${entry.item.priority}`) }}</small>
            </span>
          </span>
        </BButton>
      </article>
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
  const selectedDayKey = ref('');

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
  const scheduledItems = computed(() =>
    props.items.filter((item) => item.dueAt && Number.isFinite(parseDate(item.dueAt).getTime())),
  );
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
        items: scheduledItems.value.filter((item) => dateKey(parseDate(item.dueAt as string)) === key),
      };
    });
  });
  const agendaItems = computed(() =>
    [...scheduledItems.value]
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

  const selectedDay = computed(() => calendarDays.value.find((day) => day.key === selectedDayKey.value) || null);
  const selectedDayLabel = computed(() =>
    selectedDay.value
      ? new Intl.DateTimeFormat(locale.value, { month: 'long', day: 'numeric', weekday: 'long' }).format(
          selectedDay.value.date,
        )
      : '',
  );

  function selectDay(day: { key: string }) {
    selectedDayKey.value = selectedDayKey.value === day.key ? '' : day.key;
  }
  function dateKey(date: Date) {
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  }
  function dueTime(item: TodoItem) {
    if (!item.dueAt) return '';
    const date = parseDate(item.dueAt);
    if (!Number.isFinite(date.getTime())) return '';
    return new Intl.DateTimeFormat(locale.value, { hour: '2-digit', minute: '2-digit' }).format(date);
  }
  function isOverdue(item: TodoItem) {
    if (item.status !== 'pending' || !item.dueAt) return false;
    const dueAt = parseDate(item.dueAt).getTime();
    return Number.isFinite(dueAt) && dueAt < Date.now();
  }
  function todoStateClass(item: TodoItem) {
    if (item.status === 'completed') return 'is-completed';
    return isOverdue(item) ? 'is-overdue' : 'is-pending';
  }
  function todoStateLabel(item: TodoItem) {
    if (item.status === 'completed') return t('inbox.todoCompleted');
    return t(isOverdue(item) ? 'inbox.todoGroups.overdue' : 'inbox.todoPending');
  }
  function calendarItemTitle(item: TodoItem) {
    return [dueTime(item), todoStateLabel(item), t(`inbox.todoPriority${item.priority}`), item.title]
      .filter(Boolean)
      .join(' · ');
  }
  function moveMonth(step: number) {
    visibleMonth.value = new Date(visibleMonth.value.getFullYear(), visibleMonth.value.getMonth() + step, 1);
    selectedDayKey.value = '';
  }
</script>

<style scoped lang="less">
  /* 日历视图直接贴在滚动容器顶沿,补出与列表视图一致的上留白 */
  .todo-calendar-head {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin-bottom: 12px;
    padding-top: 10px;
  }
  .todo-calendar-head :deep(.b_btn) {
    min-width: 36px;
    height: 36px;
    padding: 0;
  }
  .todo-calendar-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    align-content: start;
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
    min-height: 42px;
    margin: 3px 0;
    padding: 4px 5px;
    overflow: hidden;
    border-left: 3px solid var(--primary-color);
    line-height: 1.2;
    text-align: left;
  }
  .todo-calendar-item__main {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 4px;
  }
  .todo-calendar-item__main time {
    flex: 0 0 auto;
    color: var(--desc-color);
    font-size: 9px;
    font-variant-numeric: tabular-nums;
  }
  .todo-calendar-item__main strong {
    min-width: 0;
    overflow: hidden;
    color: var(--text-color);
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .todo-calendar-item__meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    margin-top: 2px;
  }
  .todo-calendar-item__meta small {
    overflow: hidden;
    font-size: 8px;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .todo-calendar-item__meta small.is-overdue,
  .todo-agenda-card__meta small.is-overdue {
    color: var(--danger-color, #e5484d);
  }
  .todo-calendar-item__meta small.is-completed,
  .todo-agenda-card__meta small.is-completed {
    color: var(--success-color, #2e8b57);
  }
  .todo-calendar-day.is-selected {
    border-color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 7%, var(--background-color));
  }
  .todo-calendar-day.has-items {
    cursor: pointer;
  }

  .todo-calendar-daylist {
    display: grid;
    gap: 6px;
    margin-top: 12px;
    padding: 12px;
    border: 1px solid var(--surface-border-color, var(--card-border-color));
    border-radius: 12px;
    background: var(--background-color);
  }
  .todo-calendar-daylist > header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;

    strong {
      color: var(--text-color);
      font-size: 13px;
    }

    span {
      color: var(--desc-color);
      font-size: 11px;
    }
  }
  .todo-calendar-daylist__empty {
    margin: 0;
    color: var(--desc-color);
    font-size: 12px;
  }
  .todo-calendar-dayitem {
    display: flex;
    width: 100%;
    height: auto;
    min-height: 40px;
    align-items: center;
    justify-content: flex-start;
    gap: 8px;
    padding: 7px 9px;
    border: 1px solid var(--card-border-color);
    border-radius: 10px;
    background: color-mix(in srgb, var(--primary-color) 4%, transparent) !important;
    text-align: left;
  }
  .todo-calendar-dayitem__priority {
    width: 3px;
    height: 22px;
    flex: 0 0 auto;
    border-radius: 999px;
    background: var(--primary-color);

    &.is-priority-2 {
      background: var(--danger-color, #e5484d);
    }

    &.is-priority-0 {
      background: var(--desc-color);
    }
  }
  .todo-calendar-dayitem__content {
    display: grid;
    min-width: 0;
    gap: 2px;

    > strong {
      overflow: hidden;
      color: var(--text-color);
      font-size: 13px;
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
  .todo-calendar-dayitem.is-completed .todo-calendar-dayitem__content > strong {
    color: var(--desc-color);
    text-decoration: line-through;
  }
  .todo-calendar-dayitem__meta {
    display: flex;
    gap: 8px;
    color: var(--desc-color);
    font-size: 11px;
  }

  .todo-calendar-item.is-priority-2 {
    border-left-color: var(--danger-color, #e5484d);
  }
  .todo-agenda-card__priority.is-priority-2 {
    background: var(--danger-color, #e5484d);
  }
  .todo-calendar-item.is-priority-0 {
    border-left-color: var(--desc-color);
  }
  .todo-agenda-card__priority.is-priority-0 {
    background: var(--desc-color);
  }
  .todo-calendar-item.is-overdue,
  .todo-agenda-card.is-overdue {
    background: color-mix(in srgb, var(--danger-color, #e5484d) 5%, var(--background-color));
  }
  .todo-calendar-item.is-completed {
    border-left-color: var(--success-color, #2e8b57);
    opacity: 0.76;
  }
  .todo-calendar-item.is-completed .todo-calendar-item__main strong,
  .todo-agenda-card.is-completed .todo-agenda-card__content > strong {
    color: var(--desc-color);
    text-decoration: line-through;
  }
  .todo-calendar-day small {
    color: var(--desc-color);
    font-size: 9px;
  }
  .todo-agenda {
    display: grid;
    gap: 8px;
    padding: 14px 18px 24px;
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
  .todo-schedule-view .todo-agenda-card {
    width: 100%;
    height: auto;
    min-height: 60px;
    padding: 9px 14px;
    box-sizing: border-box;
    justify-content: flex-start;
    gap: 8px;
    line-height: 1.3;
    text-align: left;
  }
  .todo-agenda-card__priority {
    width: 7px;
    height: 7px;
    flex: 0 0 7px;
    border-radius: 50%;
    background: var(--primary-color);
  }
  .todo-agenda-card__content {
    display: grid;
    min-width: 0;
    flex: 1;
    gap: 3px;
  }
  .todo-agenda-card__content > strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .todo-agenda-card__meta {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .todo-agenda-card__meta small {
    color: var(--desc-color);
    font-size: 10px;
  }
  .todo-schedule-empty {
    margin: 0 18px 10px;
    padding: 10px 12px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--primary-color) 4%, var(--background-color));
    color: var(--desc-color);
    font-size: 12px;
    text-align: center;
  }
  @media (max-width: 767px) {
    .todo-calendar-grid {
      min-width: 0;
      grid-auto-rows: 82px;
      gap: 3px;
    }
    .todo-schedule-view {
      overflow-x: hidden;
    }
    .todo-calendar-weekday {
      padding: 3px 1px;
      font-size: 9px;
    }
    .todo-calendar-day {
      height: 82px;
      min-height: 82px;
      padding: 3px;
      box-sizing: border-box;
      overflow: hidden;
      border-radius: 8px;
    }
    .todo-calendar-day > span {
      font-size: 10px;
    }
    .todo-calendar-item {
      min-height: 20px;
      padding: 2px;
      border-left-width: 2px;
    }
    /* 窄格里「是什么」比「几点」重要:保留标题,时间与状态交给下方选中日详情 */
    .todo-calendar-item__main time,
    .todo-calendar-item__meta {
      display: none;
    }
    .todo-calendar-item__main strong {
      font-size: 9px;
      line-height: 1.15;
    }
    .todo-agenda-item {
      grid-template-columns: 86px minmax(0, 1fr);
    }
    .todo-agenda {
      padding: 12px 14px 20px;
    }
    .todo-schedule-empty {
      margin: 0 14px 8px;
      padding: 8px 10px;
    }
  }
</style>
