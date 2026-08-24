<template>
  <div class="todo-plan-editor" :class="{ 'is-desktop-layout': desktopLayout, 'is-mobile-step': mobileStep > 0 }">
    <section v-show="mobileStep !== 3" v-if="item?.planVersion === 2 && item.seriesId" class="todo-plan-editor__scope">
      <div>
        <strong>{{ t('inbox.todoPlanEditScope') }}</strong>
        <small>{{ scopeHint }}</small>
      </div>
      <BSelect v-model:value="form.scope" :options="scopeOptions" />
    </section>

    <section v-show="mobileStep !== 3" class="todo-plan-editor__section">
      <header>
        <div>
          <strong>{{ mobileStep === 2 ? t('inbox.todoPlanStepSchedule') : t('inbox.todoPlanTimeTitle') }}</strong>
          <small>{{ mobileStep === 2 ? t('inbox.todoPlanHint') : t('inbox.todoPlanTimeHint') }}</small>
        </div>
      </header>
      <div class="todo-plan-editor__grid">
        <label>
          <span>{{ t('inbox.todoStartAt') }}</span>
          <BDateTimePicker v-model:value="form.startAt" :placeholder="t('inbox.todoStartAtOptional')" />
        </label>
        <label>
          <span>{{ t('inbox.todoDueAt') }}</span>
          <BDateTimePicker v-model:value="form.dueAt" :placeholder="t('inbox.todoDuePlaceholder')" />
        </label>
      </div>
      <label class="todo-plan-editor__timezone">
        <span>{{ t('inbox.todoTimezone') }}</span>
        <BSelect v-model:value="form.timezone" :options="timezoneOptions" />
      </label>
    </section>

    <section v-show="mobileStep !== 3" class="todo-plan-editor__section">
      <header v-if="mobileStep !== 2">
        <div>
          <strong>{{ t('inbox.todoPlanTitle') }}</strong>
          <small>{{ t('inbox.todoPlanHint') }}</small>
        </div>
        <span v-if="currentOnly" class="todo-plan-editor__current-badge">{{ t('inbox.todoPlanCurrentOnly') }}</span>
      </header>

      <div
        v-if="!currentOnly"
        class="todo-plan-editor__segment todo-plan-editor__segment--plan"
        role="group"
        :aria-label="t('inbox.todoPlanTitle')"
      >
        <span v-if="mobileStep === 2" class="todo-plan-editor__segment-label">{{ t('inbox.todoPlanTitle') }}</span>
        <BButton
          v-for="option in planTypeOptions"
          :key="option.value"
          :class="{ active: form.planType === option.value }"
          @click="selectPlanType(option.value)"
        >
          {{ option.label }}
        </BButton>
      </div>

      <template v-if="!currentOnly && form.planType === 'scheduled'">
        <BButton
          v-if="mobileStep > 0"
          class="todo-plan-editor__schedule-summary"
          @click="scheduleAdvancedOpen = !scheduleAdvancedOpen"
        >
          <span>{{ t('inbox.todoPlanRepeatSummary') }}</span>
          <strong>{{ scheduleSummary }}</strong>
        </BButton>
        <div v-show="mobileStep === 0 || scheduleAdvancedOpen" class="todo-plan-editor__scheduled-config">
          <div class="todo-plan-editor__grid">
            <label>
              <span>{{ t('inbox.todoPlanFrequency') }}</span>
              <BSelect v-model:value="form.frequency" :options="frequencyOptions" />
            </label>
            <label>
              <span>{{ t('inbox.todoPlanEvery') }}</span>
              <div class="todo-plan-editor__inline">
                <BInput v-model:value="form.planInterval" type="number" />
                <span>{{ frequencyUnitLabel }}</span>
              </div>
            </label>
          </div>

          <div v-if="form.frequency === 'weekly'" class="todo-plan-editor__weekdays">
            <span>{{ t('inbox.todoPlanWeekdays') }}</span>
            <div>
              <BCheckbox v-for="day in weekdayOptions" :key="day.value" v-model="weekdayState[day.value]">
                {{ day.label }}
              </BCheckbox>
            </div>
          </div>

          <div v-if="form.frequency === 'monthly'" class="todo-plan-editor__grid">
            <label>
              <span>{{ t('inbox.todoPlanMonthDay') }}</span>
              <BInput v-model:value="form.monthDay" type="number" />
            </label>
            <label>
              <span>{{ t('inbox.todoPlanShortMonth') }}</span>
              <BSelect v-model:value="form.shortMonthPolicy" :options="shortMonthOptions" />
            </label>
          </div>

          <div class="todo-plan-editor__grid">
            <label>
              <span>{{ t('inbox.todoPlanEndMode') }}</span>
              <BSelect v-model:value="form.endMode" :options="endModeOptions" />
            </label>
            <label v-if="form.endMode === 'count'">
              <span>{{ t('inbox.todoPlanCount') }}</span>
              <BInput v-model:value="form.endCount" type="number" />
            </label>
            <label v-else-if="form.endMode === 'until'">
              <span>{{ t('inbox.todoPlanUntil') }}</span>
              <BDateTimePicker v-model:value="form.untilAt" />
            </label>
          </div>
        </div>
      </template>

      <template v-else-if="!currentOnly && form.planType === 'after_completion'">
        <p class="todo-plan-editor__meaning">{{ t('inbox.todoPlanAfterCompletionMeaning') }}</p>
        <div class="todo-plan-editor__grid">
          <label>
            <span>{{ t('inbox.todoPlanAfterInterval') }}</span>
            <div class="todo-plan-editor__inline">
              <BInput v-model:value="form.planInterval" type="number" />
              <BSelect v-model:value="form.afterUnit" :options="afterUnitOptions" />
            </div>
          </label>
          <label>
            <span>{{ t('inbox.todoPlanEndMode') }}</span>
            <BSelect v-model:value="form.afterEndMode" :options="afterEndModeOptions" />
          </label>
          <label v-if="form.afterEndMode === 'count'">
            <span>{{ t('inbox.todoPlanCount') }}</span>
            <BInput v-model:value="form.endCount" type="number" />
          </label>
        </div>
      </template>
    </section>

    <section v-show="mobileStep !== 2" ref="reminderEditorRef" class="todo-plan-editor__section">
      <header>
        <div>
          <strong>{{
            mobileStep === 3
              ? t('inbox.todoPlanStepReminder')
              : repeatingPlan
                ? t('inbox.todoPerItemReminder')
                : t('inbox.todoReminder')
          }}</strong>
          <small>{{ t('inbox.todoPerItemReminderHint') }}</small>
        </div>
      </header>

      <div
        class="todo-plan-editor__segment todo-plan-editor__segment--reminder"
        role="group"
        :aria-label="repeatingPlan ? t('inbox.todoPerItemReminder') : t('inbox.todoReminder')"
      >
        <span v-if="mobileStep === 3" class="todo-plan-editor__segment-label">{{
          repeatingPlan ? t('inbox.todoPerItemReminder') : t('inbox.todoReminder')
        }}</span>
        <BButton
          v-for="option in reminderModeOptions"
          :key="option.value"
          :class="{ active: form.reminderMode === option.value }"
          @click="selectReminderMode(option.value)"
        >
          {{ option.label }}
        </BButton>
      </div>

      <template v-if="form.reminderMode !== 'none'">
        <div class="todo-plan-editor__grid">
          <label>
            <span>{{ t('inbox.todoReminderTrigger') }}</span>
            <BSelect v-model:value="form.triggerType" :options="triggerOptions" />
          </label>
          <label v-if="form.triggerType === 'fixed_time'">
            <span>{{ t('inbox.todoReminderFixedTime') }}</span>
            <BTimePicker v-model:value="form.fixedTime" block :aria-label="t('inbox.todoReminderFixedTime')" />
          </label>
          <label v-else-if="form.triggerType === 'before_due'">
            <span>{{ t('inbox.todoReminderBeforeDue') }}</span>
            <div class="todo-plan-editor__inline">
              <BInput v-model:value="form.offsetMinutes" type="number" />
              <span>{{ t('inbox.todoReminderMinutes') }}</span>
            </div>
          </label>
        </div>

        <div class="todo-plan-editor__channels">
          <BCheckbox v-model="form.inAppReminder">{{ t('inbox.todoReminderInApp') }}</BCheckbox>
          <BCheckbox v-model="form.emailReminder">{{ t('inbox.todoReminderEmail') }}</BCheckbox>
        </div>
        <label v-if="form.emailReminder">
          <span>{{ t('inbox.todoReminderEmailAddress') }}</span>
          <BInput v-model:value="form.reminderEmail" :maxlength="254" />
        </label>

        <BButton
          v-if="mobileStep > 0"
          size="small"
          class="todo-plan-editor__advanced-toggle"
          @click="reminderAdvancedOpen = !reminderAdvancedOpen"
        >
          {{ reminderAdvancedOpen ? t('inbox.todoPlanLessReminderOptions') : t('inbox.todoPlanMoreReminderOptions') }}
        </BButton>
        <div v-show="mobileStep === 0 || reminderAdvancedOpen" class="todo-plan-editor__advanced">
          <div v-if="form.reminderMode === 'nudge'" class="todo-plan-editor__nudge">
            <p class="todo-plan-editor__meaning">{{ t('inbox.todoNudgeMeaning') }}</p>
            <div class="todo-plan-editor__grid">
              <label>
                <span>{{ t('inbox.todoNudgeInterval') }}</span>
                <div class="todo-plan-editor__inline">
                  <BInput v-model:value="form.nudgeIntervalMinutes" type="number" />
                  <span>{{ t('inbox.todoReminderMinutes') }}</span>
                </div>
              </label>
              <label>
                <span>{{ t('inbox.todoNudgeMaxCount') }}</span>
                <BInput v-model:value="form.nudgeMaxCount" type="number" />
              </label>
              <label>
                <span>{{ t('inbox.todoNudgeStop') }}</span>
                <BSelect v-model:value="form.nudgeStop" :options="nudgeStopOptions" />
              </label>
            </div>
          </div>

          <label>
            <span>{{ t('inbox.todoQuietPolicy') }}</span>
            <BSelect v-model:value="form.quietPolicy" :options="quietPolicyOptions" />
          </label>
        </div>
      </template>
    </section>

    <section v-show="mobileStep !== 2" class="todo-plan-preview" :class="{ 'has-error': previewError }">
      <header>
        <div>
          <strong>{{ t('inbox.todoPlanPreview') }}</strong>
          <small>{{ t('inbox.todoPlanPreviewServer') }}</small>
        </div>
        <BLoading v-if="previewLoading" inline loading :title="t('common.loading')" />
      </header>
      <p v-if="previewError" class="todo-plan-preview__error">{{ previewError }}</p>
      <template v-else-if="preview">
        <strong class="todo-plan-preview__headline">{{ preview.displaySummary.title }}</strong>
        <div class="todo-plan-preview__summary-list">
          <div>
            <span>{{ t('inbox.todoPlanPreviewRange') }}</span>
            <strong>{{ preview.displaySummary.range }}</strong>
          </div>
          <div v-if="preview.displaySummary.timing">
            <span>{{ t('inbox.todoPlanPreviewTiming') }}</span>
            <strong>{{ preview.displaySummary.timing }}</strong>
          </div>
          <div>
            <span>{{ t('inbox.todoPlanPreviewReminder') }}</span>
            <strong>{{ preview.displaySummary.reminder }}</strong>
          </div>
        </div>
        <div class="todo-plan-preview__facts">
          <span>{{
            t('inbox.todoPlanInstances', { count: preview.occurrenceCount ?? preview.generatedNowCount })
          }}</span>
          <span>{{ t('inbox.todoPlanReminderJobs', { count: preview.reminderJobCount }) }}</span>
          <span v-if="preview.nextReminderAt">{{
            t('inbox.todoPlanNextReminder', { time: preview.nextReminderAt })
          }}</span>
        </div>
      </template>
      <p v-else>{{ t('inbox.todoPlanPreviewWaiting') }}</p>
      <div v-if="needsPastPolicy" class="todo-plan-editor__past">
        <div>
          <strong>{{ t('inbox.todoPastChoiceTitle') }}</strong>
          <small>{{ t('inbox.todoPastChoiceHint') }}</small>
        </div>
        <div class="todo-plan-editor__past-options" role="group" :aria-label="t('inbox.todoPastChoose')">
          <BButton
            v-for="option in pastPolicyOptions"
            :key="option.value"
            :class="{ active: form.pastPolicy === option.value }"
            @click="selectPastPolicy(option.value)"
          >
            <strong>{{ option.label }}</strong>
            <small>{{ pastPolicyHint(option.value) }}</small>
          </BButton>
        </div>
      </div>
      <slot name="preview-actions" />
    </section>
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import BDateTimePicker from '@/components/base/BasicComponents/BDateTimePicker.vue';
  import BTimePicker from '@/components/base/BasicComponents/BTimePicker.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import {
    previewLegacyTodoConversionV2,
    previewTodoPlanUpdateV2,
    previewTodoPlanV2,
    type TodoChecklistItem,
    type TodoItem,
    type TodoPastPolicy,
    type TodoPlanDraft,
    type TodoPlanPreview,
    type TodoPlanScope,
    type TodoPlanWritePayload,
    type TodoPriority,
    type TodoReminderV2Config,
    type TodoResourceRefInput,
  } from '@/api/todoApi';
  import { generateUUID } from '@/utils/common';
  import { toTodoLocalInput } from '@/utils/todoPlanning';
  import { todoTodayInTimezone } from './todoDraftNormalizer';

  const props = withDefaults(
    defineProps<{
      item?: TodoItem | null;
      title: string;
      description: string;
      checklist: TodoChecklistItem[];
      priority: TodoPriority;
      resourceRefs: TodoResourceRefInput[];
      initialDueAt?: string | null;
      legacyConversion?: boolean;
      /** PC 使用原型中的左侧表单 + 右侧权威预览布局。 */
      desktopLayout?: boolean;
      /** 0 为桌面完整表单；2/3 分别只展示移动端计划或提醒确认步骤。 */
      mobileStep?: 0 | 1 | 2 | 3;
      resetKey?: number;
    }>(),
    { item: null, initialDueAt: null, legacyConversion: false, desktopLayout: false, mobileStep: 0, resetKey: 0 },
  );
  const emit = defineEmits<{
    ready: [value: { scope: TodoPlanScope; payload: TodoPlanWritePayload } | null];
    'preview-count': [count: number];
  }>();
  const { t, locale } = useI18n();
  const preview = ref<TodoPlanPreview | null>(null);
  const previewError = ref('');
  const previewLoading = ref(false);
  const needsPastPolicy = ref(false);
  const reminderEditorRef = ref<HTMLElement | null>(null);
  const reminderAdvancedOpen = ref(false);
  const scheduleAdvancedOpen = ref(false);
  let previewTimer: number | null = null;
  let previewSequence = 0;
  let idempotencyKey = generateUUID();
  let idempotencyFingerprint = '';

  const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai';
  const form = reactive({
    scope: 'current' as TodoPlanScope,
    anchorDate: '',
    startAt: '',
    dueAt: '',
    timezone: browserTimezone,
    planType: 'once' as '' | 'once' | 'scheduled' | 'after_completion',
    frequency: 'daily' as 'daily' | 'weekly' | 'monthly',
    planInterval: 1 as number | string,
    monthDay: 1 as number | string,
    shortMonthPolicy: 'last_day' as 'last_day' | 'skip',
    endMode: 'count' as 'never' | 'until' | 'count',
    afterEndMode: 'never' as 'never' | 'count',
    endCount: 30 as number | string,
    untilAt: '',
    afterUnit: 'day' as 'day' | 'week' | 'month',
    pastPolicy: '' as '' | TodoPastPolicy,
    reminderMode: 'none' as 'none' | 'once_per_instance' | 'nudge',
    triggerType: 'at_start' as 'at_start' | 'fixed_time' | 'before_due',
    fixedTime: '09:00',
    offsetMinutes: 30 as number | string,
    inAppReminder: true,
    emailReminder: false,
    reminderEmail: '',
    nudgeIntervalMinutes: 60 as number | string,
    nudgeMaxCount: 4 as number | string,
    nudgeStop: 'completion_or_due' as 'completion_or_due' | 'max_count',
    quietPolicy: 'defer_once' as 'defer_once' | 'skip',
  });
  const weekdayState = reactive<Record<number, boolean>>({
    1: true,
    2: false,
    3: false,
    4: false,
    5: false,
    6: false,
    7: false,
  });

  const currentOnly = computed(() => Boolean(props.item?.planVersion === 2 && form.scope === 'current'));
  const repeatingPlan = computed(() => !currentOnly.value && form.planType !== 'once');
  const scopeOptions = computed(() => [
    { value: 'current', label: t('inbox.todoPlanScopeCurrent') },
    { value: 'future', label: t('inbox.todoPlanScopeFuture') },
    { value: 'series', label: t('inbox.todoPlanScopeSeries') },
  ]);
  const scopeHint = computed(() =>
    form.scope === 'current'
      ? t('inbox.todoPlanScopeCurrentHint')
      : form.scope === 'future'
        ? t('inbox.todoPlanScopeFutureHint')
        : t('inbox.todoPlanScopeSeriesHint'),
  );
  const timezoneOptions = computed(() => {
    const values = [
      ...new Set([
        browserTimezone,
        form.timezone,
        'Asia/Shanghai',
        'Asia/Singapore',
        'Asia/Tokyo',
        'Europe/London',
        'America/New_York',
      ]),
    ];
    return values.filter(Boolean).map((value) => ({ value, label: value }));
  });
  const planTypeOptions = computed(() => [
    ...(props.legacyConversion && props.item?.recurrence
      ? [{ value: '', label: t('inbox.todoLegacyChooseNewPlan') }]
      : []),
    { value: 'once', label: t('inbox.todoPlanOnce') },
    { value: 'scheduled', label: t('inbox.todoPlanScheduled') },
    { value: 'after_completion', label: t('inbox.todoPlanAfterCompletion') },
  ]);
  const frequencyOptions = computed(() => [
    { value: 'daily', label: t('inbox.todoRecurrenceDaily') },
    { value: 'weekly', label: t('inbox.todoRecurrenceWeekly') },
    { value: 'monthly', label: t('inbox.todoRecurrenceMonthly') },
  ]);
  const frequencyUnitLabel = computed(() =>
    form.frequency === 'daily'
      ? t('inbox.todoReminderDays')
      : form.frequency === 'weekly'
        ? t('inbox.todoReminderWeeks')
        : t('inbox.todoPlanMonths'),
  );
  const scheduleSummary = computed(() => {
    const frequencyLabel =
      form.frequency === 'daily'
        ? t('inbox.todoRecurrenceDaily')
        : form.frequency === 'weekly'
          ? t('inbox.todoRecurrenceWeekly')
          : t('inbox.todoRecurrenceMonthly');
    const interval = Number(form.planInterval) || 1;
    const frequency =
      interval === 1 ? frequencyLabel : `${t('inbox.todoPlanEvery')} ${interval} ${frequencyUnitLabel.value}`;
    const ending =
      form.endMode === 'count'
        ? t('inbox.todoPlanCountSummary', { count: Number(form.endCount) || 1 })
        : form.endMode === 'until'
          ? t('inbox.todoPlanUntilSummary', { date: datePart(form.untilAt) || '—' })
          : t('inbox.todoPlanEndNever');
    return `${frequency} · ${ending}`;
  });
  const weekdayOptions = computed(() => {
    const base = new Date(2026, 7, 3);
    return Array.from({ length: 7 }, (_, index) => ({
      value: index + 1,
      label: new Intl.DateTimeFormat(locale.value, { weekday: 'short' }).format(
        new Date(base.getFullYear(), base.getMonth(), base.getDate() + index),
      ),
    }));
  });
  const shortMonthOptions = computed(() => [
    { value: 'last_day', label: t('inbox.todoPlanShortMonthLast') },
    { value: 'skip', label: t('inbox.todoPlanShortMonthSkip') },
  ]);
  const endModeOptions = computed(() => [
    { value: 'count', label: t('inbox.todoPlanEndCount') },
    { value: 'until', label: t('inbox.todoPlanEndUntil') },
    { value: 'never', label: t('inbox.todoPlanEndNever') },
  ]);
  const afterEndModeOptions = computed(() => endModeOptions.value.filter((option) => option.value !== 'until'));
  const afterUnitOptions = computed(() => [
    { value: 'day', label: t('inbox.todoReminderDays') },
    { value: 'week', label: t('inbox.todoReminderWeeks') },
    { value: 'month', label: t('inbox.todoPlanMonths') },
  ]);
  const reminderModeOptions = computed(() => [
    { value: 'none', label: t('inbox.todoReminderNone') },
    { value: 'once_per_instance', label: t('inbox.todoReminderOnce') },
    { value: 'nudge', label: t('inbox.todoNudge') },
  ]);
  const triggerOptions = computed(() => [
    ...(form.startAt ? [{ value: 'at_start', label: t('inbox.todoReminderAtStart') }] : []),
    { value: 'fixed_time', label: t('inbox.todoReminderFixedTime') },
    ...(form.dueAt ? [{ value: 'before_due', label: t('inbox.todoReminderBeforeDue') }] : []),
  ]);
  const nudgeStopOptions = computed(() => [
    { value: 'completion_or_due', label: t('inbox.todoNudgeStopCompletionOrDue') },
    { value: 'max_count', label: t('inbox.todoNudgeStopMaxCount') },
  ]);
  const quietPolicyOptions = computed(() => [
    { value: 'defer_once', label: t('inbox.todoQuietDefer') },
    { value: 'skip', label: t('inbox.todoQuietSkip') },
  ]);
  const pastPolicyOptions = computed(() => [
    { value: 'keep_overdue' as const, label: t('inbox.todoPastKeep') },
    { value: 'restart_today_keep_count' as const, label: t('inbox.todoPastRestart') },
    { value: 'skip_missed' as const, label: t('inbox.todoPastSkip') },
  ]);

  function selectPlanType(value: '' | 'once' | 'scheduled' | 'after_completion') {
    form.planType = value;
  }

  function selectReminderMode(value: 'none' | 'once_per_instance' | 'nudge') {
    form.reminderMode = value;
  }

  function selectPastPolicy(value: TodoPastPolicy) {
    form.pastPolicy = value;
  }

  function pastPolicyHint(value: TodoPastPolicy) {
    if (value === 'keep_overdue') return t('inbox.todoPastKeepHint');
    if (value === 'restart_today_keep_count') return t('inbox.todoPastRestartHint');
    return t('inbox.todoPastSkipHint');
  }

  function datePart(value: string) {
    return String(value || '').slice(0, 10);
  }

  function timePart(value: string) {
    return value ? String(value).slice(11, 16) : null;
  }

  function calendarDayDiff(start: string, end: string) {
    if (!start || !end) return 0;
    const [sy, sm, sd] = datePart(start).split('-').map(Number);
    const [ey, em, ed] = datePart(end).split('-').map(Number);
    return Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86_400_000);
  }

  function buildReminder(): TodoReminderV2Config {
    if (form.reminderMode === 'none') return { mode: 'none', channels: [], quietPolicy: 'defer_once' };
    const channels: Array<'in_app' | 'email'> = [];
    if (form.inAppReminder) channels.push('in_app');
    if (form.emailReminder) channels.push('email');
    return {
      mode: form.reminderMode,
      trigger: {
        type: form.triggerType,
        ...(form.triggerType === 'fixed_time' ? { fixedTime: form.fixedTime } : {}),
        ...(form.triggerType === 'before_due' ? { offsetMinutes: Number(form.offsetMinutes) } : {}),
      },
      channels,
      targetEmail: form.emailReminder ? form.reminderEmail.trim() : null,
      quietPolicy: form.quietPolicy,
      ...(form.reminderMode === 'nudge'
        ? {
            nudge: {
              intervalMinutes: Number(form.nudgeIntervalMinutes),
              maxCount: Number(form.nudgeMaxCount),
              stop: form.nudgeStop,
            },
          }
        : {}),
    };
  }

  function buildDraft(): TodoPlanDraft {
    const anchorSource = form.startAt || form.dueAt;
    if (!props.title.trim()) throw new Error(t('inbox.todoTitleRequired'));
    if (!form.planType) throw new Error(t('inbox.todoLegacyChooseNewPlan'));
    const needsPlanDate = form.planType !== 'once' || form.reminderMode !== 'none';
    const anchorDate =
      datePart(anchorSource || '') || form.anchorDate || (needsPlanDate ? todoTodayInTimezone(form.timezone) : '');
    const startDate = form.startAt ? datePart(form.startAt) : anchorDate;
    const dueDayOffset = anchorSource && form.dueAt ? calendarDayDiff(startDate, form.dueAt) : 0;
    const selectedWeekdays = Object.entries(weekdayState)
      .filter(([, selected]) => selected)
      .map(([day]) => Number(day));
    const plan = currentOnly.value
      ? { type: 'once' as const, pastPolicy: form.pastPolicy || undefined }
      : form.planType === 'scheduled'
        ? {
            type: 'scheduled' as const,
            frequency: form.frequency,
            interval: Number(form.planInterval),
            ...(form.frequency === 'weekly' ? { weekdays: selectedWeekdays } : {}),
            ...(form.frequency === 'monthly'
              ? { monthDay: Number(form.monthDay), shortMonthPolicy: form.shortMonthPolicy }
              : {}),
            end:
              form.endMode === 'count'
                ? { mode: 'count' as const, count: Number(form.endCount) }
                : form.endMode === 'until'
                  ? { mode: 'until' as const, untilDate: datePart(form.untilAt) }
                  : { mode: 'never' as const },
            pastPolicy: form.pastPolicy || undefined,
          }
        : form.planType === 'after_completion'
          ? {
              type: 'after_completion' as const,
              interval: Number(form.planInterval),
              unit: form.afterUnit,
              end:
                form.afterEndMode === 'count'
                  ? { mode: 'count' as const, count: Number(form.endCount) }
                  : { mode: 'never' as const },
              pastPolicy: form.pastPolicy || undefined,
            }
          : { type: 'once' as const, pastPolicy: form.pastPolicy || undefined };
    return {
      title: props.title.trim(),
      description: props.description.trim(),
      checklist: props.checklist,
      priority: props.priority,
      resourceRefs: props.resourceRefs,
      timing: {
        timezone: form.timezone,
        anchorDate: anchorDate || null,
        startTime: timePart(form.startAt),
        dueTime: timePart(form.dueAt),
        dueDayOffset,
      },
      plan,
      reminder: buildReminder(),
    };
  }

  async function refreshPreview() {
    const sequence = ++previewSequence;
    previewLoading.value = true;
    previewError.value = '';
    preview.value = null;
    emit('ready', null);
    try {
      const draft = buildDraft();
      const response =
        props.legacyConversion && props.item
          ? await previewLegacyTodoConversionV2(props.item.id, draft)
          : props.item?.planVersion === 2
            ? await previewTodoPlanUpdateV2(props.item.id, form.scope, draft)
            : await previewTodoPlanV2(draft);
      if (sequence !== previewSequence) return;
      if (response.status !== 200) throw new Error(response.msg || t('inbox.todoPlanPreviewFailed'));
      const next = response.data as TodoPlanPreview;
      preview.value = next;
      emit('preview-count', Math.max(1, Number(next.occurrenceCount ?? next.generatedNowCount ?? 1)));
      needsPastPolicy.value = next.requiredChoices?.includes('pastPolicy') || false;
      if (needsPastPolicy.value && !form.pastPolicy) {
        previewError.value = '';
        return;
      }
      const fingerprint = JSON.stringify(draft);
      if (fingerprint !== idempotencyFingerprint) {
        idempotencyKey = generateUUID();
        idempotencyFingerprint = fingerprint;
      }
      emit('ready', {
        scope: form.scope,
        payload: { ...draft, previewHash: next.previewHash, idempotencyKey },
      });
    } catch (error: any) {
      if (sequence !== previewSequence) return;
      previewError.value = error?.message || t('inbox.todoPlanPreviewFailed');
      needsPastPolicy.value = Boolean(error?.data?.requiredChoices?.includes?.('pastPolicy'));
    } finally {
      if (sequence === previewSequence) previewLoading.value = false;
    }
  }

  function schedulePreview() {
    // 任意字段变化都要立刻让旧确认失效；否则 350ms 防抖窗口内可能拿旧 previewHash 提交新内容。
    previewSequence += 1;
    previewLoading.value = true;
    previewError.value = '';
    preview.value = null;
    emit('ready', null);
    emit('preview-count', 1);
    if (previewTimer !== null) window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(() => void refreshPreview(), 350);
  }

  function reset() {
    idempotencyKey = generateUUID();
    idempotencyFingerprint = '';
    reminderAdvancedOpen.value = false;
    scheduleAdvancedOpen.value = false;
    const item = props.item;
    const timing = item?.series?.timing;
    const plan = item?.series?.plan;
    form.scope = 'current';
    form.startAt = toTodoLocalInput(item?.startAt);
    form.dueAt = toTodoLocalInput(item?.dueAt || props.initialDueAt);
    form.timezone = item?.instanceTimezone || item?.series?.timezone || browserTimezone;
    form.anchorDate =
      item?.occurrenceDate || timing?.anchorDate || (item?.seriesId ? todoTodayInTimezone(form.timezone) : '');
    form.planType =
      props.legacyConversion && item?.recurrence ? '' : plan?.type || (item?.series?.repeatMode ?? 'once');
    form.frequency = plan?.frequency || 'daily';
    form.planInterval = plan?.interval || 1;
    form.afterUnit = plan?.unit || 'day';
    form.endMode = plan?.end?.mode || 'count';
    form.afterEndMode = plan?.end?.mode === 'count' ? 'count' : 'never';
    form.endCount = plan?.end?.count || 30;
    form.untilAt = plan?.end?.untilDate ? `${plan.end.untilDate}T23:55` : '';
    const anchorDate = datePart(form.startAt || form.dueAt) || form.anchorDate;
    form.monthDay = plan?.monthDay || Number(anchorDate.slice(8, 10)) || 1;
    form.shortMonthPolicy = plan?.shortMonthPolicy || 'last_day';
    for (const day of Object.keys(weekdayState))
      weekdayState[Number(day)] = Boolean(plan?.weekdays?.includes(Number(day)));
    if (!plan?.weekdays?.length) {
      const anchor = new Date(`${anchorDate || todoTodayInTimezone(form.timezone)}T00:00:00`);
      const isoDay = anchor.getDay() === 0 ? 7 : anchor.getDay();
      weekdayState[isoDay || 1] = true;
    }
    form.pastPolicy = (plan?.pastPolicy as TodoPastPolicy) || '';
    const reminder = item?.reminder as TodoReminderV2Config | null | undefined;
    const v2Reminder = reminder && ['once_per_instance', 'nudge'].includes(reminder.mode) ? reminder : null;
    form.reminderMode = v2Reminder?.mode || 'none';
    form.triggerType =
      v2Reminder?.trigger?.type || (form.startAt ? 'at_start' : form.dueAt ? 'before_due' : 'fixed_time');
    form.fixedTime = v2Reminder?.trigger?.fixedTime || '09:00';
    form.offsetMinutes = v2Reminder?.trigger?.offsetMinutes ?? 30;
    form.inAppReminder = v2Reminder ? v2Reminder.channels.includes('in_app') : true;
    form.emailReminder = Boolean(v2Reminder?.channels.includes('email'));
    form.reminderEmail = v2Reminder?.targetEmail || '';
    form.nudgeIntervalMinutes = v2Reminder?.nudge?.intervalMinutes || 60;
    form.nudgeMaxCount = v2Reminder?.nudge?.maxCount || 4;
    form.nudgeStop = v2Reminder?.nudge?.stop || 'completion_or_due';
    form.quietPolicy = v2Reminder?.quietPolicy || 'defer_once';
    needsPastPolicy.value = false;
    schedulePreview();
  }

  watch(() => props.resetKey, reset, { immediate: true });
  watch(
    [
      () => props.title,
      () => props.description,
      () => props.priority,
      () => props.checklist.map((item) => `${item.id}:${item.text}:${item.done}`).join('|'),
      () => props.resourceRefs.map((item) => `${item.type}:${item.id}`).join('|'),
      () => ({ ...form }),
      () => ({ ...weekdayState }),
    ],
    schedulePreview,
    { deep: true },
  );
  watch(
    () => [form.startAt, form.dueAt],
    () => {
      if (form.triggerType === 'at_start' && !form.startAt) form.triggerType = form.dueAt ? 'before_due' : 'fixed_time';
      if (form.triggerType === 'before_due' && !form.dueAt) form.triggerType = form.startAt ? 'at_start' : 'fixed_time';
    },
  );
  onBeforeUnmount(() => {
    if (previewTimer !== null) window.clearTimeout(previewTimer);
    previewSequence += 1;
  });
</script>

<style scoped lang="less">
  .todo-plan-editor {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .todo-plan-editor.is-desktop-layout {
    display: contents;
  }
  .todo-plan-editor__section,
  .todo-plan-editor__scope,
  .todo-plan-preview {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    border: 1px solid var(--surface-border-color);
    border-radius: 15px;
    background: var(--card-background);
  }
  .todo-plan-editor__section > header,
  .todo-plan-editor__scope,
  .todo-plan-preview > header {
    flex-direction: row;
    align-items: flex-start;
    justify-content: space-between;
  }
  .todo-plan-editor__section header > div,
  .todo-plan-editor__scope > div,
  .todo-plan-preview header > div,
  .todo-plan-editor__past > div {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 4px;
  }
  .todo-plan-editor small,
  .todo-plan-preview p,
  .todo-plan-editor__meaning {
    margin: 0;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.6;
  }
  .todo-plan-editor label {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
  }
  .todo-plan-editor__grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  .todo-plan-editor__segment {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    padding: 4px;
    border-radius: 12px;
    background: var(--workspace-panel-bg-color);
  }
  .todo-plan-editor__segment :deep(.b_btn) {
    min-width: 0;
    min-height: 38px;
    flex: 1 1 0;
    padding: 0 9px;
    border: 0;
    border-radius: 9px;
    background: transparent;
    color: var(--desc-color);
    white-space: nowrap;
  }
  .todo-plan-editor__segment :deep(.b_btn.active) {
    background: var(--primary-color);
    color: #fff;
    font-weight: 700;
  }
  .todo-plan-editor__segment-label {
    width: 100%;
    flex: 0 0 100%;
    padding: 3px 4px 0;
    color: var(--text-color);
    font-size: 12px;
    font-weight: 650;
  }
  .todo-plan-editor__inline,
  .todo-plan-editor__channels {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .todo-plan-editor__advanced {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .todo-plan-editor__scheduled-config {
    display: grid;
    gap: 12px;
  }
  .todo-plan-editor__schedule-summary {
    width: 100%;
    height: auto;
    min-height: 46px;
    align-items: center;
    justify-content: space-between;
    padding: 8px 11px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    background: var(--workspace-panel-bg-color);
    text-align: left;
  }
  .todo-plan-editor__schedule-summary > span {
    color: var(--desc-color);
    font-size: 12px;
  }
  .todo-plan-editor__schedule-summary > strong {
    color: var(--text-color);
    font-size: 13px;
  }
  .todo-plan-editor__advanced-toggle {
    align-self: flex-start;
    color: var(--primary-color);
  }
  .todo-plan-editor__inline :deep(.b-input),
  .todo-plan-editor__inline :deep(.b-select) {
    min-width: 0;
    flex: 1;
  }
  .todo-plan-editor__weekdays {
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 13px;
  }
  .todo-plan-editor__weekdays > div {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 16px;
  }
  .todo-plan-editor__current-badge {
    padding: 5px 10px;
    border: 1px solid var(--primary-color);
    border-radius: 999px;
    color: var(--primary-color);
    font-size: 12px;
    font-weight: 600;
  }
  .todo-plan-preview {
    border-color: var(--primary-color);
    background: var(--card-background);
  }
  .todo-plan-editor.is-desktop-layout > .todo-plan-preview {
    position: absolute;
    top: 0;
    right: 0;
    width: 388px;
    min-height: 100%;
    box-sizing: border-box;
    padding: 20px;
    border: 0;
    border-left: 1px solid var(--surface-border-color);
    border-radius: 0;
    background: var(--workspace-panel-bg-color);
  }
  .todo-plan-preview.has-error {
    border-color: var(--danger-color, #e5484d);
  }
  .todo-plan-preview__headline {
    font-size: 18px;
  }
  .todo-plan-preview__summary-list {
    display: grid;
    gap: 11px;
    margin-top: 2px;
  }
  .todo-plan-preview__summary-list > div {
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr);
    align-items: start;
    gap: 10px;
    font-size: 13px;
  }
  .todo-plan-preview__summary-list span {
    color: var(--desc-color);
  }
  .todo-plan-preview__summary-list strong {
    line-height: 1.55;
  }
  .todo-plan-preview__facts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .todo-plan-preview__facts span {
    padding: 4px 8px;
    border: 1px solid var(--card-border-color);
    border-radius: 999px;
    color: var(--desc-color);
    font-size: 12px;
  }
  .todo-plan-editor__past {
    display: grid;
    gap: 10px;
    margin-top: 2px;
    padding: 12px;
    border: 1px solid var(--chip-pending-border, #d97706);
    border-radius: 12px;
    background: var(--chip-pending-bg, #fffbeb);
    color: var(--chip-pending-fg, #92400e);
  }
  .todo-plan-editor__past small {
    color: inherit;
    opacity: 0.82;
  }
  .todo-plan-editor__past-options {
    display: grid;
    gap: 8px;
  }
  .todo-plan-editor__past-options :deep(.b_btn) {
    display: grid;
    width: 100%;
    height: auto;
    min-height: 54px;
    justify-items: start;
    gap: 2px;
    padding: 9px 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    background: var(--card-background);
    color: var(--text-color);
    text-align: left;
    white-space: normal;
  }
  .todo-plan-editor__past-options :deep(.b_btn.active) {
    border-color: var(--primary-color);
    box-shadow: inset 3px 0 0 var(--primary-color);
  }
  .todo-plan-editor__past-options :deep(.b_btn strong) {
    font-size: 12px;
  }
  .todo-plan-editor__past-options :deep(.b_btn small) {
    color: var(--desc-color);
    font-size: 11px;
    line-height: 1.45;
  }
  .todo-plan-preview__error {
    color: var(--danger-color, #e5484d) !important;
    font-weight: 600;
  }
  @media (max-width: 980px) {
    .todo-plan-editor.is-desktop-layout > .todo-plan-preview {
      position: static;
      width: auto;
      min-height: 0;
      padding: 16px;
      border: 1px solid var(--primary-color);
      border-radius: 15px;
      background: var(--card-background);
    }
  }
  @media (max-width: 767px) {
    .todo-plan-editor.is-mobile-step {
      gap: 15px;
    }
    .todo-plan-editor.is-mobile-step > .todo-plan-editor__section {
      padding: 0;
      border: 0;
      border-radius: 0;
      background: transparent;
    }
    .todo-plan-editor.is-mobile-step .todo-plan-editor__timezone {
      display: none;
    }
    .todo-plan-editor__grid {
      grid-template-columns: 1fr;
    }
    .todo-plan-editor__section > header,
    .todo-plan-editor__scope,
    .todo-plan-preview > header,
    .todo-plan-editor__past {
      flex-direction: column;
    }
    .todo-plan-editor__section header :deep(.b-select),
    .todo-plan-editor__scope :deep(.b-select),
    .todo-plan-editor__past :deep(.b-select) {
      width: 100%;
    }
    .todo-plan-editor.is-mobile-step > .todo-plan-preview {
      padding: 15px;
      border: 1px solid var(--primary-color);
      border-radius: 16px;
      background: var(--card-background);
    }
    .todo-plan-preview__summary-list > div {
      grid-template-columns: 68px minmax(0, 1fr);
    }
  }
</style>
