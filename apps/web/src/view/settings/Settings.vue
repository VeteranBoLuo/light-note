<template>
  <div class="settings-page" ref="pageRef">
    <div class="settings-container">
      <!-- 移动端子页顶栏:只有「返回 + 当前分类」。不重复「设置 / 外观、语言…」那段大标题,
           手机上纵向空间宝贵,标题已由这一行承担。 -->
      <header v-if="isMobileSubPage" class="settings-subhead">
        <BButton class="settings-subhead-back" :aria-label="t('common.back')" @click="goBack">
          <svg-icon :src="icon.arrow_left" size="18" />
        </BButton>
        <h1 class="settings-subhead-title">{{ currentSectionTitle }}</h1>
      </header>
      <header v-else class="settings-hero">
        <BButton class="settings-back" @click="goBack">
          <svg-icon :src="icon.arrow_left" size="16" />
          <span>{{ t('common.back') }}</span>
        </BButton>
        <h1 class="settings-title">{{ t('settings.title') }}</h1>
        <p class="settings-subtitle">{{ t('settings.subtitle') }}</p>
      </header>

      <SettingsMobileIndex v-if="showMobileIndex" :sections="mobileIndexRows" @select="openSection" />

      <!-- 锚点条只服务桌面长页:移动端已按分类拆成子页,不渲染也就不必观察 -->
      <nav v-if="!bookmark.isMobile" class="settings-anchors">
        <BButton
          v-for="a in anchors"
          :key="a.id"
          class="anchor-chip"
          :class="{ active: activeAnchor === a.id }"
          :aria-pressed="activeAnchor === a.id"
          @click="scrollToSection(a.id)"
          >{{ a.label }}</BButton
        >
      </nav>

      <div v-if="!showMobileIndex" class="settings-body" :class="{ 'is-mobile-sub': isMobileSubPage }">
        <!-- 外观 -->
        <section v-if="sectionVisible('appearance')" class="settings-card" id="set-appearance">
          <div v-if="!isMobileSubPage" class="card-head">
            <span class="card-icon card-icon--appearance">
              <SvgIcon :src="icon.settings.appearance" size="20" aria-hidden="true" />
            </span>
            <div class="card-head-text">
              <h2 class="card-title">{{ t('settings.appearance') }}</h2>
              <p class="card-sub">
                {{ t(bookmark.isMobile ? 'settings.appearanceDescMobile' : 'settings.appearanceDesc') }}
              </p>
            </div>
          </div>

          <div class="fields">
            <div class="field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.theme') }}</span>
                <span class="field-desc">{{ t('settings.themeDesc') }}</span>
              </div>
              <div class="seg" :class="{ 'seg--two-column': themeOpts.length >= 4 }">
                <BButton
                  v-for="o in themeOpts"
                  :key="o.v"
                  class="seg-btn"
                  :class="{ active: (user.preferences.theme || 'system') === o.v }"
                  :type="(user.preferences.theme || 'system') === o.v ? 'primary' : undefined"
                  :aria-pressed="(user.preferences.theme || 'system') === o.v"
                  @click="set('theme', o.v)"
                >
                  {{ o.label }}
                </BButton>
              </div>
            </div>

            <div class="field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.language') }}</span>
                <span class="field-desc">{{ t('settings.languageDesc') }}</span>
              </div>
              <div class="seg" :class="{ 'seg--two-column': langOpts.length >= 4 }">
                <BButton
                  v-for="o in langOpts"
                  :key="o.v"
                  class="seg-btn"
                  :class="{ active: (user.preferences.lang || 'zh-CN') === o.v }"
                  :type="(user.preferences.lang || 'zh-CN') === o.v ? 'primary' : undefined"
                  :aria-pressed="(user.preferences.lang || 'zh-CN') === o.v"
                  @click="set('lang', o.v)"
                >
                  {{ o.label }}
                </BButton>
              </div>
            </div>

            <div v-if="!bookmark.isMobile" class="field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.uiScale') }}</span>
                <span class="field-desc">{{ t('settings.uiScaleDesc') }}</span>
              </div>
              <div class="seg" :class="{ 'seg--two-column': uiScaleOpts.length >= 4 }">
                <BButton
                  v-for="o in uiScaleOpts"
                  :key="o.v"
                  class="seg-btn"
                  :class="{ active: (user.preferences.uiScale || 'medium') === o.v }"
                  :type="(user.preferences.uiScale || 'medium') === o.v ? 'primary' : undefined"
                  :aria-pressed="(user.preferences.uiScale || 'medium') === o.v"
                  @click="set('uiScale', o.v)"
                >
                  {{ o.label }}
                </BButton>
              </div>
            </div>
          </div>
        </section>

        <!-- 通用 -->
        <section v-if="sectionVisible('general')" class="settings-card" id="set-general">
          <div v-if="!isMobileSubPage" class="card-head">
            <span class="card-icon card-icon--general">
              <SvgIcon :src="icon.settings.general" size="20" aria-hidden="true" />
            </span>
            <div class="card-head-text">
              <h2 class="card-title">{{ t('settings.general') }}</h2>
              <p class="card-sub">
                {{ t(bookmark.isMobile || isGuestUser() ? 'settings.generalDescMobile' : 'settings.generalDesc') }}
              </p>
            </div>
          </div>

          <div class="fields">
            <!-- 只对桌面端有意义：移动端 Logo 固定回「今日」，不读这项偏好 -->
            <div v-if="!bookmark.isMobile && !isGuestUser()" class="field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.defaultHome') }}</span>
                <span class="field-desc">{{ t('settings.defaultHomeDesc') }}</span>
              </div>
              <div class="seg" :class="{ 'seg--two-column': homeOpts.length >= 4 }">
                <BButton
                  v-for="o in homeOpts"
                  :key="o.v"
                  class="seg-btn"
                  :class="{ active: selectedHomePage === o.v }"
                  :type="selectedHomePage === o.v ? 'primary' : undefined"
                  :aria-pressed="selectedHomePage === o.v"
                  @click="set('homePage', o.v)"
                >
                  {{ o.label }}
                </BButton>
              </div>
            </div>

            <div class="field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.bookmarkOpen') }}</span>
                <span class="field-desc">{{ t('settings.bookmarkOpenDesc') }}</span>
              </div>
              <div class="seg" :class="{ 'seg--two-column': bookmarkOpenOpts.length >= 4 }">
                <BButton
                  v-for="o in bookmarkOpenOpts"
                  :key="o.v"
                  class="seg-btn"
                  :class="{ active: (user.preferences.openBookmarkIn || 'newTab') === o.v }"
                  :type="(user.preferences.openBookmarkIn || 'newTab') === o.v ? 'primary' : undefined"
                  :aria-pressed="(user.preferences.openBookmarkIn || 'newTab') === o.v"
                  @click="set('openBookmarkIn', o.v)"
                >
                  {{ o.label }}
                </BButton>
              </div>
            </div>

            <div class="field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.todoView') }}</span>
                <span class="field-desc">{{ t('settings.todoViewDesc') }}</span>
              </div>
              <div class="seg" :class="{ 'seg--two-column': todoViewOpts.length >= 4 }">
                <BButton
                  v-for="o in todoViewOpts"
                  :key="o.v"
                  class="seg-btn"
                  :class="{ active: (user.preferences.todoView || 'list') === o.v }"
                  :type="(user.preferences.todoView || 'list') === o.v ? 'primary' : undefined"
                  :aria-pressed="(user.preferences.todoView || 'list') === o.v"
                  @click="set('todoView', o.v)"
                >
                  {{ o.label }}
                </BButton>
              </div>
            </div>

            <!-- 手机端笔记库已支持列表视图，这里跟着开放；与 PC 共用 noteViewMode 偏好 -->
            <div class="field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.noteView') }}</span>
                <span class="field-desc">{{ t('settings.noteViewDesc') }}</span>
              </div>
              <div class="seg" :class="{ 'seg--two-column': viewOpts.length >= 4 }">
                <BButton
                  v-for="o in viewOpts"
                  :key="o.v"
                  class="seg-btn"
                  :class="{ active: (user.preferences.noteViewMode || 'list') === o.v }"
                  :type="(user.preferences.noteViewMode || 'list') === o.v ? 'primary' : undefined"
                  :aria-pressed="(user.preferences.noteViewMode || 'list') === o.v"
                  @click="set('noteViewMode', o.v)"
                >
                  {{ o.label }}
                </BButton>
              </div>
            </div>

            <!-- 移动端点击笔记始终直接进入编辑器；该偏好只改变 PC 的库内打开方式。 -->
            <div v-if="!bookmark.isMobile" class="field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.noteDirectEdit') }}</span>
                <span class="field-desc">{{ t('settings.noteDirectEditDesc') }}</span>
              </div>
              <BSwitch
                :checked="user.preferences.noteDirectEdit === true"
                :aria-label="t('settings.noteDirectEdit')"
                @change="set('noteDirectEdit', $event)"
              />
            </div>

            <div v-if="!bookmark.isMobile" class="field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.noteParentOpenMode') }}</span>
                <span class="field-desc">{{ t('settings.noteParentOpenModeDesc') }}</span>
              </div>
              <div class="seg">
                <BButton
                  v-for="o in noteParentOpenOpts"
                  :key="o.v"
                  class="seg-btn"
                  :class="{ active: selectedNoteParentOpenMode === o.v }"
                  :type="selectedNoteParentOpenMode === o.v ? 'primary' : undefined"
                  :aria-pressed="selectedNoteParentOpenMode === o.v"
                  @click="set('noteParentOpenMode', o.v)"
                >
                  {{ o.label }}
                </BButton>
              </div>
            </div>

            <div v-if="!bookmark.isMobile" class="field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.resourceView') }}</span>
                <span class="field-desc">{{ t('settings.resourceViewDesc') }}</span>
              </div>
              <div class="seg" :class="{ 'seg--two-column': resourceViewOpts.length >= 4 }">
                <BButton
                  v-for="o in resourceViewOpts"
                  :key="o.v"
                  class="seg-btn"
                  :class="{ active: (user.preferences.resourceView || 'card') === o.v }"
                  :type="(user.preferences.resourceView || 'card') === o.v ? 'primary' : undefined"
                  :aria-pressed="(user.preferences.resourceView || 'card') === o.v"
                  @click="set('resourceView', o.v)"
                >
                  {{ o.label }}
                </BButton>
              </div>
            </div>

            <div class="field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.resourceSort') }}</span>
                <span class="field-desc">{{ t('settings.resourceSortDesc') }}</span>
              </div>
              <div class="seg" :class="{ 'seg--two-column': resourceSortOpts.length >= 4 }">
                <BButton
                  v-for="o in resourceSortOpts"
                  :key="o.v"
                  class="seg-btn"
                  :class="{ active: (user.preferences.resourceSort || 'relevance') === o.v }"
                  :type="(user.preferences.resourceSort || 'relevance') === o.v ? 'primary' : undefined"
                  :aria-pressed="(user.preferences.resourceSort || 'relevance') === o.v"
                  @click="set('resourceSort', o.v)"
                >
                  {{ o.label }}
                </BButton>
              </div>
            </div>

            <div v-if="!bookmark.isMobile" class="field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.tagView') }}</span>
                <span class="field-desc">{{ t('settings.tagViewDesc') }}</span>
              </div>
              <div class="seg" :class="{ 'seg--two-column': tagViewOpts.length >= 4 }">
                <BButton
                  v-for="o in tagViewOpts"
                  :key="o.v"
                  class="seg-btn"
                  :class="{ active: (user.preferences.tagView || 'card') === o.v }"
                  :type="(user.preferences.tagView || 'card') === o.v ? 'primary' : undefined"
                  :aria-pressed="(user.preferences.tagView || 'card') === o.v"
                  @click="set('tagView', o.v)"
                >
                  {{ o.label }}
                </BButton>
              </div>
            </div>

            <div class="field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.cloudView') }}</span>
                <span class="field-desc">{{ t('settings.cloudViewDesc') }}</span>
              </div>
              <div class="seg" :class="{ 'seg--two-column': cloudViewOpts.length >= 4 }">
                <BButton
                  v-for="o in cloudViewOpts"
                  :key="o.v"
                  class="seg-btn"
                  :class="{ active: (user.preferences.cloudView || 'card') === o.v }"
                  :type="(user.preferences.cloudView || 'card') === o.v ? 'primary' : undefined"
                  :aria-pressed="(user.preferences.cloudView || 'card') === o.v"
                  @click="set('cloudView', o.v)"
                >
                  {{ o.label }}
                </BButton>
              </div>
            </div>

            <div class="field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.hideEmptyTags') }}</span>
                <span class="field-desc">{{ t('settings.hideEmptyTagsDesc') }}</span>
              </div>
              <BSwitch
                :checked="user.preferences.hideEmptyTags ?? false"
                :aria-label="t('settings.hideEmptyTags')"
                @change="set('hideEmptyTags', $event)"
              />
            </div>
          </div>
        </section>

        <!-- 安装到设备:桌面专属。移动端「我的」里已有安装入口(带状态摘要),
             设置里不再放第二个,所以这一块连目录项一起从移动端去掉(见 settingsRegistry 的 SettingsIndexSectionId)。 -->
        <section v-if="!isAndroidApp && !bookmark.isMobile" class="settings-card" id="set-install">
          <div class="card-head">
            <span class="card-icon card-icon--install">
              <SvgIcon :src="icon.pwa.install" size="20" aria-hidden="true" />
            </span>
            <div class="card-head-text">
              <h2 class="card-title">{{ t('settings.installTitle') }}</h2>
              <p class="card-sub">{{ t('settings.installDesc') }}</p>
            </div>
          </div>
          <div class="fields">
            <div class="field">
              <div class="field-head">
                <span class="field-label">{{ pwaStateLabel }}</span>
                <span class="field-desc">{{ t('settings.installStateDesc') }}</span>
              </div>
              <div class="pwa-settings-actions">
                <BButton type="primary" :disabled="isStandalone" @click="openGuide('settings')">
                  {{ isStandalone ? t('pwa.installed') : t('pwa.install') }}
                </BButton>
              </div>
            </div>
          </div>
        </section>

        <!-- 全局快捷键 -->
        <section v-if="!bookmark.isMobile" class="settings-card" id="set-shortcuts">
          <div class="card-head">
            <span class="card-icon card-icon--shortcuts">
              <SvgIcon :src="icon.settings.shortcuts" size="20" />
            </span>
            <div class="card-head-text">
              <h2 class="card-title">{{ t('settings.shortcutsTitle') }}</h2>
              <p class="card-sub">{{ t('settings.shortcutsDesc') }}</p>
            </div>
          </div>

          <div class="fields">
            <div v-for="item in shortcutItems" :key="item.id" class="field shortcut-field">
              <div class="field-head">
                <span class="field-label">{{ item.title }}</span>
                <span class="field-desc">{{ item.description }}</span>
              </div>
              <div class="shortcut-keys" :aria-label="`${item.title}: ${item.label}`">
                <template v-for="(key, index) in item.keys" :key="`${item.id}-${key}-${index}`">
                  <span v-if="index" class="shortcut-plus" aria-hidden="true">+</span>
                  <kbd class="shortcut-key">{{ key }}</kbd>
                </template>
              </div>
            </div>
          </div>
        </section>

        <!-- 通知 -->
        <section v-if="sectionVisible('notification')" class="settings-card" id="set-notification">
          <div v-if="!isMobileSubPage" class="card-head">
            <span class="card-icon card-icon--general">
              <SvgIcon :src="icon.settings.notification" size="20" aria-hidden="true" />
            </span>
            <div class="card-head-text">
              <h2 class="card-title">{{ t('settings.notification') }}</h2>
              <p class="card-sub">{{ t('settings.notificationDesc') }}</p>
            </div>
          </div>

          <div class="fields">
            <div class="field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.notificationsInApp') }}</span>
                <span class="field-desc">{{ t('settings.notificationsInAppDesc') }}</span>
              </div>
              <BSwitch
                :checked="user.preferences.notificationsInApp !== false"
                :aria-label="t('settings.notificationsInApp')"
                @change="set('notificationsInApp', $event)"
              />
            </div>
            <div v-if="!isGuestUser()" class="field community-chat-notification-field">
              <CommunityChatNotificationSettingsPanel />
            </div>
            <div class="field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.notificationsEmail') }}</span>
                <span class="field-desc">{{ t('settings.notificationsEmailDesc') }}</span>
              </div>
              <BSwitch
                :checked="user.preferences.notificationsEmail !== false"
                :aria-label="t('settings.notificationsEmail')"
                @change="set('notificationsEmail', $event)"
              />
            </div>
            <div class="field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.notificationsBrowser') }}</span>
                <span class="field-desc">{{ t('settings.notificationsBrowserDesc') }}</span>
              </div>
              <BSwitch
                :checked="user.preferences.notificationsBrowser === true"
                :aria-label="t('settings.notificationsBrowser')"
                @change="setBrowserNotifications"
              />
            </div>
            <div class="field notification-dnd-field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.notificationsDnd') }}</span>
                <span class="field-desc">{{ t('settings.notificationsDndDesc') }}</span>
              </div>
              <div class="notification-dnd-controls">
                <BTimePicker
                  class="notification-dnd-time"
                  :value="String(user.preferences.notificationsDndStart || '22:00')"
                  :aria-label="t('settings.notificationsDndStart')"
                  @change="setNotificationTime('notificationsDndStart', $event, '22:00')"
                />
                <span>—</span>
                <BTimePicker
                  class="notification-dnd-time"
                  :value="String(user.preferences.notificationsDndEnd || '08:00')"
                  :aria-label="t('settings.notificationsDndEnd')"
                  @change="setNotificationTime('notificationsDndEnd', $event, '08:00')"
                />
                <BSwitch
                  :checked="user.preferences.notificationsDnd === true"
                  :aria-label="t('settings.notificationsDnd')"
                  @change="setDnd"
                />
              </div>
            </div>
            <div class="field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.weeklyReport') }}</span>
                <span class="field-desc">{{ t('settings.weeklyReportDesc') }}</span>
              </div>
              <BSwitch
                :checked="user.preferences.weeklyReport !== false"
                :aria-label="t('settings.weeklyReport')"
                @change="set('weeklyReport', $event)"
              />
            </div>

            <div class="field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.notifyLevelUp') }}</span>
                <span class="field-desc">{{ t('settings.notifyLevelUpDesc') }}</span>
              </div>
              <BSwitch
                :checked="user.preferences.notifyLevelUp !== false"
                :aria-label="t('settings.notifyLevelUp')"
                @change="set('notifyLevelUp', $event)"
              />
            </div>

            <div class="field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.notifyOpinionReply') }}</span>
                <span class="field-desc">{{ t('settings.notifyOpinionReplyDesc') }}</span>
              </div>
              <BSwitch
                :checked="user.preferences.notifyOpinionReply !== false"
                :aria-label="t('settings.notifyOpinionReply')"
                @change="set('notifyOpinionReply', $event)"
              />
            </div>

            <div class="field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.notifyFeatureRequest') }}</span>
                <span class="field-desc">{{ t('settings.notifyFeatureRequestDesc') }}</span>
              </div>
              <BSwitch
                :checked="user.preferences.notifyFeatureRequest !== false"
                :aria-label="t('settings.notifyFeatureRequest')"
                @change="set('notifyFeatureRequest', $event)"
              />
            </div>

            <div class="field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.notifyStreakRisk') }}</span>
                <span class="field-desc">{{ t('settings.notifyStreakRiskDesc') }}</span>
              </div>
              <BSwitch
                :checked="(user.preferences as any).notifyStreakRisk !== false"
                :aria-label="t('settings.notifyStreakRisk')"
                @change="set('notifyStreakRisk', $event)"
              />
            </div>
          </div>
        </section>

        <!-- 账号与安全(登录用户可见) -->
        <section v-if="!isGuestUser() && sectionVisible('account')" class="settings-card" id="set-account">
          <div v-if="!isMobileSubPage" class="card-head">
            <span class="card-icon card-icon--general">
              <SvgIcon :src="icon.settings.account" size="20" aria-hidden="true" />
            </span>
            <div class="card-head-text">
              <h2 class="card-title">{{ t('settings.accountSecurityTitle') }}</h2>
              <p class="card-sub">{{ t('settings.accountSecurityDesc') }}</p>
            </div>
          </div>
          <div class="fields">
            <AccountSecurity />
          </div>
        </section>

        <!-- AI 用量只有一个总入口；额度、明细和规则在独立页呈现，避免设置长页被账本撑高。 -->
        <section v-if="sectionVisible('ai')" class="settings-card settings-card--ai-entry" id="set-ai">
          <BButton
            class="ai-usage-entry"
            :aria-label="t('settings.ai.entryTitle')"
            v-click-log="{ module: 'AI 用量与计费', operation: '打开页面【设置】' }"
            @click="openAiUsage"
          >
            <span class="card-icon card-icon--appearance" aria-hidden="true">
              <SvgIcon :src="icon.settings.ai" size="20" />
            </span>
            <span class="ai-usage-entry__copy">
              <strong>{{ t('settings.ai.entryTitle') }}</strong>
              <span>{{ t('settings.ai.entryDescription') }}</span>
            </span>
            <SvgIcon class="ai-usage-entry__arrow" :src="icon.arrow_right" size="16" aria-hidden="true" />
          </BButton>
        </section>

        <!-- 快速收藏(bookmarklet) -->
        <section v-if="!bookmark.isMobile" class="settings-card" id="set-quicksave">
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
              <!-- javascript: 书签的图标由浏览器固定为通用图标；这里不放文字图标，避免它被写进书签名称。 -->
              <a
                ref="bmRef"
                class="qs-bookmarklet"
                draggable="true"
                @click.prevent="onBmClick"
                v-text="t('settings.quickSaveBtn')"
              ></a>
            </div>
          </div>
        </section>

        <!-- 数据导出 / 备份 -->
        <section v-if="!bookmark.isMobile" class="settings-card" id="set-export">
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
        </section>

        <!-- 隐私与协议 -->
        <section v-if="sectionVisible('privacy')" class="settings-card" id="set-privacy">
          <div v-if="!isMobileSubPage" class="card-head">
            <span class="card-icon card-icon--general">
              <SvgIcon :src="icon.settings.privacy" size="20" aria-hidden="true" />
            </span>
            <div class="card-head-text">
              <h2 class="card-title">{{ t('settings.privacyTitle') }}</h2>
              <p class="card-sub">{{ t('settings.privacyDesc') }}</p>
            </div>
          </div>
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
        </section>

        <!-- 低频开发者资源放在设置页脚，不占普通用户的产品导航。 -->
        <div v-if="!bookmark.isMobile" class="settings-foot">
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
  import { computed, ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import { bookmarkStore, useUserStore } from '@/store';
  import { updatePreference, isGuestUser } from '@/utils/savePreference';
  import { scrollIntoContainer } from '@/utils/zoom';
  import { recordOperation } from '@/api/commonApi.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { apiBasePost } from '@/http/request';
  import AccountSecurity from '@/components/settings/AccountSecurity.vue';
  import CommunityChatNotificationSettingsPanel from '@/components/communityChat/CommunityChatNotificationSettingsPanel.vue';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';
  import BSwitch from '@/components/base/BasicComponents/BSwitch.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BTimePicker from '@/components/base/BasicComponents/BTimePicker.vue';
  import BUpload from '@/components/base/BasicComponents/BUpload.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import { getGlobalShortcutKeys, getGlobalShortcutLabel } from '@/config/keyboardShortcuts.ts';
  import { usePwaInstall } from '@/composables/usePwaInstall';
  import {
    isLightNoteAndroidApp,
    postAndroidOpenLegalDocument,
    type AndroidLegalDocument,
  } from '@/utils/androidBridge.ts';
  import {
    DEFAULT_NOTE_PARENT_OPEN_MODE,
    getHomePagePreference,
    getMobileHomePreference,
  } from '@/utils/preferences.ts';
  import { APP_FILING_NUMBER, MIIT_QUERY_URL } from '@/config/androidRelease.ts';
  import SettingsMobileIndex, { type SettingsIndexRow } from './SettingsMobileIndex.vue';
  import {
    SETTINGS_SECTION_ANCHOR,
    countEnabledNotifications,
    isSettingsSectionVisible,
    parseSettingsSection,
    visibleSettingsSections,
    type SettingsEnv,
    type SettingsIndexSectionId,
  } from './settingsRegistry';

  const { t } = useI18n();
  const router = useRouter();
  const route = useRoute();
  const bookmark = bookmarkStore();
  const isAndroidApp = isLightNoteAndroidApp();

  // 设置页锚点导航:区块多、页面长,顶部 sticky 锚点条一键跳转。游客隐藏「账号与安全」锚点,与该区块 v-if 一致。
  const anchors = computed(() => {
    const list = [
      { id: 'set-appearance', label: t('settings.appearance') },
      { id: 'set-general', label: t('settings.general') },
    ];
    if (!isAndroidApp) list.push({ id: 'set-install', label: t('settings.installTitle') });
    if (!bookmark.isMobile) list.push({ id: 'set-shortcuts', label: t('settings.shortcutsTitle') });
    list.push({ id: 'set-notification', label: t('settings.notification') });
    if (!isGuestUser()) list.push({ id: 'set-account', label: '账号与安全' });
    if (!isGuestUser()) list.push({ id: 'set-ai', label: t('settings.ai.title') });
    if (!bookmark.isMobile) {
      list.push(
        { id: 'set-quicksave', label: t('settings.quickSaveTitle') },
        { id: 'set-export', label: t('settings.exportTitle') },
      );
    }
    list.push({ id: 'set-privacy', label: t('settings.privacyTitle') });
    return list;
  });
  /*
   * 移动端「目录 + 子页」状态机。
   *
   * 唯一状态来源是 route.query.section —— 不另存 expandedSection 之类的组件状态,
   * 否则会出现「URL 指向通知、组件却展开 AI」。这么定下来后刷新、深链接、
   * 浏览器/Android 系统返回全都免费拿到,不必自己维护一套历史。
   *
   *   无 section        → 紧凑目录(SettingsMobileIndex)
   *   有合法 section    → 只渲染对应那一个区块
   *
   * 桌面端不参与:mobileSection 恒为 null,继续渲染完整长页 + 锚点。
   */
  const settingsEnv = computed<SettingsEnv>(() => ({ isGuest: isGuestUser() }));
  const mobileSection = computed(() =>
    bookmark.isMobile ? parseSettingsSection(route.query.section, settingsEnv.value) : null,
  );
  const isMobileSubPage = computed(() => mobileSection.value !== null);
  const showMobileIndex = computed(() => bookmark.isMobile && mobileSection.value === null);
  /** 桌面端渲染全部区块;移动端只渲染当前子页那一个 */
  function sectionVisible(id: SettingsIndexSectionId) {
    if (!isSettingsSectionVisible(id, settingsEnv.value)) return false;
    return !bookmark.isMobile || mobileSection.value === id;
  }

  function scrollToSection(id: string, behavior: ScrollBehavior = 'smooth') {
    const page = pageRef.value;
    const el = document.getElementById(id);
    if (!page || !el) return;
    // 固定框子路由里 scrollIntoView 定位不到 .settings-page;统一用 scrollIntoContainer(内部已换算界面缩放 zoom,见 utils/zoom.ts)
    scrollIntoContainer(page, el, 16, behavior);
  }

  // scrollspy:高亮当前滚动到的区块。root 必须是滚动容器 .settings-page(子路由在固定框内滚动,非 window)。
  const activeAnchor = ref('set-appearance');
  const pageRef = ref<HTMLElement | null>(null);
  let anchorSpy: IntersectionObserver | null = null;
  let deepLinkLayoutObserver: ResizeObserver | null = null;
  let deepLinkStopTimer = 0;
  let deepLinkTargetAnchor = '';
  const deepLinkRetryTimers = new Set<number>();

  function stopDeepLinkAlignment() {
    deepLinkLayoutObserver?.disconnect();
    deepLinkLayoutObserver = null;
    window.clearTimeout(deepLinkStopTimer);
    deepLinkStopTimer = 0;
    deepLinkRetryTimers.forEach((timer) => window.clearTimeout(timer));
    deepLinkRetryTimers.clear();
    deepLinkTargetAnchor = '';
  }

  /**
   * 深链接必须等异步设置项（例如设备列表）稳定后仍能落到目标区块。
   * 这里以 section→anchor 映射为唯一事实源，并观察整张设置正文的尺寸变化，
   * 因而适用于所有设置分类，不针对 AI 用量写死偏移量或延迟。
   */
  function alignDesktopDeepLink(rawSection: unknown) {
    if (bookmark.isMobile) return;
    const section = parseSettingsSection(rawSection, settingsEnv.value);
    if (!section) return;
    const anchor = SETTINGS_SECTION_ANCHOR[section];
    stopDeepLinkAlignment();
    deepLinkTargetAnchor = anchor;
    activeAnchor.value = anchor;
    nextTick(() => {
      const align = () => {
        activeAnchor.value = anchor;
        scrollToSection(anchor, 'auto');
      };
      align();
      const body = pageRef.value?.querySelector<HTMLElement>('.settings-body');
      if (body && typeof ResizeObserver !== 'undefined') {
        deepLinkLayoutObserver = new ResizeObserver(align);
        deepLinkLayoutObserver.observe(body);
      }
      // ResizeObserver 覆盖布局变化；几个有界重试兼容旧 WebView 以及只改内容、不改尺寸的异步组件。
      for (const delay of [160, 480, 960, 1600, 3000, 5000, 8000]) {
        const timer = window.setTimeout(() => {
          deepLinkRetryTimers.delete(timer);
          align();
        }, delay);
        deepLinkRetryTimers.add(timer);
      }
      // 设备列表等设置项可能依赖慢网络；保持有界观察，用户开始操作时会立即取消。
      deepLinkStopTimer = window.setTimeout(stopDeepLinkAlignment, 10_000);
    });
  }
  // 滚到容器底部时强制高亮最后一项:底部几个区块因判定带够不到,IntersectionObserver 永远轮不到(scrollspy 通病)。
  // 只在到底时改高亮、不碰滚动,故不会造成"点多次"(那是 zoom 定位偏移导致的,已修)。
  // scrollTop/clientHeight/scrollHeight 均为布局坐标、不受界面缩放 zoom 影响,此处无需换算。
  const onPageScroll = () => {
    const page = pageRef.value;
    if (!page) return;
    if (deepLinkTargetAnchor) {
      activeAnchor.value = deepLinkTargetAnchor;
      return;
    }
    if (page.scrollTop + page.clientHeight >= page.scrollHeight - 4) {
      activeAnchor.value = anchors.value[anchors.value.length - 1].id;
    }
  };
  // ScrollSpy 和锚点条只为桌面长页服务:移动端已按分类拆成子页,一页只有一个区块,
  // 既没有锚点条可高亮,也不该为此挂观察器和滚动监听。
  onMounted(() => {
    if (bookmark.isMobile) return;
    anchorSpy = new IntersectionObserver(
      (entries) => {
        if (deepLinkTargetAnchor) {
          activeAnchor.value = deepLinkTargetAnchor;
          return;
        }
        for (const e of entries) {
          if (e.isIntersecting) activeAnchor.value = (e.target as HTMLElement).id;
        }
      },
      { root: pageRef.value, rootMargin: '-12% 0px -78% 0px', threshold: 0 },
    );
    anchors.value.forEach((a) => {
      const el = document.getElementById(a.id);
      if (el) anchorSpy!.observe(el);
    });
    pageRef.value?.addEventListener('scroll', onPageScroll, { passive: true });
    pageRef.value?.addEventListener('wheel', stopDeepLinkAlignment, { passive: true });
    pageRef.value?.addEventListener('pointerdown', stopDeepLinkAlignment, { passive: true });
    alignDesktopDeepLink(route.query.section);
  });
  watch(
    () => route.query.section,
    (section, previous) => {
      if (section !== previous) alignDesktopDeepLink(section);
    },
  );
  onBeforeUnmount(() => {
    anchorSpy?.disconnect();
    stopDeepLinkAlignment();
    pageRef.value?.removeEventListener('scroll', onPageScroll);
    pageRef.value?.removeEventListener('wheel', stopDeepLinkAlignment);
    pageRef.value?.removeEventListener('pointerdown', stopDeepLinkAlignment);
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
      router.push('/ai-usage');
      return;
    }
    enteredFromIndex = true;
    router.push({ path: '/settings', query: { section: id } });
  }

  function openAiUsage() {
    router.push('/ai-usage');
  }

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
  const user = useUserStore();
  // 移动端按移动语义解析：偏好是 resourceCenter 等移动端不支持的值时，要落到实际生效的那一项
  const selectedHomePage = computed(() =>
    bookmark.isMobile ? getMobileHomePreference(user.preferences) : getHomePagePreference(user.preferences),
  );
  const selectedNoteParentOpenMode = computed(
    () => user.preferences.noteParentOpenMode || DEFAULT_NOTE_PARENT_OPEN_MODE,
  );

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
  const notificationSummary = computed(() => {
    const prefs = user.preferences as Record<string, unknown>;
    const base = t('settings.notificationSummary', countEnabledNotifications(prefs));
    return prefs.notificationsDnd === true ? `${base} · ${t('settings.notificationSummaryDnd')}` : base;
  });

  const aiSummary = computed(() => t('settings.ai.summary'));
  const { canPrompt, installState, isStandalone, openGuide } = usePwaInstall();

  /*
   * 移动端目录行。标题用 mobileIndex.* 那套更完整的名字(目录一行只放一个分类、有横向空间),
   * 桌面锚点继续用短标题。summary 全部来自上面的实时 computed。
   */
  const mobileIndexRows = computed<SettingsIndexRow[]>(() => {
    const copy: Record<SettingsIndexSectionId, { title: string; summary: string }> = {
      appearance: { title: t('settings.mobileIndex.appearance'), summary: appearanceSummary.value },
      general: { title: t('settings.mobileIndex.general'), summary: t('settings.mobileIndex.generalSummary') },
      notification: { title: t('settings.notification'), summary: notificationSummary.value },
      ai: { title: t('settings.ai.title'), summary: aiSummary.value },
      account: { title: t('settings.accountSecurityTitle'), summary: t('settings.accountSecurityDesc') },
      privacy: { title: t('settings.privacyTitle'), summary: t('settings.mobileIndex.privacySummary') },
    };
    const icons: Record<SettingsIndexSectionId, string> = {
      appearance: icon.settings.appearance,
      general: icon.settings.general,
      notification: icon.settings.notification,
      ai: icon.settings.ai,
      account: icon.settings.account,
      privacy: icon.settings.privacy,
    };
    return visibleSettingsSections(settingsEnv.value).map((meta) => ({
      id: meta.id,
      group: meta.group,
      tone: meta.tone,
      icon: icons[meta.id],
      title: copy[meta.id].title,
      summary: copy[meta.id].summary,
    }));
  });

  /** 子页顶栏标题:与目录行同源，避免两处各写一份而说法不一致 */
  const currentSectionTitle = computed(() => {
    const current = mobileSection.value;
    if (!current) return t('settings.title');
    return mobileIndexRows.value.find((row) => row.id === current)?.title ?? t('settings.title');
  });
  const pwaStateLabel = computed(() =>
    installState.value === 'installed'
      ? t('pwa.installed')
      : installState.value === 'prompt-ready'
        ? t('pwa.directAvailable')
        : t('pwa.manualAvailable'),
  );

  const shortcutItems = computed(() => [
    {
      id: 'globalSearch',
      title: t('settings.shortcutSearch'),
      description: t('settings.shortcutSearchDesc'),
      keys: getGlobalShortcutKeys('globalSearch'),
      label: getGlobalShortcutLabel('globalSearch'),
    },
  ]);

  function openLegalDocument(fileName: AndroidLegalDocument) {
    if (isAndroidApp && postAndroidOpenLegalDocument(fileName)) return;
    window.open(`/legal/${fileName}`, '_blank', 'noopener,noreferrer');
  }

  function openDeveloperToolbox() {
    window.open('https://boluo66.top/toolkit/', '_blank', 'noopener,noreferrer');
    recordOperation(OPERATION_LOG_MAP.navigation.toolkit);
  }

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
        recordOperation({
          ...OPERATION_LOG_MAP.settings.exportData,
          operation: `导出个人数据成功【书签${c.bookmarks || 0}/笔记${c.notes || 0}/文件${c.files || 0}】`,
        });
      } else {
        message.info(res?.msg || t('settings.exportFail'));
      }
    } catch {
      message.info(t('settings.exportFail'));
    } finally {
      exporting.value = false;
    }
  }

  // 元数据恢复先做只读预检，再由用户确认写入；文件本体和 AI 数据只导出、不承诺恢复。
  const importing = ref(false);
  async function runMetadataImport(data: any) {
    importing.value = true;
    try {
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
        recordOperation({
          module: '设置',
          operation: `恢复元数据(书签+${s.bookmarks?.added || 0}、笔记+${s.notes?.added || 0})`,
        });
      } else {
        message.info(res?.msg || t('settings.importFail'));
      }
    } catch {
      message.info(t('settings.importFail'));
    } finally {
      importing.value = false;
    }
  }

  async function onImportFiles(files: File[]) {
    const file = files?.[0];
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
      const res = await apiBasePost('/api/user/importData', { data, mode: 'preflight' });
      if (res?.status !== 200 || !res.data?.canImport) {
        message.info(res?.msg || t('settings.importFail'));
        return;
      }
      const preview = res.data;
      importing.value = false;
      Alert.alert({
        title: t('settings.importConfirmTitle'),
        content: t('settings.importConfirmContent', {
          b: preview.willRestore?.bookmarks || 0,
          n: preview.willRestore?.notes || 0,
          t: preview.willRestore?.tags || 0,
          f: preview.exportOnly?.files || 0,
          ai: preview.exportOnly?.aiConversations || 0,
        }),
        onOk: () => runMetadataImport(data),
      });
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
  // 同一个偏好值 workbench：桌面端是「工作台」，移动端是「今日」
  const homeOpts = computed(() => {
    const options = [
      { v: 'workbench', label: bookmark.isMobile ? t('settings.home.today') : t('settings.home.workbench') },
      { v: 'resourceCenter', label: t('settings.home.resourceCenter') },
      { v: 'bookmark', label: t('settings.home.bookmark') },
      { v: 'noteLibrary', label: t('settings.home.noteLibrary') },
      { v: 'cloudSpace', label: t('settings.home.cloudSpace') },
    ];
    // 资源中心在移动端是二级页面，不能作为默认首页
    return bookmark.isMobile ? options.filter((option) => option.v !== 'resourceCenter') : options;
  });
  const bookmarkOpenOpts = computed(() => [
    { v: 'newTab', label: t('settings.bookmarkOpenNew') },
    { v: 'current', label: t('settings.bookmarkOpenCurrent') },
  ]);
  const todoViewOpts = computed(() => [
    { v: 'list', label: t('inbox.todoViewList') },
    { v: 'agenda', label: t('inbox.todoViewAgenda') },
    { v: 'calendar', label: t('inbox.todoViewCalendar') },
    { v: 'matrix', label: t('inbox.todoViewMatrix') },
  ]);
  const viewOpts = computed(() => [
    { v: 'card', label: t('settings.cardView') },
    { v: 'list', label: t('settings.listView') },
  ]);
  const noteParentOpenOpts = computed(() => [
    { v: 'children', label: t('settings.noteParentOpenChildren') },
    { v: 'preview', label: t('settings.noteParentOpenPreview') },
  ]);
  const resourceViewOpts = computed(() => [
    { v: 'card', label: t('resourceCenter.view.card') },
    { v: 'list', label: t('resourceCenter.view.list') },
  ]);
  const tagViewOpts = computed(() => [
    { v: 'card', label: t('tagGraph.viewMode.card') },
    { v: 'graph', label: t('tagGraph.viewMode.graph') },
  ]);
  const cloudViewOpts = computed(() => [
    { v: 'card', label: t('settings.cardView') },
    { v: 'table', label: t('settings.tableView') },
  ]);
  const resourceSortOpts = computed(() => [
    { v: 'relevance', label: t('resourceCenter.sort.relevance') },
    { v: 'updated', label: t('resourceCenter.sort.updated') },
    { v: 'name', label: t('resourceCenter.sort.name') },
  ]);

  async function set(key: string, value: string | boolean | number) {
    if ((user.preferences as any)[key] === value) return;
    try {
      await updatePreference({ [key]: value });
      if (!isGuestUser()) recordOperation({ module: '设置', operation: `修改偏好【${key}=${value}】` });
    } catch {
      message.warning(t('settings.saveFailed'));
    }
  }

  async function setBrowserNotifications(value: boolean) {
    if (value) {
      if (typeof Notification === 'undefined') {
        message.warning(t('settings.notificationsBrowserUnsupported'));
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        message.warning(t('settings.notificationsBrowserDenied'));
        return;
      }
    }
    await set('notificationsBrowser', value);
  }

  async function setDnd(value: boolean) {
    try {
      await updatePreference({
        notificationsDnd: value,
        notificationsTimezoneOffset: new Date().getTimezoneOffset(),
      });
    } catch {
      message.warning(t('settings.saveFailed'));
    }
  }

  async function setNotificationTime(
    key: 'notificationsDndStart' | 'notificationsDndEnd',
    value: unknown,
    fallback: string,
  ) {
    const normalized = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || '')) ? String(value) : fallback;
    try {
      await updatePreference({
        [key]: normalized,
        notificationsTimezoneOffset: new Date().getTimezoneOffset(),
      });
    } catch {
      message.warning(t('settings.saveFailed'));
    }
  }

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

<style scoped lang="less">
  .notification-dnd-controls {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    min-width: min(100%, 330px);
  }
  .notification-dnd-time :deep(.b-time-trigger) {
    width: 112px;
    min-width: 112px;
  }
  .community-chat-notification-field {
    display: block;
  }
  @media (max-width: 600px) {
    .notification-dnd-field {
      align-items: stretch;
      flex-direction: column;
    }
    .notification-dnd-controls {
      width: 100%;
      justify-content: flex-start;
    }
  }
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

  /* 侧边竖排锚点导航:PC 下浮在居中内容(max-width 680)左侧空白区,不占内容宽度、不遮挡任何元素;窄屏无空间则隐藏。 */
  .settings-anchors {
    position: fixed;
    top: 50%;
    left: 50%;
    /* 用「视口中心 + transform 偏移」定位到居中内容(max-width 680)左侧空白:
       340(内容半宽) + 132(自身宽) + 16(间距) = 488。刻意避开 100vw——它在界面缩放(<html> zoom)下取值
       会与 fixed 的 zoom 二次缩放叠加,导致锚点栏右移遮住内容;而视口中心与内容在同一 zoom 上下文等比缩放,
       相对位置恒定,放大/缩小都不遮元素。zoom=1 时与原 calc 结果等价。 */
    transform: translate(-488px, -50%);
    z-index: 6;
    display: flex;
    flex-direction: column;
    gap: 3px;
    width: 132px;
    max-height: 74vh;
    overflow-y: auto;
    scrollbar-width: none;
  }
  .settings-anchors::-webkit-scrollbar {
    display: none;
  }
  .anchor-chip {
    text-align: left;
    padding: 7px 12px;
    border-radius: 8px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--desc-color);
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
    transition:
      color 0.15s,
      background 0.15s;
  }
  .anchor-chip:hover {
    color: var(--text-color);
    background: color-mix(in srgb, var(--card-border-color) 28%, transparent);
  }
  .anchor-chip.active {
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 10%, transparent);
    font-weight: 600;
  }
  /* 窄屏(容器两侧无足够空间)隐藏侧边导航,内容照常滚动 */
  @media (max-width: 1040px) {
    .settings-anchors {
      display: none;
    }
  }
  /* 点击锚点定位时略留顶部空隙 */
  .settings-card {
    scroll-margin-top: 16px;
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
  .card-icon--shortcuts {
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 12%, transparent);
  }
  .card-icon--install {
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 12%, transparent);
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

  /* ---- 移动端子页顶栏 ---- */
  /* 返回键 + 当前分类名。sticky 让它在长子页(通知有十来项)里始终可达,
     不必滚回顶部才能返回。left/right 负边距抵掉 .settings-page 的左右内边距,
     背景才能通栏,不然滚动内容会从两侧漏出来。 */
  .settings-subhead {
    position: sticky;
    top: -28px;
    z-index: 6;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 8px;
    margin: -28px -24px 0;
    padding: 10px 16px;
    background: var(--background-color);
    border-bottom: 1px solid color-mix(in srgb, var(--card-border-color) 42%, transparent);
  }
  .settings-subhead-title {
    margin: 0;
    /* 标题居中,同时给右侧留出与返回键等宽的占位,避免长标题把自己推歪 */
    padding-right: 34px;
    text-align: center;
    font-size: 17px;
    font-weight: 700;
  }
  .settings-container .settings-subhead-back {
    width: 34px;
    height: 34px;
    padding: 0;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: var(--desc-color);
  }
  .settings-container .settings-subhead-back:hover {
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 8%, transparent);
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

  .settings-card--ai-entry {
    padding: 0;
    overflow: hidden;
  }

  .settings-card--ai-entry .ai-usage-entry {
    width: 100%;
    height: auto;
    min-height: 76px;
    justify-content: flex-start;
    gap: 12px;
    padding: 14px 16px;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--text-color);
    text-align: left;
    white-space: normal;
  }

  .settings-card--ai-entry .ai-usage-entry:hover {
    background: var(--primary-btn-bg-color);
  }

  .settings-card--ai-entry .ai-usage-entry:focus-visible {
    outline-offset: -2px;
  }

  .ai-usage-entry__copy {
    min-width: 0;
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .ai-usage-entry__copy strong {
    font-size: 14px;
    font-weight: 600;
  }

  .ai-usage-entry__copy > span {
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.4;
  }

  .ai-usage-entry__arrow {
    flex: 0 0 auto;
    color: var(--desc-color);
  }

  .pwa-settings-actions {
    flex: 0 0 auto;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .legal-document-link {
    flex: 0 0 auto;
    gap: 3px;
    height: 40px;
    padding: 0 0 0 12px;
    border: 0 !important;
    background: transparent !important;
    color: var(--primary-color) !important;
    font-size: 13px;
  }
  .legal-document-link:hover {
    opacity: 0.78;
  }

  /* App 备案号:号码本身即链接,与上方「查看全文」按钮同一视觉层级,但用等宽数字避免号码看起来歪 */
  .app-filing-link {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    height: 40px;
    padding: 0 0 0 12px;
    color: var(--primary-color);
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    text-decoration: none;
  }
  .app-filing-link:hover {
    opacity: 0.78;
  }

  .shortcut-keys {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .shortcut-key {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 34px;
    height: 30px;
    padding: 0 9px;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 78%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, var(--primary-color) 4%, var(--background-color));
    box-shadow: inset 0 -2px 0 color-mix(in srgb, var(--card-border-color) 45%, transparent);
    color: var(--text-color);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 12px;
    font-weight: 600;
    line-height: 1;
    box-sizing: border-box;
  }
  .shortcut-plus {
    color: var(--desc-color);
    font-size: 12px;
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
    .shortcut-keys {
      align-self: flex-start;
    }
    .pwa-settings-actions {
      justify-content: flex-start;
    }
    .field.legal-document-field {
      flex-direction: row;
      align-items: center;
      gap: 14px;
    }
  }

  /* ---- 移动端子页:分段控件铺满整行 ----
     子页里标签和选项本来就是竖排(见上面的 @container),选项那一行整条空着。
     桌面那套 chips 按文字宽、约 31px 高,搬到手机就是又窄又矮、手指难点。
     这里把 .seg 变成一条等分轨道:按钮平分整行,44px 高刚好到触控下限。
     只作用于移动端子页 —— 桌面是「标签在左、选项在右」,铺满会把字段拉散。 */
  .settings-body.is-mobile-sub {
    /* 显式移动子页结构；不能只依赖旧 WebView 不支持的 @container。 */
    .field {
      flex-direction: column;
      align-items: stretch;
      gap: 10px;
    }
    .field.legal-document-field {
      flex-direction: row;
      align-items: center;
      gap: 14px;
    }
    .shortcut-keys {
      align-self: flex-start;
    }
    .pwa-settings-actions {
      justify-content: flex-start;
    }

    /* 轨道底色:混 border 色而非某个表面变量,深浅两套主题下都稳定地「比卡片底突出一层」
       (浅色下 border 偏暗、深色下偏亮,方向都对)。
       权重必须留在 20% 以上 —— androidColorMixFallback 只把「中性色 + transparent」里
       ≥20% 的弱底色换成稳定 RGBA,更弱的直接回退成透明,APK 里整条轨道会消失
       (就是那个「卡片列表切换区域背景色没了」)。40% 正落在插件注释所说的灰槽档位。 */
    .seg {
      width: 100%;
      flex-wrap: wrap;
      gap: 4px;
      padding: 4px;
      border-radius: 14px;
      background: color-mix(in srgb, var(--card-border-color) 40%, transparent);
    }
    /* flex:1 让 2~3 项平分一行;min-width 保证 4 项(移动端默认首页)在 320px 下
       折成两行各自铺满,而不是硬挤一行把文字压断。只写布局、不碰颜色,
       选中态的实色紫底+白字继续由下面的 .active 规则决定。 */
    .seg-btn {
      flex: 1 1 auto;
      min-width: 76px;
      min-height: 44px;
      padding: 8px 12px;
      border-radius: 10px;
      font-size: 14px;
    }
    /* 4 项以上由模板显式添加类，不依赖 Chrome 105 才支持的 :has()。 */
    .seg.seg--two-column .seg-btn {
      flex-basis: calc(50% - 2px);
    }
    /* 未选中项在轨道里不需要自己的描边/底色;选中项因此成为轨道内唯一的实色块。
       用 :not(.active) 而不是覆盖再复原,避免把 .active 的渐变背景压掉。 */
    .seg-btn:not(.active) {
      border-color: transparent;
      background: transparent;
    }
    /* 手机没有真 hover:轨道内再做位移会让整条跟着抖 */
    .seg-btn:hover:not(.active) {
      transform: none;
      border-color: transparent;
      color: var(--text-color);
    }
    /* 桌面 chips 那颗大投影(y+10、blur 22)是给「浮在卡片上的独立按钮」用的,
       放进轨道后会漏到轨道外侧、每个字段都糊一片。这里收成贴合的一层。 */
    .seg-btn.active {
      box-shadow: 0 1px 3px color-mix(in srgb, var(--primary-color) 32%, transparent);
    }
  }

  .settings-foot {
    margin: 2px 0 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    font-size: 12px;
    color: var(--desc-color);
  }
  .settings-developer-link.b_btn {
    width: auto;
    height: auto;
    min-height: 28px;
    padding: 3px 7px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border: 1px solid transparent !important;
    border-radius: 7px;
    color: var(--desc-color);
    background: transparent !important;
    font-size: 12px;
    line-height: 18px;
  }
  .settings-developer-link.b_btn:hover,
  .settings-developer-link.b_btn:focus-visible {
    border-color: var(--card-border-color) !important;
    color: var(--primary-color);
    background: var(--menu-item-h-bg-color) !important;
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
    /* 顶栏的负边距必须跟着 .settings-page 的内边距走,否则通栏背景对不上 */
    .settings-subhead {
      top: -20px;
      margin: -20px -16px 0;
      padding: 10px 12px;
    }
  }
</style>
