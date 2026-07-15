<template>
  <div class="todo-editor-form">
    <label>
      <span>{{ t('inbox.todoTitle') }}</span>
      <BInput v-model:value="form.title" :maxlength="200" :placeholder="t('inbox.todoTitlePlaceholder')" />
    </label>
    <label>
      <span>{{ t('inbox.todoDescription') }}</span>
      <BInput
        v-model:value="form.description"
        type="textarea"
        :rows="3"
        :maxlength="2000"
        :placeholder="t('inbox.todoDescriptionPlaceholder')"
      />
    </label>
    <section class="todo-checklist-editor">
      <div class="todo-checklist-editor__header">
        <div>
          <span>{{ t('inbox.todoChecklist') }}</span>
          <small>{{ t('inbox.todoChecklistHint') }}</small>
        </div>
        <BButton size="small" :disabled="checklistItems.length >= 50" @click="addChecklistItem()">
          {{ t('inbox.todoAddChecklistItem') }}
        </BButton>
      </div>
      <div class="todo-checklist-editor__list">
        <div v-for="(check, index) in checklistItems" :key="check.id" class="todo-checklist-editor__row">
          <span class="todo-checklist-editor__index">{{ index + 1 }}</span>
          <BInput
            :ref="(component) => setChecklistInputRef(check.id, component)"
            v-model:value="check.text"
            :maxlength="200"
            :placeholder="t('inbox.todoChecklistPlaceholder')"
            @enter="handleChecklistEnter(index)"
          />
          <BButton
            size="small"
            class="todo-checklist-editor__remove"
            :disabled="saving"
            @click="removeChecklistItem(index)"
          >
            {{ t('inbox.todoRemoveChecklistItem') }}
          </BButton>
        </div>
      </div>
    </section>
    <div class="todo-editor-form__grid">
      <label>
        <span>{{ t('inbox.todoPriority') }}</span>
        <BSelect v-model:value="form.priority" :options="priorityOptions" />
      </label>
      <label>
        <span>{{ t('inbox.todoDueAt') }}</span>
        <BDateTimePicker v-model:value="form.dueAt" :placeholder="t('inbox.todoDuePlaceholder')" />
      </label>
    </div>
    <section class="todo-reminder-editor">
      <div class="todo-reminder-editor__title">
        <div>
          <strong>{{ t('inbox.todoReminder') }}</strong>
          <small>{{ t('inbox.todoReminderHint') }}</small>
        </div>
        <BSelect v-model:value="form.reminderMode" :options="reminderModeOptions" />
      </div>
      <template v-if="form.reminderMode !== 'none'">
        <div class="todo-reminder-editor__channels">
          <BCheckbox v-model="form.inAppReminder">{{ t('inbox.todoReminderInApp') }}</BCheckbox>
          <BCheckbox v-model="form.emailReminder">{{ t('inbox.todoReminderEmail') }}</BCheckbox>
        </div>
        <label v-if="form.emailReminder">
          <span class="todo-reminder-editor__field-label">
            <span>{{ t('inbox.todoReminderEmailAddress') }}</span>
            <span v-if="reminderEmailValidationMessage" class="todo-reminder-editor__field-error">
              {{ reminderEmailValidationMessage }}
            </span>
          </span>
          <BInput
            v-model:value="form.reminderEmail"
            :maxlength="254"
            :placeholder="t('inbox.todoReminderEmailPlaceholder')"
          />
        </label>
        <label>
          <span class="todo-reminder-editor__field-label">
            <span>{{ form.reminderMode === 'repeat' ? t('inbox.todoReminderRange') : t('inbox.todoReminderAt') }}</span>
            <span v-if="reminderTimeValidationMessage" class="todo-reminder-editor__field-error">
              {{ reminderTimeValidationMessage }}
            </span>
          </span>
          <BDateTimePicker
            v-model:value="form.reminderStartAt"
            v-model:end-value="form.reminderEndAt"
            :mode="form.reminderMode === 'repeat' ? 'range' : 'single'"
            :placeholder="t('inbox.todoReminderPlaceholder')"
          />
        </label>
        <div v-if="form.reminderMode === 'repeat'" class="todo-reminder-editor__interval-field">
          <span>{{ t('inbox.todoReminderInterval') }}</span>
          <div class="todo-reminder-editor__interval">
            <BInput v-model:value="form.intervalValue" type="number" />
            <BSelect v-model:value="form.intervalUnit" :options="intervalUnitOptions" />
          </div>
        </div>
        <p v-if="reminderGeneralValidationMessage" class="todo-reminder-editor__error">
          {{ reminderGeneralValidationMessage }}
        </p>
      </template>
    </section>
    <div class="todo-editor-form__actions">
      <BButton @click="emit('cancel')">{{ t('common.cancel') }}</BButton>
      <BButton type="primary" :loading="saving" :disabled="!canSubmit" @click="submit">
        {{ t('common.save') }}
      </BButton>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, reactive, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import BDateTimePicker from '@/components/base/BasicComponents/BDateTimePicker.vue';
  import type { TodoChecklistItem, TodoItem, TodoPayload, TodoPriority, TodoReminderChannel } from '@/api/todoApi';
  import { generateUUID } from '@/utils/common';

  const props = withDefaults(
    defineProps<{
      item?: TodoItem | null;
      saving?: boolean;
      resetKey?: number;
    }>(),
    {
      item: null,
      saving: false,
      resetKey: 0,
    },
  );
  const emit = defineEmits<{
    submit: [payload: TodoPayload];
    cancel: [];
  }>();
  const { t } = useI18n();
  const checklistItems = ref<TodoChecklistItem[]>([]);
  const checklistInputRefs = new Map<string, { focus: () => void }>();
  const form = reactive({
    title: '',
    description: '',
    priority: 1 as TodoPriority,
    dueAt: '',
    reminderMode: 'none' as 'none' | 'once' | 'repeat',
    reminderStartAt: '',
    reminderEndAt: '',
    inAppReminder: true,
    emailReminder: false,
    reminderEmail: '',
    intervalValue: 1 as number | string,
    intervalUnit: 'day' as 'minute' | 'hour' | 'day' | 'week',
  });
  const priorityOptions = computed(() => [0, 1, 2].map((value) => ({ value, label: t(`inbox.todoPriority${value}`) })));
  const reminderModeOptions = computed(() => [
    { value: 'none', label: t('inbox.todoReminderNone') },
    { value: 'once', label: t('inbox.todoReminderOnce') },
    { value: 'repeat', label: t('inbox.todoReminderRepeat') },
  ]);
  const intervalUnitOptions = computed(() => [
    { value: 'minute', label: t('inbox.todoReminderMinutes') },
    { value: 'hour', label: t('inbox.todoReminderHours') },
    { value: 'day', label: t('inbox.todoReminderDays') },
    { value: 'week', label: t('inbox.todoReminderWeeks') },
  ]);
  const reminderEmailValidationMessage = computed(() => {
    if (form.reminderMode === 'none' || !form.emailReminder) return '';
    return /^\S+@\S+\.\S+$/.test(form.reminderEmail.trim()) ? '' : t('inbox.todoReminderEmailInvalid');
  });
  const reminderTimeValidationMessage = computed(() => {
    if (form.reminderMode === 'none' || form.reminderStartAt) return '';
    return t('inbox.todoReminderTimeRequired');
  });
  const reminderValidationMessage = computed(() => {
    if (form.reminderMode === 'none') return '';
    if (!form.inAppReminder && !form.emailReminder) return t('inbox.todoReminderChannelRequired');
    if (reminderEmailValidationMessage.value) return reminderEmailValidationMessage.value;
    if (!form.reminderStartAt) return t('inbox.todoReminderTimeRequired');
    if (form.reminderMode === 'repeat') {
      if (!form.reminderEndAt) return t('inbox.todoReminderEndRequired');
      if (new Date(form.reminderEndAt).getTime() <= new Date(form.reminderStartAt).getTime())
        return t('inbox.todoReminderRangeInvalid');
      const intervalMinutes = toMinutes(form.intervalValue, form.intervalUnit);
      if (!Number.isFinite(intervalMinutes) || intervalMinutes < 5 || intervalMinutes > 43200)
        return t('inbox.todoReminderIntervalInvalid');
      const occurrenceCount =
        Math.floor(
          (new Date(form.reminderEndAt).getTime() - new Date(form.reminderStartAt).getTime()) /
            (intervalMinutes * 60_000),
        ) + 1;
      if (occurrenceCount > 100) return t('inbox.todoReminderTooFrequent');
    }
    if (form.dueAt) {
      const reminderEnd = form.reminderMode === 'repeat' ? form.reminderEndAt : form.reminderStartAt;
      if (reminderEnd && new Date(reminderEnd).getTime() > new Date(form.dueAt).getTime())
        return t('inbox.todoReminderAfterDue');
    }
    return '';
  });
  const reminderGeneralValidationMessage = computed(() =>
    reminderEmailValidationMessage.value || reminderTimeValidationMessage.value ? '' : reminderValidationMessage.value,
  );
  const canSubmit = computed(() => Boolean(form.title.trim()) && !props.saving && !reminderValidationMessage.value);

  watch(
    () => [props.item, props.resetKey] as const,
    () => reset(),
    { immediate: true },
  );

  watch(
    () => form.reminderMode,
    (mode) => {
      if (mode !== 'repeat') form.reminderEndAt = '';
    },
  );

  function toLocalInput(value?: string | null) {
    if (!value) return '';
    const normalized = String(value).replace(' ', 'T');
    const date = new Date(normalized);
    if (!Number.isFinite(date.getTime())) return normalized.slice(0, 16);
    const offset = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  }

  function reset() {
    form.title = props.item?.title || '';
    form.description = props.item?.description || '';
    form.priority = props.item?.priority ?? 1;
    form.dueAt = toLocalInput(props.item?.dueAt);
    const reminder = props.item?.reminder;
    form.reminderMode = reminder?.mode || (props.item?.reminderAt ? 'once' : 'none');
    form.reminderStartAt = toLocalInput(reminder?.startAt || props.item?.reminderAt);
    form.reminderEndAt = toLocalInput(reminder?.endAt);
    form.inAppReminder = reminder ? reminder.channels.includes('in_app') : true;
    form.emailReminder = Boolean(reminder?.channels.includes('email'));
    form.reminderEmail = reminder?.email || '';
    // 新建周期提醒默认半小时；仍可通过“数值 + 单位”组合选择分钟、小时、天或周。
    const interval = fromMinutes(reminder?.intervalMinutes ?? 30);
    form.intervalValue = interval.value;
    form.intervalUnit = interval.unit;
    checklistItems.value = props.item?.checklist?.length
      ? props.item.checklist.map((item) => ({ ...item }))
      : [createChecklistItem()];
  }

  function createChecklistItem(): TodoChecklistItem {
    return { id: generateUUID(), text: '', done: false };
  }

  function setChecklistInputRef(id: string, component: any) {
    if (component) checklistInputRefs.set(id, component);
    else checklistInputRefs.delete(id);
  }

  function focusChecklistItem(id?: string) {
    if (!id) return;
    nextTick(() => checklistInputRefs.get(id)?.focus());
  }

  function addChecklistItem(afterIndex = checklistItems.value.length - 1) {
    if (checklistItems.value.length >= 50) return;
    const current = checklistItems.value[afterIndex];
    if (current && !current.text.trim()) {
      focusChecklistItem(current.id);
      return;
    }
    const item = createChecklistItem();
    checklistItems.value.splice(Math.max(0, afterIndex + 1), 0, item);
    focusChecklistItem(item.id);
  }

  function handleChecklistEnter(index: number) {
    if (!checklistItems.value[index]?.text.trim()) return;
    addChecklistItem(index);
  }

  function removeChecklistItem(index: number) {
    if (checklistItems.value.length === 1) {
      checklistItems.value[0] = createChecklistItem();
      focusChecklistItem(checklistItems.value[0].id);
      return;
    }
    checklistItems.value.splice(index, 1);
    focusChecklistItem(checklistItems.value[Math.min(index, checklistItems.value.length - 1)]?.id);
  }

  function submit() {
    if (!canSubmit.value) return;
    const checklist = checklistItems.value
      .map((item) => ({ ...item, text: item.text.trim() }))
      .filter((item) => Boolean(item.text))
      .slice(0, 50)
      .map((item) => ({ ...item, text: item.text.slice(0, 200) }));
    const channels: TodoReminderChannel[] = [];
    if (form.inAppReminder) channels.push('in_app');
    if (form.emailReminder) channels.push('email');
    emit('submit', {
      title: form.title.trim(),
      description: form.description.trim(),
      priority: form.priority,
      checklist,
      dueAt: form.dueAt || null,
      reminder:
        form.reminderMode === 'none'
          ? null
          : {
              mode: form.reminderMode,
              channels,
              startAt: form.reminderStartAt,
              endAt: form.reminderMode === 'repeat' ? form.reminderEndAt : null,
              intervalMinutes: form.reminderMode === 'repeat' ? toMinutes(form.intervalValue, form.intervalUnit) : null,
              email: form.emailReminder ? form.reminderEmail.trim() : null,
            },
    });
  }

  function toMinutes(value: number | string, unit: typeof form.intervalUnit) {
    const multipliers = { minute: 1, hour: 60, day: 1440, week: 10080 };
    return Math.round(Number(value) * multipliers[unit]);
  }

  function fromMinutes(minutes: number): { value: number; unit: typeof form.intervalUnit } {
    if (minutes % 10080 === 0) return { value: minutes / 10080, unit: 'week' };
    if (minutes % 1440 === 0) return { value: minutes / 1440, unit: 'day' };
    if (minutes % 60 === 0) return { value: minutes / 60, unit: 'hour' };
    return { value: minutes, unit: 'minute' };
  }
</script>

<style scoped lang="less">
  .todo-editor-form {
    display: flex;
    flex-direction: column;
    gap: 14px;
    color: var(--text-color);
  }
  .todo-editor-form label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
  }
  .todo-reminder-editor__interval-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
  }
  .todo-checklist-editor {
    display: flex;
    flex-direction: column;
    gap: 9px;
    padding: 12px;
    border: 1px solid color-mix(in srgb, var(--primary-color) 14%, var(--card-border-color));
    border-radius: 12px;
    background: color-mix(in srgb, var(--primary-color) 4%, var(--background-color));
  }
  .todo-checklist-editor__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }
  .todo-checklist-editor__header > div {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    color: var(--text-color);
    font-size: 13px;
  }
  .todo-checklist-editor__header small {
    color: var(--desc-color);
    font-size: 12px;
  }
  .todo-checklist-editor__list {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .todo-checklist-editor__row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 6px;
  }
  .todo-checklist-editor__remove {
    color: var(--desc-color);
  }
  .todo-editor-form__grid {
    display: grid;
    grid-template-columns: 0.8fr 1.4fr;
    gap: 10px;
  }
  .todo-checklist-editor__index {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--primary-color) 10%, var(--background-color));
    color: var(--primary-color);
    font-size: 11px;
    font-weight: 600;
  }
  .todo-reminder-editor {
    display: flex;
    flex-direction: column;
    gap: 11px;
    padding: 13px;
    border: 1px solid color-mix(in srgb, var(--primary-color) 12%, var(--card-border-color));
    border-radius: 14px;
    background: linear-gradient(
      130deg,
      color-mix(in srgb, var(--primary-color) 5%, var(--background-color)),
      var(--background-color)
    );
  }
  .todo-reminder-editor__title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .todo-reminder-editor__title > div {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .todo-reminder-editor__title small {
    color: var(--desc-color);
    font-size: 11px;
    font-weight: 400;
  }
  .todo-reminder-editor__channels {
    display: flex;
    flex-wrap: wrap;
    gap: 18px;
  }
  .todo-reminder-editor label {
    gap: 6px;
  }
  .todo-reminder-editor__field-label {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
  }
  .todo-reminder-editor__field-error {
    color: var(--danger-color, #e5484d);
    font-size: 12px;
    font-weight: 400;
    text-align: right;
  }
  .todo-reminder-editor__interval {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 120px;
    gap: 8px;
  }
  .todo-reminder-editor__error {
    margin: 0;
    color: var(--danger-color, #e5484d);
    font-size: 12px;
  }
  .todo-editor-form__actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  @media (max-width: 767px) {
    .todo-editor-form__grid {
      grid-template-columns: 1fr;
    }
    .todo-editor-form__actions :deep(.b_btn) {
      flex: 1;
      width: auto;
    }
    .todo-checklist-editor {
      padding: 10px;
    }
    .todo-checklist-editor__header {
      align-items: center;
    }
    .todo-checklist-editor__row {
      grid-template-columns: auto minmax(0, 1fr);
    }
    .todo-checklist-editor__remove {
      grid-column: 2;
      justify-self: end;
    }
    .todo-reminder-editor__title {
      align-items: flex-start;
      flex-direction: column;
    }
    .todo-reminder-editor__title :deep(.b-select) {
      width: 100%;
    }
    .todo-reminder-editor__field-label {
      flex-wrap: wrap;
      row-gap: 3px;
    }
    .todo-reminder-editor__field-error {
      margin-left: auto;
    }
  }
</style>
