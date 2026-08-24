<template>
  <div class="todo-reminder-repeat">
    <div class="todo-reminder-repeat__segment" role="group" :aria-label="t('inbox.todoReminderRepeatKind')">
      <BButton
        v-for="option in kindOptions"
        :key="option.value"
        :class="{ 'is-active': repeatKind === option.value }"
        :aria-pressed="repeatKind === option.value"
        @click="repeatKind = option.value"
      >
        {{ option.label }}
      </BButton>
    </div>

    <div v-if="repeatKind === 'interval'" class="todo-reminder-repeat__grid">
      <label>
        <span>{{ t('inbox.todoReminderFirstAt') }}</span>
        <BDateTimePicker v-model:value="startAt" />
      </label>
      <div class="todo-reminder-repeat__field">
        <span>{{ t('inbox.todoReminderEvery') }}</span>
        <div class="todo-reminder-repeat__interval">
          <BInput v-model:value="intervalCount" type="number" :aria-label="t('inbox.todoReminderEvery')" />
          <BSelect
            v-model:value="intervalUnit"
            :aria-label="t('inbox.todoReminderIntervalUnit')"
            :options="intervalUnitOptions"
          />
        </div>
      </div>
    </div>

    <div v-else class="todo-reminder-repeat__grid">
      <label class="todo-reminder-repeat__wide">
        <span>{{ repeatKind === 'weekly' ? t('inbox.todoReminderWeekdays') : t('inbox.todoReminderMonthDays') }}</span>
        <div v-if="repeatKind === 'weekly'" class="todo-reminder-repeat__days">
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
        <BInput v-else v-model:value="monthDaysText" :placeholder="t('inbox.todoReminderMonthDaysPlaceholder')" />
      </label>
      <label>
        <span>{{ t('inbox.todoReminderStartDate') }}</span>
        <BDateTimePicker v-model:value="startDate" :show-time="false" />
      </label>
      <label>
        <span>{{ t('inbox.todoReminderLocalTime') }}</span>
        <BTimePicker v-model:value="localTime" :aria-label="t('inbox.todoReminderLocalTime')" />
      </label>
      <label v-if="repeatKind === 'monthly'">
        <span>{{ t('inbox.todoReminderShortMonth') }}</span>
        <BSelect v-model:value="shortMonthPolicy" :options="shortMonthOptions" />
      </label>
    </div>

    <div class="todo-reminder-repeat__grid todo-reminder-repeat__stop">
      <label>
        <span>{{ t('inbox.todoReminderStop') }}</span>
        <BSelect v-model:value="stopType" :options="stopOptions" />
      </label>
      <label v-if="stopType === 'until'">
        <span>{{ t('inbox.todoReminderUntil') }}</span>
        <BDateTimePicker v-model:value="until" />
      </label>
      <label v-if="stopType === 'max_count'">
        <span>{{ t('inbox.todoReminderMaxCount') }}</span>
        <BInput v-model:value="maxCount" type="number" />
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BDateTimePicker from '@/components/base/BasicComponents/BDateTimePicker.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BTimePicker from '@/components/base/BasicComponents/BTimePicker.vue';
  import type { TodoSingleRepeatKind, TodoSingleReminderStopType, TodoSingleTaskReminderSchedule } from '@/api/todoApi';

  const reminder = defineModel<TodoSingleTaskReminderSchedule>({ required: true });
  const { t } = useI18n();
  const kindOptions = computed<Array<{ value: TodoSingleRepeatKind; label: string }>>(() => [
    { value: 'interval', label: t('inbox.todoReminderByInterval') },
    { value: 'weekly', label: t('inbox.todoReminderByWeek') },
    { value: 'monthly', label: t('inbox.todoReminderByMonth') },
  ]);
  const weekdayOptions = computed(() =>
    [1, 2, 3, 4, 5, 6, 7].map((value) => ({ value, label: t(`inbox.todoWeekday${value}`) })),
  );
  const stopOptions = computed<Array<{ value: TodoSingleReminderStopType; label: string }>>(() => [
    { value: 'completion_or_due', label: t('inbox.todoReminderStopCompletionOrDue') },
    { value: 'completion', label: t('inbox.todoReminderStopCompletion') },
    { value: 'until', label: t('inbox.todoReminderStopUntil') },
    { value: 'max_count', label: t('inbox.todoReminderStopMaxCount') },
    { value: 'manual', label: t('inbox.todoReminderStopManual') },
  ]);
  const shortMonthOptions = computed(() => [
    { value: 'last_day', label: t('inbox.todoReminderShortMonthLastDay') },
    { value: 'skip', label: t('inbox.todoReminderShortMonthSkip') },
  ]);
  const intervalUnitOptions = computed(() => [
    { value: 'minute', label: t('inbox.todoReminderMinutes') },
    { value: 'hour', label: t('inbox.todoReminderHours') },
    { value: 'day', label: t('inbox.todoReminderDays') },
  ]);
  const intervalUnitFactors = { minute: 1, hour: 60, day: 1440 } as const;

  function inferIntervalUnit(minutes: number): keyof typeof intervalUnitFactors {
    if (minutes >= 1440 && minutes % 1440 === 0) return 'day';
    if (minutes >= 60 && minutes % 60 === 0) return 'hour';
    return 'minute';
  }

  function updateRepeat(patch: Record<string, unknown>) {
    reminder.value = {
      ...reminder.value,
      mode: 'repeat',
      repeat: {
        kind: reminder.value.repeat?.kind || 'interval',
        stop: reminder.value.repeat?.stop || { type: 'completion_or_due' },
        ...reminder.value.repeat,
        ...patch,
      },
    };
  }

  const repeatKind = computed<TodoSingleRepeatKind>({
    get: () => reminder.value.repeat?.kind || 'interval',
    set: (kind) => {
      const defaults =
        kind === 'weekly'
          ? { weekdays: [1, 3, 5], localTime: '09:00' }
          : kind === 'monthly'
            ? { monthDays: [1], localTime: '09:00', shortMonthPolicy: 'last_day' as const }
            : { intervalMinutes: 1440 };
      updateRepeat({ kind, ...defaults });
    },
  });
  const startAt = computed({
    get: () => reminder.value.repeat?.startAt || '',
    set: (value) => updateRepeat({ startAt: value }),
  });
  const intervalUnit = computed<keyof typeof intervalUnitFactors>({
    get: () => inferIntervalUnit(reminder.value.repeat?.intervalMinutes || 1440),
    set: (unit) => {
      const minutes = reminder.value.repeat?.intervalMinutes || 1440;
      const currentUnit = inferIntervalUnit(minutes);
      const count = Math.max(1, minutes / intervalUnitFactors[currentUnit]);
      updateRepeat({ intervalMinutes: Math.round(count * intervalUnitFactors[unit]) });
    },
  });
  const intervalCount = computed({
    get: () => {
      const minutes = reminder.value.repeat?.intervalMinutes || 1440;
      return minutes / intervalUnitFactors[inferIntervalUnit(minutes)];
    },
    set: (value) => {
      const count = Math.max(1, Number(value || 1));
      updateRepeat({ intervalMinutes: Math.round(count * intervalUnitFactors[intervalUnit.value]) });
    },
  });
  const startDate = computed({
    get: () => reminder.value.repeat?.startDate || '',
    set: (value) => updateRepeat({ startDate: String(value).slice(0, 10) }),
  });
  const localTime = computed({
    get: () => reminder.value.repeat?.localTime || '09:00',
    set: (value) => updateRepeat({ localTime: String(value).slice(0, 5) }),
  });
  const weekdays = computed(() => reminder.value.repeat?.weekdays || []);
  function toggleWeekday(day: number) {
    const next = weekdays.value.includes(day)
      ? weekdays.value.filter((value) => value !== day)
      : [...weekdays.value, day];
    updateRepeat({ weekdays: next.sort((a, b) => a - b) });
  }
  const monthDaysText = computed({
    get: () => (reminder.value.repeat?.monthDays || []).join('、'),
    set: (value) => {
      const days = String(value)
        .split(/[,，、\s]+/)
        .map(Number)
        .filter((day) => Number.isInteger(day) && day >= 1 && day <= 31);
      updateRepeat({ monthDays: [...new Set(days)].sort((a, b) => a - b) });
    },
  });
  const shortMonthPolicy = computed({
    get: () => reminder.value.repeat?.shortMonthPolicy || 'last_day',
    set: (value) => updateRepeat({ shortMonthPolicy: value }),
  });
  const stopType = computed<TodoSingleReminderStopType>({
    get: () => reminder.value.repeat?.stop?.type || 'completion_or_due',
    set: (type) =>
      updateRepeat({
        stop: {
          type,
          ...(type === 'until' ? { until: reminder.value.repeat?.stop?.until || '' } : {}),
          ...(type === 'max_count' ? { maxCount: reminder.value.repeat?.stop?.maxCount || 30 } : {}),
        },
      }),
  });
  const until = computed({
    get: () => reminder.value.repeat?.stop?.until || '',
    set: (value) => updateRepeat({ stop: { type: 'until', until: value } }),
  });
  const maxCount = computed({
    get: () => reminder.value.repeat?.stop?.maxCount || 30,
    set: (value) => updateRepeat({ stop: { type: 'max_count', maxCount: Number(value || 30) } }),
  });
</script>

<style scoped lang="less">
  .todo-reminder-repeat {
    display: grid;
    gap: 14px;
  }

  .todo-reminder-repeat__segment {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    padding: 3px;
    border-radius: 10px;
    background: var(--workspace-panel-bg-color);
  }

  .todo-reminder-repeat__segment :deep(.b_btn) {
    width: 100%;
    min-width: 0;
    border: 1px solid transparent;
    background: transparent;
  }

  .todo-reminder-repeat__segment :deep(.b_btn.is-active) {
    border-color: var(--primary-color);
    background: var(--card-background);
    color: var(--primary-color);
    font-weight: 700;
  }

  .todo-reminder-repeat__grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .todo-reminder-repeat label,
  .todo-reminder-repeat__field {
    display: grid;
    gap: 7px;
    min-width: 0;
    color: var(--text-color);
    font-size: 13px;
    font-weight: 600;
  }

  .todo-reminder-repeat__wide {
    grid-column: 1 / -1;
  }

  .todo-reminder-repeat__interval {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 112px;
    gap: 8px;
  }

  .todo-reminder-repeat__days {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .todo-reminder-repeat__days :deep(.b_btn.is-active) {
    border-color: var(--primary-color);
    background: var(--mobile-selected-bg, var(--workspace-panel-bg-color));
    color: var(--primary-color);
    font-weight: 700;
  }

  .todo-reminder-repeat label :deep(.b-popover-trigger),
  .todo-reminder-repeat label :deep(.b-time-trigger) {
    width: 100%;
  }

  .todo-reminder-repeat label :deep(.b-time-trigger) {
    min-height: 38px;
  }

  .todo-reminder-repeat__stop {
    padding-top: 14px;
    border-top: 1px solid var(--surface-divider-color);
  }

  @media (max-width: 767px) {
    .todo-reminder-repeat__segment :deep(.b_btn) {
      height: auto;
      min-height: 44px;
      padding-block: 6px;
      line-height: 1.35;
      white-space: normal;
    }

    .todo-reminder-repeat__grid {
      grid-template-columns: 1fr;
    }

    .todo-reminder-repeat__wide {
      grid-column: auto;
    }
  }
</style>
