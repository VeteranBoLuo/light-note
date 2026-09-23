<template>
  <MobileSwipeDelete
    :enabled="swipeEnabled && !selectable"
    :open="swipeOpen"
    :disabled="writeDisabled"
    :loading="deleting"
    :label="t('inbox.deleteTodo')"
    @swipe-start="emit('swipe-start')"
    @update:open="emit('update:swipe-open', $event)"
    @delete="emit('delete')"
  >
    <article
      class="todo-item"
      @click="selectable && openPreviewFromCard($event)"
      :class="{
        'is-overdue': overdue,
        'is-completed': item.status === 'completed',
        'is-workspace': workspace,
        'is-selectable': selectable && !writeDisabled,
      }"
    >
      <div class="todo-item__body" :class="{ 'is-editable': cardPreviewable }" @click.stop="openPreviewFromCard">
        <!-- 标题始终独立于勾选框:完成/恢复只能点方框,点名字不触发状态切换 -->
        <div :class="selectable ? 'todo-item__selection-line' : 'todo-item__main-line'">
          <BCheckbox
            v-if="!selectable"
            controlled
            class="todo-item__main-check"
            :model-value="item.status === 'completed'"
            :disabled="writeDisabled"
            :aria-label="t('inbox.todoSelect', { title: item.title })"
            @click.stop
            @update:model-value="$emit('toggle-complete', $event)"
          />
          <BCheckbox
            v-else
            class="todo-item__select"
            :model-value="selected"
            :disabled="writeDisabled"
            :aria-label="t('inbox.todoSelect', { title: item.title })"
            @click.stop
            @update:model-value="$emit('select', $event)"
          />
          <div class="todo-item__title-content">
            <span v-if="selectable" class="todo-item__selection-title">{{ item.title }}</span>
            <BButton v-else-if="cardPreviewable" class="todo-item__title" @click.stop="emit('preview')">
              {{ item.title }}
            </BButton>
            <span v-else class="todo-item__title todo-item__title--static">{{ item.title }}</span>
            <section v-if="item.resourceRefs?.length" class="todo-resource-refs" @click.stop>
              <TodoResourceLinks :items="item.resourceRefs.slice(0, 1)" @open="openResourceRef" />
              <BPopover v-if="item.resourceRefs.length > 1" trigger="click" placement="bottom-left">
                <BButton
                  class="todo-resource-refs__more"
                  type="text"
                  :aria-label="t('inbox.todoMoreResources', { count: item.resourceRefs.length - 1 })"
                  >+{{ item.resourceRefs.length - 1 }}</BButton
                >
                <template #content>
                  <TodoResourceLinks
                    class="todo-resource-refs__panel"
                    :items="item.resourceRefs.slice(1)"
                    @open="openResourceRef"
                  />
                </template>
              </BPopover>
            </section>
          </div>
        </div>
        <div v-if="startLabel || item.dueAt || occurrenceLabel" class="todo-item__meta">
          <span v-if="startLabel" class="todo-start-label">{{ startLabel }}</span>
          <span v-if="item.dueAt" :class="{ overdue }">{{ dueLabel }}</span>
          <span v-if="occurrenceLabel" class="todo-start-label">{{ occurrenceLabel }}</span>
        </div>
        <div class="todo-item__chips">
          <span class="todo-priority" :class="`is-priority-${item.priority}`">{{ priorityLabel }}</span>
          <span v-if="seriesLabel || item.recurrence" class="todo-recurrence-label">{{
            seriesLabel || recurrenceLabel
          }}</span>
          <span v-if="seriesProgressLabel" class="todo-series-progress">{{ seriesProgressLabel }}</span>
          <span v-if="reminderLabel" class="todo-reminder-label">{{ reminderLabel }}</span>
          <span v-if="item.series?.status === 'paused'" class="todo-plan-state-label">{{
            t('inbox.todoSeriesPausedBadge')
          }}</span>
          <span v-for="label in legacyLabels" :key="label" class="todo-legacy-label">{{ label }}</span>
        </div>
        <p v-if="item.description" class="todo-item__description">{{ item.description }}</p>
        <TodoSubitems
          :item="item"
          :disabled="writeDisabled || selectable"
          :editable="!seriesDetail"
          @update-checklist="emit('update-checklist', $event)"
          @edit="emit('edit', 'checklist')"
        />
        <div v-if="item.list || item.tags?.length" class="todo-item__organization" @click.stop>
          <span v-if="item.list"><SvgIcon :src="icon.common.folderOutline" size="15" />{{ item.list.name }}</span>
          <ResourceTagChip
            v-for="tag in item.tags"
            :key="tag.id"
            :tag="tag"
            interactive
            @click="router.push({ name: 'tagDetail', params: { id: tag.id } })"
          />
        </div>
        <section v-if="reminderLabel" class="todo-reminder-summary" :class="{ 'is-past': pastReminderLabel }">
          <strong>{{ reminderLabel }}</strong>
          <span v-if="nextReminderLabel">{{
            t(isTodoSingleReminder(item) ? 'inbox.todoSingleReminderTime' : 'inbox.todoNextReminder', {
              time: nextReminderLabel,
            })
          }}</span>
          <span v-else-if="pastReminderLabel" class="todo-reminder-summary__past">
            {{ t('inbox.todoPastReminder', { time: pastReminderLabel }) }}
          </span>
        </section>
      </div>
      <!-- 已完成待办同时提供勾选框与更多菜单恢复入口。 -->
      <div class="todo-item__actions todo-item__actions--desktop">
        <template v-if="item.status === 'pending'">
          <BSelect
            class="todo-item__priority-select"
            :value="item.priority"
            :options="priorityOptions"
            :disabled="writeDisabled"
            :aria-label="t('inbox.todoPriority')"
            @change="changePriority"
          />
          <BPopover
            v-if="!workspace"
            trigger="click"
            placement="bottom-right"
            :open="openMenu === 'desktopSnooze'"
            @update:open="(visible: boolean) => setMenu('desktopSnooze', visible)"
          >
            <BButton size="small" :disabled="writeDisabled">{{ t('inbox.todoSnooze') }}</BButton>
            <template #content>
              <div class="todo-snooze-menu">
                <BButton @click="runMenuAction(() => emit('snooze', 'tenMinutes'))">
                  {{ t('inbox.todoSnoozeTenMinutes') }}
                </BButton>
                <BButton @click="runMenuAction(() => emit('snooze', 'oneHour'))">
                  {{ t('inbox.todoSnoozeOneHour') }}
                </BButton>
                <BButton @click="runMenuAction(() => emit('snooze', 'threeHours'))">
                  {{ t('inbox.todoSnoozeThreeHours') }}
                </BButton>
                <BButton @click="runMenuAction(() => emit('snooze', 'oneDay'))">
                  {{ t('inbox.todoSnoozeOneDay') }}
                </BButton>
              </div>
            </template>
          </BPopover>
        </template>
        <BButton
          v-if="seriesDetail"
          class="todo-occurrence-delete"
          size="small"
          :disabled="writeDisabled || deleting"
          :loading="deleting"
          @click.stop="emit('delete')"
          >{{ t('todoWorkspace.deleteOccurrence') }}</BButton
        >
        <BActionMenu
          v-else
          :items="desktopMoreMenuItems"
          :width="208"
          :triggers="['click']"
          placement="bottom-right"
          :disabled="writeDisabled"
          :aria-label="t('common.more')"
          @select="handleDesktopMoreAction"
        >
          <template #item-priority="{ close }">
            <TodoPriorityMenu
              :value="item.priority"
              :disabled="writeDisabled"
              @select="
                (priority) => {
                  changePriority(priority);
                  close();
                }
              "
            />
          </template>
          <template #item-snooze="{ close }">
            <div class="todo-menu-snooze" role="group" :aria-label="t('inbox.todoSnooze')">
              <span class="todo-menu-snooze__label">{{ t('inbox.todoSnooze') }}</span>
              <div class="todo-menu-snooze__options">
                <BButton
                  v-for="option in snoozeOptions"
                  :key="option.key"
                  role="menuitem"
                  :disabled="writeDisabled"
                  @click="
                    close();
                    handleDesktopMoreAction(option.key);
                  "
                  >{{ option.label }}</BButton
                >
              </div>
            </div>
          </template>
          <BButton class="todo-more-button" size="small" :disabled="writeDisabled" :aria-label="t('common.more')">
            <SvgIcon :src="icon.common.more" size="18" aria-hidden="true" />
          </BButton>
        </BActionMenu>
      </div>
      <div class="todo-item__actions todo-item__actions--mobile">
        <template v-if="seriesDetail">
          <BSelect
            v-if="item.status === 'pending'"
            class="todo-occurrence-priority"
            :value="item.priority"
            :options="priorityOptions"
            :disabled="writeDisabled"
            :aria-label="t('inbox.todoPriority')"
            @change="changePriority"
          />
          <BButton
            class="todo-occurrence-delete"
            size="small"
            :disabled="writeDisabled || deleting"
            :loading="deleting"
            @click.stop="emit('delete')"
            >{{ t('todoWorkspace.deleteOccurrence') }}</BButton
          >
        </template>
        <template v-else>
          <template v-if="item.status === 'pending'">
            <BButton
              class="todo-mobile-action todo-mobile-action--priority"
              :disabled="writeDisabled"
              @click="openMobileMenu('priority')"
            >
              {{ priorityLabel }}
            </BButton>
            <BButton class="todo-mobile-action" :disabled="writeDisabled" @click="openMobileMenu('snooze')">
              {{ t('inbox.todoSnooze') }}
            </BButton>
            <BButton class="todo-mobile-action" :disabled="writeDisabled" @click="openMobileMenu('more')">
              {{ t('common.more') }}
            </BButton>
          </template>
          <BButton v-else class="todo-mobile-action" :disabled="writeDisabled" @click="openMobileMenu('more')">
            {{ t('common.more') }}
          </BButton>
        </template>
      </div>
    </article>
  </MobileSwipeDelete>
  <MobilePageActionsDrawer
    v-if="!seriesDetail"
    v-model:open="mobileMenuOpen"
    :object-title="item.title"
    :title="mobileMenuTitle"
    :actions="mobileMenuActions"
    @action="handleMobileMenuAction"
  />
</template>

<script setup lang="ts">
  import TodoSubitems from './TodoSubitems.vue';
  import TodoPriorityMenu from './TodoPriorityMenu.vue';
  import ResourceTagChip from '@/components/tag/ResourceTagChip.vue';
  import { computed, ref } from 'vue';
  import useUserStore from '@/store/useUser';
  import { useI18n } from 'vue-i18n';
  import { recordOperation } from '@/api/commonApi';
  import BActionMenu from '@/components/base/BasicComponents/BActionMenu.vue';
  import type { BActionMenuItem } from '@/components/base/BasicComponents/actionMenu';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import MobileSwipeDelete from '@/components/mobile/MobileSwipeDelete.vue';
  import MobilePageActionsDrawer, { type MobilePageActionItem } from '@/components/mobile/MobilePageActionsDrawer.vue';
  import TodoResourceLinks from '@/components/todo/TodoResourceLinks.vue';
  import { OPERATION_LOG_MAP } from '@/config/logMap';
  import { useRouter } from 'vue-router';
  import type { TodoChecklistItem, TodoItem, TodoPriority, TodoResourceRefView, TodoSeriesAction } from '@/api/todoApi';
  import { resolveResourceRoute, resolveTodoResourceReturnPath } from '@/utils/resourceNavigation';
  import {
    formatTodoDateTime,
    isTodoOverdue,
    isTodoSingleReminder,
    normalizeTodoDateOnly,
    todoPastReminderAt,
    type TodoSnoozePreset,
  } from '@/utils/todoPlanning';
  import icon from '@/config/icon';

  const props = defineProps<{
    item: TodoItem;
    workspace?: boolean;
    seriesDetail?: boolean;
    disabled?: boolean;
    deleting?: boolean;
    selectable?: boolean;
    selected?: boolean;
    swipeEnabled?: boolean;
    swipeOpen?: boolean;
  }>();
  const emit = defineEmits<{
    organize: [];
    'toggle-complete': [completed: boolean];
    'update-checklist': [checklist: TodoChecklistItem[]];
    preview: [];
    edit: [section?: 'checklist'];
    delete: [];
    'add-to-calendar': [];
    select: [selected: boolean];
    snooze: [preset: TodoSnoozePreset];
    'update-priority': [priority: TodoPriority];
    'swipe-start': [];
    'update:swipe-open': [open: boolean];
    'series-action': [action: TodoSeriesAction];
  }>();
  const { t, locale } = useI18n();
  const router = useRouter();

  // 桌面端稍后提醒使用 BPopover，更多操作使用统一 BActionMenu；移动端进入底部 Action Sheet。
  const openMenu = ref<'desktopSnooze' | ''>('');
  const mobileMenu = ref<'priority' | 'snooze' | 'more'>('more');
  const mobileMenuOpen = ref(false);

  function setMenu(key: 'desktopSnooze', visible: boolean) {
    openMenu.value = visible ? key : '';
  }

  function runMenuAction(action: () => void) {
    if (writeDisabled.value) return;
    openMenu.value = '';
    action();
  }

  const overdue = computed(() => isTodoOverdue(props.item));
  const priorityLabel = computed(() => t(`inbox.todoPriority${props.item.priority}`));
  const completedChecklistCount = computed(() => props.item.checklist.filter((check) => check.done).length);
  const dueLabel = computed(() => {
    if (!props.item.dueAt) return '';
    const value = formatTodoDateTime(props.item.dueAt, locale.value, {
      relative: true,
      includeYear: false,
      relativeLabels: {
        today: t('inbox.todoToday'),
        tomorrow: t('inbox.todoTomorrow'),
      },
    });
    if (!value) return '';
    return overdue.value ? t('inbox.todoOverdue', { time: value }) : t('inbox.todoDue', { time: value });
  });
  const startLabel = computed(() => {
    if (!props.item.startAt) return '';
    const value = formatTodoDateTime(props.item.startAt, locale.value, {
      relative: true,
      includeYear: false,
      relativeLabels: { today: t('inbox.todoToday'), tomorrow: t('inbox.todoTomorrow') },
    });
    return value ? t('inbox.todoStarts', { time: value }) : '';
  });
  const occurrenceLabel = computed(() => {
    if (props.item.startAt || props.item.dueAt || !props.item.occurrenceDate) return '';
    const date = normalizeTodoDateOnly(props.item.occurrenceDate);
    if (!date) return '';
    const value = formatTodoDateTime(`${date} 00:00:00`, locale.value, {
      relative: true,
      includeYear: false,
      includeTime: false,
      relativeLabels: { today: t('inbox.todoToday'), tomorrow: t('inbox.todoTomorrow') },
    });
    return value ? t('inbox.todoScheduledDate', { time: value }) : '';
  });
  const reminderLabel = computed(() => {
    const reminder = props.item.reminder;
    if (!reminder) return '';
    if (reminder.mode === 'none') return '';
    const channelLabels = reminder.channels.map((channel) =>
      channel === 'email' ? t('inbox.todoReminderEmail') : t('inbox.todoReminderInApp'),
    );
    if (reminder.mode === 'repeat') {
      if ('version' in reminder && reminder.repeat) {
        const repeat = reminder.repeat;
        const schedule =
          repeat.kind === 'interval'
            ? repeat.intervalMinutes === 1440
              ? t('inbox.todoReminderDailyAt', { time: String(repeat.startAt || '').slice(11, 16) || '09:00' })
              : t('inbox.todoReminderIntervalSummary', { minutes: repeat.intervalMinutes || 0 })
            : repeat.kind === 'weekly'
              ? t('inbox.todoReminderWeeklySummary', {
                  weekdays: (repeat.weekdays || []).map((day) => t(`inbox.todoWeekday${day}`)).join('、'),
                  time: repeat.localTime || '09:00',
                })
              : t('inbox.todoReminderMonthlySummary', {
                  days: (repeat.monthDays || []).join('、'),
                  time: repeat.localTime || '09:00',
                });
        return `${schedule} · ${channelLabels.join(' + ')}`;
      }
      return t('inbox.todoReminderRepeatSummary', { channels: channelLabels.join(' + ') });
    }
    if (reminder.mode === 'nudge') {
      return t('inbox.todoNudgeSummary', {
        channels: channelLabels.join(' + '),
        count: reminder.remainingCount || reminder.nudge?.maxCount || 0,
      });
    }
    if (reminder.mode === 'once' && 'version' in reminder && reminder.once) {
      const once = reminder.once;
      const schedule =
        once.type === 'at_due'
          ? t('inbox.todoReminderAtDue')
          : once.type === 'at_start'
            ? t('inbox.todoReminderAtStart')
            : once.type === 'before_due'
              ? t('inbox.todoReminderBeforeDueMinutes', { minutes: once.offsetMinutes || 0 })
              : t('inbox.todoReminderFixedAtSummary', { time: once.fixedAt || '' });
      return `${schedule} · ${channelLabels.join(' + ')}`;
    }
    return t('inbox.todoReminderOnceSummary', { channels: channelLabels.join(' + ') });
  });
  const nextReminderLabel = computed(() => {
    const reminder = props.item.reminder;
    const nextAt = (reminder && 'nextAt' in reminder ? reminder.nextAt : null) || props.item.reminderAt || null;
    if (!nextAt) return '';
    return formatTodoDateTime(nextAt, locale.value, {
      relative: true,
      includeYear: false,
      relativeLabels: { today: t('inbox.todoToday'), tomorrow: t('inbox.todoTomorrow') },
    });
  });
  const pastReminderLabel = computed(() => {
    const reminderAt = todoPastReminderAt(props.item);
    if (!reminderAt) return '';
    return formatTodoDateTime(reminderAt, locale.value, {
      relative: true,
      includeYear: false,
      relativeLabels: { today: t('inbox.todoToday'), tomorrow: t('inbox.todoTomorrow') },
    });
  });
  const seriesLabel = computed(() => {
    const series = props.item.series;
    if (!series) return '';
    if (series.repeatMode === 'after_completion') {
      const interval = series.plan?.interval || 1;
      const unit = series.plan?.unit || 'day';
      return t('inbox.todoSeriesAfterCompletionSummary', {
        interval,
        unit: t(`inbox.todoPlanUnit.${unit}`),
      });
    }
    const frequency = series.plan?.frequency || 'daily';
    return t(`inbox.todoRecurrenceSummary.${frequency}`, { interval: series.plan?.interval || 1 });
  });
  const seriesProgressLabel = computed(() => {
    const progress = props.item.series?.progress;
    if (!progress) return '';
    return progress.total
      ? t('inbox.todoSeriesProgress', {
          current: props.item.occurrenceNo || 0,
          total: progress.total,
          skipped: progress.skipped,
        })
      : t('inbox.todoSeriesProgressRolling', { current: props.item.occurrenceNo || progress.generated });
  });
  const recurrenceLabel = computed(() => {
    const recurrence = props.item.recurrence;
    if (!recurrence) return '';
    return t(`inbox.todoRecurrenceSummary.${recurrence.frequency}`, { interval: recurrence.interval });
  });
  const legacyLabels = computed(() => {
    if (Number(props.item.planVersion || 1) === 2) return [];
    const labels: string[] = [];
    if (props.item.recurrence) labels.push(t('inbox.todoLegacyCompletionBadge'));
    if (props.item.reminder?.mode === 'repeat') labels.push(t('inbox.todoLegacyReminderBadge'));
    return labels;
  });
  const priorityOptions = computed(() => [0, 1, 2].map((value) => ({ value, label: t(`inbox.todoPriority${value}`) })));
  const user = useUserStore();
  const writeDisabled = computed(() => props.disabled || user.adminContext?.mode === 'readonly');
  const cardPreviewable = computed(() => !props.seriesDetail && !props.selectable && !props.disabled);
  const snoozeOptions = computed(() =>
    (['tenMinutes', 'oneHour', 'threeHours', 'oneDay'] as const).map((preset) => ({
      key: `snooze-${preset}`,
      label: t(`inbox.todoSnooze${preset[0].toUpperCase()}${preset.slice(1)}`),
    })),
  );
  const desktopMoreMenuItems = computed<BActionMenuItem[]>(() => {
    const actions: BActionMenuItem[] =
      props.workspace && props.item.status !== 'completed'
        ? [
            {
              key: 'organize',
              label: t('todoWorkspace.organization'),
              icon: icon.resource.tag,
              disabled: props.selectable,
            },
          ]
        : [];
    if (props.item.status === 'pending') {
      actions.unshift(
        { key: 'priority', label: t('inbox.todoPriority') },
        ...(props.workspace ? [{ key: 'snooze', label: t('inbox.todoSnooze') }] : []),
        { key: 'settings-divider', divider: true },
      );
      actions.push(
        { key: 'edit', label: t('inbox.editTodo'), icon: icon.table_edit },
        { key: 'calendar', label: t('inbox.addToCalendar'), icon: icon.common.calendar },
      );
      if (props.item.seriesId) {
        actions.push(
          { key: 'series-divider', divider: true },
          { key: 'series-skip', label: t('inbox.todoSeriesSkipInstance'), icon: icon.todo.repeat },
          props.item.series?.status === 'paused'
            ? { key: 'series-resume', label: t('inbox.todoSeriesResume'), icon: icon.ai.play }
            : { key: 'series-pause', label: t('inbox.todoSeriesPause'), icon: icon.ai.pause },
        );
      }
      actions.push({ key: 'delete-divider', divider: true });
    }
    if (props.item.status === 'completed') {
      actions.push({ key: 'reopen', label: t('inbox.todoReopenCompletion'), icon: icon.noteDetail.back });
      actions.push({ key: 'delete-divider', divider: true });
    }
    actions.push({
      key: 'delete',
      label: t('inbox.deleteTodo'),
      icon: icon.table_delete,
      danger: true,
      disabled: props.deleting,
    });
    return actions;
  });
  const mobileMenuTitle = computed(() => {
    if (mobileMenu.value === 'priority') return t('inbox.todoPriority');
    if (mobileMenu.value === 'snooze') return t('inbox.todoSnooze');
    return t('common.more');
  });
  const mobileMenuActions = computed<MobilePageActionItem[]>(() => {
    if (mobileMenu.value === 'priority') {
      return [0, 1, 2].map((value) => ({
        key: `priority-${value}`,
        label: t(`inbox.todoPriority${value}`),
        selected: props.item.priority === value,
      }));
    }
    if (mobileMenu.value === 'snooze') {
      return [
        { key: 'snooze-tenMinutes', label: t('inbox.todoSnoozeTenMinutes'), icon: icon.common.calendar },
        { key: 'snooze-oneHour', label: t('inbox.todoSnoozeOneHour'), icon: icon.common.calendar },
        { key: 'snooze-threeHours', label: t('inbox.todoSnoozeThreeHours'), icon: icon.common.calendar },
        { key: 'snooze-oneDay', label: t('inbox.todoSnoozeOneDay'), icon: icon.common.calendar },
      ];
    }
    const seriesActions: MobilePageActionItem[] =
      props.item.status === 'pending' && props.item.seriesId
        ? [
            {
              key: 'series-skip',
              label: t('inbox.todoSeriesSkipInstance'),
              icon: icon.todo.repeat,
              dividerBefore: true,
            },
            props.item.series?.status === 'paused'
              ? { key: 'series-resume', label: t('inbox.todoSeriesResume'), icon: icon.ai.play }
              : { key: 'series-pause', label: t('inbox.todoSeriesPause'), icon: icon.ai.pause },
          ]
        : [];
    return [
      ...(props.item.status === 'pending'
        ? [
            { key: 'edit', label: t('inbox.editTodo'), icon: icon.table_edit },
            { key: 'calendar', label: t('inbox.addToCalendar'), icon: icon.common.calendar },
          ]
        : [{ key: 'reopen', label: t('inbox.todoReopenCompletion'), icon: icon.noteDetail.back }]),
      ...(props.workspace && props.item.status !== 'completed'
        ? [
            {
              key: 'organize',
              label: t('todoWorkspace.organization'),
              icon: icon.resource.tag,
              disabled: props.selectable,
            },
          ]
        : []),
      ...seriesActions,
      {
        key: 'delete',
        label: t('inbox.deleteTodo'),
        icon: icon.table_delete,
        danger: true,
        dividerBefore: true,
        loading: props.deleting,
      },
    ];
  });

  function openMobileMenu(menu: 'priority' | 'snooze' | 'more') {
    mobileMenu.value = menu;
    mobileMenuOpen.value = true;
  }

  function handleMobileMenuAction(action: MobilePageActionItem) {
    if (writeDisabled.value) return;
    if (action.key.startsWith('priority-')) changePriority(action.key.slice('priority-'.length));
    else if (action.key.startsWith('snooze-')) {
      emit('snooze', action.key.slice('snooze-'.length) as TodoSnoozePreset);
    } else handleMoreAction(action.key);
  }

  function handleDesktopMoreAction(key: string) {
    handleMoreAction(key);
  }

  function handleMoreAction(key: string) {
    if (writeDisabled.value) return;
    if (key.startsWith('snooze-')) emit('snooze', key.slice(7) as TodoSnoozePreset);
    else if (key === 'reopen') emit('toggle-complete', false);
    else if (key === 'edit') emit('edit');
    else if (key === 'organize') emit('organize');
    else if (key === 'calendar') {
      void recordOperation(OPERATION_LOG_MAP.inbox.openCalendarExport);
      emit('add-to-calendar');
    } else if (key === 'series-skip') emit('series-action', 'skip');
    else if (key === 'series-pause') emit('series-action', 'pause');
    else if (key === 'series-resume') emit('series-action', 'resume');
    else if (key === 'delete') emit('delete');
  }

  function openPreviewFromCard(event: MouseEvent) {
    if (props.disabled) return;
    const target = event.target as HTMLElement | null;
    if (
      target?.closest(
        'button, a, input, textarea, select, [role="button"], [role="checkbox"], [role="combobox"], .todo-checklist, .todo-resource-refs',
      )
    ) {
      return;
    }
    if (props.selectable) emit('select', !props.selected);
    else if (!props.seriesDetail) emit('preview');
  }

  function openResourceRef(ref: TodoResourceRefView) {
    if (!ref.available) return;
    const noteReturnPath = resolveTodoResourceReturnPath(router.currentRoute.value.fullPath, props.item.id, ref);
    const target = resolveResourceRoute({ type: ref.type, id: ref.id, title: ref.title }, { noteReturnPath });
    if (target) router.push(target);
  }

  function toggleChecklist(id: string, done: boolean) {
    emit(
      'update-checklist',
      props.item.checklist.map((item) => (item.id === id ? { ...item, done } : item)),
    );
  }
  function changePriority(value: unknown) {
    if (writeDisabled.value) return;
    const priority = Number(value);
    if (priority !== props.item.priority && (priority === 0 || priority === 1 || priority === 2))
      emit('update-priority', priority);
  }
</script>

<style scoped lang="less">
  .todo-menu-snooze {
    padding: var(--ui-space-7, 7px) var(--ui-space-12, 12px);
  }
  .todo-menu-snooze__label {
    display: block;
    margin-bottom: var(--ui-space-7, 7px);
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .todo-menu-snooze__options {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--ui-space-6, 6px);
  }
  .todo-menu-snooze__options .b_btn {
    width: 100%;
    height: var(--ui-layout-30, 30px);
    padding: 0 var(--ui-space-4, 4px);
    border: 1px solid var(--surface-border-color);
    background: transparent;
    font-size: var(--ui-font-12, 12px);
  }
  .todo-menu-snooze__options .b_btn:hover,
  .todo-menu-snooze__options .b_btn:focus-visible {
    color: var(--workspace-purple-text);
    background: var(--workspace-hover);
  }
  .todo-item__organization {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-space-8, 8px);
    margin-top: var(--ui-space-8, 8px);
    align-items: center;
  }
  .todo-item {
    position: relative;
    overflow: hidden;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: var(--ui-space-12, 12px);
    padding: var(--ui-space-15, 15px) var(--ui-space-16, 16px);
    border: 1px solid var(--surface-border-color, var(--card-border-color));
    border-radius: 15px;
    background: var(--card-background, var(--background-color));
    box-shadow: 0 12px 30px -28px rgba(30, 40, 80, 0.5);
  }
  .todo-item .todo-item__actions .todo-occurrence-delete.b_btn {
    color: var(--danger-color);
    white-space: nowrap;
  }
  .todo-occurrence-priority {
    width: var(--ui-layout-100, 100px);
  }
  .todo-recurrence-label {
    color: var(--success-color, #2e8b57);
  }
  .todo-series-progress,
  .todo-start-label {
    color: var(--desc-color);
  }
  .todo-plan-state-label,
  .todo-legacy-label {
    padding: var(--ui-space-1, 1px) var(--ui-space-6, 6px);
    border-radius: 999px;
    font-weight: 600;
  }
  .todo-plan-state-label {
    border: 1px solid var(--primary-color);
    color: var(--primary-color);
  }
  .todo-legacy-label {
    border: 1px solid #b45309;
    color: #92400e;
  }
  .todo-item::before {
    position: absolute;
    top: 14px;
    bottom: 14px;
    left: 0;
    width: 3px;
    border-radius: 0 4px 4px 0;
    content: '';
    background: var(--todo-accent-color, var(--primary-color));
  }
  .todo-item.is-overdue {
    border-color: var(--surface-border-color, var(--card-border-color));
  }
  .todo-item.is-overdue::before {
    background: var(--danger-color, #e5484d);
  }
  /* 完成态明确「退场」:压低内容存在感,收起主题色渐变与左侧强调条。
     注意只淡化文案区——勾选框(取消完成)和右侧操作(删除)仍可点,
     整卡 opacity 会让它们看起来像禁用。 */
  .todo-item.is-completed {
    border-color: var(--surface-border-color, var(--card-border-color));
    background: var(--workspace-panel-bg-color, var(--background-color));
  }
  .todo-item.is-completed .todo-item__meta,
  .todo-item.is-completed .todo-item__chips,
  .todo-item.is-completed .todo-item__description,
  .todo-item.is-completed .todo-checklist,
  .todo-item.is-completed .todo-resource-refs,
  .todo-item.is-completed .todo-reminder-summary {
    opacity: 0.62;
  }
  .todo-item.is-completed::before {
    display: none;
  }
  .todo-item__body {
    min-width: 0;
  }
  .todo-item.is-selectable,
  .todo-item__body.is-editable {
    cursor: pointer;
  }
  .todo-item__meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-space-5, 5px) var(--ui-space-10, 10px);
    margin: var(--ui-space-4, 4px) 0 0 var(--ui-space-30, 30px);
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .todo-item__meta .overdue {
    color: var(--danger-color, #e5484d);
    font-weight: 650;
  }
  .todo-item__chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ui-space-6, 6px);
    margin: var(--ui-space-8, 8px) 0 0 var(--ui-space-30, 30px);
  }
  .todo-item__chips > span {
    min-height: var(--ui-layout-20, 20px);
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    padding: var(--ui-space-2, 2px) var(--ui-space-8, 8px);
    border: 1px solid var(--surface-border-color, var(--card-border-color));
    border-radius: 999px;
    background: var(--workspace-panel-bg-color, var(--background-color));
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
    line-height: 1.35;
  }
  .todo-item__chips > .todo-recurrence-label {
    border-color: var(--chip-success-border) !important;
    background: var(--chip-success-bg) !important;
    color: var(--chip-success-fg) !important;
  }
  .todo-item__chips > .todo-plan-state-label {
    border-color: var(--chip-pin-border) !important;
    background: var(--chip-pin-bg) !important;
    color: var(--chip-pin-fg) !important;
  }
  .todo-item__chips > .todo-legacy-label {
    border-color: var(--chip-pending-border) !important;
    background: var(--chip-pending-bg) !important;
    color: var(--chip-pending-fg) !important;
  }
  .todo-reminder-label {
    border-color: var(--chip-pending-border) !important;
    background: var(--chip-pending-bg) !important;
    color: var(--chip-pending-fg) !important;
  }
  .todo-priority {
    border-color: var(--chip-todo-border) !important;
    background: var(--chip-todo-bg) !important;
    color: var(--chip-todo-fg) !important;
    font-weight: 650;
  }
  .todo-priority.is-priority-2 {
    border-color: var(--chip-danger-border) !important;
    background: var(--chip-danger-bg) !important;
    color: var(--chip-danger-fg) !important;
  }
  .todo-item__main-line,
  .todo-item__selection-line {
    display: flex;
    align-items: flex-start;
    gap: var(--ui-space-6, 6px);
    margin-top: var(--ui-space-5, 5px);
    min-width: 0;
  }
  .todo-item__title-content {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ui-space-6, 6px) var(--ui-space-10, 10px);
    min-width: 0;
    flex: 1;
  }
  .todo-item__title-content > .todo-item__title,
  .todo-item__title-content > .todo-item__selection-title {
    flex: 0 1 auto;
    max-width: 100%;
  }
  /* 方框与标题第一行共用 24px 行盒，换行后仍对齐首行。 */
  .todo-item__main-check,
  .todo-item__select {
    flex: 0 0 var(--ui-layout-24, 24px);
    height: var(--ui-layout-24, 24px);
    box-sizing: border-box;
    align-items: center;
    justify-content: center;
    padding: 0;
  }
  .todo-item__title--static {
    cursor: default;
  }
  .todo-item__main-check :deep(.b-checkbox__inner),
  .todo-item__select :deep(.b-checkbox__inner) {
    width: var(--ui-layout-19, 19px);
    height: var(--ui-layout-19, 19px);
    border-radius: 6px;
  }
  .todo-item__title,
  .todo-item__selection-title {
    display: block;
    min-width: 0;
    color: var(--text-color);
    font-size: var(--ui-font-16, 16px);
    font-weight: 600;
    line-height: var(--ui-layout-24, 24px);
    overflow-wrap: anywhere;
  }
  .todo-item__title.b_btn {
    width: auto;
    height: auto;
    min-height: 0;
    padding: 0;
    background: transparent;
    text-align: left;
    white-space: normal;
    transition: color 0.2s;
  }
  .todo-item__title.b_btn:focus-visible {
    color: var(--primary-color);
  }
  @media (hover: hover) and (pointer: fine) {
    .todo-item__title.b_btn:hover {
      color: var(--primary-color);
    }
  }
  .is-completed .todo-item__title,
  .is-completed .todo-item__selection-title {
    color: var(--desc-color);
    text-decoration: line-through;
  }
  .todo-item__description {
    margin: var(--ui-space-5, 5px) 0 0 var(--ui-space-30, 30px);
    color: var(--desc-color);
    font-size: var(--ui-font-13, 13px);
    line-height: 1.6;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .todo-checklist {
    margin: var(--ui-space-11, 11px) 0 0 var(--ui-space-30, 30px);
    padding: var(--ui-space-9, 9px) var(--ui-space-10, 10px) var(--ui-space-8, 8px);
    border: 0;
    border-radius: 11px;
    background: var(--workspace-panel-bg-color, var(--hover-background));
  }
  .todo-checklist__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-12, 12px);
    padding: 0 var(--ui-space-4, 4px) var(--ui-space-5, 5px);
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .todo-checklist__header > span:first-child {
    color: var(--text-color);
    font-weight: 600;
  }
  .todo-checklist__items {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-1, 1px);
  }
  .todo-checklist__item {
    width: 100%;
    box-sizing: border-box;
    border-radius: 7px;
    padding: var(--ui-space-5, 5px) var(--ui-space-4, 4px);
  }
  .todo-checklist__item:hover {
    background: color-mix(in srgb, var(--primary-color) 6%, transparent);
  }
  .todo-checklist .done {
    text-decoration: line-through;
    color: var(--desc-color);
  }
  .todo-resource-refs {
    display: flex;
    align-items: center;
    gap: var(--ui-space-5, 5px);
    min-width: 0;
    max-width: 100%;
    flex: 0 1 auto;
  }
  .todo-resource-refs > :deep(.b-popover-trigger) {
    flex: 0 0 auto;
  }
  .todo-resource-refs__panel {
    box-sizing: border-box;
    width: var(--ui-layout-280, 280px);
    max-width: calc(100vw - var(--ui-space-48, 48px));
    max-height: var(--ui-layout-240, 240px);
    overflow-y: auto;
    padding: var(--ui-space-10, 10px);
  }
  .todo-resource-refs__more.b_btn {
    height: var(--ui-layout-24, 24px);
    min-height: var(--ui-layout-24, 24px);
    padding: 0 var(--ui-space-4, 4px);
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }

  .todo-reminder-summary {
    display: grid;
    gap: var(--ui-space-2, 2px);
    margin: var(--ui-space-10, 10px) 0 0 var(--ui-space-30, 30px);
    padding: var(--ui-space-9, 9px) var(--ui-space-11, 11px);
    border-radius: 10px;
    background: var(--workspace-panel-bg-color, var(--hover-background));
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .todo-reminder-summary strong {
    color: var(--text-color);
    font-size: var(--ui-font-12, 12px);
    font-weight: 650;
  }
  .todo-reminder-summary.is-past {
    border: 1px solid var(--chip-pending-border);
    border-left: 3px solid var(--warning-color);
    background: var(--chip-pending-bg);
  }
  .todo-reminder-summary__past {
    color: var(--chip-pending-fg);
    font-weight: 650;
  }

  .todo-item__actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--ui-space-6, 6px);
  }
  .todo-item__actions--desktop {
    align-self: start;
    flex-wrap: nowrap;
    margin-top: var(--ui-space-5, 5px);
  }
  .todo-item__actions--mobile {
    display: none;
  }
  .todo-item__priority-select {
    width: var(--ui-layout-92, 92px);
  }
  .todo-item__actions :deep(.select-trigger),
  .todo-item__actions :deep(.b_btn) {
    height: var(--ui-layout-34, 34px);
    min-height: var(--ui-layout-34, 34px);
    box-sizing: border-box;
    border: 0;
    border-radius: 9px;
    background: var(--workspace-panel-bg-color);
  }
  .todo-item__actions :deep(.b_btn) {
    padding: 0 var(--ui-space-11, 11px);
    line-height: var(--ui-layout-34, 34px);
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .todo-item__actions :deep(.todo-more-button) {
    width: var(--ui-layout-34, 34px);
    padding: 0;
    color: var(--text-color);
  }
  .todo-snooze-menu {
    display: grid;
    width: max-content;
    min-width: 0;
    padding: var(--ui-space-4, 4px);
    gap: var(--ui-space-2, 2px);
  }
  .todo-snooze-menu :deep(.b_btn) {
    width: 100%;
    justify-content: flex-start;
    height: var(--ui-layout-30, 30px);
    min-height: var(--ui-layout-30, 30px);
    padding: 0 var(--ui-space-10, 10px);
    font-size: var(--ui-font-13, 13px);
  }
  @media (pointer: coarse) {
    .todo-snooze-menu :deep(.b_btn) {
      min-height: var(--ui-layout-44, 44px);
    }
  }
  @media (min-width: 768px) and (max-width: 900px) {
    .todo-item {
      grid-template-columns: minmax(0, 1fr);
    }
    .todo-item__actions--desktop {
      grid-column: 1 / -1;
      justify-self: end;
      margin: 0 0 0 var(--ui-space-30, 30px);
    }
  }
  @media (max-width: 767px) {
    .todo-item__organization {
      margin-left: var(--ui-space-30, 30px);
    }
    .todo-resource-refs {
      flex-basis: 100%;
    }
    .todo-item {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--ui-space-10, 10px);
      padding: var(--ui-space-14, 14px);
      border-radius: 17px;
      border: 1px solid var(--surface-border-color);
      border-left: 4px solid var(--todo-accent-color);
      background: var(--card-background);
      box-shadow: none;
    }
    .todo-item::before {
      display: none;
    }
    .todo-item.is-overdue {
      border-color: var(--surface-border-color);
      border-left-color: var(--danger-color);
    }
    .todo-item.is-completed {
      border-color: var(--surface-border-color);
      border-left-color: var(--success-color);
      background: var(--card-background);
    }
    .todo-item__meta {
      margin-left: var(--ui-space-30, 30px);
      gap: var(--ui-space-6, 6px);
      font-size: var(--ui-font-12, 12px);
    }
    .todo-item__chips {
      margin-left: var(--ui-space-30, 30px);
    }
    .todo-item__chips > .todo-priority {
      display: none;
    }
    .todo-item__actions--desktop {
      display: none;
    }
    .todo-item__actions--mobile {
      display: flex;
      width: auto;
      margin-left: var(--ui-space-30, 30px);
      gap: var(--ui-space-7, 7px);
      align-items: center;
      justify-content: flex-end;
    }
    .todo-item__actions--mobile :deep(.b_btn) {
      position: relative;
      z-index: 0;
      isolation: isolate;
      width: auto;
      min-width: 0;
      height: var(--mobile-touch-size, var(--ui-layout-44, 44px));
      min-height: var(--mobile-touch-size, var(--ui-layout-44, 44px));
      padding-inline: var(--ui-space-12, 12px);
      border: 0;
      border-radius: 10px;
      background: transparent !important;
      font-size: var(--ui-font-12, 12px);
      white-space: nowrap;
    }
    .todo-item__actions--mobile :deep(.b_btn::before) {
      position: absolute;
      z-index: -1;
      inset: 3px 0;
      border-radius: 10px;
      background: var(--workspace-panel-bg-color);
      content: '';
    }
    .todo-mobile-action--priority {
      margin-right: auto;
      color: var(--todo-accent-color);
      font-weight: 650;
    }
    .todo-item__actions--mobile :deep(.todo-mobile-action--priority::before) {
      inset: 9px 0;
      border: 1px solid color-mix(in srgb, var(--todo-accent-color) 45%, var(--surface-border-color));
      border-radius: 999px;
      background: color-mix(in srgb, var(--todo-accent-color) 10%, var(--card-background));
    }
    .todo-checklist {
      margin-right: 0;
      padding: var(--ui-space-11, 11px);
      border-radius: 12px;
      border: 0;
      background: var(--workspace-panel-bg-color);
      box-shadow: none;
    }
  }
</style>
