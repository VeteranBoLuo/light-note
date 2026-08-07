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
    <label v-if="onceType === 'fixed_at'">
      <span>{{ t('inbox.todoReminderFixedAt') }}</span>
      <BDateTimePicker v-model:value="fixedAt" />
    </label>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
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
          ...(type === 'fixed_at' ? { fixedAt: reminder.value.once?.fixedAt || '' } : {}),
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
  const fixedAt = computed({
    get: () => reminder.value.once?.fixedAt || '',
    set: (value) => {
      reminder.value = { ...reminder.value, once: { type: 'fixed_at', fixedAt: value } };
    },
  });
</script>

<style scoped lang="less">
  .todo-reminder-once {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }

  label {
    display: grid;
    gap: 7px;
    color: var(--text-color);
    font-size: 13px;
    font-weight: 600;
  }

  @media (max-width: 767px) {
    .todo-reminder-once {
      grid-template-columns: 1fr;
    }
  }
</style>
