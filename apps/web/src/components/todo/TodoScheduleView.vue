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
        <span
          ><b class="todo-calendar-daynum">{{ day.date.getDate() }}</b></span
        >
        <BButton
          v-for="item in day.items.slice(0, 3)"
          :key="item.id"
          class="todo-calendar-item"
          :class="[`is-priority-${item.priority}`, todoStateClass(item)]"
          :title="calendarItemTitle(item)"
          @click.stop="activateCalendarItem(day, item)"
        >
          <span class="todo-calendar-item__main">
            <time :datetime="itemDateTime(item) || undefined">{{ scheduleTime(item) }}</time>
            <strong>{{ item.title }}</strong>
          </span>
          <span class="todo-calendar-item__meta">
            <small v-if="isScheduledSeries(item)" class="is-series">
              <SvgIcon :src="icon.todo.repeat" size="11" aria-hidden="true" />
              {{ t('inbox.todoRecurringInstance') }}
            </small>
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
      <MobileSwipeDelete
        v-for="item in selectedDay.items"
        :key="item.id"
        class="todo-calendar-dayitem-swipe"
        :enabled="swipeEnabled"
        :open="openSwipeId === item.id"
        :disabled="disabled"
        :loading="deletingId === item.id"
        :label="t('inbox.deleteTodo')"
        allow-interactive-start
        @swipe-start="beginSwipe(item.id)"
        @update:open="updateSwipe(item.id, $event)"
        @delete="deleteFromSwipe(item)"
      >
        <BButton class="todo-calendar-dayitem" :class="todoStateClass(item)" @click="$emit('preview', item)">
          <span class="todo-calendar-dayitem__priority" :class="`is-priority-${item.priority}`"></span>
          <span class="todo-calendar-dayitem__content">
            <strong>{{ item.title }}</strong>
            <span class="todo-calendar-dayitem__meta">
              <small>{{ scheduleTime(item) }}</small>
              <small :class="todoStateClass(item)">{{ todoStateLabel(item) }}</small>
            </span>
          </span>
        </BButton>
      </MobileSwipeDelete>
    </section>

    <div v-else class="todo-agenda">
      <article v-for="entry in agendaItems" :key="entry.item.id" class="todo-agenda-item">
        <time :datetime="itemDateTime(entry.item) || undefined">
          <strong>{{ entry.day }}</strong>
          <span>{{ entry.time }}</span>
        </time>
        <MobileSwipeDelete
          class="todo-agenda-card-swipe"
          :enabled="swipeEnabled"
          :open="openSwipeId === entry.item.id"
          :disabled="disabled"
          :loading="deletingId === entry.item.id"
          :label="t('inbox.deleteTodo')"
          allow-interactive-start
          @swipe-start="beginSwipe(entry.item.id)"
          @update:open="updateSwipe(entry.item.id, $event)"
          @delete="deleteFromSwipe(entry.item)"
        >
          <BButton class="todo-agenda-card" :class="todoStateClass(entry.item)" @click="$emit('preview', entry.item)">
            <span class="todo-agenda-card__priority" :class="`is-priority-${entry.item.priority}`"></span>
            <span class="todo-agenda-card__content">
              <strong>{{ entry.item.title }}</strong>
              <span class="todo-agenda-card__meta">
                <small v-if="entry.seriesId" class="is-series">
                  <SvgIcon :src="icon.todo.repeat" size="12" aria-hidden="true" />
                  {{
                    entry.missedCount
                      ? t('inbox.todoAgendaMissedSeries', { count: entry.missedCount })
                      : t('inbox.todoRecurringInstance')
                  }}
                </small>
                <small :class="todoStateClass(entry.item)">{{ todoStateLabel(entry.item) }}</small>
                <small>{{ t(`inbox.todoPriority${entry.item.priority}`) }}</small>
              </span>
            </span>
          </BButton>
        </MobileSwipeDelete>
      </article>
      <BButton v-if="agendaHasMore" class="todo-agenda__more" @click="agendaHorizonDays += 14">
        {{ t('inbox.todoAgendaLoadMore') }}
      </BButton>
    </div>
  </section>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import MobileSwipeDelete from '@/components/mobile/MobileSwipeDelete.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { bookmarkStore } from '@/store';
  import type { TodoItem } from '@/api/todoApi';
  import { isTodoOverdue, normalizeTodoDateOnly, todoScheduleAt } from '@/utils/todoPlanning';
  import { buildTodoAgendaEntries } from '@/utils/todoSeriesGrouping';

  const props = defineProps<{
    items: TodoItem[];
    view: 'agenda' | 'calendar';
    swipeEnabled?: boolean;
    disabled?: boolean;
    deletingId?: string;
  }>();
  const emit = defineEmits<{
    preview: [item: TodoItem];
    edit: [item: TodoItem];
    delete: [item: TodoItem];
    'range-change': [range: { startDate: string; endDate: string }];
  }>();
  const bookmark = bookmarkStore();
  const { t, locale } = useI18n();
  const visibleMonth = ref(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const selectedDayKey = ref('');
  const openSwipeId = ref('');
  const agendaHorizonDays = ref(14);
  const scheduleNow = ref(new Date());
  let midnightTimer = 0;

  watch(
    () => [props.disabled, props.items.map((item) => item.id).join(',')],
    () => {
      if (props.disabled || !props.items.some((item) => item.id === openSwipeId.value)) openSwipeId.value = '';
    },
  );
  watch(
    () => props.view,
    () => (openSwipeId.value = ''),
  );

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
    props.items.filter(
      (item) => itemScheduleAt(item) && Number.isFinite(parseDate(itemScheduleAt(item) as string).getTime()),
    ),
  );
  const scheduledItemsByDay = computed(() => {
    const map = new Map<string, TodoItem[]>();
    for (const item of scheduledItems.value) {
      const key = dateKey(parseDate(itemScheduleAt(item) as string));
      const current = map.get(key) || [];
      current.push(item);
      map.set(key, current);
    }
    return map;
  });
  const calendarDays = computed(() => {
    const first = visibleMonth.value;
    const mondayOffset = (first.getDay() + 6) % 7;
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - mondayOffset);
    const todayKey = dateKey(scheduleNow.value);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
      const key = dateKey(date);
      return {
        key,
        date,
        currentMonth: date.getMonth() === first.getMonth(),
        today: key === todayKey,
        items: scheduledItemsByDay.value.get(key) || [],
      };
    });
  });
  watch(
    [() => props.view, visibleMonth],
    () => {
      if (props.view !== 'calendar') return;
      const days = calendarDays.value;
      if (!days.length) return;
      emit('range-change', {
        startDate: isoDateKey(days[0].date),
        endDate: isoDateKey(days.at(-1)!.date),
      });
    },
    { immediate: true },
  );
  const agendaCutoff = computed(() => {
    const now = scheduleNow.value;
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + agendaHorizonDays.value + 1).getTime();
  });
  const agendaProjection = computed(() => buildTodoAgendaEntries(scheduledItems.value, scheduleNow.value));
  const agendaHasMore = computed(() =>
    agendaProjection.value.some((entry) => {
      const value = itemScheduleAt(entry.item);
      return value && parseDate(value).getTime() >= agendaCutoff.value;
    }),
  );
  const agendaItems = computed(() =>
    agendaProjection.value
      .filter((entry) => {
        const value = itemScheduleAt(entry.item);
        return Boolean(value && parseDate(value).getTime() < agendaCutoff.value);
      })
      .map((entry) => {
        const date = parseDate(itemScheduleAt(entry.item) as string);
        return {
          ...entry,
          day: new Intl.DateTimeFormat(locale.value, { month: 'short', day: 'numeric', weekday: 'short' }).format(date),
          time: scheduleTime(entry.item),
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
    openSwipeId.value = '';
    selectedDayKey.value = selectedDayKey.value === day.key ? '' : day.key;
  }
  function beginSwipe(id: string) {
    openSwipeId.value = id;
  }
  function updateSwipe(id: string, open: boolean) {
    if (open) openSwipeId.value = id;
    else if (openSwipeId.value === id) openSwipeId.value = '';
  }
  function deleteFromSwipe(item: TodoItem) {
    openSwipeId.value = '';
    emit('delete', item);
  }
  function closeSwipe() {
    openSwipeId.value = '';
  }
  defineExpose({ closeSwipe });
  /**
   * 窄屏格子只放得下截断的标题,点它应该先展开当天详情看清楚,而不是直接弹编辑框;
   * 桌面格子信息完整,点条目直接打开详情预览。
   */
  function activateCalendarItem(day: { key: string }, item: TodoItem) {
    if (bookmark.isMobile) {
      selectedDayKey.value = day.key;
      return;
    }
    emit('preview', item);
  }
  function dateKey(date: Date) {
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  }
  function isoDateKey(date: Date) {
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
  function itemScheduleAt(item: TodoItem) {
    return todoScheduleAt(item);
  }
  function itemDateTime(item: TodoItem) {
    return item.startAt || item.dueAt || normalizeTodoDateOnly(item.occurrenceDate) || '';
  }
  function scheduleTime(item: TodoItem) {
    if (!item.startAt && !item.dueAt && item.occurrenceDate) return t('inbox.todoAllDay');
    const value = itemScheduleAt(item);
    if (!value) return '';
    const date = parseDate(value);
    if (!Number.isFinite(date.getTime())) return '';
    return new Intl.DateTimeFormat(locale.value, { hour: '2-digit', minute: '2-digit' }).format(date);
  }
  function isOverdue(item: TodoItem) {
    return isTodoOverdue(item, scheduleNow.value);
  }
  function isScheduledSeries(item: TodoItem) {
    return Boolean(item.seriesId && item.series?.repeatMode === 'scheduled');
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
    return [scheduleTime(item), todoStateLabel(item), t(`inbox.todoPriority${item.priority}`), item.title]
      .filter(Boolean)
      .join(' · ');
  }
  function moveMonth(step: number) {
    visibleMonth.value = new Date(visibleMonth.value.getFullYear(), visibleMonth.value.getMonth() + step, 1);
    selectedDayKey.value = '';
  }
  function scheduleMidnightRefresh() {
    const now = new Date();
    const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 100);
    midnightTimer = window.setTimeout(() => {
      scheduleNow.value = new Date();
      scheduleMidnightRefresh();
    }, nextDay.getTime() - now.getTime());
  }
  onMounted(scheduleMidnightRefresh);
  onBeforeUnmount(() => window.clearTimeout(midnightTimer));
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
    gap: 1px;
    overflow: hidden;
    border: 1px solid var(--surface-border-color, var(--card-border-color));
    border-radius: 14px;
    background: var(--surface-border-color, var(--card-border-color));
  }
  .todo-calendar-weekday {
    padding: 7px 5px;
    background: var(--workspace-panel-bg-color, var(--background-color));
    color: var(--desc-color);
    font-size: 11px;
    text-align: center;
  }
  .todo-calendar-day {
    min-height: 104px;
    padding: 6px;
    border: 0;
    border-radius: 0;
    background: var(--card-background, var(--background-color));
  }
  .todo-calendar-day > span {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 4px;
    color: var(--desc-color);
    font-size: 11px;
  }
  .todo-calendar-day.is-outside {
    opacity: 0.42;
  }
  /* 日期数字单独成块,「今天」才能用实心圆底标记(日历通用语义,窄格子里也一眼可见) */
  .todo-calendar-daynum {
    display: inline-flex;
    min-width: 18px;
    height: 18px;
    align-items: center;
    justify-content: center;
    padding: 0 3px;
    box-sizing: border-box;
    border-radius: 999px;
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }
  /**
   * 「今天」的可辨识度不能只靠混色描边与淡底:Android WebView 会把 color-mix() 回退成
   * 稳定主题色(见 src/vite/androidColorMixFallback.ts),淡底会退化成普通页面底色,
   * 混色边框也失去与相邻格子的差异 —— 当天曾只剩一个小圆点。
   * 因此实色主色描边 + 实心圆底日期承担基础标记,淡底只是支持混色时的锦上添花。
   */
  .todo-calendar-day.is-today {
    border-color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 6%, var(--background-color));
  }
  .todo-calendar-day.is-today .todo-calendar-daynum {
    background: var(--primary-color);
    color: #fff;
    font-weight: 700;
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
  .todo-calendar-item__meta small.is-series,
  .todo-agenda-card__meta small.is-series {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    color: var(--primary-color);
    font-weight: 650;
  }
  .todo-calendar-item__meta small.is-overdue,
  .todo-agenda-card__meta small.is-overdue {
    color: var(--danger-color, #e5484d);
  }
  .todo-calendar-item__meta small.is-completed,
  .todo-agenda-card__meta small.is-completed {
    color: var(--success-color, #2e8b57);
  }
  /* 选中日要比「今天」更强:主色描边再加内层一圈实色,混色淡底被回退掉时依然分得清 */
  .todo-calendar-day.is-selected {
    border-color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 13%, var(--background-color));
    box-shadow: inset 0 0 0 1px var(--primary-color);
  }

  .todo-calendar-day.is-selected > span {
    color: var(--primary-color);
    font-weight: 700;
  }
  .todo-calendar-day.has-items {
    cursor: pointer;
  }

  .todo-calendar-daylist {
    display: grid;
    gap: 6px;
    margin-top: 12px;
    padding: 12px;
    border: 0;
    border-radius: 12px;
    background: var(--workspace-panel-bg-color, var(--background-color));
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
    border: 0;
    border-radius: 10px;
    background: color-mix(in srgb, var(--primary-color) 4%, transparent) !important;
    text-align: left;
  }
  .todo-calendar-dayitem-swipe,
  .todo-agenda-card-swipe {
    width: 100%;
  }
  .todo-calendar-dayitem-swipe {
    --swipe-border-radius: 10px;
  }
  .todo-agenda-card-swipe {
    --swipe-border-radius: 10px;
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
    gap: 9px;
    padding: 8px 2px 24px;
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
    border: 1px solid var(--surface-border-color, var(--card-border-color));
    border-radius: 13px;
    background: var(--card-background, var(--background-color));
    box-shadow: 0 12px 30px -28px rgba(30, 40, 80, 0.5);
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
  .todo-agenda__more {
    justify-self: center;
    min-width: 180px;
    margin-top: 5px;
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
      gap: 1px;
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
      border-radius: 0;
    }
    .todo-calendar-day > span {
      font-size: 10px;
    }
    .todo-calendar-daynum {
      min-width: 16px;
      height: 16px;
      padding: 0 2px;
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
      padding: 6px 0 20px;
    }
    .todo-schedule-empty {
      margin: 0 14px 8px;
      padding: 8px 10px;
    }
  }
</style>
