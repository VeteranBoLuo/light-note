<template>
  <div class="todo-independent-plan">
    <section>
      <header>
        <strong>{{ t('inbox.todoIndependentPlan') }}</strong>
        <small>{{ t('inbox.todoIndependentPlanHint') }}</small>
      </header>
      <div class="todo-independent-plan__grid">
        <label>
          <span>{{ t('inbox.todoPlanGenerationMode') }}</span>
          <BSelect v-model:value="planType" :options="planTypeOptions" />
        </label>
        <template v-if="planType === 'scheduled'">
          <label>
            <span>{{ t('inbox.todoPlanFrequency') }}</span>
            <BSelect v-model:value="frequency" :options="frequencyOptions" />
          </label>
          <label>
            <span>{{ t('inbox.todoPlanInterval') }}</span>
            <BInput v-model:value="interval" type="number" />
          </label>
          <label v-if="frequency === 'weekly'" class="todo-independent-plan__wide">
            <span>{{ t('inbox.todoReminderWeekdays') }}</span>
            <div class="todo-independent-plan__days">
              <BButton
                v-for="day in weekdayOptions"
                :key="day.value"
                size="small"
                :class="{ 'is-active': weekdays.includes(day.value) }"
                @click="toggleWeekday(day.value)"
              >
                {{ day.label }}
              </BButton>
            </div>
          </label>
          <label v-if="frequency === 'monthly'">
            <span>{{ t('inbox.todoPlanMonthDay') }}</span>
            <BInput v-model:value="monthDay" type="number" />
          </label>
        </template>
        <template v-else>
          <label>
            <span>{{ t('inbox.todoPlanAfterCompletionInterval') }}</span>
            <BInput v-model:value="interval" type="number" />
          </label>
          <label>
            <span>{{ t('inbox.todoPlanAfterCompletionUnit') }}</span>
            <BSelect v-model:value="afterUnit" :options="unitOptions" />
          </label>
        </template>
        <label>
          <span>{{ t('inbox.todoStartAt') }}</span>
          <BDateTimePicker v-model:value="startAt" />
        </label>
        <label>
          <span>{{ dueAtLabel }}</span>
          <BDateTimePicker v-model:value="dueAt" />
        </label>
        <label>
          <span>{{ t('inbox.todoPlanTimezone') }}</span>
          <BSelect v-model:value="props.draft.timing.timezone" :options="timezoneOptions" />
        </label>
        <label>
          <span>{{ t('inbox.todoPlanEndMode') }}</span>
          <BSelect v-model:value="endMode" :options="endOptions" />
          <small class="todo-independent-plan__field-hint">{{ endModeHint }}</small>
        </label>
        <label v-if="endMode === 'count'">
          <span>{{ t('inbox.todoPlanEndCount') }}</span>
          <BInput v-model:value="endCount" type="number" />
        </label>
        <label v-if="endMode === 'until' && !scheduledEndUsesDueDate">
          <span>{{ t('inbox.todoPlanEndDate') }}</span>
          <BDateTimePicker v-model:value="untilAt" />
        </label>
        <label>
          <span>{{ t('inbox.todoPastChoiceTitle') }}</span>
          <BSelect v-model:value="pastPolicy" :options="pastPolicyOptions" :placeholder="t('inbox.todoPastChoose')" />
        </label>
      </div>
    </section>
    <section>
      <header>
        <strong>{{ t('inbox.todoIndependentReminder') }}</strong>
        <small>{{ t('inbox.todoIndependentReminderHint') }}</small>
      </header>
      <div class="todo-independent-plan__grid">
        <label>
          <span>{{ t('inbox.todoReminder') }}</span>
          <BSelect v-model:value="reminderMode" :options="reminderOptions" />
        </label>
        <label v-if="reminderMode !== 'none'">
          <span>{{ t('inbox.todoReminderWhen') }}</span>
          <BSelect v-model:value="triggerType" :options="triggerOptions" />
        </label>
        <label v-if="reminderMode !== 'none' && triggerType === 'fixed_time'">
          <span>{{ t('inbox.todoReminderFixedTime') }}</span>
          <BInput v-model:value="fixedTime" type="time" />
          <small class="todo-independent-plan__field-hint">{{ t('inbox.todoReminderFixedTimeHint') }}</small>
        </label>
        <label v-else-if="reminderMode !== 'none' && triggerType === 'before_due'">
          <span>{{ t('inbox.todoReminderOffsetMinutes') }}</span>
          <div class="todo-independent-plan__inline">
            <BInput v-model:value="offsetMinutes" type="number" />
            <span>{{ t('inbox.todoReminderMinutes') }}</span>
          </div>
        </label>
        <small v-if="reminderMode === 'nudge'" class="todo-independent-plan__wide todo-independent-plan__nudge-hint">
          {{ t('inbox.todoNudgeConfigHint') }}
        </small>
        <div v-if="reminderMode === 'nudge'" class="todo-independent-plan__field">
          <span>{{ t('inbox.todoNudgeInterval') }}</span>
          <div class="todo-independent-plan__inline todo-independent-plan__inline--select">
            <BInput v-model:value="nudgeIntervalValue" type="number" />
            <BSelect
              v-model:value="nudgeIntervalUnit"
              :options="nudgeIntervalUnitOptions"
              :aria-label="t('inbox.todoReminderIntervalUnit')"
            />
          </div>
        </div>
        <label v-if="reminderMode === 'nudge'">
          <span>{{ t('inbox.todoNudgeMaxCount') }}</span>
          <BInput v-model:value="nudgeMaxCount" type="number" />
        </label>
        <label v-if="reminderMode === 'nudge'">
          <span>{{ t('inbox.todoNudgeStop') }}</span>
          <BSelect v-model:value="nudgeStop" :options="nudgeStopOptions" />
        </label>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
  import { computed, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BDateTimePicker from '@/components/base/BasicComponents/BDateTimePicker.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import type { TodoPlanEndMode, TodoPlanType, TodoRecurrenceFrequency, TodoReminderV2Mode } from '@/api/todoApi';
  import type { TodoPastPolicy } from '@/api/todoApi';
  import { suggestTodoPlanEndDate, type TodoCreateDraftV3 } from './todoDraftNormalizer';

  const props = defineProps<{ draft: TodoCreateDraftV3 }>();
  const { t } = useI18n();
  const planTypeOptions = computed(() => [
    { value: 'scheduled', label: t('inbox.todoPlanScheduled') },
    { value: 'after_completion', label: t('inbox.todoPlanAfterCompletion') },
  ]);
  const frequencyOptions = computed(() => [
    { value: 'daily', label: t('inbox.todoRecurrenceDaily') },
    { value: 'weekly', label: t('inbox.todoRecurrenceWeekly') },
    { value: 'monthly', label: t('inbox.todoRecurrenceMonthly') },
  ]);
  const unitOptions = computed(() => [
    { value: 'day', label: t('inbox.todoReminderDays') },
    { value: 'week', label: t('inbox.todoReminderWeeks') },
    { value: 'month', label: t('inbox.todoRecurrenceMonthly') },
  ]);
  const endOptions = computed(() => [
    ...(planType.value === 'scheduled' ? [{ value: 'until', label: t('inbox.todoPlanEndByDate') }] : []),
    { value: 'count', label: t('inbox.todoPlanEndByCount') },
    { value: 'never', label: t('inbox.todoPlanNoEnd') },
  ]);
  const reminderOptions = computed(() => [
    { value: 'none', label: t('inbox.todoReminderNone') },
    { value: 'once_per_instance', label: t('inbox.todoReminderEachTaskOnce') },
    { value: 'nudge', label: t('inbox.todoReminderEachTaskNudge') },
  ]);
  const triggerOptions = computed(() => [
    { value: 'at_start', label: t('inbox.todoReminderAtStart') },
    { value: 'before_due', label: t('inbox.todoReminderBeforeDue') },
    { value: 'fixed_time', label: t('inbox.todoReminderFixedTime') },
  ]);
  const nudgeIntervalUnitOptions = computed(() => [
    { value: 'minute', label: t('inbox.todoReminderMinutes') },
    { value: 'hour', label: t('inbox.todoReminderHours') },
    { value: 'day', label: t('inbox.todoReminderDays') },
  ]);
  const nudgeStopOptions = computed(() => [
    { value: 'completion_or_due', label: t('inbox.todoNudgeStopCompletionOrDue') },
    { value: 'max_count', label: t('inbox.todoNudgeStopMaxCount') },
  ]);
  const timezoneOptions = computed(() => [
    { value: 'Asia/Shanghai', label: t('inbox.todoTimezoneChina') },
    { value: 'Asia/Singapore', label: 'Asia/Singapore (UTC+8)' },
    { value: 'Asia/Tokyo', label: 'Asia/Tokyo (UTC+9)' },
    { value: 'America/New_York', label: 'America/New_York' },
    { value: 'Europe/London', label: 'Europe/London' },
  ]);
  const pastPolicyOptions = computed(() => [
    { value: 'keep_overdue', label: t('inbox.todoPastKeep') },
    { value: 'restart_today_keep_count', label: t('inbox.todoPastRestart') },
    { value: 'skip_missed', label: t('inbox.todoPastSkip') },
  ]);
  const weekdayOptions = computed(() =>
    [1, 2, 3, 4, 5, 6, 7].map((value) => ({ value, label: t(`inbox.todoWeekday${value}`) })),
  );

  const planType = computed<TodoPlanType>({
    get: () => props.draft.independentTasks.plan.type,
    set: (type) => {
      props.draft.independentTasks.plan =
        type === 'after_completion'
          ? { type, interval: 1, unit: 'day', end: { mode: 'count', count: 30 } }
          : {
              type: 'scheduled',
              frequency: 'daily',
              interval: 1,
              end: { mode: 'until', untilDate: planDueDate() || recommendedEndDate() },
            };
    },
  });
  const frequency = computed<TodoRecurrenceFrequency>({
    get: () => props.draft.independentTasks.plan.frequency || 'daily',
    set: (value) => (props.draft.independentTasks.plan.frequency = value),
  });
  const interval = computed({
    get: () => props.draft.independentTasks.plan.interval || 1,
    set: (value) => (props.draft.independentTasks.plan.interval = Number(value || 1)),
  });
  const afterUnit = computed({
    get: () => props.draft.independentTasks.plan.unit || 'day',
    set: (value) => (props.draft.independentTasks.plan.unit = value),
  });
  const weekdays = computed(() => props.draft.independentTasks.plan.weekdays || []);
  function toggleWeekday(day: number) {
    props.draft.independentTasks.plan.weekdays = weekdays.value.includes(day)
      ? weekdays.value.filter((value) => value !== day)
      : [...weekdays.value, day].sort((a, b) => a - b);
  }
  const monthDay = computed({
    get: () => props.draft.independentTasks.plan.monthDay || 1,
    set: (value) => (props.draft.independentTasks.plan.monthDay = Number(value || 1)),
  });
  const startAt = computed({
    get: () => props.draft.timing.startAt || '',
    set: (value) => (props.draft.timing.startAt = value || null),
  });
  const dueAt = computed({
    get: () => props.draft.timing.dueAt || '',
    set: (value) => (props.draft.timing.dueAt = value || null),
  });
  const endMode = computed<TodoPlanEndMode>({
    get: () =>
      props.draft.independentTasks.plan.end?.mode ||
      (props.draft.independentTasks.plan.type === 'scheduled' ? 'until' : 'count'),
    set: (mode) => {
      props.draft.independentTasks.plan.end = {
        mode,
        ...(mode === 'count' ? { count: props.draft.independentTasks.plan.end?.count || 30 } : {}),
        ...(mode === 'until'
          ? {
              untilDate: planDueDate() || props.draft.independentTasks.plan.end?.untilDate || recommendedEndDate(),
            }
          : {}),
      };
    },
  });
  const scheduledEndUsesDueDate = computed(
    () => planType.value === 'scheduled' && endMode.value === 'until' && Boolean(planDueDate()),
  );
  const dueAtLabel = computed(() =>
    planType.value === 'scheduled' && endMode.value === 'until' ? t('inbox.todoPlanDueAndEndAt') : t('inbox.todoDueAt'),
  );
  const endModeHint = computed(() => {
    if (scheduledEndUsesDueDate.value) return t('inbox.todoPlanEndUsesDueDate');
    return endMode.value === 'never' ? t('inbox.todoPlanNoEndHint') : t('inbox.todoPlanEndModeHint');
  });
  const endCount = computed({
    get: () => props.draft.independentTasks.plan.end?.count || 30,
    set: (value) => (props.draft.independentTasks.plan.end = { mode: 'count', count: Number(value || 30) }),
  });
  const pastPolicy = computed<TodoPastPolicy | ''>({
    get: () => props.draft.independentTasks.plan.pastPolicy || '',
    set: (value) => (props.draft.independentTasks.plan.pastPolicy = value || undefined),
  });
  const untilAt = computed({
    get: () => {
      const untilDate = props.draft.independentTasks.plan.end?.untilDate || '';
      return untilDate ? `${untilDate} 23:59` : '';
    },
    set: (value) => (props.draft.independentTasks.plan.end = { mode: 'until', untilDate: String(value).slice(0, 10) }),
  });
  const fixedTime = computed({
    get: () => props.draft.independentTasks.reminder.trigger?.fixedTime || '09:00',
    set: (value) => {
      props.draft.independentTasks.reminder.trigger = { type: 'fixed_time', fixedTime: String(value || '') };
    },
  });
  const offsetMinutes = computed({
    get: () => props.draft.independentTasks.reminder.trigger?.offsetMinutes ?? 60,
    set: (value) => {
      props.draft.independentTasks.reminder.trigger = {
        type: 'before_due',
        offsetMinutes: Math.max(0, Number(value || 0)),
      };
    },
  });
  const reminderMode = computed<TodoReminderV2Mode>({
    get: () => props.draft.independentTasks.reminder.mode,
    set: (mode) => {
      props.draft.independentTasks.reminder =
        mode === 'none'
          ? { mode, channels: [] }
          : {
              mode,
              trigger: defaultReminderTrigger(),
              channels: ['in_app'],
              ...(mode === 'nudge' ? { nudge: { intervalMinutes: 60, stop: 'completion_or_due', maxCount: 4 } } : {}),
            };
    },
  });
  const triggerType = computed({
    get: () => props.draft.independentTasks.reminder.trigger?.type || 'at_start',
    set: (type) => {
      props.draft.independentTasks.reminder.trigger = {
        type,
        ...(type === 'before_due' ? { offsetMinutes: 60 } : {}),
        ...(type === 'fixed_time' ? { fixedTime: '09:00' } : {}),
      };
    },
  });
  const nudgeIntervalUnit = computed<'minute' | 'hour' | 'day'>({
    get: () => naturalIntervalUnit(props.draft.independentTasks.reminder.nudge?.intervalMinutes || 60),
    set: (unit) => {
      updateNudge({ intervalMinutes: Math.max(1, Number(nudgeIntervalValue.value || 1)) * intervalFactor(unit) });
    },
  });
  const nudgeIntervalValue = computed({
    get: () => {
      const minutes = props.draft.independentTasks.reminder.nudge?.intervalMinutes || 60;
      return minutes / intervalFactor(naturalIntervalUnit(minutes));
    },
    set: (value) => {
      updateNudge({
        intervalMinutes: Math.max(1, Number(value || 1)) * intervalFactor(nudgeIntervalUnit.value),
      });
    },
  });
  const nudgeMaxCount = computed({
    get: () => props.draft.independentTasks.reminder.nudge?.maxCount || 4,
    set: (value) => updateNudge({ maxCount: Math.max(1, Number(value || 1)) }),
  });
  const nudgeStop = computed<'completion_or_due' | 'max_count'>({
    get: () => props.draft.independentTasks.reminder.nudge?.stop || 'completion_or_due',
    set: (stop) => updateNudge({ stop }),
  });

  function recommendedEndDate() {
    return suggestTodoPlanEndDate(props.draft.timing.startAt || props.draft.timing.dueAt);
  }

  function planDueDate() {
    return String(props.draft.timing.dueAt || '').slice(0, 10);
  }

  function defaultReminderTrigger() {
    if (props.draft.timing.startAt) return { type: 'at_start' as const };
    if (props.draft.timing.dueAt) return { type: 'before_due' as const, offsetMinutes: 0 };
    return { type: 'fixed_time' as const, fixedTime: '09:00' };
  }

  function naturalIntervalUnit(minutes: number): 'minute' | 'hour' | 'day' {
    if (minutes % 1440 === 0) return 'day';
    if (minutes % 60 === 0) return 'hour';
    return 'minute';
  }

  function intervalFactor(unit: 'minute' | 'hour' | 'day') {
    return unit === 'day' ? 1440 : unit === 'hour' ? 60 : 1;
  }

  function updateNudge(
    patch: Partial<{ intervalMinutes: number; maxCount: number; stop: 'completion_or_due' | 'max_count' }>,
  ) {
    props.draft.independentTasks.reminder.nudge = {
      intervalMinutes: 60,
      maxCount: 4,
      stop: 'completion_or_due',
      ...props.draft.independentTasks.reminder.nudge,
      ...patch,
    };
  }

  watch(
    [() => planType.value, () => endMode.value, () => props.draft.timing.dueAt],
    () => {
      const dueDate = planDueDate();
      if (planType.value !== 'scheduled' || endMode.value !== 'until' || !dueDate) return;
      if (props.draft.independentTasks.plan.end?.untilDate === dueDate) return;
      props.draft.independentTasks.plan.end = { mode: 'until', untilDate: dueDate };
    },
    { immediate: true },
  );
</script>

<style scoped lang="less">
  .todo-independent-plan {
    display: grid;
    gap: 16px;
  }

  .todo-independent-plan__notice {
    display: grid;
    gap: 4px;
    padding: 12px 14px;
    border: 1px solid var(--primary-color);
    border-radius: 11px;
    background: var(--mobile-selected-bg, var(--workspace-panel-bg-color));
    color: var(--primary-color);
  }

  .todo-independent-plan__notice span,
  header small {
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.5;
  }

  .todo-independent-plan section,
  .todo-independent-plan header {
    display: grid;
    gap: 12px;
  }

  .todo-independent-plan header {
    gap: 3px;
  }

  .todo-independent-plan__grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .todo-independent-plan label,
  .todo-independent-plan__field {
    display: grid;
    gap: 7px;
    min-width: 0;
    color: var(--text-color);
    font-size: 13px;
    font-weight: 600;
  }

  .todo-independent-plan__field-hint {
    color: var(--desc-color);
    font-size: 12px;
    font-weight: 400;
    line-height: 1.5;
  }

  .todo-independent-plan__wide {
    grid-column: 1 / -1;
  }

  .todo-independent-plan__inline {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    font-weight: 400;
  }

  .todo-independent-plan__inline--select {
    grid-template-columns: minmax(0, 1fr) minmax(110px, 0.4fr);
  }

  .todo-independent-plan__nudge-hint {
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.55;
  }

  .todo-independent-plan__days {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .todo-independent-plan__days :deep(.b_btn.is-active) {
    border-color: var(--primary-color);
    background: var(--mobile-selected-bg, var(--workspace-panel-bg-color));
    color: var(--primary-color);
    font-weight: 700;
  }

  @media (max-width: 767px) {
    .todo-independent-plan__grid {
      grid-template-columns: 1fr;
    }

    .todo-independent-plan__wide {
      grid-column: auto;
    }
  }
</style>
