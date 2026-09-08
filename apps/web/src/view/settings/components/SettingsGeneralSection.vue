<template>
  <div class="settings-section-stack" id="set-general"
    ><SettingsSectionCard :title="t('settingsRefine.opening')" :description="t('settingsRefine.openingDesc')"
      ><SettingsPreferenceField
        pref-key="dailyReviewEnabled"
        :label="t('growth.dailyReviewTitle')"
        :description="t('settings.dailyReviewDesc')"
        kind="switch"
        :default-value="true"
        v-if="!isGuestUser()"
        :disabled="Boolean(user.adminContext)" />
      <SettingsPreferenceField
        pref-key="homePage"
        :label="t('settings.defaultHome')"
        :description="t('settings.defaultHomeDesc')"
        kind="select"
        default-value="workbench"
        :options="homeOpts"
        v-if="!bookmark.isMobile && !isGuestUser()"
        :selected-value="selectedHomePage" />
      <SettingsPreferenceField
        pref-key="openBookmarkIn"
        :label="t('settings.bookmarkOpen')"
        :description="t('settings.bookmarkOpenDesc')"
        kind="choice"
        default-value="newTab"
        :options="bookmarkOpenOpts" />
      <SettingsPreferenceField
        pref-key="noteDirectEdit"
        :label="t('settings.noteDirectEdit')"
        :description="t('settings.noteDirectEditDesc')"
        kind="switch"
        :default-value="false"
        v-if="!bookmark.isMobile" />
      <SettingsPreferenceField
        pref-key="noteParentOpenMode"
        :label="t('settings.noteParentOpenMode')"
        :description="t('settings.noteParentOpenModeDesc')"
        kind="choice"
        default-value="children"
        :options="noteParentOpenOpts"
        v-if="!bookmark.isMobile"
        :selected-value="selectedNoteParentOpenMode" /></SettingsSectionCard
    ><SettingsSectionCard :title="t('settingsRefine.views')" :description="t('settingsRefine.viewsDesc')"
      ><SettingsPreferenceField
        pref-key="todoView"
        :label="t('settings.todoView')"
        :description="t('settings.todoViewDesc')"
        kind="select"
        default-value="list"
        :options="todoViewOpts" />
      <SettingsPreferenceField
        pref-key="noteViewMode"
        :label="t('settings.noteView')"
        :description="t('settings.noteViewDesc')"
        kind="choice"
        default-value="card"
        :options="viewOpts" />
      <SettingsPreferenceField
        pref-key="resourceView"
        :label="t('settings.resourceView')"
        :description="t('settings.resourceViewDesc')"
        kind="choice"
        default-value="card"
        :options="resourceViewOpts"
        v-if="!bookmark.isMobile" />
      <SettingsPreferenceField
        pref-key="resourceSort"
        :label="t('settings.resourceSort')"
        :description="t('settings.resourceSortDesc')"
        kind="select"
        default-value="relevance"
        :options="resourceSortOpts" />
      <SettingsPreferenceField
        pref-key="tagView"
        :label="t('settings.tagView')"
        :description="t('settings.tagViewDesc')"
        kind="choice"
        default-value="card"
        :options="tagViewOpts"
        v-if="!bookmark.isMobile" />
      <SettingsPreferenceField
        pref-key="cloudView"
        :label="t('settings.cloudView')"
        :description="t('settings.cloudViewDesc')"
        kind="choice"
        default-value="card"
        :options="cloudViewOpts" />
      <SettingsPreferenceField
        pref-key="hideEmptyTags"
        :label="t('settings.hideEmptyTags')"
        :description="t('settings.hideEmptyTagsDesc')"
        kind="switch"
        :default-value="false" /></SettingsSectionCard
    ><SettingsSectionCard
      v-if="!bookmark.isMobile"
      :title="t('settingsRefine.install')"
      :description="t('settings.installDesc')"
      id="set-install"
    >
      <div class="fields"
        ><div v-if="!isAndroidApp" class="field"
          ><div class="field-head"
            ><span class="field-label">{{ t('settings.installTitle') }}</span
            ><span class="field-desc">{{ pwaStateLabel }} · {{ t('settings.installStateDesc') }}</span></div
          ><BButton type="primary" :disabled="isStandalone" @click="openGuide('settings')">{{
            isStandalone ? t('pwa.installed') : t('pwa.install')
          }}</BButton></div
        >
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
      </div></SettingsSectionCard
    >
    <BCard as="section" v-if="!bookmark.isMobile" class="settings-card" id="set-quicksave">
      <div class="card-head">
        <span class="card-icon card-icon--appearance">
          <SvgIcon :src="icon.settings.shortcuts" size="20" aria-hidden="true" />
        </span>
        <div class="card-head-text">
          <h2 class="card-title">{{ t('settings.browserCaptureTitle') }}</h2>
          <p class="card-sub">{{ t('settings.browserCaptureDesc') }}</p>
        </div>
      </div>
      <div class="browser-capture-grid">
        <BCard class="browser-capture-card browser-capture-card--extension" variant="raised" padding="18px">
          <div class="browser-capture-card__head">
            <span class="browser-capture-card__logo">
              <img src="/favicon.svg?v=7" alt="" />
            </span>
            <div class="browser-capture-card__title">
              <h3>{{ t('settings.browserCaptureExtensionTitle') }}</h3>
              <span>{{ t('settings.browserCaptureExtensionDesktop') }}</span>
            </div>
            <BChip tone="pin" size="medium">{{ t('settings.browserCaptureExtensionBadge') }}</BChip>
          </div>
          <p class="browser-capture-card__desc">{{ t('settings.browserCaptureExtensionDesc') }}</p>
          <div class="browser-capture-card__features">
            <BChip tone="bookmark" size="medium">
              <SvgIcon :src="icon.resource.bookmark" size="13" aria-hidden="true" />
              {{ t('settings.browserCaptureExtensionBookmark') }}
            </BChip>
            <BChip tone="note" size="medium">
              <SvgIcon :src="icon.resource.note" size="13" aria-hidden="true" />
              {{ t('settings.browserCaptureExtensionNote') }}
            </BChip>
            <BChip tone="file" size="medium">
              <SvgIcon :src="icon.resource.file" size="13" aria-hidden="true" />
              {{ t('settings.browserCaptureExtensionFile') }}
            </BChip>
          </div>
          <div class="browser-capture-card__actions">
            <BButton type="primary" @click="openBrowserExtensionStore">
              <SvgIcon :src="icon.support.store" size="15" aria-hidden="true" />
              {{ t('settings.browserCaptureExtensionInstall') }}
            </BButton>
          </div>
        </BCard>

        <BCard class="browser-capture-card browser-capture-card--bookmarklet" variant="card" padding="18px">
          <div class="browser-capture-card__head">
            <span class="browser-capture-card__icon browser-capture-card__icon--bookmark">
              <SvgIcon :src="icon.resource.bookmark" size="21" aria-hidden="true" />
            </span>
            <div class="browser-capture-card__title">
              <h3>{{ t('settings.browserCaptureBookmarkletTitle') }}</h3>
              <span>{{ t('settings.quickSaveDrag') }}</span>
            </div>
            <BChip tone="neutral" size="medium">{{ t('settings.browserCaptureBookmarkletBadge') }}</BChip>
          </div>
          <p class="browser-capture-card__desc">{{ t('settings.browserCaptureBookmarkletDesc') }}</p>
          <p class="browser-capture-card__hint">{{ t('settings.quickSaveHint') }}</p>
          <!-- javascript: 书签必须使用原生可拖拽链接；BButton 无法写入浏览器书签栏。 -->
          <a
            ref="bmRef"
            class="qs-bookmarklet"
            draggable="true"
            @click.prevent="onBmClick"
            v-text="t('settings.quickSaveBtn')"
          ></a>
        </BCard>
      </div>
      <p class="browser-capture-privacy">
        <SvgIcon :src="icon.settings.privacy" size="15" aria-hidden="true" />
        {{ t('settings.browserCapturePrivacy') }}
      </p>
    </BCard></div
  >
</template>
<script setup lang="ts">
  import { computed, ref, watchEffect } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { bookmarkStore, useUserStore } from '@/store';
  import { isGuestUser } from '@/utils/savePreference';
  import { getHomePagePreference, getMobileHomePreference, DEFAULT_NOTE_PARENT_OPEN_MODE } from '@/utils/preferences';
  import { isLightNoteAndroidApp } from '@/utils/androidBridge';
  import { getGlobalShortcutKeys, getGlobalShortcutLabel } from '@/config/keyboardShortcuts';
  import { usePwaInstall } from '@/composables/usePwaInstall';
  import { openChromeWebStore } from '@/config/browserExtension.ts';
  import { recordOperation } from '@/api/commonApi';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import SettingsSectionCard from './SettingsSectionCard.vue';
  import SettingsPreferenceField from './SettingsPreferenceField.vue';
  const { t } = useI18n();
  const user = useUserStore(),
    bookmark = bookmarkStore();
  const isAndroidApp = isLightNoteAndroidApp();
  const { installState, isStandalone, openGuide } = usePwaInstall();
  const selectedHomePage = computed(() =>
    bookmark.isMobile ? getMobileHomePreference(user.preferences) : getHomePagePreference(user.preferences),
  );
  const selectedNoteParentOpenMode = computed(
    () => user.preferences.noteParentOpenMode || DEFAULT_NOTE_PARENT_OPEN_MODE,
  );

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

  function openBrowserExtensionStore() {
    if (!openChromeWebStore()) return;
    void recordOperation({ module: '浏览器收集', operation: '从设置打开 Chrome 扩展商店' });
  }

  // 快速收藏 bookmarklet:href 用当前站点 origin 动态生成,拖到书签栏后在任意网页点它即可
  const bmRef = ref<HTMLAnchorElement | null>(null);
  function onBmClick() {
    message.info(t('settings.quickSaveDragTip'));
  }
  watchEffect(() => {
    const o = window.location.origin;
    const code =
      "javascript:(function(){var o='" +
      o +
      "';var u=encodeURIComponent(location.href),t=encodeURIComponent(document.title||''),s='';try{s=encodeURIComponent((''+(window.getSelection?window.getSelection():'')).slice(0,500))}catch(e){}window.open(o+'/quick-save?u='+u+'&t='+t+'&d='+s,'ln_qs','width=480,height=680')})();";
    if (bmRef.value) bmRef.value.setAttribute('href', code);
  });

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
</script>
