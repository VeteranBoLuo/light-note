<template>
  <div class="settings-page" ref="pageRef">
    <div class="settings-container">
      <header class="settings-hero">
        <BButton class="settings-back" @click="goBack">
          <svg-icon :src="icon.arrow_left" size="16" />
          <span>{{ t('common.back') }}</span>
        </BButton>
        <h1 class="settings-title">{{ t('settings.title') }}</h1>
        <p class="settings-subtitle">{{ t('settings.subtitle') }}</p>
      </header>

      <nav class="settings-anchors">
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

      <div class="settings-body">
        <!-- 外观 -->
        <section class="settings-card" id="set-appearance">
          <div class="card-head">
            <span class="card-icon card-icon--appearance">
              <svg viewBox="0 0 24 24" width="20" height="20">
                <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6" />
                <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" />
              </svg>
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
              <div class="seg">
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
              <div class="seg">
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
              <div class="seg">
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
        <section class="settings-card" id="set-general">
          <div class="card-head">
            <span class="card-icon card-icon--general">
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
              >
                <path d="M5 7h14M5 12h14M5 17h14" />
                <circle cx="10" cy="7" r="1.7" fill="currentColor" stroke="none" />
                <circle cx="15" cy="12" r="1.7" fill="currentColor" stroke="none" />
                <circle cx="8" cy="17" r="1.7" fill="currentColor" stroke="none" />
              </svg>
            </span>
            <div class="card-head-text">
              <h2 class="card-title">{{ t('settings.general') }}</h2>
              <p class="card-sub">
                {{ t(bookmark.isMobile || isGuestUser() ? 'settings.generalDescMobile' : 'settings.generalDesc') }}
              </p>
            </div>
          </div>

          <div class="fields">
            <div v-if="!bookmark.isMobile && !isGuestUser()" class="field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.defaultHome') }}</span>
                <span class="field-desc">{{ t('settings.defaultHomeDesc') }}</span>
              </div>
              <div class="seg">
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
              <div class="seg">
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
                <span class="field-label">{{ t('settings.noteView') }}</span>
                <span class="field-desc">{{ t('settings.noteViewDesc') }}</span>
              </div>
              <div class="seg">
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

            <div class="field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.resourceView') }}</span>
                <span class="field-desc">{{ t('settings.resourceViewDesc') }}</span>
              </div>
              <div class="seg">
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
              <div class="seg">
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

            <div class="field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.tagView') }}</span>
                <span class="field-desc">{{ t('settings.tagViewDesc') }}</span>
              </div>
              <div class="seg">
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
              <div class="seg">
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
                <span class="field-label">{{ t('settings.tagManageView') }}</span>
                <span class="field-desc">{{ t('settings.tagManageViewDesc') }}</span>
              </div>
              <div class="seg">
                <BButton
                  v-for="o in tagManageViewOpts"
                  :key="o.v"
                  class="seg-btn"
                  :class="{ active: (user.preferences.tagManageView || 'card') === o.v }"
                  :type="(user.preferences.tagManageView || 'card') === o.v ? 'primary' : undefined"
                  :aria-pressed="(user.preferences.tagManageView || 'card') === o.v"
                  @click="set('tagManageView', o.v)"
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

        <!-- 安装到设备 -->
        <section v-if="!isAndroidApp" class="settings-card" id="set-install">
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
        <section class="settings-card" id="set-notification">
          <div class="card-head">
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
                <BInput
                  :value="String(user.preferences.notificationsDndStart || '22:00')"
                  type="time"
                  :aria-label="t('settings.notificationsDndStart')"
                  @change="setNotificationTime('notificationsDndStart', $event, '22:00')"
                />
                <span>—</span>
                <BInput
                  :value="String(user.preferences.notificationsDndEnd || '08:00')"
                  type="time"
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
        <section v-if="!isGuestUser()" class="settings-card" id="set-account">
          <div class="card-head">
            <span class="card-icon card-icon--general">
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
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
        <section class="settings-card" id="set-ai">
          <div class="card-head">
            <span class="card-icon card-icon--appearance">
              <SvgIcon :src="icon.settings.ai" size="20" aria-hidden="true" />
            </span>
            <div class="card-head-text">
              <h2 class="card-title">{{ t('settings.ai.title') }}</h2>
              <p class="card-sub">{{ t('settings.ai.description') }}</p>
            </div>
          </div>
          <div class="fields">
            <div class="field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.ai.style') }}</span>
                <span class="field-desc">{{ t('settings.ai.styleDescription') }}</span>
              </div>
              <div class="seg">
                <BButton
                  v-for="o in aiStyleOpts"
                  :key="o.v"
                  class="seg-btn"
                  :class="{ active: ((user.preferences as any).aiStyle || 'balanced') === o.v }"
                  :type="((user.preferences as any).aiStyle || 'balanced') === o.v ? 'primary' : undefined"
                  :aria-pressed="((user.preferences as any).aiStyle || 'balanced') === o.v"
                  @click="set('aiStyle', o.v)"
                >
                  {{ o.label }}
                </BButton>
              </div>
            </div>
            <div class="field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.ai.enabled') }}</span>
                <span class="field-desc">{{ t('settings.ai.enabledDescription') }}</span>
              </div>
              <BSwitch
                :checked="user.preferences.aiEnabled !== false"
                :aria-label="t('settings.ai.enabled')"
                @change="set('aiEnabled', $event)"
              />
            </div>
            <div class="field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.ai.defaultFullscreen') }}</span>
                <span class="field-desc">{{ t('settings.ai.defaultFullscreenDescription') }}</span>
              </div>
              <BSwitch
                :checked="user.preferences.aiDefaultFullscreen === true"
                :aria-label="t('settings.ai.defaultFullscreen')"
                @change="set('aiDefaultFullscreen', $event)"
              />
            </div>
            <div v-if="!isGuestUser()" class="field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.ai.cloudHistory') }}</span>
                <span class="field-desc">{{ t('settings.ai.cloudHistoryDescription') }}</span>
              </div>
              <BSwitch
                :checked="user.preferences.aiCloudHistory !== false"
                :aria-label="t('settings.ai.cloudHistory')"
                @change="set('aiCloudHistory', $event)"
              />
            </div>
            <div class="field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.ai.rememberDrawerWidth') }}</span>
                <span class="field-desc">{{ t('settings.ai.rememberDrawerWidthDescription') }}</span>
              </div>
              <BSwitch
                :checked="rememberDrawerWidth"
                :aria-label="t('settings.ai.rememberDrawerWidth')"
                @change="setRememberDrawerWidth"
              />
            </div>
            <div class="field">
              <div class="field-head">
                <span class="field-label">{{ t('settings.ai.quota') }}</span>
                <span class="field-desc">{{ t('settings.ai.quotaDescription') }}</span>
              </div>
              <span class="field-desc" style="color: var(--text-color)">{{ quotaText }}</span>
            </div>
          </div>
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
              <a ref="bmRef" class="qs-bookmarklet" draggable="true" @click.prevent="onBmClick"
                >🔖 {{ t('settings.quickSaveBtn') }}</a
              >
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
        <section class="settings-card" id="set-privacy">
          <div class="card-head">
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
          </div>
        </section>

        <p class="settings-foot">{{ t('settings.footHint') }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import { bookmarkStore, useUserStore } from '@/store';
  import { updatePreference, isGuestUser } from '@/utils/savePreference';
  import { scrollIntoContainer } from '@/utils/zoom';
  import { recordOperation } from '@/api/commonApi.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { apiBasePost } from '@/http/request';
  import AccountSecurity from '@/components/settings/AccountSecurity.vue';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';
  import BSwitch from '@/components/base/BasicComponents/BSwitch.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BUpload from '@/components/base/BasicComponents/BUpload.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import { getGlobalShortcutKeys, getGlobalShortcutLabel } from '@/config/keyboardShortcuts.ts';
  import { usePwaInstall } from '@/composables/usePwaInstall';
  import {
    isLightNoteAndroidApp,
    postAndroidOpenLegalDocument,
    type AndroidLegalDocument,
  } from '@/utils/androidBridge.ts';
  import { getHomePagePreference } from '@/utils/preferences.ts';

  const { t } = useI18n();
  const router = useRouter();
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
    list.push({ id: 'set-ai', label: 'AI 设置' });
    if (!bookmark.isMobile) {
      list.push(
        { id: 'set-quicksave', label: t('settings.quickSaveTitle') },
        { id: 'set-export', label: t('settings.exportTitle') },
      );
    }
    list.push({ id: 'set-privacy', label: t('settings.privacyTitle') });
    return list;
  });
  function scrollToSection(id: string) {
    const page = pageRef.value;
    const el = document.getElementById(id);
    if (!page || !el) return;
    // 固定框子路由里 scrollIntoView 定位不到 .settings-page;统一用 scrollIntoContainer(内部已换算界面缩放 zoom,见 utils/zoom.ts)
    scrollIntoContainer(page, el, 16);
  }

  // scrollspy:高亮当前滚动到的区块。root 必须是滚动容器 .settings-page(子路由在固定框内滚动,非 window)。
  const activeAnchor = ref('set-appearance');
  const pageRef = ref<HTMLElement | null>(null);
  let anchorSpy: IntersectionObserver | null = null;
  // 滚到容器底部时强制高亮最后一项:底部几个区块因判定带够不到,IntersectionObserver 永远轮不到(scrollspy 通病)。
  // 只在到底时改高亮、不碰滚动,故不会造成"点多次"(那是 zoom 定位偏移导致的,已修)。
  // scrollTop/clientHeight/scrollHeight 均为布局坐标、不受界面缩放 zoom 影响,此处无需换算。
  const onPageScroll = () => {
    const page = pageRef.value;
    if (!page) return;
    if (page.scrollTop + page.clientHeight >= page.scrollHeight - 4) {
      activeAnchor.value = anchors.value[anchors.value.length - 1].id;
    }
  };
  onMounted(() => {
    anchorSpy = new IntersectionObserver(
      (entries) => {
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
  });
  onBeforeUnmount(() => {
    anchorSpy?.disconnect();
    pageRef.value?.removeEventListener('scroll', onPageScroll);
  });
  const user = useUserStore();
  const selectedHomePage = computed(() => getHomePagePreference(user.preferences));
  const { canPrompt, installState, isStandalone, openGuide } = usePwaInstall();
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
    {
      id: 'aiAssistant',
      title: t('settings.shortcutAi'),
      description: t('settings.shortcutAiDesc'),
      keys: getGlobalShortcutKeys('aiAssistant'),
      label: getGlobalShortcutLabel('aiAssistant'),
    },
  ]);

  function openLegalDocument(fileName: AndroidLegalDocument) {
    if (isAndroidApp && postAndroidOpenLegalDocument(fileName)) return;
    window.open(`/legal/${fileName}`, '_blank', 'noopener,noreferrer');
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
  const homeOpts = computed(() => [
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
  const cloudViewOpts = computed(() => [
    { v: 'card', label: t('settings.cardView') },
    { v: 'table', label: t('settings.tableView') },
  ]);
  const tagManageViewOpts = computed(() => [
    { v: 'card', label: t('settings.cardView') },
    { v: 'list', label: t('settings.listView') },
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

  // 记住 AI 抽屉宽度:纯本地开关(抽屉宽度是设备相关偏好,不入账号 preferences、不跨设备同步)
  const REMEMBER_DRAWER_FLAG = 'light-note:ai-remember-drawer-width';
  const rememberDrawerWidth = ref(false);
  try {
    rememberDrawerWidth.value = localStorage.getItem(REMEMBER_DRAWER_FLAG) === 'true';
  } catch {}
  function setRememberDrawerWidth(value: boolean) {
    rememberDrawerWidth.value = value;
    try {
      localStorage.setItem(REMEMBER_DRAWER_FLAG, String(value));
      if (!value) localStorage.removeItem('light-note:ai-drawer-width');
    } catch {}
  }

  // AI 回答风格(映射后端 temperature:严谨0.3/平衡1.0/发散1.5)
  const aiStyleOpts = computed(() => [
    { v: 'strict', label: t('settings.ai.styleStrict') },
    { v: 'balanced', label: t('settings.ai.styleBalanced') },
    { v: 'creative', label: t('settings.ai.styleCreative') },
  ]);

  // 今日 AI 额度
  const quotaText = ref(t('settings.ai.quotaLoading'));
  function fmtTokens(n: number) {
    if (!Number.isFinite(n)) return '—';
    return n >= 10000 ? `${(n / 10000).toFixed(n % 10000 === 0 ? 0 : 1)}万` : String(n);
  }
  onMounted(async () => {
    try {
      const res = await apiBasePost('/api/chat/aiQuota', {});
      const d: any = res?.data;
      if (d?.exempt) quotaText.value = t('settings.ai.quotaUnlimited');
      else if (d && Number.isFinite(d.quota))
        quotaText.value = t('settings.ai.quotaUsage', { used: fmtTokens(d.used), quota: fmtTokens(d.quota) });
      else quotaText.value = '—';
    } catch {
      quotaText.value = '—';
    }
  });

  function goBack() {
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
  .notification-dnd-controls :deep(.b-input) {
    width: 112px;
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
