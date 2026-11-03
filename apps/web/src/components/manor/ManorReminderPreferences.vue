<template>
  <div class="manor-reminder-preferences" :class="{ 'is-game': game }">
    <SettingsPreferenceField
      pref-key="manorEntryDot"
      :label="t('settings.manorEntryDot')"
      :description="t(game ? 'manor.reminders.entryDotDesc' : 'settings.manorEntryDotDesc')"
      kind="switch"
      :default-value="true"
      :selected-value="user.preferences.manorEntryDot !== false"
    >
      <template v-if="game" #switch-label="{ checked }">
        <span class="manor-reminder-status" :class="{ 'is-on': checked }" aria-hidden="true">{{
          t(checked ? 'settings.switchOn' : 'settings.switchOff')
        }}</span>
      </template>
    </SettingsPreferenceField>
    <SettingsPreferenceField
      pref-key="notifyManor"
      :label="t('settings.notifyManor')"
      :description="t(game ? 'manor.reminders.notifyManorDesc' : 'settings.notifyManorDesc')"
      kind="switch"
      :default-value="false"
      :selected-value="manorEnabled"
    >
      <template v-if="game" #switch-label="{ checked }">
        <span class="manor-reminder-status" :class="{ 'is-on': checked }" aria-hidden="true">{{
          t(checked ? 'settings.switchOn' : 'settings.switchOff')
        }}</span>
      </template>
    </SettingsPreferenceField>
    <div v-if="manorEnabled" class="manor-reminder-options" role="group" :aria-label="t('settings.manorReminderTypes')">
      <h3>{{ t('settings.manorReminderTypes') }}</h3>
      <SettingsPreferenceField
        v-for="key in ['notifyManorDigest', 'notifyManorWater']"
        :key="key"
        :pref-key="key"
        :label="t(`settings.${key}`)"
        :description="t(`${game ? 'manor.reminders' : 'settings'}.${key}Desc`)"
        kind="switch"
        :default-value="true"
        :disabled="pending('notifyManor')"
      >
        <template v-if="game" #switch-label="{ checked }">
          <span class="manor-reminder-status" :class="{ 'is-on': checked }" aria-hidden="true">{{
            t(checked ? 'settings.switchOn' : 'settings.switchOff')
          }}</span>
        </template>
      </SettingsPreferenceField>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useUserStore } from '@/store';
  import { usePreferenceSaveState } from '@/utils/savePreference';
  import SettingsPreferenceField from '@/view/settings/components/SettingsPreferenceField.vue';

  const { t } = useI18n();
  const props = withDefaults(defineProps<{ appearance?: 'settings' | 'game' }>(), { appearance: 'settings' });
  const game = computed(() => props.appearance === 'game');
  const user = useUserStore();
  const { pending } = usePreferenceSaveState();
  const manorEnabled = computed(() => user.preferences.notifyManor === true);
</script>

<style scoped>
  .manor-reminder-preferences :deep(.b-switch) {
    min-width: var(--ui-control-44, 44px);
    min-height: var(--ui-control-44, 44px);
    justify-content: center;
  }
  .manor-reminder-options {
    padding-inline-start: var(--ui-space-16, 16px);
  }
  .manor-reminder-options h3 {
    margin: var(--ui-space-14, 14px) 0 0;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    font-weight: 500;
  }
  .is-game {
    --text-color: #634929;
    --desc-color: #806238;
    --primary-color: #65842e;
    --card-border-color: #c7b792;
    --primary-btn-bg-color: #f0e2bf;
    --primary-btn-h-bg-color: #e8d5a9;
    --error-color: #a03925;
    display: grid;
    gap: var(--ui-space-12, 12px);
  }
  .is-game :deep(.settings-field-row) {
    gap: var(--ui-space-14, 14px);
    padding: var(--ui-space-12, 12px) var(--ui-space-14, 14px);
    min-height: var(--ui-layout-82, 82px);
    border: 1px solid #d9bf87;
    border-radius: var(--ui-space-14, 14px);
    background: #fff9e9;
  }
  .is-game :deep(.settings-field-row__control) {
    gap: var(--ui-space-6, 6px);
    max-width: none;
  }
  .is-game :deep(.settings-field-row strong) {
    font-size: var(--ui-font-16, 16px);
    line-height: 1.4;
  }
  .is-game :deep(.settings-field-row p) {
    font-size: var(--ui-font-13, 13px);
    line-height: 1.6;
  }
  .is-game :deep(.b-switch__track) {
    border: 1px solid #a59265;
    box-shadow: inset 0 1px var(--ui-space-2, 2px) #71572d30;
  }
  .is-game :deep(.b-switch__thumb) {
    background: #fffbe9;
  }
  .is-game :deep(.b-switch:focus-visible) {
    outline: 2px solid #526f2f;
    outline-offset: 2px;
    border-radius: var(--ui-space-8, 8px);
  }
  .is-game .manor-reminder-options {
    display: grid;
    gap: var(--ui-space-12, 12px);
    padding: 0;
  }
  .is-game .manor-reminder-options h3 {
    margin: 0;
    padding: var(--ui-space-6, 6px) var(--ui-space-12, 12px);
    border-radius: var(--ui-space-8, 8px);
    background: #f3e4bd;
    color: #77552b;
    font-size: var(--ui-font-14, 14px);
    font-weight: 600;
  }
  .manor-reminder-status {
    min-width: calc(2 * var(--ui-font-14, 14px));
    color: #795a30;
    font-size: var(--ui-font-14, 14px);
    font-weight: 600;
    white-space: nowrap;
  }
  .manor-reminder-status.is-on {
    color: #496420;
  }
</style>
