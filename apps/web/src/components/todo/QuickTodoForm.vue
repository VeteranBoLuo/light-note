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
        <BSelect v-model:value="priority" :options="priorityOptions" />
      </label>
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
  import type { TodoPayload, TodoPriority } from '@/api/todoApi';
  import { dueForTodoGroup } from '@/utils/todoPlanning';

  type DuePreset = 'none' | 'today' | 'tomorrow';

  const props = withDefaults(
    defineProps<{
      saving?: boolean;
      resetKey?: number;
    }>(),
    {
      saving: false,
      resetKey: 0,
    },
  );
  const emit = defineEmits<{
    submit: [payload: TodoPayload];
    details: [payload: TodoPayload];
  }>();
  const { t } = useI18n();
  const titleInput = ref<InstanceType<typeof BInput> | null>(null);
  const title = ref('');
  const priority = ref<TodoPriority>(1);
  const duePreset = ref<DuePreset>('none');

  const dueOptions = computed<Array<{ value: DuePreset; label: string }>>(() => [
    { value: 'none', label: t('inbox.quickTodoNoDate') },
    { value: 'today', label: t('inbox.quickTodoToday') },
    { value: 'tomorrow', label: t('inbox.quickTodoTomorrow') },
  ]);
  const priorityOptions = computed(() => [0, 1, 2].map((value) => ({ value, label: t(`inbox.todoPriority${value}`) })));
  const canSubmit = computed(() => Boolean(title.value.trim()) && !props.saving);

  watch(
    () => props.resetKey,
    () => reset(),
  );

  function buildPayload(): TodoPayload {
    return {
      title: title.value.trim(),
      priority: priority.value,
      dueAt:
        duePreset.value === 'today'
          ? dueForTodoGroup('today')
          : duePreset.value === 'tomorrow'
            ? dueForTodoGroup('upcoming')
            : null,
    };
  }

  function submit() {
    if (!canSubmit.value) return;
    emit('submit', buildPayload());
  }

  function openDetails() {
    emit('details', buildPayload());
  }

  function reset() {
    title.value = '';
    priority.value = 1;
    duePreset.value = 'none';
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
