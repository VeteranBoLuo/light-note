<template>
  <section class="growth-preferences" :aria-busy="loading">
    <header>
      <span class="growth-preferences__icon"><SvgIcon :src="icon.userCenter.settingsGear" size="20" /></span>
      <div><h2>{{ t('growth.preferencesTitle') }}</h2><p>{{ t('growth.preferencesSubtitle') }}</p></div>
    </header>
    <div v-if="loading && !preferences" class="growth-preferences__loading"><BLoading size="small" /></div>
    <div v-else-if="error && !preferences" class="growth-preferences__error">
      <span>{{ t('growth.preferencesLoadFailed') }}</span>
      <BButton size="small" @click="$emit('retry')">{{ t('common.retry') }}</BButton>
    </div>
    <template v-else>
      <div class="growth-preferences__row">
        <div><strong>{{ t('growth.weeklyTargetTitle') }}</strong><span>{{ t('growth.weeklyTargetDesc') }}</span></div>
        <BSelect v-model:value="draft.weeklyActiveTarget" :options="weeklyOptions" :disabled="readOnly || saving" />
      </div>
      <div class="growth-preferences__row">
        <div><strong>{{ t('growth.streakReminderTitle') }}</strong><span>{{ t('growth.streakReminderDesc') }}</span></div>
        <BSwitch v-model:checked="draft.streakReminderEnabled" :disabled="readOnly || saving" />
      </div>
      <div class="growth-preferences__row">
        <div><strong>{{ t('growth.celebrationTitle') }}</strong><span>{{ t('growth.celebrationDesc') }}</span></div>
        <BSwitch v-model:checked="draft.celebrationEnabled" :disabled="readOnly || saving" />
      </div>
      <div class="growth-preferences__row">
        <div><strong>{{ t('growth.lowPressureTitle') }}</strong><span>{{ t('growth.lowPressureDesc') }}</span></div>
        <BSwitch v-model:checked="draft.lowPressureMode" :disabled="readOnly || saving" />
      </div>
      <BButton v-if="dirty && !readOnly" type="primary" size="small" :loading="saving" @click="save">
        {{ t('common.save') }}
      </BButton>
    </template>
  </section>
</template>

<script setup lang="ts">
  import { computed, reactive, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BSwitch from '@/components/base/BasicComponents/BSwitch.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import type { GrowthPreferences } from '@/composables/useGrowth.ts';

  const props = withDefaults(
    defineProps<{
      preferences: GrowthPreferences | null;
      loading?: boolean;
      error?: boolean;
      saving?: boolean;
      readOnly?: boolean;
    }>(),
    { loading: false, error: false, saving: false, readOnly: false },
  );
  const emit = defineEmits<{ save: [value: Partial<GrowthPreferences>]; retry: [] }>();
  const { t } = useI18n();
  const draft = reactive<GrowthPreferences>({
    weeklyActiveTarget: 5,
    streakReminderEnabled: true,
    celebrationEnabled: true,
    lowPressureMode: false,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    utcOffsetMinutes: -new Date().getTimezoneOffset(),
  });
  watch(
    () => props.preferences,
    (value) => value && Object.assign(draft, value),
    { immediate: true, deep: true },
  );
  const weeklyOptions = computed(() => [
    { label: t('growth.weeklyTargetOff'), value: 0 },
    { label: t('growth.weeklyTargetDays', { n: 3 }), value: 3 },
    { label: t('growth.weeklyTargetDays', { n: 5 }), value: 5 },
    { label: t('growth.weeklyTargetDays', { n: 7 }), value: 7 },
  ]);
  const dirty = computed(() => {
    const value = props.preferences;
    return Boolean(
      value &&
        (value.weeklyActiveTarget !== Number(draft.weeklyActiveTarget) ||
          value.streakReminderEnabled !== draft.streakReminderEnabled ||
          value.celebrationEnabled !== draft.celebrationEnabled ||
          value.lowPressureMode !== draft.lowPressureMode),
    );
  });
  function save() {
    emit('save', {
      weeklyActiveTarget: Number(draft.weeklyActiveTarget) as 0 | 3 | 5 | 7,
      streakReminderEnabled: draft.streakReminderEnabled,
      celebrationEnabled: draft.celebrationEnabled,
      lowPressureMode: draft.lowPressureMode,
    });
  }
</script>

<style scoped lang="less">
  .growth-preferences { display: flex; flex-direction: column; gap: 12px; }
  header { display: flex; align-items: center; gap: 10px; }
  h2 { margin: 0; color: var(--text-color); font-size: 16px; }
  p { margin: 2px 0 0; color: var(--desc-color); font-size: 12px; }
  .growth-preferences__icon { display: grid; width: 36px; height: 36px; place-items: center; border: 1px solid var(--primary-color); border-radius: 10px; color: var(--primary-color); }
  .growth-preferences__row { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 10px 0; border-top: 1px solid var(--card-border-color); }
  .growth-preferences__row > div { display: flex; min-width: 0; flex-direction: column; }
  .growth-preferences__row strong { color: var(--text-color); font-size: 13px; }
  .growth-preferences__row span { color: var(--desc-color); font-size: 11.5px; }
  .growth-preferences__row :deep(.b-select) { width: 150px; flex: 0 0 auto; }
  .growth-preferences__loading { display: grid; min-height: 100px; place-items: center; }
  .growth-preferences__error { display: flex; min-height: 100px; align-items: center; justify-content: center; gap: 8px; color: var(--desc-color); font-size: 12px; }
  .growth-preferences > .b_btn { align-self: flex-end; }
  @media (max-width: 560px) { .growth-preferences__row { align-items: flex-start; } .growth-preferences__row :deep(.b-select) { width: 125px; } }
</style>
