<template>
  <div class="todo-reminder-once">
    <label>
      <span>{{ t('inbox.todoReminderWhen') }}</span>
      <BSelect v-model:value="onceType" :options="typeOptions" />
    </label>
    <label v-if="onceType === 'before_due'">
      <span>{{ t('inbox.todoReminderOffsetMinutes') }}</span>
      <BInput v-model:value="offsetMinutes" type="number" />
    </label>
    <div v-if="onceType === 'fixed_at'" class="todo-reminder-once__fixed">
      <span>{{ t('inbox.todoReminderFixedAt') }}</span>
      <div v-for="(row, index) in fixedRows" :key="row.id" class="todo-reminder-once__row">
        <BDateTimePicker v-model:value="row.value" @update:value="writeFixedTimes" />
        <BButton
          v-if="fixedRows.length > 1"
          class="todo-reminder-once__remove"
          type="text"
          icon-only
          :aria-label="t('inbox.todoReminderRemoveTime', { index: index + 1 })"
          :title="t('inbox.todoReminderRemoveTime', { index: index + 1 })"
          @click="removeFixedTime(index)"
        >
          <SvgIcon :src="icon.common.close" size="16" />
        </BButton>
      </div>
      <BButton
        class="todo-reminder-once__add"
        type="text"
        size="small"
        :disabled="fixedRows.length >= maxFixedTimes"
        :aria-label="t('inbox.todoReminderAddTime')"
        @click="addFixedTime"
      >
        <SvgIcon :src="icon.common.add" size="16" />
        {{ t('inbox.todoReminderAddTime') }}
      </BButton>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { getTodoFixedReminderTimes, TODO_SINGLE_TASK_MAX_REMINDER_JOBS } from '@lightnote/shared/todo-reminder';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { useI18n } from 'vue-i18n';
  import BDateTimePicker from '@/components/base/BasicComponents/BDateTimePicker.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import type { TodoSingleTaskReminderSchedule } from '@/api/todoApi';

  const reminder = defineModel<TodoSingleTaskReminderSchedule>({ required: true });
  const { t } = useI18n();
  const typeOptions = computed(() => [
    { value: 'at_due', label: t('inbox.todoReminderAtDue') },
    { value: 'at_start', label: t('inbox.todoReminderAtStart') },
    { value: 'before_due', label: t('inbox.todoReminderBeforeDue') },
    { value: 'fixed_at', label: t('inbox.todoReminderFixedAt') },
  ]);
  const onceType = computed({
    get: () => reminder.value.once?.type || 'at_due',
    set: (type) => {
      reminder.value = {
        ...reminder.value,
        mode: 'once',
        once: {
          type,
          ...(type === 'before_due' ? { offsetMinutes: reminder.value.once?.offsetMinutes || 60 } : {}),
          ...(type === 'fixed_at'
            ? {
                fixedAt: reminder.value.once?.fixedAt || '',
                ...(reminder.value.once?.fixedAts ? { fixedAts: reminder.value.once.fixedAts } : {}),
              }
            : {}),
        },
      };
    },
  });
  const offsetMinutes = computed({
    get: () => reminder.value.once?.offsetMinutes || 60,
    set: (value) => {
      reminder.value = {
        ...reminder.value,
        once: { type: 'before_due', offsetMinutes: Number(value || 60) },
      };
    },
  });
  let nextRowId = 0;
  const fixedRows = ref(getTodoFixedReminderTimes(reminder.value.once).map((value) => ({ id: nextRowId++, value })));
  const maxFixedTimes = computed(() =>
    Math.floor(TODO_SINGLE_TASK_MAX_REMINDER_JOBS / Math.max(1, reminder.value.channels.length)),
  );
  function writeFixedTimes() {
    const values = fixedRows.value.map((row) => row.value);
    reminder.value = {
      ...reminder.value,
      once: { type: 'fixed_at', fixedAt: values[0] || '', ...(values.length > 1 ? { fixedAts: values } : {}) },
    };
  }
  function addFixedTime() {
    if (fixedRows.value.length >= maxFixedTimes.value) return;
    fixedRows.value.push({ id: nextRowId++, value: '' });
    writeFixedTimes();
  }
  function removeFixedTime(index: number) {
    if (fixedRows.value.length <= 1) return;
    fixedRows.value.splice(index, 1);
    writeFixedTimes();
  }
  watch(
    () => reminder.value.once,
    (once) => {
      const values = getTodoFixedReminderTimes(once);
      if (JSON.stringify(values) !== JSON.stringify(fixedRows.value.map((row) => row.value))) {
        fixedRows.value = (values.length ? values : ['']).map((value) => ({ id: nextRowId++, value }));
      }
    },
    { deep: true },
  );
</script>

<style scoped lang="less">
  .todo-reminder-once {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--ui-space-14, 14px);
  }

  label,
  .todo-reminder-once__fixed {
    display: grid;
    align-content: start;
    min-width: 0;
    gap: var(--ui-space-7, 7px);
    color: var(--text-color);
    font-size: var(--ui-font-13, 13px);
    font-weight: 600;
  }

  .todo-reminder-once__row {
    display: flex;
    align-items: center;
    gap: var(--ui-space-6, 6px);
    min-width: 0;
  }

  .todo-reminder-once__row > :deep(.b-popover-trigger) {
    flex: 1;
    min-width: 0;
  }

  .todo-reminder-once__row > :deep(.b_btn) {
    flex: none;
    width: var(--ui-control-32, 32px);
    min-width: var(--ui-control-32, 32px);
    padding: 0;
  }

  .todo-reminder-once__add {
    justify-self: start;
  }

  @media (max-width: 767px) {
    .todo-reminder-once {
      grid-template-columns: 1fr;
    }

    .todo-reminder-once__row > :deep(.todo-reminder-once__remove) {
      width: var(--ui-control-44, 44px);
      min-width: var(--ui-control-44, 44px);
      min-height: var(--ui-control-44, 44px);
    }
  }
</style>
