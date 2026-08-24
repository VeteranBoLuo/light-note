<template>
  <div class="quick-todo-form">
    <div class="quick-todo-form__intro">
      <strong>{{ t('inbox.quickTodoHeading') }}</strong>
      <span>{{ t('inbox.quickTodoEnterHint') }}</span>
    </div>

    <label class="quick-todo-form__title">
      <span>{{ t('inbox.todoTitle') }}</span>
      <BInput
        ref="titleInput"
        v-model:value="title"
        height="44px"
        :maxlength="200"
        :placeholder="t('inbox.todoTitlePlaceholder')"
        @enter="submit"
      />
    </label>

    <div class="quick-todo-form__options">
      <div class="quick-todo-form__field">
        <span>{{ t('inbox.quickTodoDue') }}</span>
        <div class="quick-todo-form__date-options" role="group" :aria-label="t('inbox.quickTodoDue')">
          <BButton
            v-for="option in dueOptions"
            :key="option.value"
            size="small"
            :class="{ 'is-active': duePreset === option.value }"
            :aria-pressed="duePreset === option.value"
            @click="duePreset = option.value"
          >
            {{ option.label }}
          </BButton>
        </div>
      </div>
      <label class="quick-todo-form__field">
        <span>{{ t('inbox.todoPriority') }}</span>
        <div
          v-if="!mobile"
          class="quick-todo-form__priority-options"
          role="group"
          :aria-label="t('inbox.todoPriority')"
        >
          <BButton
            v-for="option in priorityOptions"
            :key="option.value"
            size="small"
            :class="{ 'is-active': priority === option.value }"
            :aria-pressed="priority === option.value"
            @click="priority = option.value"
          >
            {{ option.label }}
          </BButton>
        </div>
        <BSelect v-else v-model:value="priority" :options="priorityOptions" />
      </label>
    </div>

    <div v-if="reminderPresetsEnabled" class="quick-todo-form__field">
      <span>{{ t('inbox.todoReminder') }}</span>
      <div class="quick-todo-form__reminder-options" role="group" :aria-label="t('inbox.todoReminder')">
        <BButton
          v-for="option in reminderOptions"
          :key="option.value"
          size="small"
          :class="{ 'is-active': reminderPreset === option.value }"
          :aria-pressed="reminderPreset === option.value"
          :disabled="option.value === 'before_due_1h' && duePreset === 'none'"
          @click="reminderPreset = option.value"
        >
          {{ option.label }}
        </BButton>
        <BTimePicker
          v-model:value="dailyReminderTime"
          class="quick-todo-form__daily-reminder"
          :class="{ 'is-active': reminderPreset === 'daily' }"
          :aria-label="t('inbox.quickTodoReminderTimeLabel')"
          @open-change="onDailyReminderOpenChange"
        >
          <template #prefix>
            <span>{{ t('inbox.quickTodoReminderDaily') }}</span>
          </template>
        </BTimePicker>
      </div>
      <small>{{
        duePreset === 'none' ? t('inbox.quickTodoReminderNeedsDue') : t('inbox.quickTodoReminderHint')
      }}</small>
      <small v-if="quickReminderError" class="quick-todo-form__error" role="alert">{{ quickReminderError }}</small>
    </div>

    <div class="quick-todo-form__actions">
      <BButton :disabled="saving" @click="openDetails">{{ t('inbox.quickTodoDetails') }}</BButton>
      <BButton type="primary" :loading="saving" :disabled="!canSubmit" @click="submit">
        {{ t('inbox.quickTodoCreate') }}
      </BButton>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BTimePicker from '@/components/base/BasicComponents/BTimePicker.vue';
  import type { TodoCreateInitialValues, TodoPriority, TodoQuickReminderPreset } from '@/api/todoApi';
  import { dueForTodoDatePreset, todoNowInTimezone } from '@/utils/todoPlanning';

  type DuePreset = 'none' | 'today' | 'tomorrow' | 'week';

  const props = withDefaults(
    defineProps<{
      saving?: boolean;
      resetKey?: number;
      mobile?: boolean;
      reminderPresetsEnabled?: boolean;
    }>(),
    {
      saving: false,
      resetKey: 0,
      mobile: false,
      reminderPresetsEnabled: true,
    },
  );
  const emit = defineEmits<{
    submit: [payload: TodoCreateInitialValues & { title: string }];
    details: [payload: TodoCreateInitialValues & { title: string }];
  }>();
  const { t } = useI18n();
  const titleInput = ref<InstanceType<typeof BInput> | null>(null);
  const title = ref('');
  const priority = ref<TodoPriority>(1);
  const duePreset = ref<DuePreset>('none');
  const reminderPreset = ref<TodoQuickReminderPreset>('none');
  const dailyReminderTime = ref('09:00');
  const validationClock = ref(Date.now());

  const dueOptions = computed<Array<{ value: DuePreset; label: string }>>(() => [
    { value: 'none', label: t('inbox.quickTodoNoDate') },
    { value: 'today', label: t('inbox.quickTodoToday') },
    { value: 'tomorrow', label: t('inbox.quickTodoTomorrow') },
    ...(!props.mobile ? [{ value: 'week' as const, label: t('inbox.quickTodoThisWeek') }] : []),
  ]);
  const priorityOptions = computed(() => [0, 1, 2].map((value) => ({ value, label: t(`inbox.todoPriority${value}`) })));
  const reminderOptions = computed<Array<{ value: TodoQuickReminderPreset; label: string }>>(() => [
    { value: 'none', label: t('inbox.todoReminderNone') },
    { value: 'before_due_1h', label: t('inbox.quickTodoReminderBeforeDue') },
  ]);
  const dueAt = computed(() =>
    duePreset.value === 'none' ? null : dueForTodoDatePreset(duePreset.value, { now: new Date(validationClock.value) }),
  );
  const quickReminderError = computed(() => {
    if (reminderPreset.value !== 'daily' || duePreset.value !== 'today' || !dueAt.value) return '';
    const reminderAt = `${dueAt.value.slice(0, 10)}T${dailyReminderTime.value}`;
    return reminderAt <= todoNowInTimezone('Asia/Shanghai', new Date(validationClock.value))
      ? t('inbox.quickTodoReminderPastToday')
      : '';
  });
  const canSubmit = computed(() => Boolean(title.value.trim()) && !props.saving && !quickReminderError.value);

  watch(
    () => props.resetKey,
    () => reset(),
  );
  watch(duePreset, (value) => {
    validationClock.value = Date.now();
    if (value === 'none' && reminderPreset.value === 'before_due_1h') reminderPreset.value = 'none';
  });
  watch([reminderPreset, dailyReminderTime], () => {
    validationClock.value = Date.now();
  });

  function buildPayload(): TodoCreateInitialValues & { title: string } {
    return {
      title: title.value.trim(),
      priority: priority.value,
      dueAt: dueAt.value,
      quickReminderPreset: reminderPreset.value,
      ...(reminderPreset.value === 'daily' ? { quickReminderTime: dailyReminderTime.value } : {}),
    };
  }

  function submit() {
    validationClock.value = Date.now();
    if (!canSubmit.value) return;
    emit('submit', buildPayload());
  }

  function openDetails() {
    emit('details', buildPayload());
  }


  function onDailyReminderOpenChange(open: boolean) {
    if (open) reminderPreset.value = 'daily';
  }

  function reset() {
    title.value = '';
    priority.value = 1;
    duePreset.value = 'none';
    reminderPreset.value = 'none';
    dailyReminderTime.value = '09:00';
    void nextTick(() => titleInput.value?.focus());
  }
</script>

<style scoped lang="less">
  .quick-todo-form {
    display: grid;
    gap: 18px;
    min-width: 0;
  }

  .quick-todo-form__intro {
    display: grid;
    gap: 4px;
  }

  .quick-todo-form__intro strong {
    color: var(--text-color);
    font-size: 16px;
  }

  .quick-todo-form__intro span,
  .quick-todo-form__title small {
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.5;
  }

  .quick-todo-form__error {
    color: var(--danger-color, #e5484d) !important;
    font-weight: 600;
  }

  .quick-todo-form__title,
  .quick-todo-form__field {
    display: grid;
    gap: 7px;
    min-width: 0;
    color: var(--text-color);
    font-size: 13px;
    font-weight: 500;
  }

  .quick-todo-form__title :deep(.b-input) {
    border: 1px solid color-mix(in srgb, var(--primary-color) 30%, var(--surface-border-color)) !important;
    border-radius: 10px;
    background: color-mix(in srgb, var(--bl-input-noBorder-bg-color) 78%, var(--card-background)) !important;
    font-size: 15px;
  }

  .quick-todo-form__title :deep(.b-input:hover) {
    border-color: color-mix(in srgb, var(--primary-color) 52%, var(--surface-border-color)) !important;
  }

  .quick-todo-form__title :deep(.b-input:focus-visible) {
    border-color: var(--primary-color) !important;
    background: var(--card-background) !important;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary-color) 13%, transparent) !important;
  }

  .quick-todo-form__options {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 150px;
    gap: 14px;
    align-items: end;
  }

  .quick-todo-form__date-options {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .quick-todo-form__reminder-options {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }

  .quick-todo-form__daily-reminder :deep(.b-time-trigger) {
    min-width: 154px;
    font-size: 12px;
    font-weight: 500;
  }

  .quick-todo-form__daily-reminder.is-active :deep(.b-time-trigger) {
    border-color: var(--primary-color);
    background: var(--mobile-selected-bg, var(--workspace-panel-bg-color));
    color: var(--primary-color);
    font-weight: 700;
  }

  .quick-todo-form__priority-options {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }

  .quick-todo-form__priority-options :deep(.b_btn) {
    min-height: 32px;
    border: 1px solid var(--surface-border-color);
    border-radius: 9px;
  }

  .quick-todo-form__priority-options :deep(.b_btn.is-active) {
    border-color: var(--primary-color);
    background: var(--mobile-selected-bg, var(--workspace-panel-bg-color));
    color: var(--primary-color);
    font-weight: 700;
  }

  .quick-todo-form__reminder-options :deep(.b_btn) {
    height: 36px;
    min-height: 36px;
    line-height: 36px;
    border: 1px solid var(--surface-border-color);
    border-radius: 9px;
  }

  .quick-todo-form__reminder-options :deep(.b-time-trigger) {
    height: 36px;
    min-height: 36px;
  }

  .quick-todo-form__reminder-options :deep(.b_btn.is-active) {
    border-color: var(--primary-color);
    background: var(--mobile-selected-bg, var(--workspace-panel-bg-color));
    color: var(--primary-color);
    font-weight: 700;
  }

  .quick-todo-form__date-options :deep(.b_btn) {
    min-height: 32px;
    border: 1px solid transparent;
    border-radius: 9px;
  }

  .quick-todo-form__date-options :deep(.b_btn.is-active) {
    border-color: color-mix(in srgb, var(--primary-color) 34%, transparent);
    background: color-mix(in srgb, var(--primary-color) 11%, var(--card-background));
    color: var(--primary-color);
    font-weight: 600;
  }

  .quick-todo-form__actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding-top: 2px;
  }

  @media (max-width: 767px) {
    .quick-todo-form {
      gap: 14px;
    }

    .quick-todo-form__intro {
      display: flex;
      align-items: baseline;
      gap: 6px;
    }

    .quick-todo-form__intro strong {
      font-size: 15px;
    }

    .quick-todo-form__intro span {
      font-size: 13px;
    }

    .quick-todo-form__options {
      grid-template-columns: 1fr;
      gap: 14px;
    }

    .quick-todo-form__field :deep(.b-select) {
      width: 100%;
    }

    .quick-todo-form__actions :deep(.b_btn) {
      flex: 1 1 0;
      width: auto;
      height: 48px;
      min-height: 48px;
    }

    .quick-todo-form__actions {
      position: absolute;
      right: 0;
      bottom: 0;
      left: 0;
      z-index: 2;
      gap: 9px;
      padding: 12px 14px calc(20px + env(safe-area-inset-bottom));
      border-top: 1px solid var(--surface-divider-color);
      background: var(--card-background);
    }

    .quick-todo-form__date-options {
      gap: 2px;
    }

    .quick-todo-form__date-options :deep(.b_btn) {
      position: relative;
      z-index: 0;
      isolation: isolate;
      min-height: 44px;
      padding: 0 8px;
      border: 0;
      background: transparent !important;
      font-size: 11px;
    }

    .quick-todo-form__date-options :deep(.b_btn::before) {
      position: absolute;
      z-index: -1;
      inset: 10px 2px;
      border: 1px solid var(--surface-border-color);
      border-radius: 999px;
      background: var(--workspace-panel-bg-color);
      content: '';
    }

    .quick-todo-form__date-options :deep(.b_btn.is-active::before) {
      border-color: var(--primary-color);
      background: var(--mobile-selected-bg);
    }
  }
</style>
