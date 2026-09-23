<template>
  <BPopover
    class="b-time-picker"
    :class="{ 'is-block': block }"
    v-model:open="open"
    trigger="click"
    placement="bottom-left"
    overlay-class-name="b-time-popover"
    :disabled="disabled"
    @open-change="emit('openChange', $event)"
  >
    <BButton
      class="b-time-trigger"
      :class="{ 'is-open': open }"
      :disabled="disabled"
      :aria-label="ariaLabel || placeholderText"
      :aria-expanded="open"
      aria-haspopup="dialog"
    >
      <slot name="prefix" />
      <span class="b-time-trigger__value" :class="{ 'is-placeholder': !value }">
        {{ value || placeholderText }}
      </span>
      <SvgIcon class="b-time-trigger__icon" :src="icon.common.time" size="16" aria-hidden="true" />
    </BButton>

    <template #content>
      <section class="b-time-panel" role="dialog" :aria-label="ariaLabel || placeholderText">
        <header class="b-time-panel__header">
          <span class="b-time-panel__icon" aria-hidden="true">
            <SvgIcon :src="icon.common.time" size="17" />
          </span>
          <div>
            <strong>{{ placeholderText }}</strong>
            <span>{{ draftHour }}:{{ draftMinute }}</span>
          </div>
        </header>

        <div class="b-time-panel__fields">
          <label>
            <span>{{ t('common.hour') }}</span>
            <BSelect
              v-model:value="draftHour"
              :options="hourOptions"
              editable
              inputmode="numeric"
              :maxlength="2"
              :aria-label="t('common.hour')"
              dropdown-class-name="b-time-select-dropdown"
              select-on-focus
              @validity-change="hourValid = $event"
            />
          </label>
          <span class="b-time-panel__separator" aria-hidden="true">:</span>
          <label>
            <span>{{ t('common.minute') }}</span>
            <BSelect
              v-model:value="draftMinute"
              :options="minuteOptions"
              editable
              inputmode="numeric"
              :maxlength="2"
              :aria-label="t('common.minute')"
              dropdown-class-name="b-time-select-dropdown"
              select-on-focus
              @validity-change="minuteValid = $event"
            />
          </label>
        </div>

        <footer class="b-time-panel__footer">
          <BButton size="small" @click="open = false">{{ t('common.cancel') }}</BButton>
          <BButton size="small" type="primary" :disabled="!canApply" @click="applyValue">
            {{ t('common.confirm') }}
          </BButton>
        </footer>
      </section>
    </template>
  </BPopover>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from './BButton.vue';
  import BPopover from './BPopover.vue';
  import BSelect from './BSelect.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';

  const props = withDefaults(
    defineProps<{
      placeholder?: string;
      ariaLabel?: string;
      disabled?: boolean;
      defaultValue?: string;
      block?: boolean;
    }>(),
    {
      placeholder: '',
      ariaLabel: '',
      disabled: false,
      defaultValue: '09:00',
      block: false,
    },
  );
  const emit = defineEmits<{
    change: [value: string];
    openChange: [open: boolean];
  }>();
  const value = defineModel<string>('value', { default: '' });
  const { t } = useI18n();
  const open = ref(false);
  const draftHour = ref('09');
  const draftMinute = ref('00');
  const hourValid = ref(true);
  const minuteValid = ref(true);

  const placeholderText = computed(() => props.placeholder || t('common.selectTime'));
  const canApply = computed(() => hourValid.value && minuteValid.value);
  const hourOptions = Array.from({ length: 24 }, (_, index) => {
    const optionValue = String(index).padStart(2, '0');
    return { value: optionValue, label: optionValue };
  });
  const minuteOptions = Array.from({ length: 60 }, (_, index) => {
    const optionValue = String(index).padStart(2, '0');
    return { value: optionValue, label: optionValue };
  });

  watch(open, (next) => {
    if (!next) return;
    const [hour, minute] = normalizeTime(value.value || props.defaultValue).split(':');
    draftHour.value = hour;
    draftMinute.value = minute;
    hourValid.value = true;
    minuteValid.value = true;
  });

  function normalizeTime(raw: string) {
    const match = /^(\d{1,2}):(\d{1,2})$/.exec(String(raw || '').trim());
    if (!match) return '09:00';
    const hour = Math.min(23, Math.max(0, Number(match[1])));
    const minute = Math.min(59, Math.max(0, Number(match[2])));
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  function applyValue() {
    if (!canApply.value) return;
    const next = `${draftHour.value}:${draftMinute.value}`;
    value.value = next;
    emit('change', next);
    open.value = false;
  }
</script>

<style scoped lang="less">
  :deep(.b-popover-trigger) {
    display: inline-flex;
  }

  .b-time-picker.is-block {
    width: 100%;
    min-width: 0;
  }

  .b-time-picker.is-block :deep(.b-time-trigger) {
    width: 100%;
    min-width: 0;
  }

  .b-time-trigger {
    min-width: var(--ui-layout-142, 142px);
    height: var(--ui-control-36, 36px);
    min-height: var(--ui-control-36, 36px);
    justify-content: flex-start;
    gap: var(--ui-space-8, 8px);
    padding: 0 var(--ui-space-11, 11px);
    border: 1px solid var(--surface-border-color);
    border-radius: 9px;
    color: var(--text-color);
    background: var(--primary-btn-bg-color);
    line-height: var(--ui-control-36, 36px);
  }

  .b-time-trigger.is-open {
    border-color: var(--primary-color);
    color: var(--primary-color);
    background: var(--mobile-selected-bg, var(--workspace-panel-bg-color));
  }

  .b-time-trigger__value {
    min-width: var(--ui-layout-42, 42px);
    font-variant-numeric: tabular-nums;
  }

  .b-time-trigger__value.is-placeholder {
    color: var(--desc-color);
  }

  .b-time-trigger__icon {
    margin-left: auto;
    flex: none;
  }

  .b-time-panel {
    width: var(--ui-layout-252, 252px);
    max-width: calc(100vw - 24px);
    padding: var(--ui-space-14, 14px);
    box-sizing: border-box;
  }

  .b-time-panel__header {
    display: flex;
    align-items: center;
    gap: var(--ui-space-10, 10px);
    padding-bottom: var(--ui-space-12, 12px);
    border-bottom: 1px solid var(--surface-divider-color);
  }

  .b-time-panel__icon {
    width: var(--ui-control-34, 34px);
    height: var(--ui-control-34, 34px);
    display: inline-flex;
    flex: 0 0 var(--ui-control-34, 34px);
    align-items: center;
    justify-content: center;
    border: 1px solid var(--primary-color);
    border-radius: 10px;
    color: #fff;
    background: var(--primary-color);
  }

  .b-time-panel__header > div {
    min-width: 0;
    display: grid;
    gap: var(--ui-space-2, 2px);
  }

  .b-time-panel__header strong {
    font-size: var(--ui-font-13, 13px);
  }

  .b-time-panel__header div > span {
    color: var(--primary-color);
    font-size: var(--ui-font-18, 18px);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .b-time-panel__fields {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: end;
    gap: var(--ui-space-7, 7px);
    padding: var(--ui-space-13, 13px) 0;
  }

  .b-time-panel__fields label {
    min-width: 0;
    display: grid;
    gap: var(--ui-space-5, 5px);
  }

  .b-time-panel__fields :deep(.b-select) {
    width: 100%;
    min-width: 0;
    display: block;
  }

  .b-time-panel__fields label > span {
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
  }

  .b-time-panel__separator {
    padding-bottom: var(--ui-space-8, 8px);
    color: var(--desc-color);
    font-weight: 700;
  }

  .b-time-panel__fields :deep(.select-trigger) {
    width: 100%;
    min-width: 0;
    min-height: var(--ui-control-38, 38px);
    border-radius: 9px;
  }

  .b-time-panel__fields :deep(.select-search-inline) {
    width: 100%;
    min-width: 0;
  }

  .b-time-panel__footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--ui-space-7, 7px);
    padding-top: var(--ui-space-11, 11px);
    border-top: 1px solid var(--surface-divider-color);
  }

  :global(.select-dropdown.b-time-select-dropdown) {
    max-height: var(--ui-layout-220, 220px);
    padding: var(--ui-space-6, 6px);
    border-color: color-mix(in srgb, var(--primary-color) 18%, var(--surface-border-color));
    border-radius: 12px;
    background: var(--card-background);
    box-shadow: 0 12px 30px rgba(28, 25, 74, 0.16);
    scrollbar-color: color-mix(in srgb, var(--primary-color) 38%, transparent) transparent;
  }

  :global(.select-dropdown.b-time-select-dropdown .select-option) {
    min-height: var(--ui-control-32, 32px);
    border-radius: 8px;
    font-variant-numeric: tabular-nums;
  }

  :global(.select-dropdown.b-time-select-dropdown .select-option.is-selected) {
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 12%, var(--card-background));
    font-weight: 700;
  }

  html.light-note-mobile-rendering .b-time-panel__icon {
    box-shadow: none;
  }

  html.light-note-mobile-rendering :global(.select-dropdown.b-time-select-dropdown) {
    box-shadow: none;
  }
</style>
