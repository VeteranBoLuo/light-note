<template>
  <BModal
    v-model:visible="visible"
    :title="t('inbox.calendarModalTitle')"
    width="430px"
    :mask-closable="!exporting"
    :esc-closable="!exporting"
    @close="close"
  >
    <div v-if="item" class="todo-calendar">
      <strong class="todo-calendar__title">{{ item.title }}</strong>
      <p v-if="dueText" class="todo-calendar__due">{{ dueText }}</p>
      <div class="todo-calendar__field">
        <span class="todo-calendar__label">{{ t('inbox.calendarAlarmLabel') }}</span>
        <BSelect v-model:value="alarm" :options="alarmOptions" :aria-label="t('inbox.calendarAlarmLabel')" />
      </div>
      <p class="todo-calendar__note">{{ t('inbox.calendarExportNote') }}</p>
    </div>
    <template #footer>
      <div class="todo-calendar__footer">
        <BButton :disabled="exporting" @click="close">{{ t('common.cancel') }}</BButton>
        <BButton type="primary" :loading="exporting" @click="confirm">{{ t('inbox.calendarExportAction') }}</BButton>
      </div>
    </template>
  </BModal>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import type { TodoItem } from '@/api/todoApi';
  import { formatTodoDateTime } from '@/utils/todoPlanning';

  const props = defineProps<{ item: TodoItem | null; exporting?: boolean }>();
  const visible = defineModel<boolean>('visible');
  const emit = defineEmits<{ confirm: [alarmMinutesBefore: number | null] }>();
  const { t, locale } = useI18n();

  const DEFAULT_ALARM = '15';
  const alarm = ref(DEFAULT_ALARM);

  const alarmOptions = computed(() => [
    { label: t('inbox.calendarAlarmNone'), value: 'none' },
    { label: t('inbox.calendarAlarmOnTime'), value: '0' },
    { label: t('inbox.calendarAlarmMinutesBefore', { n: 5 }), value: '5' },
    { label: t('inbox.calendarAlarmMinutesBefore', { n: 15 }), value: '15' },
    { label: t('inbox.calendarAlarmMinutesBefore', { n: 30 }), value: '30' },
    { label: t('inbox.calendarAlarmHourBefore'), value: '60' },
    { label: t('inbox.calendarAlarmDayBefore'), value: '1440' },
  ]);

  const dueText = computed(() => {
    const time = formatTodoDateTime(props.item?.dueAt, locale.value);
    return time ? t('inbox.todoDue', { time }) : '';
  });

  watch(visible, (value) => {
    if (value) alarm.value = DEFAULT_ALARM;
  });

  function confirm() {
    if (props.exporting) return;
    emit('confirm', alarm.value === 'none' ? null : Number(alarm.value));
  }

  function close() {
    if (!props.exporting) visible.value = false;
  }
</script>

<style scoped lang="less">
  .todo-calendar {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }
  .todo-calendar__title {
    color: var(--text-color);
    font-size: 15px;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
  .todo-calendar__due {
    margin: 0;
    color: var(--desc-color);
    font-size: 13px;
  }
  .todo-calendar__field {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 4px;
  }
  .todo-calendar__label {
    flex-shrink: 0;
    color: var(--text-color);
    font-size: 13px;
  }
  .todo-calendar__field :deep(.b-select) {
    min-width: 0;
    flex: 1;
  }
  .todo-calendar__note {
    margin: 4px 0 0;
    padding: 8px 10px;
    border-radius: 8px;
    background: var(--hover-background);
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.6;
  }
  /* 自定义 #footer 会替换 BModal 默认底栏容器，需按约定自带内边距，否则按钮贴弹窗边缘 */
  .todo-calendar__footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 0 20px 16px;
  }

  @media (max-width: 767px) {
    .todo-calendar__footer {
      padding: 0 16px 12px;
    }
  }
</style>
