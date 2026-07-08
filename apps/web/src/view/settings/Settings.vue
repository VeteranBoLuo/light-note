<template>
  <div class="settings-page">
    <section class="settings-container">
      <header class="settings-hero">
        <button class="settings-back" @click="goBack">
          <svg-icon :src="icon.arrow_left" size="18" />
          <span>{{ t('common.back') }}</span>
        </button>
        <h1 class="settings-title">{{ t('settings.title') }}</h1>
        <p class="settings-subtitle">{{ t('settings.subtitle') }}</p>
      </header>

      <!-- 外观 -->
      <div class="settings-card">
        <h2 class="settings-group">{{ t('settings.appearance') }}</h2>
        <div class="settings-row">
          <span class="settings-label">{{ t('settings.theme') }}</span>
          <div class="seg">
            <button
              v-for="o in themeOpts"
              :key="o.v"
              class="seg-btn"
              :class="{ active: user.preferences.theme === o.v }"
              @click="set('theme', o.v)"
            >
              {{ o.label }}
            </button>
          </div>
        </div>
        <div class="settings-row">
          <span class="settings-label">{{ t('settings.language') }}</span>
          <div class="seg">
            <button
              v-for="o in langOpts"
              :key="o.v"
              class="seg-btn"
              :class="{ active: (user.preferences.lang || 'zh-CN') === o.v }"
              @click="set('lang', o.v)"
            >
              {{ o.label }}
            </button>
          </div>
        </div>
      </div>

      <!-- 通用 -->
      <div class="settings-card">
        <h2 class="settings-group">{{ t('settings.general') }}</h2>
        <div class="settings-row">
          <span class="settings-label">{{ t('settings.defaultHome') }}</span>
          <div class="seg seg-wrap">
            <button
              v-for="o in homeOpts"
              :key="o.v"
              class="seg-btn"
              :class="{ active: (user.preferences.homePage || 'landing') === o.v }"
              @click="set('homePage', o.v)"
            >
              {{ o.label }}
            </button>
          </div>
        </div>
        <div class="settings-row">
          <span class="settings-label">{{ t('settings.noteView') }}</span>
          <div class="seg">
            <button
              v-for="o in viewOpts"
              :key="o.v"
              class="seg-btn"
              :class="{ active: (user.preferences.noteViewMode || 'list') === o.v }"
              @click="set('noteViewMode', o.v)"
            >
              {{ o.label }}
            </button>
          </div>
        </div>
      </div>

      <!-- 成长 / 账号:占位,随成长体系上线 -->
      <div class="settings-card settings-card--muted">
        <p>{{ t('settings.moreComing') }}</p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import { useUserStore } from '@/store';
  import { updatePreference } from '@/utils/savePreference';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';

  const { t } = useI18n();
  const router = useRouter();
  const user = useUserStore();

  const themeOpts = [
    { v: 'system', label: t('navigation.followSystem') },
    { v: 'day', label: t('navigation.light') },
    { v: 'night', label: t('navigation.dark') },
  ];
  const langOpts = [
    { v: 'zh-CN', label: '中文' },
    { v: 'en-US', label: 'English' },
  ];
  const homeOpts = [
    { v: 'landing', label: t('settings.home.landing') },
    { v: 'workbench', label: t('settings.home.workbench') },
    { v: 'resourceCenter', label: t('settings.home.resourceCenter') },
    { v: 'bookmark', label: t('settings.home.bookmark') },
    { v: 'noteLibrary', label: t('settings.home.noteLibrary') },
    { v: 'cloudSpace', label: t('settings.home.cloudSpace') },
  ];
  const viewOpts = [
    { v: 'card', label: t('settings.cardView') },
    { v: 'list', label: t('settings.listView') },
  ];

  async function set(key: string, value: string) {
    if ((user.preferences as any)[key] === value) return;
    try {
      await updatePreference({ [key]: value });
    } catch {
      message.warning(t('settings.saveFailed'));
    }
  }

  function goBack() {
    if (window.history.length > 1) router.back();
    else router.push('/home');
  }
</script>

<style scoped lang="less">
  .settings-page {
    min-height: 100vh;
    padding: 20px 24px 40px;
    box-sizing: border-box;
    background: var(--background-color);
    color: var(--text-color);
  }
  .settings-container {
    max-width: 720px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .settings-hero {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 4px 0 8px;
  }
  .settings-back {
    width: fit-content;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    margin-bottom: 6px;
    border-radius: 999px;
    border: 1px solid var(--border-color);
    background: transparent;
    color: var(--text-color);
    cursor: pointer;
  }
  .settings-title {
    margin: 0;
    font-size: 22px;
    font-weight: 600;
  }
  .settings-subtitle {
    margin: 0;
    font-size: 13px;
    color: var(--sub-text-color);
  }
  .settings-card {
    border: 1px solid color-mix(in srgb, var(--border-color) 92%, transparent);
    border-radius: 14px;
    background: color-mix(in srgb, var(--background-color) 96%, transparent);
    padding: 16px 18px;
  }
  .settings-card--muted {
    color: var(--sub-text-color);
    font-size: 13px;
    text-align: center;
  }
  .settings-card--muted p {
    margin: 0;
  }
  .settings-group {
    margin: 0 0 12px;
    font-size: 13px;
    font-weight: 600;
    color: var(--sub-text-color);
    letter-spacing: 0.04em;
  }
  .settings-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 10px 0;
    flex-wrap: wrap;
  }
  .settings-row + .settings-row {
    border-top: 1px solid color-mix(in srgb, var(--border-color) 60%, transparent);
  }
  .settings-label {
    font-size: 14px;
  }
  .seg {
    display: inline-flex;
    gap: 6px;
  }
  .seg-wrap {
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .seg-btn {
    padding: 6px 14px;
    border-radius: 8px;
    border: 1px solid var(--border-color);
    background: transparent;
    color: var(--text-color);
    font-size: 13px;
    cursor: pointer;
    transition:
      background 0.15s,
      border-color 0.15s,
      color 0.15s;
  }
  .seg-btn:hover {
    border-color: var(--primary-color);
  }
  .seg-btn.active {
    background: var(--primary-color);
    border-color: var(--primary-color);
    color: #fff;
  }
</style>
