<template>
  <div class="todo-independent-plan">
    <section class="todo-independent-plan__intro" role="note">
      <div>
        <strong>{{ t('inbox.todoGuidedIntroTitle') }}</strong>
        <span>{{ t('inbox.todoGuidedIntroHint') }}</span>
      </div>
      <div class="todo-independent-plan__flow" aria-hidden="true">
        <span>1 {{ t('inbox.todoGuidedFlowRepeat') }}</span>
        <i>→</i>
        <span>2 {{ t('inbox.todoGuidedFlowEnd') }}</span>
        <i>→</i>
        <span>3 {{ t('inbox.todoGuidedFlowReminder') }}</span>
      </div>
    </section>

    <section class="todo-independent-plan__step">
      <header class="todo-independent-plan__step-head">
        <span class="todo-independent-plan__step-index">1</span>
        <div>
          <strong>{{ t('inbox.todoGuidedRepeatTitle') }}</strong>
          <small>{{ t('inbox.todoGuidedRepeatHint') }}</small>
        </div>
      </header>
      <div
        class="todo-independent-plan__choices todo-independent-plan__choices--two"
        role="group"
        :aria-label="t('inbox.todoPlanGenerationMode')"
      >
        <BButton
          v-for="option in planTypeOptions"
          :key="option.value"
          :class="{ 'is-active': planType === option.value }"
          :aria-pressed="planType === option.value"
          @click="planType = option.value"
        >
          {{ option.label }}
        </BButton>
      </div>
      <p class="todo-independent-plan__selection-hint">{{ planTypeHint }}</p>
      <div class="todo-independent-plan__fields">
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
                :aria-pressed="weekdays.includes(day.value)"
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
      </div>
    </section>

    <section class="todo-independent-plan__step">
      <header class="todo-independent-plan__step-head">
        <span class="todo-independent-plan__step-index">2</span>
        <div>
          <strong>{{ t('inbox.todoGuidedEndTitle') }}</strong>
          <small>{{ t('inbox.todoGuidedEndHint') }}</small>
        </div>
      </header>
      <div class="todo-independent-plan__choices" role="group" :aria-label="t('inbox.todoPlanEndMode')">
        <BButton
          v-for="option in endOptions"
          :key="option.value"
          :class="{ 'is-active': endMode === option.value }"
          :aria-pressed="endMode === option.value"
          @click="endMode = option.value"
        >
          {{ option.label }}
        </BButton>
      </div>
      <p class="todo-independent-plan__selection-hint">{{ endModeHint }}</p>
      <div v-if="endMode !== 'never'" class="todo-independent-plan__fields">
        <label v-if="scheduledEndUsesDueAt" class="todo-independent-plan__wide">
          <span>{{ t('inbox.todoGuidedEndUntilLabel') }}</span>
          <BDateTimePicker v-model:value="dueAt" />
          <small class="todo-independent-plan__field-hint">{{ t('inbox.todoGuidedEndUntilFieldHint') }}</small>
        </label>
        <label v-else-if="endMode === 'count'">
          <span>{{ t('inbox.todoPlanEndCount') }}</span>
          <BInput v-model:value="endCount" type="number" />
          <small class="todo-independent-plan__field-hint">{{ t('inbox.todoPlanEndCountHint') }}</small>
        </label>
      </div>
    </section>

    <section class="todo-independent-plan__step">
      <header class="todo-independent-plan__step-head">
        <span class="todo-independent-plan__step-index">3</span>
        <div>
          <strong>{{ t('inbox.todoGuidedReminderTitle') }}</strong>
          <small>{{ t('inbox.todoGuidedReminderHint') }}</small>
        </div>
      </header>
      <div class="todo-independent-plan__choices" role="group" :aria-label="t('inbox.todoReminder')">
        <BButton
          v-for="option in reminderOptions"
          :key="option.value"
          :class="{ 'is-active': reminderMode === option.value }"
          :aria-pressed="reminderMode === option.value"
          @click="reminderMode = option.value"
        >
          {{ option.label }}
        </BButton>
      </div>
      <p class="todo-independent-plan__selection-hint">{{ reminderModeHint }}</p>

      <template v-if="reminderMode !== 'none'">
        <div class="todo-independent-plan__subsection">
          <strong>{{ t('inbox.todoReminderWhen') }}</strong>
          <div class="todo-independent-plan__choices" role="group" :aria-label="t('inbox.todoReminderWhen')">
            <BButton
              v-for="option in triggerOptions"
              :key="option.value"
              :class="{ 'is-active': triggerType === option.value }"
              :aria-pressed="triggerType === option.value"
              @click="triggerType = option.value"
            >
              {{ option.label }}
            </BButton>
          </div>
          <p class="todo-independent-plan__selection-hint">{{ reminderTriggerHint }}</p>
        </div>

        <div class="todo-independent-plan__fields">
          <label v-if="triggerType === 'fixed_time'">
            <span>{{ t('inbox.todoReminderFixedTime') }}</span>
            <BInput v-model:value="fixedTime" type="time" />
            <small class="todo-independent-plan__field-hint">{{ t('inbox.todoReminderFixedTimeHint') }}</small>
          </label>
          <label v-else-if="triggerType === 'at_start'">
            <span>{{ t('inbox.todoGuidedRequiredStartLabel') }}</span>
            <BDateTimePicker v-model:value="startAt" />
            <small class="todo-independent-plan__field-hint">{{ t('inbox.todoPlanStartTimePurpose') }}</small>
          </label>
          <template v-else>
            <label v-if="!scheduledEndUsesDueAt">
              <span>{{ t('inbox.todoGuidedRequiredDueLabel') }}</span>
              <BDateTimePicker v-model:value="dueAt" />
              <small class="todo-independent-plan__field-hint">{{ t('inbox.todoPlanDueTimePurpose') }}</small>
            </label>
            <div v-else class="todo-independent-plan__linked-note" role="note">
              {{ t('inbox.todoGuidedUsesEndDue') }}
            </div>
            <label>
              <span>{{ t('inbox.todoReminderOffsetMinutes') }}</span>
              <div class="todo-independent-plan__inline">
                <BInput v-model:value="offsetMinutes" type="number" />
                <span>{{ t('inbox.todoReminderMinutes') }}</span>
              </div>
              <small class="todo-independent-plan__field-hint">{{ t('inbox.todoReminderOffsetHint') }}</small>
            </label>
          </template>

          <template v-if="reminderMode === 'nudge'">
            <small class="todo-independent-plan__wide todo-independent-plan__nudge-hint">
              {{ t('inbox.todoNudgeConfigHint') }}
            </small>
            <div class="todo-independent-plan__field">
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
            <label>
              <span>{{ t('inbox.todoNudgeMaxCount') }}</span>
              <BInput v-model:value="nudgeMaxCount" type="number" />
            </label>
            <label>
              <span>{{ t('inbox.todoNudgeStop') }}</span>
              <BSelect v-model:value="nudgeStop" :options="nudgeStopOptions" />
            </label>
          </template>
        </div>
      </template>
    </section>

    <section v-if="needsPastPolicy" class="todo-independent-plan__past" aria-live="polite">
      <header>
        <strong>{{ t('inbox.todoGuidedPastTitle') }}</strong>
        <small>{{ t('inbox.todoGuidedPastHint') }}</small>
      </header>
      <div class="todo-independent-plan__past-options" role="group" :aria-label="t('inbox.todoPastChoose')">
        <BButton
          v-for="option in pastPolicyOptions"
          :key="option.value"
          :class="{ 'is-active': pastPolicy === option.value }"
          :aria-pressed="pastPolicy === option.value"
          @click="pastPolicy = option.value"
        >
          <strong>{{ option.label }}</strong>
          <small>{{ pastPolicyHint(option.value) }}</small>
        </BButton>
      </div>
    </section>

    <section class="todo-independent-plan__more" :class="{ 'is-open': moreSettingsOpen }">
      <div class="todo-independent-plan__more-head">
        <div>
          <strong>{{ t('inbox.todoGuidedMoreTitle') }}</strong>
          <small>{{ moreSettingsHint }}</small>
        </div>
        <BButton
          size="small"
          :aria-expanded="moreSettingsOpen"
          aria-controls="todo-independent-plan-more-fields"
          @click="moreSettingsOpen = !moreSettingsOpen"
        >
          {{ moreSettingsOpen ? t('common.collapse') : t('common.expand') }}
        </BButton>
      </div>
      <div v-if="moreSettingsOpen" id="todo-independent-plan-more-fields" class="todo-independent-plan__fields">
        <label v-if="reminderMode === 'none' || triggerType !== 'at_start'">
          <span>{{ t('inbox.todoStartAt') }}</span>
          <BDateTimePicker v-model:value="startAt" />
          <small class="todo-independent-plan__field-hint">{{ t('inbox.todoPlanStartTimePurpose') }}</small>
        </label>
        <label v-if="(reminderMode === 'none' || triggerType !== 'before_due') && !scheduledEndUsesDueAt">
          <span>{{ t('inbox.todoDueAt') }}</span>
          <BDateTimePicker v-model:value="dueAt" />
          <small class="todo-independent-plan__field-hint">{{ t('inbox.todoPlanDueTimePurpose') }}</small>
        </label>
        <label class="todo-independent-plan__wide">
          <span>{{ t('inbox.todoPlanTimezone') }}</span>
          <BSelect v-model:value="props.draft.timing.timezone" :options="timezoneOptions" />
          <small class="todo-independent-plan__field-hint">{{ t('inbox.todoPlanTimezoneHint') }}</small>
        </label>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BDateTimePicker from '@/components/base/BasicComponents/BDateTimePicker.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import type {
    TodoPastPolicy,
    TodoPlanEndMode,
    TodoPlanType,
    TodoRecurrenceFrequency,
    TodoReminderTriggerType,
    TodoReminderV2Mode,
  } from '@/api/todoApi';
  import { suggestTodoPlanEndDate, todoTodayInTimezone, type TodoCreateDraftV3 } from './todoDraftNormalizer';

  const props = withDefaults(defineProps<{ draft: TodoCreateDraftV3; needsPastPolicy?: boolean }>(), {
    needsPastPolicy: false,
  });
  const needsPastPolicy = computed(() => props.needsPastPolicy);
  const { t } = useI18n();
  const planTypeOptions = computed<Array<{ value: Exclude<TodoPlanType, 'once'>; label: string }>>(() => [
    { value: 'scheduled', label: t('inbox.todoPlanScheduled') },
    { value: 'after_completion', label: t('inbox.todoPlanAfterCompletion') },
  ]);
  const frequencyOptions = computed<Array<{ value: TodoRecurrenceFrequency; label: string }>>(() => [
    { value: 'daily', label: t('inbox.todoRecurrenceDaily') },
    { value: 'weekly', label: t('inbox.todoRecurrenceWeekly') },
    { value: 'monthly', label: t('inbox.todoRecurrenceMonthly') },
  ]);
  const unitOptions = computed(() => [
    { value: 'day', label: t('inbox.todoReminderDays') },
    { value: 'week', label: t('inbox.todoReminderWeeks') },
    { value: 'month', label: t('inbox.todoRecurrenceMonthly') },
  ]);
  const endOptions = computed<Array<{ value: TodoPlanEndMode; label: string }>>(() => {
    const options: Array<{ value: TodoPlanEndMode; label: string }> = [
      { value: 'count', label: t('inbox.todoPlanEndByCount') },
      { value: 'never', label: t('inbox.todoPlanNoEnd') },
    ];
    if (planType.value === 'scheduled') {
      options.unshift({ value: 'until', label: t('inbox.todoPlanEndByDate') });
    }
    return options;
  });
  const reminderOptions = computed<Array<{ value: TodoReminderV2Mode; label: string }>>(() => [
    { value: 'none', label: t('inbox.todoReminderNone') },
    { value: 'once_per_instance', label: t('inbox.todoReminderEachTaskOnce') },
    { value: 'nudge', label: t('inbox.todoReminderEachTaskNudge') },
  ]);
  const triggerOptions = computed<Array<{ value: TodoReminderTriggerType; label: string }>>(() => [
    { value: 'fixed_time', label: t('inbox.todoReminderFixedTime') },
    { value: 'at_start', label: t('inbox.todoReminderAtStart') },
    { value: 'before_due', label: t('inbox.todoReminderBeforeDue') },
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
  const pastPolicyOptions = computed<Array<{ value: TodoPastPolicy; label: string }>>(() => [
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
              end: { mode: 'until', untilDate: recommendedEndDate() },
            };
    },
  });
  const planTypeHint = computed(() =>
    planType.value === 'scheduled' ? t('inbox.todoGuidedScheduledHint') : t('inbox.todoGuidedAfterCompletionHint'),
  );
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
  let autoFilledUntilDueAt = '';
  const endMode = computed<TodoPlanEndMode>({
    get: () =>
      props.draft.independentTasks.plan.end?.mode ||
      (props.draft.independentTasks.plan.type === 'scheduled' ? 'until' : 'count'),
    set: (mode) => {
      const untilDate =
        endMode.value === 'until'
          ? planDueDate() || props.draft.independentTasks.plan.end?.untilDate || recommendedEndDate()
          : recommendedEndDate();
      props.draft.independentTasks.plan.end = {
        mode,
        ...(mode === 'count' ? { count: props.draft.independentTasks.plan.end?.count || 30 } : {}),
        ...(mode === 'until' ? { untilDate } : {}),
      };
    },
  });
  const scheduledEndUsesDueAt = computed(() => planType.value === 'scheduled' && endMode.value === 'until');
  const endModeHint = computed(() => {
    if (endMode.value === 'until') return t('inbox.todoPlanEndByDateHint');
    if (endMode.value === 'count') return t('inbox.todoPlanEndByCountHint');
    return t('inbox.todoPlanNoEndHint');
  });
  const endCount = computed({
    get: () => props.draft.independentTasks.plan.end?.count || 30,
    set: (value) => (props.draft.independentTasks.plan.end = { mode: 'count', count: Number(value || 30) }),
  });
  const pastPolicy = computed<TodoPastPolicy | ''>({
    get: () => props.draft.independentTasks.plan.pastPolicy || '',
    set: (value) => (props.draft.independentTasks.plan.pastPolicy = value || undefined),
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
  const reminderModeHint = computed(() => {
    if (reminderMode.value === 'none') return t('inbox.todoGuidedReminderNoneHint');
    if (reminderMode.value === 'nudge') return t('inbox.todoGuidedReminderNudgeHint');
    return t('inbox.todoGuidedReminderOnceHint');
  });
  const triggerType = computed<TodoReminderTriggerType>({
    get: () => props.draft.independentTasks.reminder.trigger?.type || 'fixed_time',
    set: (type) => {
      props.draft.independentTasks.reminder.trigger = {
        type,
        ...(type === 'before_due' ? { offsetMinutes: 60 } : {}),
        ...(type === 'fixed_time' ? { fixedTime: '09:00' } : {}),
      };
    },
  });
  const reminderTriggerHint = computed(() => {
    if (triggerType.value === 'at_start') return t('inbox.todoReminderAtStartPurpose');
    if (triggerType.value === 'before_due') return t('inbox.todoReminderBeforeDuePurpose');
    return t('inbox.todoReminderFixedTimePurpose');
  });
  const moreSettingsOpen = ref(
    Boolean(
      (props.draft.timing.startAt && triggerType.value !== 'at_start') ||
      (props.draft.timing.dueAt && triggerType.value !== 'before_due' && !scheduledEndUsesDueAt.value),
    ),
  );
  const moreSettingsHint = computed(() => {
    if (reminderMode.value !== 'none' && triggerType.value === 'at_start') {
      return scheduledEndUsesDueAt.value ? t('inbox.todoGuidedMoreStartUntilHint') : t('inbox.todoGuidedMoreStartHint');
    }
    if (reminderMode.value !== 'none' && triggerType.value === 'before_due') {
      return scheduledEndUsesDueAt.value ? t('inbox.todoGuidedMoreUntilHint') : t('inbox.todoGuidedMoreDueHint');
    }
    return scheduledEndUsesDueAt.value ? t('inbox.todoGuidedMoreUntilHint') : t('inbox.todoGuidedMoreHint');
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
    if (props.draft.timing.dueAt && !scheduledEndUsesDueAt.value) {
      return { type: 'before_due' as const, offsetMinutes: 0 };
    }
    return { type: 'fixed_time' as const, fixedTime: '09:00' };
  }

  function pastPolicyHint(value: TodoPastPolicy) {
    if (value === 'keep_overdue') return t('inbox.todoPastKeepHint');
    if (value === 'restart_today_keep_count') return t('inbox.todoPastRestartHint');
    return t('inbox.todoPastSkipHint');
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
    [() => planType.value, () => endMode.value],
    ([currentType, currentEndMode], previous) => {
      const usesCombinedDueAt = currentType === 'scheduled' && currentEndMode === 'until';
      const hasPrevious = previous?.[0] !== undefined || previous?.[1] !== undefined;
      const previouslyUsedCombinedDueAt = hasPrevious && previous[0] === 'scheduled' && previous[1] === 'until';

      if (usesCombinedDueAt && !previouslyUsedCombinedDueAt) {
        if (!hasPrevious && planDueDate()) return;
        const untilDate = props.draft.independentTasks.plan.end?.untilDate || recommendedEndDate();
        const existingTime = String(props.draft.timing.dueAt || '').slice(11, 16);
        const nextDueAt = `${untilDate} ${existingTime || '23:59'}`;
        autoFilledUntilDueAt = props.draft.timing.dueAt ? '' : nextDueAt;
        props.draft.timing.dueAt = nextDueAt;
        return;
      }

      if (!usesCombinedDueAt && previouslyUsedCombinedDueAt) {
        const currentDueAt = String(props.draft.timing.dueAt || '');
        if (!currentDueAt || currentDueAt === autoFilledUntilDueAt) {
          props.draft.timing.dueAt = null;
        } else {
          const anchorDate =
            String(props.draft.timing.startAt || '').slice(0, 10) || todoTodayInTimezone(props.draft.timing.timezone);
          const dueTime = currentDueAt.slice(11, 16);
          props.draft.timing.dueAt = dueTime ? `${anchorDate} ${dueTime}` : null;
        }
        autoFilledUntilDueAt = '';
      }
    },
    { immediate: true },
  );

  watch(
    () => props.draft.timing.dueAt,
    () => {
      if (autoFilledUntilDueAt && props.draft.timing.dueAt !== autoFilledUntilDueAt) autoFilledUntilDueAt = '';
      if (planType.value !== 'scheduled' || endMode.value !== 'until') return;
      const untilDate = planDueDate();
      if (props.draft.independentTasks.plan.end?.untilDate === untilDate) return;
      props.draft.independentTasks.plan.end = { mode: 'until', untilDate: untilDate || null };
    },
    { immediate: true },
  );
</script>

<style scoped lang="less">
  .todo-independent-plan {
    display: grid;
    gap: 12px;
  }

  .todo-independent-plan__intro,
  .todo-independent-plan__step,
  .todo-independent-plan__past,
  .todo-independent-plan__more {
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--card-background);
  }

  .todo-independent-plan__intro {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 14px;
    border: 1px solid var(--primary-color);
    background: var(--mobile-selected-bg, var(--workspace-panel-bg-color));
  }

  .todo-independent-plan__intro > div:first-child,
  .todo-independent-plan__step-head > div,
  .todo-independent-plan__more-head > div,
  .todo-independent-plan__past > header {
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  .todo-independent-plan__intro strong {
    color: var(--primary-color);
    font-size: 13px;
  }

  .todo-independent-plan__intro span,
  .todo-independent-plan__step-head small,
  .todo-independent-plan__more-head small,
  .todo-independent-plan__past header small {
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.5;
  }

  .todo-independent-plan__flow {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 7px;
    color: var(--primary-color);
    font-size: 11px;
    font-weight: 700;
  }

  .todo-independent-plan__flow span {
    padding: 3px 7px;
    border: 1px solid var(--primary-color);
    border-radius: 999px;
    color: var(--primary-color);
    line-height: 1.4;
  }

  .todo-independent-plan__flow i {
    color: var(--desc-color);
    font-style: normal;
  }

  .todo-independent-plan__step {
    display: grid;
    gap: 11px;
    padding: 14px;
  }

  .todo-independent-plan__step-head {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }

  .todo-independent-plan__step-head strong,
  .todo-independent-plan__more-head strong,
  .todo-independent-plan__past header strong {
    color: var(--text-color);
    font-size: 14px;
    line-height: 1.45;
  }

  .todo-independent-plan__step-index {
    display: inline-flex;
    width: 24px;
    height: 24px;
    flex: 0 0 24px;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--primary-color);
    color: #fff;
    font-size: 12px;
    font-weight: 800;
  }

  .todo-independent-plan__choices {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 7px;
  }

  .todo-independent-plan__choices--two {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .todo-independent-plan__choices :deep(.b_btn) {
    position: relative;
    width: 100%;
    min-width: 0;
    height: auto;
    min-height: 40px;
    padding: 7px 10px;
    border: 1px solid var(--surface-border-color) !important;
    border-radius: 9px;
    background: var(--workspace-panel-bg-color);
    color: var(--text-color);
    line-height: 1.35;
    white-space: normal;
  }

  .todo-independent-plan__choices :deep(.b_btn.is-active) {
    border: 2px solid var(--primary-color) !important;
    background: var(--mobile-selected-bg, var(--workspace-panel-bg-color));
    color: var(--primary-color);
    font-weight: 700;
  }

  .todo-independent-plan__selection-hint {
    margin: -2px 0 0;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.55;
  }

  .todo-independent-plan__fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    padding-top: 2px;
  }

  .todo-independent-plan label,
  .todo-independent-plan__field {
    display: grid;
    align-content: start;
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

  .todo-independent-plan__subsection {
    display: grid;
    gap: 9px;
    padding-top: 11px;
    border-top: 1px solid var(--surface-border-color);
  }

  .todo-independent-plan__subsection > strong {
    color: var(--text-color);
    font-size: 13px;
  }

  .todo-independent-plan__linked-note {
    display: flex;
    align-items: center;
    padding: 9px 11px;
    border-left: 3px solid var(--primary-color);
    border-radius: 8px;
    background: var(--workspace-panel-bg-color);
    color: var(--desc-color);
    font-size: 12px;
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
    border: 1px solid var(--primary-color) !important;
    background: var(--mobile-selected-bg, var(--workspace-panel-bg-color));
    color: var(--primary-color);
    font-weight: 700;
  }

  .todo-independent-plan__past {
    display: grid;
    gap: 11px;
    padding: 13px 14px;
    border-left: 4px solid var(--warning-color, #d97706);
  }

  .todo-independent-plan__past-options {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 7px;
  }

  .todo-independent-plan__past-options :deep(.b_btn) {
    position: relative;
    display: flex;
    width: 100%;
    min-width: 0;
    height: auto;
    min-height: 68px;
    align-items: flex-start;
    justify-content: center;
    flex-direction: column;
    gap: 2px;
    padding: 9px 11px;
    border: 1px solid var(--surface-border-color) !important;
    background: var(--workspace-panel-bg-color);
    line-height: 1.4;
    text-align: left;
    white-space: normal;
  }

  .todo-independent-plan__past-options :deep(.b_btn.is-active) {
    border: 2px solid var(--primary-color) !important;
    background: var(--mobile-selected-bg, var(--workspace-panel-bg-color));
  }

  .todo-independent-plan__past-options :deep(.b_btn strong) {
    color: var(--text-color);
    font-size: 12px;
  }

  .todo-independent-plan__past-options :deep(.b_btn small) {
    color: var(--desc-color);
    font-size: 11px;
    line-height: 1.45;
  }

  .todo-independent-plan__more {
    display: grid;
    gap: 12px;
    padding: 12px 14px;
    background: var(--workspace-panel-bg-color);
  }

  .todo-independent-plan__more.is-open {
    border-color: var(--primary-color);
  }

  .todo-independent-plan__more-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .todo-independent-plan__more-head :deep(.b_btn) {
    flex: 0 0 auto;
  }

  @media (max-width: 767px) {
    .todo-independent-plan__intro {
      align-items: flex-start;
      flex-direction: column;
    }

    .todo-independent-plan__flow {
      width: 100%;
      justify-content: space-between;
    }

    .todo-independent-plan__flow span {
      flex: 1;
      text-align: center;
    }

    .todo-independent-plan__fields,
    .todo-independent-plan__past-options {
      grid-template-columns: 1fr;
    }

    .todo-independent-plan__wide {
      grid-column: auto;
    }

    .todo-independent-plan__choices :deep(.b_btn) {
      min-height: 44px;
      padding-inline: 6px;
      font-size: 12px;
    }

    .todo-independent-plan__more-head {
      align-items: flex-start;
    }
  }

  html.light-note-mobile-rendering .todo-independent-plan__choices :deep(.b_btn.is-active),
  html.light-note-mobile-rendering .todo-independent-plan__past-options :deep(.b_btn.is-active) {
    border-color: var(--primary-color) !important;
    color: var(--primary-color);
  }
</style>
