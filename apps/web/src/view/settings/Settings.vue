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

            <div class="field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.uiScale') }}</span>
                <span class="field-desc">{{ t('settings.uiScaleDesc') }}</span>
              </div>
              <div class="seg">
                <button
                  v-for="o in uiScaleOpts"
                  :key="o.v"
                  class="seg-btn"
                  :class="{ active: (user.preferences.uiScale || 'medium') === o.v }"
                  @click="set('uiScale', o.v)"
                >
                  {{ o.label }}
                </button>
              </div>
            </div>
          </div>
        </section>

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
              <div class="seg">
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
                <span class="field-label">{{ t('settings.bookmarkOpen') }}</span>
                <span class="field-desc">{{ t('settings.bookmarkOpenDesc') }}</span>
              </div>
              <div class="seg">
                <button
                  v-for="o in bookmarkOpenOpts"
                  :key="o.v"
                  class="seg-btn"
                  :class="{ active: (user.preferences.openBookmarkIn || 'newTab') === o.v }"
                  @click="set('openBookmarkIn', o.v)"
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

            <div class="field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.resourceView') }}</span>
                <span class="field-desc">{{ t('settings.resourceViewDesc') }}</span>
              </div>
              <div class="seg">
                <button
                  v-for="o in resourceViewOpts"
                  :key="o.v"
                  class="seg-btn"
                  :class="{ active: (user.preferences.resourceView || 'card') === o.v }"
                  @click="set('resourceView', o.v)"
                >
                  {{ o.label }}
                </button>
              </div>
            </div>

            <div class="field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.resourceSort') }}</span>
                <span class="field-desc">{{ t('settings.resourceSortDesc') }}</span>
              </div>
              <div class="seg">
                <button
                  v-for="o in resourceSortOpts"
                  :key="o.v"
                  class="seg-btn"
                  :class="{ active: (user.preferences.resourceSort || 'relevance') === o.v }"
                  @click="set('resourceSort', o.v)"
                >
                  {{ o.label }}
                </button>
              </div>
            </div>

            <div class="field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.tagView') }}</span>
                <span class="field-desc">{{ t('settings.tagViewDesc') }}</span>
              </div>
              <div class="seg">
                <button
                  v-for="o in tagViewOpts"
                  :key="o.v"
                  class="seg-btn"
                  :class="{ active: (user.preferences.tagView || 'card') === o.v }"
                  @click="set('tagView', o.v)"
                >
                  {{ o.label }}
                </button>
              </div>
            </div>

            <div class="field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.hideEmptyTags') }}</span>
                <span class="field-desc">{{ t('settings.hideEmptyTagsDesc') }}</span>
              </div>
              <div class="seg">
                <button
                  v-for="o in onOffOpts"
                  :key="String(o.v)"
                  class="seg-btn"
                  :class="{ active: (user.preferences.hideEmptyTags ?? false) === o.v }"
                  @click="set('hideEmptyTags', o.v)"
                >
                  {{ o.label }}
                </button>
              </div>
            </div>

          </div>
        </section>

        <!-- 通知 -->
        <section class="settings-card">
          <div class="card-head">
            <span class="card-icon card-icon--general">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.7 21a2 2 0 0 1-3.4 0" />
              </svg>
            </span>
            <div class="card-head-text">
              <h2 class="card-title">{{ t('settings.notification') }}</h2>
              <p class="card-sub">{{ t('settings.notificationDesc') }}</p>
            </div>
          </div>

          <div class="fields">
            <div class="field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.weeklyReport') }}</span>
                <span class="field-desc">{{ t('settings.weeklyReportDesc') }}</span>
              </div>
              <div class="seg">
                <button
                  v-for="o in onOffOpts"
                  :key="String(o.v)"
                  class="seg-btn"
                  :class="{ active: (user.preferences.weeklyReport !== false) === o.v }"
                  @click="set('weeklyReport', o.v)"
                >
                  {{ o.label }}
                </button>
              </div>
            </div>

            <div class="field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.notifyLevelUp') }}</span>
                <span class="field-desc">{{ t('settings.notifyLevelUpDesc') }}</span>
              </div>
              <div class="seg">
                <button
                  v-for="o in onOffOpts"
                  :key="String(o.v)"
                  class="seg-btn"
                  :class="{ active: (user.preferences.notifyLevelUp !== false) === o.v }"
                  @click="set('notifyLevelUp', o.v)"
                >
                  {{ o.label }}
                </button>
              </div>
            </div>

            <div class="field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.notifyOpinionReply') }}</span>
                <span class="field-desc">{{ t('settings.notifyOpinionReplyDesc') }}</span>
              </div>
              <div class="seg">
                <button
                  v-for="o in onOffOpts"
                  :key="String(o.v)"
                  class="seg-btn"
                  :class="{ active: (user.preferences.notifyOpinionReply !== false) === o.v }"
                  @click="set('notifyOpinionReply', o.v)"
                >
                  {{ o.label }}
                </button>
              </div>
            </div>

            <div class="field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.notifyStreakRisk') }}</span>
                <span class="field-desc">{{ t('settings.notifyStreakRiskDesc') }}</span>
              </div>
              <div class="seg">
                <button
                  v-for="o in onOffOpts"
                  :key="String(o.v)"
                  class="seg-btn"
                  :class="{ active: ((user.preferences as any).notifyStreakRisk !== false) === o.v }"
                  @click="set('notifyStreakRisk', o.v)"
                >
                  {{ o.label }}
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- 账号与安全(登录用户可见) -->
        <section v-if="!isGuestUser()" class="settings-card">
          <div class="card-head">
            <span class="card-icon card-icon--general">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
              </svg>
            </span>
            <div class="card-head-text">
              <h2 class="card-title">账号与安全</h2>
              <p class="card-sub">密码、账号绑定与登录设备</p>
            </div>
          </div>
          <div class="fields">
            <AccountSecurity />
          </div>
        </section>

        <!-- AI 设置 -->
        <section class="settings-card">
          <div class="card-head">
            <span class="card-icon card-icon--appearance">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3.5" />
                <path d="M12 3v2M12 19v2M5 12H3M21 12h-2M6 6l1.5 1.5M16.5 16.5L18 18M18 6l-1.5 1.5M7.5 16.5L6 18" />
              </svg>
            </span>
            <div class="card-head-text">
              <h2 class="card-title">AI 设置</h2>
              <p class="card-sub">回答风格与今日额度</p>
            </div>
          </div>
          <div class="fields">
            <div class="field">
              <div class="field-head">
                <span class="field-label">回答风格</span>
                <span class="field-desc">越「发散」每次回答越不同,越「严谨」越稳定一致</span>
              </div>
              <div class="seg">
                <button
                  v-for="o in aiStyleOpts"
                  :key="o.v"
                  class="seg-btn"
                  :class="{ active: ((user.preferences as any).aiStyle || 'balanced') === o.v }"
                  @click="set('aiStyle', o.v)"
                >
                  {{ o.label }}
                </button>
              </div>
            </div>
            <div class="field">
              <div class="field-head">
                <span class="field-label">AI 开关</span>
                <span class="field-desc">关闭后隐藏 AI 助手入口</span>
              </div>
              <div class="seg">
                <button
                  v-for="o in onOffOpts"
                  :key="String(o.v)"
                  class="seg-btn"
                  :class="{ active: ((user.preferences as any).aiEnabled ?? true) === o.v }"
                  @click="set('aiEnabled', o.v)"
                >
                  {{ o.label }}
                </button>
              </div>
            </div>
            <div class="field">
              <div class="field-head">
                <span class="field-label">今日 AI 额度</span>
                <span class="field-desc">按成长等级每日发放</span>
              </div>
              <span class="field-desc" style="color: var(--text-color)">{{ quotaText }}</span>
            </div>
          </div>
        </section>

        <!-- 快速收藏(bookmarklet) -->
        <section class="settings-card">
          <div class="card-head">
            <span class="card-icon card-icon--appearance">🔖</span>
            <div class="card-head-text">
              <h2 class="card-title">{{ t('settings.quickSaveTitle') }}</h2>
              <p class="card-sub">{{ t('settings.quickSaveDesc') }}</p>
            </div>
          </div>
          <div class="fields">
            <div class="field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.quickSaveDrag') }}</span>
                <span class="field-desc">{{ t('settings.quickSaveHint') }}</span>
              </div>
              <a ref="bmRef" class="qs-bookmarklet" draggable="true" @click.prevent="onBmClick">🔖 {{ t('settings.quickSaveBtn') }}</a>
            </div>
          </div>
        </section>

        <!-- 数据导出 / 备份 -->
        <section class="settings-card">
          <div class="card-head">
            <span class="card-icon card-icon--appearance">📦</span>
            <div class="card-head-text">
              <h2 class="card-title">{{ t('settings.exportTitle') }}</h2>
              <p class="card-sub">{{ t('settings.exportDesc') }}</p>
            </div>
          </div>
          <div class="fields">
            <div class="field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.exportAll') }}</span>
                <span class="field-desc">{{ t('settings.exportAllDesc') }}</span>
              </div>
              <button class="export-btn" :disabled="exporting" @click="exportAll">
                {{ exporting ? t('settings.exporting') : t('settings.exportBtn') }}
              </button>
            </div>
            <div class="field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.importAll') }}</span>
                <span class="field-desc">{{ t('settings.importAllDesc') }}</span>
              </div>
              <button class="export-btn" :disabled="importing" @click="triggerImport">
                {{ importing ? t('settings.importing') : t('settings.importBtn') }}
              </button>
              <input ref="importInputRef" type="file" accept="application/json,.json" style="display: none" @change="onImportFile" />
            </div>
          </div>
        </section>

        <p class="settings-foot">{{ t('settings.footHint') }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, onMounted } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import { useUserStore } from '@/store';
  import { updatePreference, isGuestUser } from '@/utils/savePreference';
  import { recordOperation } from '@/api/commonApi.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { apiBasePost } from '@/http/request';
  import AccountSecurity from '@/components/settings/AccountSecurity.vue';

  const { t } = useI18n();
  const router = useRouter();
  const user = useUserStore();

  // 快速收藏 bookmarklet:href 用当前站点 origin 动态生成,拖到书签栏后在任意网页点它即可
  const bmRef = ref<HTMLAnchorElement | null>(null);
  function onBmClick() {
    message.info(t('settings.quickSaveDragTip'));
  }
  onMounted(() => {
    const o = window.location.origin;
    const code =
      "javascript:(function(){var o='" +
      o +
      "';var u=encodeURIComponent(location.href),t=encodeURIComponent(document.title||''),s='';try{s=encodeURIComponent((''+(window.getSelection?window.getSelection():'')).slice(0,500))}catch(e){}window.open(o+'/quick-save?u='+u+'&t='+t+'&d='+s,'ln_qs','width=480,height=680')})();";
    if (bmRef.value) bmRef.value.setAttribute('href', code);
  });

  // 一键导出/备份:拉全部数据 → 下成 JSON(文件名用本地日期,不用 toISOString 避免跨日偏差)
  const exporting = ref(false);
  async function exportAll() {
    if (exporting.value) return;
    exporting.value = true;
    try {
      const res = await apiBasePost('/api/user/exportData', {});
      if (res?.status === 200 && res.data) {
        const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const d = new Date();
        const p = (n: number) => String(n).padStart(2, '0');
        const a = document.createElement('a');
        a.href = url;
        a.download = `轻笺备份_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        const c = res.data.counts || {};
        message.success(t('settings.exportOk', { b: c.bookmarks || 0, n: c.notes || 0, f: c.files || 0 }));
      } else {
        message.info(res?.msg || t('settings.exportFail'));
      }
    } catch {
      message.info(t('settings.exportFail'));
    } finally {
      exporting.value = false;
    }
  }

  // 数据导入:选择「数据导出」生成的备份 JSON,恢复书签/笔记/标签(后端智能去重)。文件二进制不在备份内,跳过。
  const importing = ref(false);
  const importInputRef = ref<HTMLInputElement | null>(null);
  function triggerImport() {
    if (importing.value) return;
    importInputRef.value?.click();
  }
  async function onImportFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // 清空,允许重复选同一文件再次导入
    if (!file) return;
    importing.value = true;
    try {
      const text = await file.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        message.info(t('settings.importInvalid'));
        return;
      }
      const res = await apiBasePost('/api/user/importData', { data });
      if (res?.status === 200 && res.data) {
        const s = res.data;
        message.success(
          t('settings.importOk', {
            b: s.bookmarks?.added || 0,
            n: s.notes?.added || 0,
            sk: (s.bookmarks?.skipped || 0) + (s.notes?.skipped || 0),
          }),
        );
        recordOperation({ module: '设置', operation: `导入数据(书签+${s.bookmarks?.added || 0}、笔记+${s.notes?.added || 0})` });
      } else {
        message.info(res?.msg || t('settings.importFail'));
      }
    } catch {
      message.info(t('settings.importFail'));
    } finally {
      importing.value = false;
    }
  }

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
  const uiScaleOpts = computed(() => [
    { v: 'small', label: t('settings.uiScaleSmall') },
    { v: 'medium', label: t('settings.uiScaleMedium') },
    { v: 'large', label: t('settings.uiScaleLarge') },
  ]);
  const homeOpts = computed(() => [
    { v: 'landing', label: t('settings.home.landing') },
    { v: 'workbench', label: t('settings.home.workbench') },
    { v: 'resourceCenter', label: t('settings.home.resourceCenter') },
    { v: 'bookmark', label: t('settings.home.bookmark') },
    { v: 'noteLibrary', label: t('settings.home.noteLibrary') },
    { v: 'cloudSpace', label: t('settings.home.cloudSpace') },
  ]);
  const bookmarkOpenOpts = computed(() => [
    { v: 'newTab', label: t('settings.bookmarkOpenNew') },
    { v: 'current', label: t('settings.bookmarkOpenCurrent') },
  ]);
  const viewOpts = computed(() => [
    { v: 'card', label: t('settings.cardView') },
    { v: 'list', label: t('settings.listView') },
  ]);
  const resourceViewOpts = computed(() => [
    { v: 'card', label: t('resourceCenter.view.card') },
    { v: 'list', label: t('resourceCenter.view.list') },
  ]);
  const tagViewOpts = computed(() => [
    { v: 'card', label: t('tagGraph.viewMode.card') },
    { v: 'graph', label: t('tagGraph.viewMode.graph') },
  ]);
  const onOffOpts = computed(() => [
    { v: true, label: t('settings.switchOn') },
    { v: false, label: t('settings.switchOff') },
  ]);
  const resourceSortOpts = computed(() => [
    { v: 'relevance', label: t('resourceCenter.sort.relevance') },
    { v: 'updated', label: t('resourceCenter.sort.updated') },
    { v: 'name', label: t('resourceCenter.sort.name') },
  ]);

  async function set(key: string, value: string | boolean) {
    if ((user.preferences as any)[key] === value) return;
    try {
      await updatePreference({ [key]: value });
      if (!isGuestUser()) recordOperation({ module: '设置', operation: `修改偏好【${key}=${value}】` });
    } catch {
      message.warning(t('settings.saveFailed'));
    }
  }

  // AI 回答风格(映射后端 temperature:严谨0.3/平衡1.0/发散1.5)
  const aiStyleOpts = [
    { v: 'strict', label: '严谨' },
    { v: 'balanced', label: '平衡' },
    { v: 'creative', label: '发散' },
  ];

  // 今日 AI 额度
  const quotaText = ref('加载中…');
  function fmtTokens(n: number) {
    if (!Number.isFinite(n)) return '—';
    return n >= 10000 ? `${(n / 10000).toFixed(n % 10000 === 0 ? 0 : 1)}万` : String(n);
  }
  onMounted(async () => {
    try {
      const res = await apiBasePost('/api/chat/aiQuota', {});
      const d: any = res?.data;
      if (d?.exempt) quotaText.value = '不限(内部账号)';
      else if (d && Number.isFinite(d.quota)) quotaText.value = `已用 ${fmtTokens(d.used)} / ${fmtTokens(d.quota)} tokens`;
      else quotaText.value = '—';
    } catch {
      quotaText.value = '—';
    }
  });

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

  /* 单列居中:设置项聚焦"偏好"本身;账号/帮助等入口不再重复(已在个人中心),布局更清爽。 */
  .settings-container {
    max-width: 680px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  /* 卡片设为 container:字段按"卡片宽"而非"视口宽"决定是否堆叠,缩放/窄窗下不错位。 */
  .settings-body {
    display: flex;
    flex-direction: column;
    gap: 18px;
    container-type: inline-size;
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
  .card-head-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
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
  }
  .field + .field {
    border-top: 1px solid color-mix(in srgb, var(--card-border-color) 34%, transparent);
  }
  .field-head {
    flex: 1 1 auto;
    min-width: 0;
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
    flex: 0 1 auto;
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: flex-end;
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
    white-space: nowrap;
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

  /* 关键修复:当卡片窄到装不下 标签+选项 一行时(缩放/窄窗),字段改竖排、选项左对齐,
     避免选项浮右与标签错位。用 @container 按卡片宽判断,而非 @media 按视口宽。 */
  @container (max-width: 460px) {
    .field {
      flex-direction: column;
      align-items: stretch;
      gap: 10px;
    }
    .seg {
      justify-content: flex-start;
    }
  }

  .settings-foot {
    margin: 2px 0 0;
    text-align: center;
    font-size: 12px;
    color: var(--desc-color);
  }

  .qs-bookmarklet {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 8px 16px;
    border-radius: 10px;
    background: linear-gradient(135deg, var(--primary-color), color-mix(in srgb, var(--primary-color) 70%, #000));
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    text-decoration: none;
    cursor: grab;
    user-select: none;
    box-shadow: 0 2px 8px color-mix(in srgb, var(--primary-color) 30%, transparent);
    white-space: nowrap;
  }
  .qs-bookmarklet:active {
    cursor: grabbing;
  }

  .export-btn {
    border: 0;
    border-radius: 8px;
    padding: 8px 18px;
    font-size: 13px;
    font-weight: 600;
    color: #fff;
    background: var(--primary-color);
    cursor: pointer;
    white-space: nowrap;
  }
  .export-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  @media (max-width: 560px) {
    .settings-page {
      padding: 20px 16px 48px;
    }
  }
</style>
