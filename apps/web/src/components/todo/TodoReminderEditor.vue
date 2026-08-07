<template>
  <section class="todo-reminder-editor-v3">
    <div class="todo-reminder-editor-v3__mode" role="group" :aria-label="t('inbox.todoReminder')">
      <BButton
        v-for="option in modeOptions"
        :key="option.value"
        :class="{ 'is-active': model.mode === option.value }"
        :aria-pressed="model.mode === option.value"
        @click="setMode(option.value)"
      >
        {{ option.label }}
      </BButton>
    </div>
    <TodoReminderOnceEditor v-if="model.mode === 'once'" v-model="model" />
    <TodoReminderRepeatEditor v-if="model.mode === 'repeat'" v-model="model" />
    <template v-if="model.mode !== 'none'">
      <div class="todo-reminder-editor-v3__channels">
        <BCheckbox :model-value="model.channels.includes('in_app')" @change="toggleChannel('in_app', $event)">
          {{ t('inbox.todoReminderInApp') }}
        </BCheckbox>
        <BCheckbox :model-value="model.channels.includes('email')" @change="toggleChannel('email', $event)">
          {{ t('inbox.todoReminderEmail') }}
        </BCheckbox>
      </div>
      <label v-if="model.channels.includes('email')" class="todo-reminder-editor-v3__email">
        <span>{{ t('inbox.todoReminderEmailAddress') }}</span>
        <BInput v-model:value="targetEmail" :maxlength="254" />
        <small v-if="model.mode === 'repeat'">{{ t('inbox.todoReminderEmailFiniteHint') }}</small>
      </label>
    </template>
  </section>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import TodoReminderOnceEditor from './TodoReminderOnceEditor.vue';
  import TodoReminderRepeatEditor from './TodoReminderRepeatEditor.vue';
  import type { TodoReminderChannel, TodoSingleReminderMode, TodoSingleTaskReminderSchedule } from '@/api/todoApi';

  const model = defineModel<TodoSingleTaskReminderSchedule>({ required: true });
  const { t } = useI18n();
  const modeOptions = computed<Array<{ value: TodoSingleReminderMode; label: string }>>(() => [
    { value: 'none', label: t('inbox.todoReminderNone') },
    { value: 'once', label: t('inbox.todoReminderOnce') },
    { value: 'repeat', label: t('inbox.todoReminderRepeat') },
  ]);

  function setMode(mode: TodoSingleReminderMode) {
    if (mode === 'none') {
      model.value = { version: 1, mode, channels: [] };
      return;
    }
    if (mode === 'once') {
      model.value = {
        version: 1,
        mode,
        once: model.value.once || { type: 'at_due' },
        channels: model.value.channels.length ? model.value.channels : ['in_app'],
        targetEmail: model.value.targetEmail,
      };
      return;
    }
    model.value = {
      version: 1,
      mode,
      repeat: model.value.repeat || {
        kind: 'interval',
        intervalMinutes: 1440,
        stop: { type: 'completion_or_due' },
      },
      channels: model.value.channels.length ? model.value.channels : ['in_app'],
      targetEmail: model.value.targetEmail,
    };
  }

  function toggleChannel(channel: TodoReminderChannel, checked: boolean) {
    const channels = checked
      ? [...new Set([...model.value.channels, channel])]
      : model.value.channels.filter((item) => item !== channel);
    model.value = { ...model.value, channels };
  }

  const targetEmail = computed({
    get: () => model.value.targetEmail || '',
    set: (value) => {
      model.value = { ...model.value, targetEmail: value };
    },
  });
</script>

<style scoped lang="less">
  .todo-reminder-editor-v3 {
    display: grid;
    gap: 16px;
  }

  .todo-reminder-editor-v3__email small {
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.5;
  }

  .todo-reminder-editor-v3__mode {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    padding: 3px;
    border-radius: 11px;
    background: var(--workspace-panel-bg-color);
  }

  .todo-reminder-editor-v3__mode :deep(.b_btn) {
    border: 1px solid transparent;
    background: transparent;
  }

  .todo-reminder-editor-v3__mode :deep(.b_btn.is-active) {
    border-color: var(--primary-color);
    background: var(--card-background);
    color: var(--primary-color);
    font-weight: 700;
  }

  .todo-reminder-editor-v3__channels {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    padding-top: 4px;
  }

  .todo-reminder-editor-v3__email {
    display: grid;
    gap: 7px;
    color: var(--text-color);
    font-size: 13px;
    font-weight: 600;
  }
</style>
