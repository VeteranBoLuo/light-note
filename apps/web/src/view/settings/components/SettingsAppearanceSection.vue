<template>
  <div class="settings-section-stack" id="set-appearance">
    <SettingsSectionCard :title="t('settings.theme')" :description="t('settings.themeDesc')">
      <div class="theme-previews" role="group" :aria-label="t('settings.theme')">
        <BButton
          v-for="option in themes"
          :key="option.value"
          class="theme-preview"
          :class="[option.value, { 'is-selected': user.preferences.theme === option.value }]"
          :aria-pressed="user.preferences.theme === option.value"
          :disabled="pending('theme')"
          @click="saveTheme(option.value)"
        >
          <span class="theme-preview__window" aria-hidden="true"
            ><span class="theme-preview__sidebar"></span><span class="theme-preview__lines"><i></i><i></i><i></i></span
          ></span>
          <span class="theme-preview__label"
            >{{ option.label
            }}<SvgIcon
              v-if="user.preferences.theme === option.value"
              :src="icon.message.success"
              size="15"
              color="var(--primary-color)"
              aria-hidden="true"
          /></span>
        </BButton>
      </div>
      <SettingsSaveStatus :keys="['theme']" />
    </SettingsSectionCard>
    <SettingsSectionCard :title="t('settingsRefine.display')" :description="t('settingsRefine.displayDesc')">
      <SettingsPreferenceField
        pref-key="lang"
        :label="t('settings.language')"
        :description="t('settings.languageDesc')"
        default-value="zh-CN"
        :options="[
          { v: 'zh-CN', label: '中文' },
          { v: 'en-US', label: 'English' },
        ]"
      />
      <SettingsPreferenceField
        v-if="!bookmark.isMobile"
        pref-key="uiScale"
        :label="t('settings.uiScale')"
        :description="t('settings.uiScaleDesc')"
        default-value="medium"
        :options="scales"
      />
    </SettingsSectionCard>
  </div>
</template>
<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { bookmarkStore, useUserStore } from '@/store';
  import { updatePreference, usePreferenceSaveState } from '@/utils/savePreference';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import SettingsSectionCard from './SettingsSectionCard.vue';
  import SettingsPreferenceField from './SettingsPreferenceField.vue';
  import SettingsSaveStatus from './SettingsSaveStatus.vue';
  const user = useUserStore(),
    bookmark = bookmarkStore();
  const { t } = useI18n();
  const { pending } = usePreferenceSaveState();
  const themes = computed(() => [
    { value: 'system', label: t('navigation.followSystem') },
    { value: 'day', label: t('navigation.light') },
    { value: 'night', label: t('navigation.dark') },
  ]);
  const scales = computed(() => [
    { v: 'small', label: t('settings.uiScaleSmall') },
    { v: 'medium', label: t('settings.uiScaleMedium') },
    { v: 'large', label: t('settings.uiScaleLarge') },
  ]);
  const saveTheme = (theme: string) => {
    if (!pending('theme') && theme !== user.preferences.theme) void updatePreference({ theme }).catch(() => {});
  };
</script>
<style scoped lang="less">
  .theme-previews {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    padding: 16px 0 10px;
  }
  .theme-preview.b_btn {
    display: flex;
    width: 100%;
    flex-direction: column;
    align-items: stretch;
    padding: 10px;
    height: auto;
    min-width: 0;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    background: var(--card-background);
    color: var(--text-color);
  }
  .theme-preview.is-selected.b_btn {
    border-color: var(--primary-color);
    background: var(--card-background);
    background: color-mix(in srgb, var(--primary-color) 10%, var(--card-background));
  }
  .theme-preview__window {
    display: flex;
    position: relative;
    height: 68px;
    border: 1px solid var(--surface-border-color);
    border-radius: 6px;
    overflow: hidden;
    background: #fff;
  }
  .theme-preview__sidebar {
    width: 24%;
    background: #f4f3fc;
    border-right: 1px solid #e7e6ef;
  }
  .theme-preview__lines {
    flex: 1;
    padding: 14px 10px;
    display: grid;
    align-content: start;
    gap: 7px;
  }
  .theme-preview__lines i {
    height: 5px;
    border-radius: 4px;
    background: #e5e4f1;
  }
  .theme-preview__lines i:nth-child(2) {
    width: 70%;
    background: #aaa4fc;
  }
  .night .theme-preview__window {
    background: #252530;
  }
  .night .theme-preview__sidebar {
    background: #31313e;
    border-color: #41414c;
  }
  .night .theme-preview__lines i {
    background: #50505e;
  }
  .system .theme-preview__window {
    background: linear-gradient(to right, #fff 50%, #252530 50%);
  }
  .theme-preview__label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    margin-top: 10px;
    font-size: 13px;
    white-space: normal;
    text-align: left;
  }
  .theme-preview__label :deep(svg) {
    color: var(--primary-color);
  }
  :global(.settings-page .is-mobile-sub .theme-previews) {
    gap: 8px;
  }
  :global(.settings-page .is-mobile-sub .theme-preview.b_btn) {
    padding: 8px;
  }
  :global(.settings-page .is-mobile-sub .theme-preview__window) {
    height: 60px;
  }
  :global(.settings-page .is-mobile-sub .theme-preview__label) {
    font-size: 12px;
  }
</style>
