<template>
  <MobileSwipeDelete
    :enabled="swipeEnabled && !selectable && !readOnly"
    :open="swipeOpen"
    :disabled="disabled"
    :loading="deleting"
    :label="t('inbox.deleteTodo')"
    @swipe-start="emit('swipe-start')"
    @update:open="emit('update:swipe-open', $event)"
    @delete="emit('delete')"
  >
    <article class="todo-item" :class="{ 'is-overdue': overdue, 'is-completed': item.status === 'completed' }">
      <BCheckbox
        v-if="selectable"
        class="todo-item__select"
        :model-value="selected"
        :disabled="disabled"
        :aria-label="t('inbox.todoSelect', { title: item.title })"
        @update:model-value="$emit('select', $event)"
      />
      <div class="todo-item__body" :class="{ 'is-editable': cardEditable }" @click="openEditorFromCard">
        <div class="todo-item__meta">
          <span>{{ t('inbox.todo') }}</span>
          <span class="todo-priority">{{ priorityLabel }}</span>
          <span v-if="item.dueAt" :class="{ overdue }">{{ dueLabel }}</span>
          <span v-if="reminderLabel" class="todo-reminder-label">{{ reminderLabel }}</span>
          <span v-if="item.recurrence" class="todo-recurrence-label">{{ recurrenceLabel }}</span>
        </div>
        <!-- 标题始终独立于勾选框:完成/恢复只能点方框,点名字不触发状态切换 -->
        <div v-if="!selectable" class="todo-item__main-line">
          <BCheckbox
            class="todo-item__main-check"
            :model-value="item.status === 'completed'"
            :disabled="disabled || readOnly"
            :aria-label="t('inbox.todoSelect', { title: item.title })"
            @click.stop
            @update:model-value="$emit('toggle-complete', $event)"
          />
          <span class="todo-item__title todo-item__title--static">{{ item.title }}</span>
        </div>
        <div v-else class="todo-item__selection-title">{{ item.title }}</div>
        <p v-if="item.description" class="todo-item__description">{{ item.description }}</p>
        <section v-if="item.checklist?.length" class="todo-checklist" @click.stop>
          <header class="todo-checklist__header">
            <span>{{ t('inbox.todoChecklist') }}</span>
            <span>{{
              t('inbox.todoChecklistProgress', { done: completedChecklistCount, total: item.checklist.length })
            }}</span>
          </header>
          <div class="todo-checklist__items">
            <BCheckbox
              v-for="check in item.checklist"
              :key="check.id"
              class="todo-checklist__item"
              :model-value="check.done"
              :disabled="disabled || readOnly || item.status === 'completed'"
              @update:model-value="toggleChecklist(check.id, $event)"
            >
              <span :class="{ done: check.done }">{{ check.text }}</span>
            </BCheckbox>
          </div>
        </section>
        <!-- 参考资料:最多展示 3 个,失效目标标注不可用且不可点击 -->
        <section v-if="item.resourceRefs?.length" class="todo-resource-refs" @click.stop>
          <span class="todo-resource-refs__label">{{ t('inbox.todoResourceRefsTitle') }}</span>
          <div class="todo-resource-refs__list">
            <BButton
              v-for="ref in visibleResourceRefs"
              :key="`${ref.type}:${ref.id}`"
              class="todo-resource-chip"
              :class="{ 'is-unavailable': !ref.available }"
              :disabled="!ref.available"
              :title="ref.available ? ref.title : t('inbox.todoResourceUnavailable')"
              @click.stop="openResourceRef(ref)"
            >
              <span class="todo-resource-chip__type">{{ t(`ai.sourceTypes.${ref.type}`) }}</span>
              <span class="todo-resource-chip__title">{{ ref.title || t('inbox.todoResourceUnavailable') }}</span>
            </BButton>
            <span v-if="hiddenResourceRefCount" class="todo-resource-more">+{{ hiddenResourceRefCount }}</span>
          </div>
        </section>
      </div>
      <!-- 已完成的待办只保留「取消勾选恢复」和「删除」,避免对无效动作(编辑/日历/优先级/稍后)的误操作 -->
      <div v-if="!readOnly" class="todo-item__actions todo-item__actions--desktop">
        <template v-if="item.status === 'pending'">
          <BSelect
            class="todo-item__priority-select"
            :value="item.priority"
            :options="priorityOptions"
            :disabled="disabled"
            :aria-label="t('inbox.todoPriority')"
            @change="changePriority"
          />
          <BPopover
            trigger="click"
            placement="bottom-right"
            :open="openMenu === 'desktopSnooze'"
            @update:open="(visible: boolean) => setMenu('desktopSnooze', visible)"
          >
            <BButton size="small" :disabled="disabled">{{ t('inbox.todoSnooze') }}</BButton>
            <template #content>
              <div class="todo-snooze-menu">
                <BButton @click="runMenuAction(() => emit('snooze', 'tenMinutes'))">
                  {{ t('inbox.todoSnoozeTenMinutes') }}
                </BButton>
                <BButton @click="runMenuAction(() => emit('snooze', 'tomorrow'))">
                  {{ t('inbox.todoSnoozeTomorrow') }}
                </BButton>
                <BButton @click="runMenuAction(() => emit('snooze', 'nextWeek'))">
                  {{ t('inbox.todoSnoozeNextWeek') }}
                </BButton>
              </div>
            </template>
          </BPopover>
          <BButton size="small" :disabled="disabled" @click="$emit('edit')">{{ t('inbox.editTodo') }}</BButton>
          <BButton
            size="small"
            :disabled="disabled"
            v-click-log="OPERATION_LOG_MAP.inbox.openCalendarExport"
            @click="$emit('add-to-calendar')"
          >
            {{ t('inbox.addToCalendar') }}
          </BButton>
        </template>
        <BButton size="small" type="danger" :loading="deleting" :disabled="disabled" @click="$emit('delete')">
          {{ t('inbox.deleteTodo') }}
        </BButton>
      </div>
      <div v-if="!readOnly" class="todo-item__actions todo-item__actions--mobile">
        <template v-if="item.status === 'pending'">
          <BSelect
            class="todo-item__priority-select"
            :value="item.priority"
            :options="priorityOptions"
            :disabled="disabled"
            :aria-label="t('inbox.todoPriority')"
            @change="changePriority"
          />
          <BPopover
            trigger="click"
            placement="top-left"
            :open="openMenu === 'snooze'"
            @update:open="(visible: boolean) => setMenu('snooze', visible)"
          >
            <BButton size="small" :disabled="disabled">{{ t('inbox.todoSnooze') }}</BButton>
            <template #content>
              <div class="todo-snooze-menu">
                <BButton @click="runMenuAction(() => emit('snooze', 'tenMinutes'))">
                  {{ t('inbox.todoSnoozeTenMinutes') }}
                </BButton>
                <BButton @click="runMenuAction(() => emit('snooze', 'tomorrow'))">
                  {{ t('inbox.todoSnoozeTomorrow') }}
                </BButton>
                <BButton @click="runMenuAction(() => emit('snooze', 'nextWeek'))">
                  {{ t('inbox.todoSnoozeNextWeek') }}
                </BButton>
              </div>
            </template>
          </BPopover>
          <BPopover
            trigger="click"
            placement="top-right"
            :open="openMenu === 'more'"
            @update:open="(visible: boolean) => setMenu('more', visible)"
          >
            <BButton size="small" :disabled="disabled">{{ t('common.more') }}</BButton>
            <template #content>
              <div class="todo-mobile-action-menu">
                <BButton :disabled="disabled" @click="runMenuAction(() => emit('edit'))">
                  {{ t('inbox.editTodo') }}
                </BButton>
                <BButton
                  :disabled="disabled"
                  v-click-log="OPERATION_LOG_MAP.inbox.openCalendarExport"
                  @click="runMenuAction(() => emit('add-to-calendar'))"
                >
                  {{ t('inbox.addToCalendar') }}
                </BButton>
                <BButton
                  type="danger"
                  :loading="deleting"
                  :disabled="disabled"
                  @click="runMenuAction(() => emit('delete'))"
                >
                  {{ t('inbox.deleteTodo') }}
                </BButton>
              </div>
            </template>
          </BPopover>
        </template>
        <BButton v-else size="small" type="danger" :loading="deleting" :disabled="disabled" @click="$emit('delete')">
          {{ t('inbox.deleteTodo') }}
        </BButton>
      </div>
    </article>
  </MobileSwipeDelete>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import MobileSwipeDelete from '@/components/mobile/MobileSwipeDelete.vue';
  import { OPERATION_LOG_MAP } from '@/config/logMap';
  import { useRouter } from 'vue-router';
  import type { TodoChecklistItem, TodoItem, TodoPriority, TodoResourceRefView } from '@/api/todoApi';
  import { resolveResourceRoute } from '@/utils/resourceNavigation';
  import { formatTodoDateTime, parseTodoDate } from '@/utils/todoPlanning';

  const props = defineProps<{
    item: TodoItem;
    disabled?: boolean;
    readOnly?: boolean;
    deleting?: boolean;
    selectable?: boolean;
    selected?: boolean;
    swipeEnabled?: boolean;
    swipeOpen?: boolean;
  }>();
  const emit = defineEmits<{
    'toggle-complete': [completed: boolean];
    'update-checklist': [checklist: TodoChecklistItem[]];
    edit: [];
    delete: [];
    'add-to-calendar': [];
    select: [selected: boolean];
    snooze: [preset: 'tenMinutes' | 'tomorrow' | 'nextWeek'];
    'update-priority': [priority: TodoPriority];
    'swipe-start': [];
    'update:swipe-open': [open: boolean];
  }>();
  const { t, locale } = useI18n();
  const router = useRouter();

  /**
   * 「稍后」与「更多」菜单受控：点菜单项后必须先收起菜单，否则编辑弹框打开时
   * 菜单还浮在弹框上面。
   *
   * 桌面与移动两套操作区必须用不同的 key：非当前端的那套只是 display:none，
   * 组件仍然存在，而 BPopover 的浮层 teleport 到 body、不受父元素隐藏影响，
   * 共用 key 会让两个浮层同时打开，隐藏那套因为锚点不可见而飘到左上角。
   */
  const openMenu = ref<'snooze' | 'desktopSnooze' | 'more' | ''>('');

  function setMenu(key: 'snooze' | 'desktopSnooze' | 'more', visible: boolean) {
    openMenu.value = visible ? key : '';
  }

  function runMenuAction(action: () => void) {
    openMenu.value = '';
    action();
  }

  const overdue = computed(
    () =>
      props.item.status === 'pending' &&
      Boolean(props.item.dueAt) &&
      parseTodoDate(props.item.dueAt as string).getTime() < Date.now(),
  );
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
  const reminderLabel = computed(() => {
    const reminder = props.item.reminder;
    if (!reminder) return '';
    const channelLabels = reminder.channels.map((channel) =>
      channel === 'email' ? t('inbox.todoReminderEmail') : t('inbox.todoReminderInApp'),
    );
    return reminder.mode === 'repeat'
      ? t('inbox.todoReminderRepeatSummary', { channels: channelLabels.join(' + ') })
      : t('inbox.todoReminderOnceSummary', { channels: channelLabels.join(' + ') });
  });
  const recurrenceLabel = computed(() => {
    const recurrence = props.item.recurrence;
    if (!recurrence) return '';
    return t(`inbox.todoRecurrenceSummary.${recurrence.frequency}`, { interval: recurrence.interval });
  });
  const priorityOptions = computed(() => [0, 1, 2].map((value) => ({ value, label: t(`inbox.todoPriority${value}`) })));
  const MAX_VISIBLE_REFS = 3;
  const visibleResourceRefs = computed(() => (props.item.resourceRefs || []).slice(0, MAX_VISIBLE_REFS));
  const hiddenResourceRefCount = computed(() => Math.max(0, (props.item.resourceRefs?.length || 0) - MAX_VISIBLE_REFS));
  const cardEditable = computed(() => !props.selectable && !props.disabled && !props.readOnly);

  function openEditorFromCard(event: MouseEvent) {
    if (!cardEditable.value) return;
    const target = event.target as HTMLElement | null;
    if (
      target?.closest(
        'button, a, input, textarea, select, [role="button"], [role="checkbox"], .todo-checklist, .todo-resource-refs',
      )
    ) {
      return;
    }
    emit('edit');
  }

  function openResourceRef(ref: TodoResourceRefView) {
    if (!ref.available) return;
    const target = resolveResourceRoute({ type: ref.type, id: ref.id, title: ref.title });
    if (target) router.push(target);
  }

  function toggleChecklist(id: string, done: boolean) {
    emit(
      'update-checklist',
      props.item.checklist.map((item) => (item.id === id ? { ...item, done } : item)),
    );
  }
  function changePriority(value: unknown) {
    const priority = Number(value);
    if (priority === 0 || priority === 1 || priority === 2) emit('update-priority', priority);
  }
</script>

<style scoped lang="less">
  .todo-item {
    position: relative;
    overflow: hidden;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 18px;
    padding: 16px 18px;
    border: 1px solid color-mix(in srgb, var(--primary-color) 18%, var(--card-border-color));
    border-radius: 16px;
    background: linear-gradient(
      108deg,
      color-mix(in srgb, var(--primary-color) 6%, var(--background-color)),
      var(--background-color) 42%
    );
  }
  .todo-item__select {
    position: absolute;
    top: 18px;
    left: 10px;
    z-index: 1;
  }
  .todo-recurrence-label {
    color: var(--success-color, #2e8b57);
  }
  .todo-item::before {
    position: absolute;
    top: 12px;
    bottom: 12px;
    left: 0;
    width: 3px;
    border-radius: 0 4px 4px 0;
    content: '';
    background: linear-gradient(
      to bottom,
      transparent,
      var(--primary-color) 20%,
      var(--primary-color) 80%,
      transparent
    );
  }
  .todo-item.is-overdue {
    border-color: color-mix(in srgb, var(--danger-color, #e5484d) 38%, var(--card-border-color));
  }
  /* 完成态明确「退场」:压低内容存在感,收起主题色渐变与左侧强调条。
     注意只淡化文案区——勾选框(取消完成)和右侧操作(删除)仍可点,
     整卡 opacity 会让它们看起来像禁用。 */
  .todo-item.is-completed {
    border-color: var(--card-border-color);
    background: color-mix(in srgb, var(--text-color) 3%, var(--background-color));
  }
  .todo-item.is-completed .todo-item__meta,
  .todo-item.is-completed .todo-item__description,
  .todo-item.is-completed .todo-checklist,
  .todo-item.is-completed .todo-resource-refs {
    opacity: 0.62;
  }
  .todo-item.is-completed::before {
    display: none;
  }
  .todo-item__body {
    min-width: 0;
  }
  .todo-item__body.is-editable {
    cursor: pointer;
  }
  .todo-item__meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-left: 30px;
    color: var(--desc-color);
    font-size: 12px;
  }
  .todo-item__meta > span:first-child {
    color: var(--primary-color);
    font-weight: 600;
  }
  .todo-item__meta .overdue {
    color: var(--danger-color, #e5484d);
  }
  .todo-reminder-label {
    color: var(--primary-color);
  }
  .todo-priority {
    padding: 0 6px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--primary-color) 10%, transparent);
  }
  .todo-item__main-line {
    display: flex;
    align-items: flex-start;
    gap: 6px;
  }
  .todo-item__main-check {
    align-items: flex-start;
    margin-top: 5px;
    padding: 2px 0;
  }
  /* 已完成态标题独立于勾选框,补齐与 label 版一致的纵向节奏 */
  .todo-item__title--static {
    margin-top: 7px;
    cursor: default;
  }
  .todo-item__main-check :deep(.b-checkbox__inner) {
    width: 19px;
    height: 19px;
    border-radius: 6px;
  }
  .todo-item__title {
    display: block;
    color: var(--text-color);
    font-size: 16px;
    font-weight: 600;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }
  .todo-item__selection-title {
    margin-top: 5px;
    padding: 2px 0 2px 30px;
    color: var(--text-color);
    font-size: 16px;
    font-weight: 600;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }
  .is-completed .todo-item__title,
  .is-completed .todo-item__selection-title {
    color: var(--desc-color);
    text-decoration: line-through;
  }
  .todo-item__description {
    margin: 5px 0 0 30px;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.6;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .todo-checklist {
    margin: 11px 0 0 30px;
    padding: 9px 10px 8px;
    border: 1px solid color-mix(in srgb, var(--primary-color) 10%, var(--card-border-color));
    border-radius: 11px;
    background: color-mix(in srgb, var(--primary-color) 4%, transparent);
  }
  .todo-checklist__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 4px 5px;
    color: var(--desc-color);
    font-size: 12px;
  }
  .todo-checklist__header > span:first-child {
    color: var(--text-color);
    font-weight: 600;
  }
  .todo-checklist__items {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .todo-checklist__item {
    width: 100%;
    box-sizing: border-box;
    border-radius: 7px;
    padding: 5px 4px;
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
    align-items: flex-start;
    gap: 8px;
    margin: 9px 0 0 30px;
    flex-wrap: wrap;
  }

  .todo-resource-refs__label {
    flex: 0 0 auto;
    padding-top: 4px;
    color: var(--desc-color);
    font-size: 12px;
  }

  .todo-resource-refs__list {
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }

  .todo-resource-chip {
    max-width: 220px;
    height: auto;
    min-height: 26px;
    padding: 3px 9px;
    gap: 5px;
    border: 1px solid var(--card-border-color);
    border-radius: 999px;
    background: color-mix(in srgb, var(--primary-color) 5%, transparent) !important;
    font-size: 12px;

    &.is-unavailable {
      opacity: 0.55;
      cursor: not-allowed;
    }
  }

  .todo-resource-chip__type {
    flex: 0 0 auto;
    color: var(--primary-color);
  }

  .todo-resource-chip__title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-color);
  }

  .todo-resource-more {
    color: var(--desc-color);
    font-size: 12px;
  }

  .todo-item__actions {
    align-self: center;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
  }
  .todo-item__actions--mobile {
    display: none;
  }
  .todo-item__priority-select {
    width: 116px;
  }
  .todo-item__actions :deep(.select-trigger),
  .todo-item__actions :deep(.b_btn) {
    height: 44px;
    min-height: 44px;
    box-sizing: border-box;
    border-radius: 10px;
  }
  .todo-item__actions :deep(.b_btn) {
    padding: 0 14px;
    line-height: 44px;
  }
  .todo-snooze-menu {
    display: grid;
    min-width: 160px;
    padding: 6px;
    gap: 4px;
  }
  .todo-snooze-menu :deep(.b_btn) {
    justify-content: flex-start;
    min-height: 36px;
  }
  .todo-mobile-action-menu {
    display: grid;
    min-width: 176px;
    padding: 6px;
    gap: 4px;
  }
  .todo-mobile-action-menu :deep(.b_btn) {
    width: 100%;
    min-height: 40px;
    justify-content: flex-start;
  }
  @media (pointer: coarse) {
    .todo-snooze-menu :deep(.b_btn),
    .todo-mobile-action-menu :deep(.b_btn) {
      min-height: 44px;
    }
  }
  @media (max-width: 767px) {
    .todo-item {
      grid-template-columns: minmax(0, 1fr);
      gap: 10px;
      padding: 12px 13px;
      border-radius: 14px;
    }
    .todo-item__meta {
      margin-left: 30px;
      gap: 6px;
    }
    .todo-item__meta > span:first-child {
      display: none;
    }
    .todo-priority {
      display: none;
    }
    .todo-item__actions--desktop {
      display: none;
    }
    .todo-item__actions--mobile {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      width: auto;
      margin-left: 30px;
      gap: 8px;
      align-items: center;
    }
    .todo-item__actions--mobile .todo-item__priority-select {
      width: 100%;
      min-width: 0;
    }
    /* 卡片内的次级操作继承了桌面的 44px，在窄屏显得笨重；
       收到 38px 并压紧内边距，仍高于 36px 的舒适触控下限 */
    .todo-item__actions--mobile :deep(.select-trigger),
    .todo-item__actions--mobile :deep(.b_btn) {
      width: 100%;
      min-width: 0;
      height: 38px;
      min-height: 38px;
      padding-inline: 10px;
      font-size: 13px;
      white-space: nowrap;
    }
    .todo-checklist {
      margin-right: 0;
    }
  }
</style>
