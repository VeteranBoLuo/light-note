<template>
  <BPopover
    v-model:open="open"
    trigger="click"
    placement="bottom-left"
    overlay-class-name="b-datetime-popover"
    :disabled="disabled"
  >
    <BButton class="b-datetime-trigger" :disabled="disabled">
      <span class="b-datetime-trigger__icon">&#128197;</span>
      <span :class="{ 'is-placeholder': !displayValue }">{{ displayValue || placeholder }}</span>
    </BButton>
    <template #content>
      <div class="b-datetime-panel">
        <header class="b-datetime-panel__header">
          <BButton size="small" :title="t('common.previous')" @click="moveMonth(-1)">&#8249;</BButton>
          <strong>{{ monthLabel }}</strong>
          <BButton size="small" :title="t('common.next')" @click="moveMonth(1)">&#8250;</BButton>
        </header>
        <div class="b-datetime-weekdays">
          <span v-for="day in weekdays" :key="day">{{ day }}</span>
        </div>
        <div class="b-datetime-days">
          <BButton
            v-for="day in calendarDays"
            :key="day.key"
            size="small"
            class="b-datetime-day"
            :class="{
              'is-outside': !day.currentMonth,
              'is-selected': isSelected(day.value),
              'is-in-range': isInRange(day.value),
              'is-today': day.value === today,
            }"
            @click="selectDate(day.value)"
          >
            {{ day.label }}
          </BButton>
        </div>

        <div class="b-datetime-times" :class="{ 'is-range': mode === 'range' }">
          <section>
            <span>{{ mode === 'range' ? t('common.startTime') : t('common.time') }}</span>
            <div>
              <BSelect v-model:value="draftStartHour" :options="hourOptions" />
              <span>:</span>
              <BSelect v-model:value="draftStartMinute" :options="minuteOptions" />
            </div>
          </section>
          <section v-if="mode === 'range'">
            <span>{{ t('common.endTime') }}</span>
            <div>
              <BSelect v-model:value="draftEndHour" :options="hourOptions" />
              <span>:</span>
              <BSelect v-model:value="draftEndMinute" :options="minuteOptions" />
            </div>
          </section>
        </div>

        <p v-if="mode === 'range'" class="b-datetime-range-hint">{{ rangeHint }}</p>
        <footer class="b-datetime-panel__footer">
          <BButton size="small" @click="clearValue">{{ t('common.clear') }}</BButton>
          <div>
            <BButton size="small" @click="open = false">{{ t('common.cancel') }}</BButton>
            <BButton size="small" type="primary" :disabled="!canApply" @click="applyValue">
              {{ t('common.confirm') }}
            </BButton>
          </div>
        </footer>
      </div>
    </template>
  </BPopover>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';

  const props = withDefaults(
    defineProps<{
      mode?: 'single' | 'range';
      placeholder?: string;
      disabled?: boolean;
    }>(),
    {
      mode: 'single',
      placeholder: '',
      disabled: false,
    },
  );
  const value = defineModel<string>('value', { default: '' });
  const endValue = defineModel<string>('endValue', { default: '' });
  const { t, locale } = useI18n();
  const open = ref(false);
  const viewMonth = ref(startOfMonth(new Date()));
  const draftStartDate = ref('');
  const draftEndDate = ref('');
  const draftStartHour = ref('09');
  const draftStartMinute = ref('00');
  const draftEndHour = ref('18');
  const draftEndMinute = ref('00');
  const today = toDatePart(new Date());

  const mode = computed(() => props.mode);
  const placeholder = computed(() => props.placeholder || t('common.selectDateTime'));
  const hourOptions = Array.from({ length: 24 }, (_, index) => {
    const value = String(index).padStart(2, '0');
    return { value, label: value };
  });
  const minuteOptions = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'].map((value) => ({
    value,
    label: value,
  }));
  const weekdays = computed(() => {
    const base = new Date(2026, 6, 12);
    return Array.from({ length: 7 }, (_, index) =>
      new Intl.DateTimeFormat(locale.value, { weekday: 'narrow' }).format(
        new Date(base.getFullYear(), base.getMonth(), base.getDate() + index),
      ),
    );
  });
  const monthLabel = computed(() =>
    new Intl.DateTimeFormat(locale.value, { year: 'numeric', month: 'long' }).format(viewMonth.value),
  );
  const calendarDays = computed(() => {
    const first = startOfMonth(viewMonth.value);
    const cursor = new Date(first);
    cursor.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(cursor);
      date.setDate(cursor.getDate() + index);
      const dateValue = toDatePart(date);
      return {
        key: dateValue,
        value: dateValue,
        label: date.getDate(),
        currentMonth: date.getMonth() === first.getMonth(),
      };
    });
  });
  const canApply = computed(
    () => Boolean(draftStartDate.value) && (mode.value === 'single' || Boolean(draftEndDate.value)),
  );
  const displayValue = computed(() => {
    if (!value.value) return '';
    const start = formatDisplay(value.value);
    if (mode.value !== 'range') return start;
    return endValue.value ? `${start} — ${formatDisplay(endValue.value)}` : start;
  });
  const rangeHint = computed(() => {
    if (!draftStartDate.value) return t('common.selectRangeStart');
    if (!draftEndDate.value) return t('common.selectRangeEnd');
    return `${formatDraft(draftStartDate.value, draftStartHour.value, draftStartMinute.value)} — ${formatDraft(
      draftEndDate.value,
      draftEndHour.value,
      draftEndMinute.value,
    )}`;
  });

  watch(open, (next) => {
    if (!next) return;
    readModel();
  });

  watch(mode, (next) => {
    // 区间切回单点时立即丢弃结束值，避免日历仍高亮旧终点，提交时也不携带陈旧数据。
    if (next !== 'single') return;
    draftEndDate.value = '';
    endValue.value = '';
  });

  function readModel() {
    const start = splitValue(value.value);
    const end = mode.value === 'range' ? splitValue(endValue.value) : splitValue('');
    draftStartDate.value = start.date;
    draftStartHour.value = start.hour || '09';
    draftStartMinute.value = normalizeMinute(start.minute || '00');
    draftEndDate.value = end.date;
    draftEndHour.value = end.hour || '18';
    draftEndMinute.value = normalizeMinute(end.minute || '00');
    const anchor = parseLocalDate(start.date || toDatePart(new Date()));
    viewMonth.value = startOfMonth(anchor);
  }

  function moveMonth(step: number) {
    viewMonth.value = new Date(viewMonth.value.getFullYear(), viewMonth.value.getMonth() + step, 1);
  }

  function selectDate(date: string) {
    if (mode.value === 'single') {
      draftStartDate.value = date;
      return;
    }
    if (!draftStartDate.value || draftEndDate.value) {
      draftStartDate.value = date;
      draftEndDate.value = '';
      return;
    }
    if (date < draftStartDate.value) {
      draftEndDate.value = draftStartDate.value;
      draftStartDate.value = date;
    } else {
      draftEndDate.value = date;
    }
  }

  function isSelected(date: string) {
    return date === draftStartDate.value || (mode.value === 'range' && date === draftEndDate.value);
  }

  function isInRange(date: string) {
    return Boolean(
      mode.value === 'range' &&
        draftStartDate.value &&
        draftEndDate.value &&
        date > draftStartDate.value &&
        date < draftEndDate.value,
    );
  }

  function applyValue() {
    if (!canApply.value) return;
    value.value = formatDraft(draftStartDate.value, draftStartHour.value, draftStartMinute.value);
    endValue.value =
      mode.value === 'range' ? formatDraft(draftEndDate.value, draftEndHour.value, draftEndMinute.value) : '';
    open.value = false;
  }

  function clearValue() {
    value.value = '';
    endValue.value = '';
    draftStartDate.value = '';
    draftEndDate.value = '';
    open.value = false;
  }

  function startOfMonth(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function toDatePart(date: Date) {
    const pad = (part: number) => String(part).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function parseLocalDate(raw: string) {
    const [year, month, day] = raw.split('-').map(Number);
    return new Date(year, Math.max(0, month - 1), day || 1);
  }

  function splitValue(raw: string) {
    const normalized = String(raw || '').replace(' ', 'T');
    const [date = '', time = ''] = normalized.split('T');
    const [hour = '', minute = ''] = time.split(':');
    return { date, hour, minute };
  }

  function normalizeMinute(minute: string) {
    const numeric = Number(minute);
    if (!Number.isFinite(numeric)) return '00';
    return String(Math.min(55, Math.round(numeric / 5) * 5)).padStart(2, '0');
  }

  function formatDraft(date: string, hour: string, minute: string) {
    return `${date}T${hour}:${minute}`;
  }

  function formatDisplay(raw: string) {
    const date = new Date(String(raw).replace(' ', 'T'));
    if (!Number.isFinite(date.getTime())) return raw;
    return new Intl.DateTimeFormat(locale.value, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  }
</script>

<style scoped lang="less">
  :deep(.b-popover-trigger) {
    width: 100%;
  }
  .b-datetime-trigger {
    width: 100%;
    min-height: 38px;
    justify-content: flex-start;
    overflow: hidden;
    text-align: left;
  }
  .b-datetime-trigger__icon {
    flex: none;
    opacity: 0.72;
  }
  .b-datetime-trigger span:last-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .b-datetime-trigger .is-placeholder {
    color: var(--desc-color);
  }
  .b-datetime-panel {
    width: 332px;
    max-width: calc(100vw - 24px);
    padding: 12px;
    box-sizing: border-box;
  }
  .b-datetime-panel__header,
  .b-datetime-panel__footer,
  .b-datetime-panel__footer > div,
  .b-datetime-times section > div {
    display: flex;
    align-items: center;
  }
  .b-datetime-panel__header {
    justify-content: space-between;
    margin-bottom: 9px;
  }
  .b-datetime-panel__header strong {
    font-size: 14px;
  }
  .b-datetime-weekdays,
  .b-datetime-days {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 3px;
  }
  .b-datetime-weekdays {
    margin-bottom: 4px;
  }
  .b-datetime-weekdays span {
    color: var(--desc-color);
    font-size: 11px;
    text-align: center;
  }
  .b-datetime-day {
    width: 100%;
    min-width: 0;
    height: 34px;
    padding: 0;
    border-radius: 9px;
  }
  .b-datetime-day.is-outside {
    opacity: 0.35;
  }
  .b-datetime-day.is-today {
    color: var(--primary-color);
    font-weight: 700;
  }
  .b-datetime-day.is-in-range {
    border-radius: 5px;
    background: color-mix(in srgb, var(--primary-color) 9%, transparent);
  }
  .b-datetime-day.is-selected {
    background: var(--primary-color);
    color: #fff;
    opacity: 1;
  }
  .b-datetime-times {
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
    margin-top: 12px;
    padding-top: 11px;
    border-top: 1px solid var(--card-border-color);
  }
  .b-datetime-times.is-range {
    grid-template-columns: 1fr 1fr;
  }
  .b-datetime-times section {
    min-width: 0;
  }
  .b-datetime-times section > span {
    display: block;
    margin-bottom: 5px;
    color: var(--desc-color);
    font-size: 11px;
  }
  .b-datetime-times section > div {
    gap: 4px;
  }
  .b-datetime-times :deep(.b-select) {
    flex: 1;
    min-width: 0;
  }
  .b-datetime-range-hint {
    margin: 9px 0 0;
    color: var(--desc-color);
    font-size: 11px;
    line-height: 1.5;
  }
  .b-datetime-panel__footer {
    justify-content: space-between;
    gap: 10px;
    margin-top: 12px;
  }
  .b-datetime-panel__footer > div {
    gap: 6px;
  }
  @media (max-width: 420px) {
    .b-datetime-panel {
      width: calc(100vw - 24px);
    }
  }
</style>
