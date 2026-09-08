<template>
  <div
    class="settings-page auto-scrollbar"
    :class="{ 'is-mobile': bookmark.isMobile, 'is-appearance': sectionVisible('appearance') }"
    ref="pageRef"
    v-auto-scrollbar
  >
    <div
      class="settings-container"
      :class="{
        'is-desktop': !bookmark.isMobile,
        'is-full-desktop': bookmark.isDesktop,
      }"
    >
      <!-- 移动端子页顶栏:只有「返回 + 当前分类」。不重复「设置 / 外观、语言…」那段大标题,
           手机上纵向空间宝贵,标题已由这一行承担。 -->
      <header v-if="isMobileSubPage" class="settings-subhead">
        <BButton class="settings-subhead-back" :aria-label="t('common.back')" @click="goBack">
          <svg-icon :src="icon.arrow_left" size="18" />
        </BButton>
        <h1 class="settings-subhead-title">{{ currentSectionTitle }}</h1>
      </header>
      <header v-else-if="bookmark.isMobile" class="settings-hero">
        <BButton class="settings-back" @click="goBack">
          <svg-icon :src="icon.arrow_left" size="16" />
          <span>{{ t('common.back') }}</span>
        </BButton>
        <h1 class="settings-title">{{ t('settings.title') }}</h1>
        <p class="settings-subtitle">{{ t('settings.subtitle') }}</p>
      </header>

      <SettingsMobileIndex v-if="showMobileIndex" :sections="mobileIndexRows" @select="openSection" />

      <aside v-if="!bookmark.isMobile" class="settings-desktop-sidebar">
        <BButton class="settings-back" @click="goBack">
          <SvgIcon :src="icon.arrow_left" size="16" aria-hidden="true" />
          <span>{{ t('common.back') }}</span>
        </BButton>
        <h1 class="settings-title">{{ t('settings.title') }}</h1>
        <nav class="settings-desktop-nav" :aria-label="t('settings.title')">
          <BButton
            v-for="section in desktopNavigationRows"
            :key="section.id"
            class="settings-desktop-nav__item"
            :class="{ active: desktopSection === section.id }"
            :aria-current="desktopSection === section.id ? 'page' : undefined"
            @click="openDesktopSection(section.id)"
          >
            <span class="settings-desktop-nav__icon" :class="`is-${section.tone}`" aria-hidden="true">
              <SvgIcon :src="section.icon" size="17" />
            </span>
            <span>{{ section.title }}</span>
            <SvgIcon class="settings-desktop-nav__arrow" :src="icon.arrow_right" size="13" aria-hidden="true" />
          </BButton> </nav
        ><p class="settings-sidebar-note"
          >{{ t('settingsRefine.automatic') }}<br />{{ t('settingsRefine.deviceScope') }}</p
        >
      </aside>

      <div
        v-if="!showMobileIndex"
        class="settings-body"
        :class="{ 'is-mobile-sub': isMobileSubPage, 'is-privacy': sectionVisible('privacy') }"
      >
        <header v-if="!bookmark.isMobile" class="settings-category-heading">
          <span class="card-icon" :class="'is-' + activeCategory?.tone"
            ><SvgIcon :src="activeCategory?.icon" size="22"
          /></span>
          <div
            ><h1>{{ activeCategory?.title }}</h1
            ><p>{{ categoryDescription }}</p></div
          >
        </header>
        <!-- 外观 -->
        <SettingsAppearanceSection v-if="sectionVisible('appearance')" />

        <!-- 通用 -->
        <SettingsGeneralSection v-if="sectionVisible('general')" />

        <!-- 通知 -->
        <SettingsNotificationSection v-if="sectionVisible('notification')" />

        <!-- 账号与安全(登录用户可见) -->
        <BCard as="section" v-if="!isGuestUser() && sectionVisible('account')" class="settings-card" id="set-account">
          <div class="fields">
            <AccountSecurity />
          </div>
        </BCard>

        <!-- AI 用量与例行任务共用设置壳；默认先展示用量，避免从设置跳出上下文。 -->
        <BCard as="section" v-if="sectionVisible('ai')" class="settings-card settings-card--ai" id="set-ai">
          <BTabs
            :active-tab="aiSettingsPanel"
            variant="line"
            :options="[
              { key: 'usage', label: t('settings.ai.usageTab') },
              { key: 'routines', label: t('settings.ai.routinesTab') },
            ]"
            @update:active-tab="selectAiSettingsPanel($event as 'usage' | 'routines')"
          />
          <AiUsagePage v-if="aiSettingsPanel === 'usage'" class="settings-embedded-content" embedded />
          <div v-else class="fields">
            <div v-if="dailyBriefPreferenceWritable" class="field ai-daily-brief-field">
              <div class="field-head">
                <span class="ai-field-title-row">
                  <span class="field-label">{{ t('settings.ai.dailyBriefTitle') }}</span>
                  <BChip tone="success">{{ t('settings.ai.defaultEnabled') }}</BChip>
                </span>
                <span class="field-desc" :class="{ 'is-error': dailyBriefPreferenceError }">
                  {{ dailyBriefPreferenceDescription }}
                </span>
              </div>
              <BSwitch
                :checked="dailyBriefEnabled"
                :disabled="dailyBriefPreferenceLoading || dailyBriefPreferenceSaving || !dailyBriefFeatureEnabled"
                :aria-label="t('settings.ai.dailyBriefTitle')"
                @change="setDailyBriefEnabled"
              />
              <div class="ai-brief-details">
                <span class="ai-brief-icon" aria-hidden="true">
                  <SvgIcon :src="icon.common.magicWand" size="18" />
                </span>
                <div class="ai-brief-detail">
                  <strong>{{ t('settings.ai.triggerTitle') }}</strong>
                  <span>{{ t('settings.ai.triggerDescription') }}</span>
                </div>
                <div class="ai-brief-detail">
                  <strong>{{ t('settings.ai.scopeTitle') }}</strong>
                  <span>{{ t('settings.ai.scopeDescription') }}</span>
                </div>
                <div class="ai-brief-detail">
                  <strong>{{ t('settings.ai.formatTitle') }}</strong>
                  <span>{{ t('settings.ai.formatDescription') }}</span>
                </div>
              </div>
            </div>
            <div v-if="dailyBriefPreferenceWritable && dailyBriefEnabled" class="field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.ai.dailyBriefAutoTitle') }}</span>
                <span class="field-desc">{{ t('settings.ai.dailyBriefAutoDescription') }}</span>
              </div>
              <BSwitch
                :checked="dailyBriefAutoUpdate"
                :disabled="dailyBriefPreferenceLoading || dailyBriefPreferenceSaving || !dailyBriefFeatureEnabled"
                :aria-label="t('settings.ai.dailyBriefAutoTitle')"
                @change="setDailyBriefAutoUpdate"
              />
            </div>
            <div v-if="dailyBriefPreferenceWritable" class="ai-routine-boundary">
              <div class="ai-routine-boundary__head">
                <span>
                  <strong>{{ t('settings.ai.boundaryTitle') }}</strong>
                  <small>{{ t('settings.ai.boundaryDescription') }}</small>
                </span>
              </div>
              <div class="ai-routine-boundary__items">
                <span>{{ t('settings.ai.boundaryFacts') }}</span>
                <span>{{ t('settings.ai.boundaryNoGuess') }}</span>
                <span>{{ t('settings.ai.boundaryControl') }}</span>
              </div>
            </div>
          </div>
        </BCard>

        <!-- 积分概览和明细也在设置壳内呈现；独立旧路由仅保留兼容。 -->
        <BCard as="section" v-if="sectionVisible('points')" class="settings-card settings-card--points" id="set-points">
          <div v-if="pointsLoginRequired" class="field">
            <div class="field-head">
              <span class="field-label">{{ t('personCenter.pointsLoginRequired') }}</span>
            </div>
            <BButton @click="bookmark.isShowLogin = true">{{ t('personCenter.loginRegister') }}</BButton>
          </div>
          <PointsUsagePage v-else class="settings-embedded-content" embedded />
        </BCard>

        <!-- 浏览器收集：完整扩展与轻量书签栏入口并列，避免把能力不同的两种方式混成一个按钮。 -->

        <!-- 数据导出 / 备份 -->
        <BCard
          as="section"
          v-if="!bookmark.isMobile && sectionVisible('privacy')"
          class="settings-card"
          id="set-export"
        >
          <div class="card-head">
            <span class="card-icon"><SvgIcon :src="icon.resource.file" size="20" /></span>
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
              <BButton class="export-btn" type="primary" :loading="exporting" @click="exportAll">
                {{ exporting ? t('settings.exporting') : t('settings.exportBtn') }}
              </BButton>
            </div>
            <div class="field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.importAll') }}</span>
                <span class="field-desc">{{ t('settings.importAllDesc') }}</span>
              </div>
              <BUpload
                accept="application/json,.json"
                :multiple="false"
                raw-file
                :disabled="importing"
                @change="onImportFiles"
              >
                <BButton class="export-btn" type="primary" :loading="importing">
                  {{ importing ? t('settings.importing') : t('settings.importBtn') }}
                </BButton>
              </BUpload>
            </div>
          </div>
        </BCard>

        <!-- 隐私与协议 -->
        <BCard as="section" v-if="sectionVisible('privacy')" class="settings-card" id="set-privacy">
          <div class="card-head"
            ><h2 class="card-title">{{ t('settings.privacyTitle') }}</h2></div
          >
          <div class="fields">
            <div class="field legal-document-field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.privacyPolicy') }}</span>
                <span class="field-desc">{{ t('settings.privacyPolicyDesc') }}</span>
              </div>
              <BButton class="legal-document-link" @click="openLegalDocument('privacy-policy.html')">
                <span>{{ t('settings.viewDocument') }}</span>
                <SvgIcon :src="icon.arrow_right" size="15" aria-hidden="true" />
              </BButton>
            </div>
            <div class="field legal-document-field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.userAgreement') }}</span>
                <span class="field-desc">{{ t('settings.userAgreementDesc') }}</span>
              </div>
              <BButton class="legal-document-link" @click="openLegalDocument('user-agreement.html')">
                <span>{{ t('settings.viewDocument') }}</span>
                <SvgIcon :src="icon.arrow_right" size="15" aria-hidden="true" />
              </BButton>
            </div>
            <!-- App 备案号:工信部要求 App 内显著展示,仅 APK 内显示(浏览器端页脚已有网站 ICP 备案号,两者不同不可混用) -->
            <div v-if="isAndroidApp" class="field legal-document-field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.appFiling') }}</span>
                <span class="field-desc">{{ t('settings.appFilingDesc') }}</span>
              </div>
              <a class="app-filing-link" :href="MIIT_QUERY_URL" target="_blank" rel="noopener noreferrer">
                <span>{{ APP_FILING_NUMBER }}</span>
                <SvgIcon :src="icon.arrow_right" size="15" aria-hidden="true" />
              </a>
            </div>
          </div>
        </BCard>

        <!-- 低频开发者资源放在设置页脚，不占普通用户的产品导航。 -->
        <div v-if="!bookmark.isMobile && sectionVisible('privacy')" class="settings-foot">
          <span>{{ t('settings.footHint') }}</span>
          <span aria-hidden="true">·</span>
          <BButton
            class="settings-developer-link"
            :aria-label="t('settings.developerToolboxDesc')"
            @click="openDeveloperToolbox"
          >
            <SvgIcon :src="icon.toolkit" size="13" aria-hidden="true" />
            <span>{{ t('settings.developerToolbox') }}</span>
            <SvgIcon :src="icon.arrow_right" size="12" aria-hidden="true" />
          </BButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import SettingsAppearanceSection from './components/SettingsAppearanceSection.vue';
  import SettingsGeneralSection from './components/SettingsGeneralSection.vue';
  import SettingsNotificationSection from './components/SettingsNotificationSection.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import { useBrowserPush } from '@/composables/useBrowserPush';
  import { computed, ref, nextTick, watch, onBeforeUnmount } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import { bookmarkStore, useUserStore } from '@/store';
  import { isGuestUser } from '@/utils/savePreference';
  import { recordOperation } from '@/api/commonApi.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { apiBasePost } from '@/http/request';
  import AccountSecurity from '@/components/settings/AccountSecurity.vue';
  import AiUsagePage from '@/view/aiUsage/AiUsagePage.vue';
  import PointsUsagePage from '@/view/pointsUsage/PointsUsagePage.vue';
  import BSwitch from '@/components/base/BasicComponents/BSwitch.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BUpload from '@/components/base/BasicComponents/BUpload.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import {
    isLightNoteAndroidApp,
    postAndroidOpenLegalDocument,
    type AndroidLegalDocument,
  } from '@/utils/androidBridge.ts';
  import { getMobileHomePreference } from '@/utils/preferences.ts';
  import { APP_FILING_NUMBER, MIIT_QUERY_URL } from '@/config/androidRelease.ts';
  import SettingsMobileIndex, { type SettingsIndexRow } from './SettingsMobileIndex.vue';
  import { useDailyBriefPreference } from './useDailyBriefPreference';
  import {
    countEnabledNotifications,
    parseSettingsSection,
    visibleSettingsSections,
    type SettingsEnv,
    type SettingsIndexSectionId,
  } from './settingsRegistry';

  const { t } = useI18n();
  const router = useRouter();
  const route = useRoute();
  const bookmark = bookmarkStore();
  const user = useUserStore();
  const isAndroidApp = isLightNoteAndroidApp();

  const pageRef = ref<HTMLElement | null>(null);
  /*
   * 桌面左侧目录和移动端「目录 + 子页」共用 route.query.section。
   *
   * 唯一状态来源是 route.query.section —— 不另存 expandedSection 之类的组件状态,
   * 否则会出现「URL 指向通知、组件却展开 AI」。这么定下来后刷新、深链接、
   * 浏览器/Android 系统返回全都免费拿到,不必自己维护一套历史。
   *
   *   无 section        → 紧凑目录(SettingsMobileIndex)
   *   有合法 section    → 只渲染对应那一个区块
   *
   * 桌面无 section 时默认外观；移动无 section 时仍显示紧凑目录。
   */
  const settingsEnv = computed<SettingsEnv>(() => ({ isGuest: isGuestUser() }));
  const pointsLoginRequired = computed(
    () => settingsEnv.value.isGuest && parseSettingsSection(route.query.section, { isGuest: false }) === 'points',
  );
  const parsedSection = computed(() =>
    pointsLoginRequired.value ? 'points' : parseSettingsSection(route.query.section, settingsEnv.value),
  );
  const desktopSection = computed<SettingsIndexSectionId>(
    () => parsedSection.value || visibleSettingsSections(settingsEnv.value)[0]?.id || 'appearance',
  );
  const mobileSection = computed(() => (bookmark.isMobile ? parsedSection.value : null));
  const isMobileSubPage = computed(() => mobileSection.value !== null);
  const showMobileIndex = computed(() => bookmark.isMobile && mobileSection.value === null);

  function sectionIcon(iconKey: string) {
    if (iconKey === 'points') return icon.growth.coin;
    return (icon.settings as Record<string, string>)[iconKey] || icon.nullImg;
  }

  const desktopNavigationRows = computed(() =>
    visibleSettingsSections(settingsEnv.value).map((meta) => ({
      ...meta,
      icon: sectionIcon(meta.iconKey),
      title: t(meta.titleKey),
    })),
  );

  const activeCategory = computed(() => desktopNavigationRows.value.find((row) => row.id === desktopSection.value));
  const categoryDescription = computed(() => {
    const keys = {
      appearance: 'settings.appearanceDesc',
      general: 'settings.generalDesc',
      notification: 'settings.notificationDesc',
      ai: 'settings.ai.description',
      points: 'growth.pointsUsagePageDescription',
      account: 'settings.accountSecurityDesc',
      privacy: 'settings.privacyDesc',
    };
    return t(keys[desktopSection.value]);
  });
  /** 两端都只渲染当前分类，桌面右侧不再是超长设置页。 */
  function sectionVisible(id: SettingsIndexSectionId) {
    return bookmark.isMobile ? mobileSection.value === id : desktopSection.value === id;
  }

  function openDesktopSection(id: SettingsIndexSectionId) {
    const targetPanel = id === 'ai' ? 'usage' : undefined;
    if (desktopSection.value === id && route.query.section === id && route.query.panel === targetPanel) return;
    const query = { ...route.query, section: id, panel: targetPanel };
    if (!targetPanel) delete query.panel;
    void router.replace({ path: '/settings', query });
  }

  // 切换桌面分类时将右侧内容回到顶部；选中态始终来自 URL。
  watch(desktopSection, () => {
    if (bookmark.isMobile) return;
    nextTick(() => {
      if (pageRef.value) pageRef.value.scrollTop = 0;
    });
  });

  /*
   * 目录滚动位置恢复。存在组件内 —— 目录与子页只差 query(?section=),
   * 同一路由 + 固定的 router-view key 会复用同一实例,不会被销毁(全站并没有 keep-alive);
   * 不写 localStorage —— 刷新 App 后从顶部开始是合理的,没必要跨会话记住。
   */
  const indexScrollTop = ref(0);
  /** 是否由目录页 push 进来:决定返回用 back() 还是 replace()(深链接进来没有目录可回) */
  let enteredFromIndex = false;

  function openSection(id: SettingsIndexSectionId) {
    indexScrollTop.value = pageRef.value?.scrollTop ?? 0;
    if (id === 'ai') {
      recordOperation({ module: 'AI 用量与计费', operation: '打开页面【设置】' });
    }
    enteredFromIndex = true;
    router.push({ path: '/settings', query: { section: id, ...(id === 'ai' ? { panel: 'usage' } : {}) } });
  }

  const aiSettingsPanel = computed<'usage' | 'routines'>(() =>
    route.query.panel === 'routines' ? 'routines' : 'usage',
  );

  function selectAiSettingsPanel(panel: 'usage' | 'routines') {
    if (aiSettingsPanel.value === panel && route.query.panel === panel) return;
    void router.replace({ path: '/settings', query: { ...route.query, section: 'ai', panel } });
  }

  const dailyBriefPreferenceOwnerKey = computed(() =>
    [
      user.id || 'visitor',
      user.role || '',
      user.adminContext?.id || '',
      user.adminContext?.subjectUserId || '',
      user.adminContext?.mode || '',
    ].join('|'),
  );
  const dailyBriefPreferenceWritable = computed(
    () => Boolean(user.id && user.role !== 'visitor') && !user.adminContext,
  );
  const {
    enabled: dailyBriefEnabled,
    autoUpdate: dailyBriefAutoUpdate,
    featureEnabled: dailyBriefFeatureEnabled,
    loading: dailyBriefPreferenceLoading,
    saving: dailyBriefPreferenceSaving,
    error: dailyBriefPreferenceError,
    description: dailyBriefPreferenceDescription,
    load: loadDailyBriefPreference,
    setEnabled: setDailyBriefEnabled,
    setAutoUpdate: setDailyBriefAutoUpdate,
  } = useDailyBriefPreference({
    ownerKey: dailyBriefPreferenceOwnerKey,
    writable: dailyBriefPreferenceWritable,
  });

  watch(
    [parsedSection, aiSettingsPanel, dailyBriefPreferenceOwnerKey],
    ([section, panel]) => {
      if (section === 'ai' && panel === 'routines' && dailyBriefPreferenceWritable.value) {
        void loadDailyBriefPreference();
      }
    },
    { immediate: true },
  );

  function backToIndex() {
    // 走 back() 才能让浏览器/Android 的前进后退保持一致;深链接进来时历史里没有目录页,只能 replace
    if (enteredFromIndex) router.back();
    else router.replace({ path: '/settings' });
  }

  // 子页 ↔ 目录切换时的滚动:进子页从顶部开始,回目录恢复到刚才浏览的位置。
  // scrollTop 是布局坐标,不受界面缩放(<html> zoom)影响,这里无需换算。
  watch(mobileSection, (current, previous) => {
    if (current) {
      nextTick(() => {
        if (pageRef.value) pageRef.value.scrollTop = 0;
      });
      return;
    }
    if (previous) {
      enteredFromIndex = false;
      const top = indexScrollTop.value;
      nextTick(() => {
        if (pageRef.value) pageRef.value.scrollTop = top;
      });
    }
  });
  /*
   * 目录摘要:一行说清当前状态，让人不进子页也知道现在是什么设置。
   * 必须取真实偏好、不能写死 —— 摘要一旦和实际不符，目录就从「帮你定位」变成「骗你一次」。
   */
  const appearanceSummary = computed(() => {
    const theme = themeOpts.value.find((o) => o.v === (user.preferences.theme || 'system'))?.label;
    const lang = langOpts.find((o) => o.v === (user.preferences.lang || 'zh-CN'))?.label;
    return [theme, lang].filter(Boolean).join(' · ');
  });

  // 项数由 settingsRegistry 的清单算出(总数不写死)，免打扰单独作为后缀,原因见该模块注释
  const browserPush = useBrowserPush();
  const notificationSummary = computed(() => {
    const prefs = user.preferences as Record<string, unknown>;
    const base = t(
      'settings.notificationSummary',
      countEnabledNotifications(
        { ...prefs, notificationsBrowser: browserPush.enabled.value },
        { browserPush: !bookmark.isMobileDevice, guest: isGuestUser() },
      ),
    );
    return !bookmark.isMobileDevice && prefs.notificationsDnd === true
      ? `${base} · ${t('settings.notificationSummaryDnd')}`
      : base;
  });

  const aiSummary = computed(() => t('settings.ai.summary'));

  /*
   * 移动端目录行。标题用 mobileIndex.* 那套更完整的名字(目录一行只放一个分类、有横向空间),
   * 桌面锚点继续用短标题。summary 全部来自上面的实时 computed。
   */
  const mobileIndexRows = computed<SettingsIndexRow[]>(() => {
    const summaries: Record<SettingsIndexSectionId, string> = {
      appearance: appearanceSummary.value,
      general: t('settings.mobileIndex.generalSummary'),
      notification: notificationSummary.value,
      ai: aiSummary.value,
      points: t('growth.pointsUsagePageDescription'),
      account: t('settings.accountSecurityDesc'),
      privacy: t('settings.mobileIndex.privacySummary'),
    };
    return visibleSettingsSections(settingsEnv.value).map((meta) => ({
      id: meta.id,
      group: meta.group,
      tone: meta.tone,
      icon: sectionIcon(meta.iconKey),
      title: t(meta.mobileTitleKey),
      summary: summaries[meta.id],
    }));
  });

  /** 子页顶栏标题:与目录行同源，避免两处各写一份而说法不一致 */
  const currentSectionTitle = computed(() => {
    if (pointsLoginRequired.value) return t('growth.pointsUsagePageTitle');
    const current = mobileSection.value;
    if (!current) return t('settings.title');
    return mobileIndexRows.value.find((row) => row.id === current)?.title ?? t('settings.title');
  });
  function openLegalDocument(fileName: AndroidLegalDocument) {
    if (isAndroidApp && postAndroidOpenLegalDocument(fileName)) return;
    window.open(`/legal/${fileName}`, '_blank', 'noopener,noreferrer');
  }

  function openDeveloperToolbox() {
    window.open('https://boluo66.top/toolkit/', '_blank', 'noopener,noreferrer');
    recordOperation(OPERATION_LOG_MAP.navigation.toolkit);
  }

  // 一键导出/备份:拉全部数据 → 下成 JSON(文件名用本地日期,不用 toISOString 避免跨日偏差)
  const exporting = ref(false);
  async function exportAll() {
    if (exporting.value) return;
    exporting.value = true;
    const owner = dataOperationGeneration;
    try {
      if (owner !== dataOperationGeneration) return;
      const res = await apiBasePost('/api/user/exportData', {});
      if (owner !== dataOperationGeneration) return;
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
        recordOperation({
          ...OPERATION_LOG_MAP.settings.exportData,
          operation: `导出个人数据成功【书签${c.bookmarks || 0}/笔记${c.notes || 0}/文件${c.files || 0}】`,
        });
      } else {
        message.info(res?.msg || t('settings.exportFail'));
      }
    } catch {
      if (owner !== dataOperationGeneration) return;
      message.info(t('settings.exportFail'));
    } finally {
      if (owner === dataOperationGeneration) exporting.value = false;
    }
  }

  // 元数据恢复先做只读预检，再由用户确认写入；文件本体和 AI 数据只导出、不承诺恢复。
  const importing = ref(false);
  let dataOperationGeneration = 0;
  watch(
    dailyBriefPreferenceOwnerKey,
    () => {
      dataOperationGeneration++;
      importing.value = false;
      exporting.value = false;
    },
    { flush: 'sync' },
  );
  onBeforeUnmount(() => {
    dataOperationGeneration++;
  });
  async function runMetadataImport(data: any, owner = dataOperationGeneration) {
    if (owner !== dataOperationGeneration) return;
    importing.value = true;
    try {
      if (owner !== dataOperationGeneration) return;
      const res = await apiBasePost('/api/user/importData', { data });
      if (owner !== dataOperationGeneration) return;
      if (res?.status === 200 && res.data) {
        const s = res.data;
        message.success(
          t('settings.importOk', {
            b: s.bookmarks?.added || 0,
            n: s.notes?.added || 0,
            sk: (s.bookmarks?.skipped || 0) + (s.notes?.skipped || 0),
          }),
        );
        recordOperation({
          module: '设置',
          operation: `恢复元数据(书签+${s.bookmarks?.added || 0}、笔记+${s.notes?.added || 0})`,
        });
      } else {
        message.info(res?.msg || t('settings.importFail'));
      }
    } catch {
      if (owner !== dataOperationGeneration) return;
      message.info(t('settings.importFail'));
    } finally {
      if (owner === dataOperationGeneration) importing.value = false;
    }
  }

  async function onImportFiles(files: File[]) {
    const file = files?.[0];
    if (!file) return;
    importing.value = true;
    const owner = dataOperationGeneration;
    try {
      const text = await file.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        message.info(t('settings.importInvalid'));
        return;
      }
      if (owner !== dataOperationGeneration) return;
      const res = await apiBasePost('/api/user/importData', { data, mode: 'preflight' });
      if (owner !== dataOperationGeneration) return;
      if (res?.status !== 200 || !res.data?.canImport) {
        message.info(res?.msg || t('settings.importFail'));
        return;
      }
      const preview = res.data;
      if (owner === dataOperationGeneration) importing.value = false;
      Alert.alert({
        title: t('settings.importConfirmTitle'),
        content: t('settings.importConfirmContent', {
          b: preview.willRestore?.bookmarks || 0,
          n: preview.willRestore?.notes || 0,
          t: preview.willRestore?.tags || 0,
          f: preview.exportOnly?.files || 0,
          ai: preview.exportOnly?.aiConversations || 0,
        }),
        onOk: () => runMetadataImport(data, owner),
      });
    } catch {
      if (owner !== dataOperationGeneration) return;
      message.info(t('settings.importFail'));
    } finally {
      if (owner === dataOperationGeneration) importing.value = false;
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
  function goBack() {
    // 移动端子页的返回终点是设置目录，不是个人中心
    if (isMobileSubPage.value) {
      backToIndex();
      return;
    }
    // 移动端设置页是个人中心的下级页面，返回目标必须稳定留在轻笺内部。
    // 使用 replace 避免个人中心再次按浏览器返回时又回到设置页形成往返循环。
    if (bookmark.isMobile) {
      router.replace('/personCenter');
      return;
    }
    if (window.history.length > 1) router.back();
    else router.push('/home');
  }
</script>

<style lang="less">
  .settings-page {
    height: 100%;
    overflow-y: auto;
    scrollbar-gutter: stable;
    box-sizing: border-box;
    padding: 20px 32px 48px;
    background: var(--background-color);
    color: var(--text-color);
    .settings-container {
      max-width: 680px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
    .settings-container.is-desktop {
      max-width: 1610px;
      display: grid;
      grid-template-columns: 210px minmax(0, 1fr);
      gap: 22px;
      align-items: start;
    }
    .settings-container.is-full-desktop {
      grid-template-columns: 244px minmax(0, 1fr);
      gap: 26px;
    }
    .settings-desktop-sidebar {
      position: sticky;
      top: 0;
      min-width: 0;
      min-height: 520px;
      border: 1px solid var(--surface-border-color);
      border-radius: 14px;
      padding: 18px 14px;
      background: var(--card-background);
    }
    .settings-title {
      font-size: 24px;
      margin: 16px 8px;
    }
    .settings-back.b_btn {
      border-radius: 24px;
      color: var(--desc-color);
      background: transparent;
      margin-left: 4px;
    }
    .settings-desktop-nav {
      display: grid;
      gap: 4px;
    }
    .settings-desktop-nav__item.b_btn {
      width: 100%;
      min-height: 44px;
      height: auto;
      padding: 8px 9px;
      display: flex;
      justify-content: flex-start;
      gap: 10px;
      border: 1px solid transparent;
      border-radius: 10px;
      background: transparent;
      color: var(--desc-color);
      font-size: 13px;
      white-space: normal;
      text-align: left;
    }
    .settings-desktop-nav__item.active.b_btn {
      color: var(--primary-color);
      border-color: var(--primary-color);
      background: var(--card-background);
      background: color-mix(in srgb, var(--primary-color) 10%, var(--card-background));
    }
    .settings-desktop-nav__item:hover {
      background: var(--card-background);
      background: color-mix(in srgb, var(--primary-color) 10%, var(--card-background));
    }
    .settings-desktop-nav__icon {
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      border: 1px solid var(--primary-color);
      border-color: color-mix(in srgb, var(--primary-color) 25%, var(--surface-border-color));
      border-radius: 8px;
      color: var(--primary-color);
      background: var(--card-background);
      background: color-mix(in srgb, var(--primary-color) 10%, var(--card-background));
    }
    .settings-desktop-nav__icon.is-green,
    .card-icon.is-green {
      color: var(--resource-note-color);
      background: var(--card-background);
      background: color-mix(in srgb, var(--resource-note-color) 9%, var(--card-background));
      border-color: var(--resource-note-color);
      border-color: color-mix(in srgb, var(--resource-note-color) 30%, var(--surface-border-color));
    }
    .settings-desktop-nav__arrow {
      margin-left: auto;
      opacity: 0;
      flex-shrink: 0;
    }
    .active .settings-desktop-nav__arrow {
      opacity: 1;
    }
    .settings-sidebar-note {
      margin: 24px 8px 4px;
      font-size: 11px;
      line-height: 1.8;
      color: var(--desc-color);
    }
    .settings-body,
    .settings-section-stack {
      display: flex;
      flex-direction: column;
      gap: 18px;
      min-width: 0;
    }
    .settings-body {
      gap: 14px;
    }
    .settings-category-heading {
      position: sticky;
      top: 0;
      z-index: 10;
      flex-shrink: 0;
      background: var(--background-color);
      box-shadow: 0 -24px 0 var(--background-color);
      display: flex;
      gap: 12px;
      align-items: center;
      min-height: 62px;
      margin-bottom: 2px;
    }
    .settings-category-heading h1 {
      font-size: 22px;
      margin: 0;
    }
    .settings-category-heading p {
      font-size: 12px;
      color: var(--desc-color);
      margin: 5px 0 0;
      line-height: 1.6;
    }
    .settings-category-heading > .settings-save-status {
      margin-left: auto;
    }
    .card-icon {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      color: var(--primary-color);
      background: var(--card-background);
      background: color-mix(in srgb, var(--primary-color) 10%, var(--card-background));
    }
    .settings-card {
      padding: 18px 22px 4px;
      border: 1px solid var(--surface-border-color);
      border-radius: 14px;
      background: var(--card-background);
      min-width: 0;
      box-shadow: none;
    }
    .card-head {
      display: flex;
      gap: 10px;
      align-items: center;
      padding-bottom: 14px;
      border-bottom: 1px solid var(--surface-divider-color, var(--border-color));
    }
    .card-head > .card-icon {
      display: none;
    }
    .card-title {
      font-size: 16px;
      margin: 0;
      font-weight: 600;
    }
    .card-sub {
      font-size: 12px;
      color: var(--desc-color);
      margin: 5px 0 0;
      line-height: 1.7;
    }
    .fields {
      display: flex;
      flex-direction: column;
    }
    .field {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
      padding: 18px 0;
      min-height: 76px;
      border-bottom: 1px solid var(--surface-divider-color, var(--border-color));
    }
    .settings-body.is-privacy {
      gap: 14px;
    }
    #set-export,
    #set-privacy {
      .card-head {
        padding-bottom: 10px;
      }
      .field {
        box-sizing: border-box;
        min-height: 64px;
        padding: 12px 0;
        gap: 20px;
      }
      .field-head {
        gap: 4px;
        max-width: 820px;
      }
    }
    .field:last-child {
      border-bottom: 0;
    }
    .field-head {
      display: grid;
      gap: 6px;
      min-width: 0;
      flex: 1;
      max-width: 660px;
    }
    .field-label {
      font-size: 14px;
      font-weight: 600;
    }
    .field-desc {
      font-size: 12px;
      color: var(--desc-color);
      line-height: 1.7;
      overflow-wrap: anywhere;
    }
    .field-desc.is-error {
      color: var(--error-color);
    }
    .settings-card--ai,
    .settings-card--points,
    #set-account {
      padding: 0;
      background: transparent;
      border: 0;
      box-shadow: none;
    }
    .settings-card--ai > .fields {
      border: 1px solid var(--surface-border-color);
      border-radius: 14px;
      background: var(--card-background);
      padding: 0 22px 18px;
      margin-top: 18px;
    }
    .settings-embedded-content {
      margin-top: 18px;
    }
    .settings-card--points .settings-embedded-content {
      margin-top: 0;
    }
    .ai-daily-brief-field {
      flex-wrap: wrap;
    }
    .ai-field-title-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .ai-brief-details {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      width: 100%;
      padding: 14px;
      background: var(--card-background);
      background: color-mix(in srgb, var(--primary-color) 10%, var(--card-background));
      border-radius: 10px;
    }
    .ai-brief-detail {
      flex: 1 1 160px;
      display: grid;
      gap: 6px;
    }
    .ai-brief-detail strong {
      font-size: 12px;
    }
    .ai-brief-detail span {
      font-size: 12px;
      color: var(--desc-color);
      line-height: 1.7;
    }
    .ai-brief-icon {
      color: var(--primary-color);
    }
    .ai-routine-boundary {
      margin-top: 18px;
      font-size: 12px;
      color: var(--desc-color);
      line-height: 1.8;
    }
    .ai-routine-boundary__head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
    }
    .ai-routine-boundary__head small {
      display: block;
    }
    .ai-routine-boundary__items {
      display: grid;
      gap: 6px;
      margin-top: 10px;
    }
    .shortcut-keys {
      display: flex;
      align-items: center;
      gap: 7px;
    }
    .shortcut-key {
      padding: 7px 12px;
      border: 1px solid var(--surface-border-color);
      border-radius: 7px;
      background: var(--card-background);
      background: color-mix(in srgb, var(--primary-color) 10%, var(--card-background));
    }
    .browser-capture-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
      gap: 16px;
      margin-top: 16px;
    }
    .browser-capture-card {
      --b-card-shadow: none;
      --b-card-background: var(--card-background);
    }
    .browser-capture-card__head {
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
    }
    .browser-capture-card__title {
      min-width: 0;
      flex: 1;
    }
    .browser-capture-card__title h3 {
      font-size: 14px;
      margin: 0;
    }
    .browser-capture-card__title > span {
      font-size: 11px;
      color: var(--desc-color);
    }
    .browser-capture-card__logo img {
      width: 28px;
      height: 28px;
    }
    .browser-capture-card__icon {
      color: var(--primary-color);
    }
    .browser-capture-card__desc,
    .browser-capture-card__hint,
    .browser-capture-privacy {
      font-size: 12px;
      color: var(--desc-color);
      line-height: 1.8;
    }
    .browser-capture-card__features,
    .browser-capture-card__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
    }
    .browser-capture-card__features {
      --chip-bookmark-fg: var(--chip-pin-fg);
      --chip-bookmark-bg: var(--chip-pin-bg);
      --chip-bookmark-border: var(--chip-pin-border);
      --chip-note-fg: var(--chip-success-fg);
      --chip-note-bg: var(--chip-success-bg);
      --chip-note-border: var(--chip-success-border);
      --chip-file-fg: var(--chip-pending-fg);
      --chip-file-bg: var(--chip-pending-bg);
      --chip-file-border: var(--chip-pending-border);

      .b-chip__content {
        gap: 4px;
      }
    }
    .browser-capture-privacy {
      display: flex;
      gap: 6px;
      align-items: center;
      margin: 14px 0;
    }
    .qs-bookmarklet {
      display: inline-flex;
      padding: 8px 14px;
      margin-top: 8px;
      border: 1px solid var(--primary-color);
      border-radius: 8px;
      color: var(--primary-color);
      text-decoration: none;
    }
    .legal-document-link.b_btn {
      color: var(--primary-color);
      border: 0;
      background: transparent;
    }
    .settings-foot {
      display: flex;
      justify-content: center;
      flex-wrap: wrap;
      align-items: center;
      gap: 7px;
      color: var(--desc-color);
      font-size: 11px;
      margin-top: 8px;
    }
    .settings-developer-link.b_btn {
      font-size: 11px;
      color: var(--desc-color);
      border: 0;
      background: transparent;
    }
    .settings-subhead {
      display: grid;
      grid-template-columns: 44px minmax(0, 1fr) 44px;
      align-items: center;
      position: sticky;
      top: 0;
      flex-shrink: 0;
      z-index: 100;
      box-shadow: 0 -14px 0 var(--card-background);
      margin: -14px -14px 0;
      padding: 8px 10px;
      background: var(--card-background);
      border-bottom: 1px solid var(--surface-border-color);
    }
    .settings-hero {
      position: sticky;
      top: 0;
      z-index: 10;
      flex-shrink: 0;
      box-shadow: 0 -14px 0 var(--card-background);
      margin: -14px -14px 0;
      padding: 10px 14px;
      background: var(--card-background);
      border-bottom: 1px solid var(--surface-border-color);
    }
    .settings-subhead-title {
      font-size: 18px;
      text-align: center;
      margin: 0;
    }
    .settings-subhead-back.b_btn {
      width: 44px;
      height: 44px;
      border: 0;
      background: transparent;
    }
    .settings-subtitle {
      font-size: 12px;
      color: var(--desc-color);
    }
    .settings-container:not(.is-desktop) {
      gap: 14px;
    }
    .is-mobile-sub {
      gap: 14px;
    }
    .is-mobile-sub .settings-section-stack {
      gap: 14px;
    }
    .is-mobile-sub .settings-card,
    .is-mobile-sub .settings-section-card {
      padding: 16px 16px 3px;
      border-radius: 12px;
    }
    .is-mobile-sub .settings-card--ai,
    .is-mobile-sub .settings-card--points,
    .is-mobile-sub #set-account {
      padding: 0;
    }
    .is-mobile-sub .settings-field-row.is-stacked {
      flex-direction: column;
      align-items: stretch;
    }
    .is-mobile-sub .settings-field-row.is-stacked .settings-field-row__control {
      max-width: 100%;
      width: 100%;
    }
    .is-mobile-sub .settings-field-row {
      gap: 12px;
      padding: 14px 0;
    }
    .is-mobile-sub .field {
      padding: 14px 0;
      gap: 12px;
      flex-wrap: wrap;
    }
    .is-mobile-sub .field-head {
      flex-basis: 65%;
    }
    .is-mobile-sub .b_btn {
      min-height: 44px;
    }
  }
  // Only section headings inside settings receive this treatment; shared pages keep their own styles.
  .settings-page
    .settings-body
    :is(
      .settings-section-card__head,
      .card-head,
      .browser-push-settings__head,
      .community-notification-settings__head,
      .ai-quota-panel__head,
      .usage-head,
      .points-overview-panel__head,
      .ledger-head,
      .acc-sec .field-head--row
    ) {
    position: relative;
    box-sizing: border-box;
    padding: 8px 12px 8px 20px;
    margin-top: -8px;
    border-bottom: 1px solid var(--surface-divider-color, var(--border-color));
    border-radius: 8px 8px 0 0;
    background: var(--card-background);
    background: color-mix(in srgb, var(--primary-color) 4%, var(--card-background));

    &::before {
      content: '';
      position: absolute;
      left: 8px;
      top: 12px;
      width: 3px;
      height: 16px;
      border-radius: 2px;
      background: var(--primary-color);
    }
    h2,
    h3,
    .field-label,
    .community-notification-settings__head-copy > strong {
      font-size: 15px;
      font-weight: 600;
      line-height: 24px;
    }
  }
  .settings-page .settings-body .community-notification-settings__head-icon {
    display: none;
  }
  .settings-page:not(.is-mobile) {
    overflow-y: scroll;
  }
  .settings-page.is-appearance:not(.is-mobile) {
    padding-bottom: 16px;
    .settings-field-row {
      min-height: 64px;
      padding-top: 11px;
      padding-bottom: 11px;
    }
    .settings-body {
      gap: 14px;
    }
  }
  .settings-page.is-mobile {
    padding: 14px 14px 32px;
    background: var(--workspace-panel-bg-color);
  }
</style>
