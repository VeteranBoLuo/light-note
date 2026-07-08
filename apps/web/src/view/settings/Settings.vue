<template>
  <div class="settings-page">
    <div class="settings-container">
      <header class="settings-hero">
        <button class="settings-back" @click="goBack">
          <svg-icon :src="icon.arrow_left" size="16" />
          <span>{{ t('common.back') }}</span>
        </button>
        <h1 class="settings-title">{{ t('settings.title') }}</h1>
        <p class="settings-subtitle">{{ t('settings.subtitle') }}</p>
      </header>

      <div class="settings-body">
        <div class="settings-col">
      <!-- 外观 -->
      <section class="settings-card">
        <div class="card-head">
          <span class="card-icon card-icon--appearance">
            <svg viewBox="0 0 24 24" width="20" height="20">
              <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6" />
              <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" />
            </svg>
          </span>
          <div class="card-head-text">
            <h2 class="card-title">{{ t('settings.appearance') }}</h2>
            <p class="card-sub">{{ t('settings.appearanceDesc') }}</p>
          </div>
        </div>

        <div class="fields">
          <div class="field">
            <div class="field-head">
              <span class="field-label">{{ t('settings.theme') }}</span>
              <span class="field-desc">{{ t('settings.themeDesc') }}</span>
            </div>
            <div class="seg">
              <button
                v-for="o in themeOpts"
                :key="o.v"
                class="seg-btn"
                :class="{ active: (user.preferences.theme || 'system') === o.v }"
                @click="set('theme', o.v)"
              >
                {{ o.label }}
              </button>
            </div>
          </div>

          <div class="field">
            <div class="field-head">
              <span class="field-label">{{ t('settings.language') }}</span>
              <span class="field-desc">{{ t('settings.languageDesc') }}</span>
            </div>
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
      </section>
        </div>

        <div class="settings-col">
      <!-- 通用 -->
      <section class="settings-card">
        <div class="card-head">
          <span class="card-icon card-icon--general">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
              <path d="M5 7h14M5 12h14M5 17h14" />
              <circle cx="10" cy="7" r="1.7" fill="currentColor" stroke="none" />
              <circle cx="15" cy="12" r="1.7" fill="currentColor" stroke="none" />
              <circle cx="8" cy="17" r="1.7" fill="currentColor" stroke="none" />
            </svg>
          </span>
          <div class="card-head-text">
            <h2 class="card-title">{{ t('settings.general') }}</h2>
            <p class="card-sub">{{ t('settings.generalDesc') }}</p>
          </div>
        </div>

        <div class="fields">
          <div class="field">
            <div class="field-head">
              <span class="field-label">{{ t('settings.defaultHome') }}</span>
              <span class="field-desc">{{ t('settings.defaultHomeDesc') }}</span>
            </div>
            <div class="seg seg--wrap">
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

          <div class="field">
            <div class="field-head">
              <span class="field-label">{{ t('settings.noteView') }}</span>
              <span class="field-desc">{{ t('settings.noteViewDesc') }}</span>
            </div>
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
      </section>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import { useUserStore } from '@/store';
  import { updatePreference, isGuestUser } from '@/utils/savePreference';
  import { recordOperation } from '@/api/commonApi.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';

  const { t } = useI18n();
  const router = useRouter();
  const user = useUserStore();

  // 选项 label 必须用 computed:语言即时切换(不再整页刷新)后,顶层一次性求值的 t() 不会更新
  const themeOpts = computed(() => [
    { v: 'system', label: t('navigation.followSystem') },
    { v: 'day', label: t('navigation.light') },
    { v: 'night', label: t('navigation.dark') },
  ]);
  const langOpts = [
    { v: 'zh-CN', label: '中文' },
    { v: 'en-US', label: 'English' },
  ];
  const homeOpts = computed(() => [
    { v: 'landing', label: t('settings.home.landing') },
    { v: 'workbench', label: t('settings.home.workbench') },
    { v: 'resourceCenter', label: t('settings.home.resourceCenter') },
    { v: 'bookmark', label: t('settings.home.bookmark') },
    { v: 'noteLibrary', label: t('settings.home.noteLibrary') },
    { v: 'cloudSpace', label: t('settings.home.cloudSpace') },
  ]);
  const viewOpts = computed(() => [
    { v: 'card', label: t('settings.cardView') },
    { v: 'list', label: t('settings.listView') },
  ]);

  async function set(key: string, value: string) {
    if ((user.preferences as any)[key] === value) return;
    try {
      await updatePreference({ [key]: value });
      if (!isGuestUser()) recordOperation({ module: '设置', operation: `修改偏好【${key}=${value}】` });
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
  /* 本页作为 index.vue 的子路由,根元素被 :style="viewStyle" 内联设为
     position:fixed; top:60px; height:calc(100% - 60px)(外层 #tag-container 又是 overflow:hidden)。
     所以必须在这个固定高度的框内部自己滚动:用 height:100% + overflow-y:auto,
     绝不能用 min-height:100vh —— 那会把元素撑出视口 60px 且底部被裁、无滚动条。 */
  .settings-page {
    height: 100%;
    overflow-y: auto;
    padding: 28px 24px 64px;
    box-sizing: border-box;
    background: var(--background-color);
    color: var(--text-color);
  }

  .settings-container {
    max-width: 1040px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  /* 大屏两栏:外观/通用 左、成长 右,减少两侧留白、成长上移到首屏 */
  .settings-body {
    display: flex;
    gap: 18px;
    align-items: flex-start;
  }
  .settings-col {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  @media (max-width: 880px) {
    .settings-body {
      flex-direction: column;
    }
  }

  /* ---- hero ---- */
  .settings-hero {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .settings-back {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 12px 5px 8px;
    margin-bottom: 8px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 70%, transparent);
    background: transparent;
    color: var(--desc-color);
    font-size: 13px;
    cursor: pointer;
    transition:
      color 0.15s,
      border-color 0.15s,
      background 0.15s;
  }
  .settings-back:hover {
    color: var(--primary-color);
    border-color: color-mix(in srgb, var(--primary-color) 45%, transparent);
    background: color-mix(in srgb, var(--primary-color) 6%, transparent);
  }
  .settings-title {
    margin: 0;
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  .settings-subtitle {
    margin: 0;
    font-size: 13px;
    color: var(--desc-color);
  }

  /* ---- section card ---- */
  .settings-card {
    border: 1px solid color-mix(in srgb, var(--card-border-color) 62%, transparent);
    border-radius: 16px;
    background: var(--workbench-subcard-bg);
    padding: 18px 20px 6px;
    box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.03),
      0 12px 28px -22px rgba(30, 35, 70, 0.35);
  }
  .card-head {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-bottom: 14px;
    border-bottom: 1px solid color-mix(in srgb, var(--card-border-color) 42%, transparent);
  }
  .card-icon {
    flex: 0 0 auto;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .card-icon--appearance {
    color: var(--resource-bookmark-color);
    background: color-mix(in srgb, var(--resource-bookmark-color) 12%, transparent);
  }
  .card-icon--general {
    color: var(--resource-note-color);
    background: color-mix(in srgb, var(--resource-note-color) 12%, transparent);
  }
  .card-icon--growth {
    color: var(--resource-file-color);
    background: color-mix(in srgb, var(--resource-file-color) 14%, transparent);
  }
  .growth-wrap {
    padding-top: 16px;
  }
  .card-head-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .card-title {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
  }
  .card-sub {
    margin: 0;
    font-size: 12px;
    color: var(--desc-color);
  }

  /* ---- fields ---- */
  .fields {
    display: flex;
    flex-direction: column;
  }
  .field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    padding: 15px 0;
    flex-wrap: wrap;
  }
  .field + .field {
    border-top: 1px solid color-mix(in srgb, var(--card-border-color) 34%, transparent);
  }
  .field-head {
    flex: 1 1 180px;
    min-width: 140px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .field-label {
    font-size: 14px;
    font-weight: 500;
  }
  .field-desc {
    font-size: 12px;
    line-height: 1.4;
    color: var(--desc-color);
  }

  /* ---- segmented chips ---- */
  .seg {
    flex: 1 1 auto;
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .seg--wrap {
    max-width: 340px;
  }
  .seg-btn {
    padding: 7px 15px;
    border-radius: 9px;
    border: 1px solid var(--workbench-subcard-border);
    background: color-mix(in srgb, var(--primary-color) 5%, var(--background-color));
    color: var(--text-color);
    font-size: 13px;
    font-weight: 500;
    line-height: 1.2;
    cursor: pointer;
    transition:
      transform 0.18s ease,
      background 0.18s ease,
      border-color 0.18s ease,
      color 0.18s ease,
      box-shadow 0.18s ease;
  }
  .seg-btn:hover:not(.active) {
    transform: translateY(-1px);
    border-color: color-mix(in srgb, var(--primary-color) 45%, var(--workbench-subcard-border));
    color: var(--primary-color);
  }
  .seg-btn.active {
    border-color: transparent;
    background: linear-gradient(135deg, var(--primary-color), color-mix(in srgb, var(--primary-color) 76%, #4b46cc));
    color: #fff;
    box-shadow: 0 10px 22px -14px color-mix(in srgb, var(--primary-color) 70%, transparent);
  }

  /* ---- coming-soon footer ---- */
  .settings-coming {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 16px;
    border-radius: 14px;
    border: 1px dashed color-mix(in srgb, var(--card-border-color) 55%, transparent);
    color: var(--desc-color);
    font-size: 12.5px;
    text-align: center;
  }
  .settings-coming svg {
    flex: 0 0 auto;
    color: color-mix(in srgb, var(--primary-color) 60%, var(--desc-color));
  }

  @media (max-width: 560px) {
    .settings-page {
      padding: 20px 16px 48px;
    }
    /* 窄屏统一竖排:标签在上、选项在下并左对齐,避免短选项与标签同行、长选项换行的不一致 */
    .field {
      flex-direction: column;
      align-items: stretch;
      gap: 10px;
    }
    /* 竖排下 flex-basis 会变成高度,须复位,否则标签区被撑高留下大空隙 */
    .field-head {
      flex: 0 0 auto;
    }
    .seg {
      justify-content: flex-start;
    }
    .seg--wrap {
      max-width: none;
    }
  }
</style>
