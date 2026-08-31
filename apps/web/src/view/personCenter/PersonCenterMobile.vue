<template>
  <CommonContainer
    :title="$t('personCenter.title')"
    :show-back="false"
    :show-navigation="!bookmark.isMobile"
    embedded-mobile
  >
    <div class="person-center-layout" :class="{ 'person-center-layout--mobile': bookmark.isMobile }">
      <div
        class="person-menu-scroll"
        :class="{ 'person-menu-scroll--mobile': bookmark.isMobile, 'no-scrollbar': bookmark.isMobile }"
      >
        <section class="profile-card">
          <div class="profile-card__identity">
            <BButton
              class="profile-card__avatar"
              :class="{ 'profile-card__avatar--framed': equippedFrameId }"
              :aria-label="t('personCenter.viewAvatar')"
              @click="zoomImage"
            >
              <AvatarFramePreview
                v-if="equippedFrameId"
                :frame-id="equippedFrameId"
                :src="user.headPicture || icon.navigation.user"
                :size="48"
                :decorative="false"
              />
              <svg-icon v-else img-id="viewUserImg" size="58" :src="user.headPicture || icon.navigation.user" />
            </BButton>
            <div class="profile-card__copy">
              <strong>{{ user.alias || t('personCenter.defaultNickname') }}</strong>
              <span v-if="user.email">{{ user.email }}</span>
            </div>
            <BButton class="profile-card__edit" @click="goToProfileModule('/myInfo')">
              <SvgIcon :src="icon.card_edit" size="15" aria-hidden="true" />
              {{ t('personCenter.editProfile') }}
            </BButton>
          </div>

          <div class="profile-card__stats" :aria-label="t('personCenter.resourceOverview')">
            <div class="profile-card__stat">
              <strong>{{ formatCompactNumber(user.bookmarkTotal) }}</strong>
              <span>{{ t('navigation.bookmark') }}</span>
            </div>
            <div class="profile-card__stat">
              <strong>{{ formatCompactNumber(user.noteTotal) }}</strong>
              <span>{{ t('navigation.note') }}</span>
            </div>
            <div class="profile-card__stat">
              <strong>{{ formatStorageSize(user.storageUsed) }}</strong>
              <span>{{ t('personCenter.storageUsed') }}</span>
            </div>
          </div>

          <div class="profile-card__assets" :aria-label="t('personCenter.assetOverview')">
            <PointsBalanceSummary
              :points="growthInfo?.points"
              :loading="growthLoading"
              entry-source="移动个人中心"
              @open-details="goPointsDetails"
            />
            <AiQuotaSummary
              density="comfortable"
              layout="tile"
              entry-source="移动个人中心"
              @open-details="goAiQuotaDetails"
            />
          </div>

          <BButton
            class="profile-card__growth"
            @click="goGrowth"
            v-click-log="{ module: '个人中心', operation: '打开成长中心' }"
          >
            <span class="profile-card__growth-icon">
              <SvgIcon :src="icon.userCenter.growth" size="19" aria-hidden="true" />
            </span>
            <span class="profile-card__growth-body">
              <span class="profile-card__growth-main">
                <strong v-if="growthInfo">Lv.{{ growthInfo.level }} {{ growthInfo.name }}</strong>
                <strong v-else>{{ growthLoading ? t('common.loading') : t('personCenter.growthUnavailable') }}</strong>
                <span>{{ t('personCenter.growthProgress') }}</span>
              </span>
              <BProgress
                v-if="growthInfo"
                size="small"
                :percent="growthInfo.progress"
                :aria-label="t('personCenter.growthProgress')"
              />
            </span>
            <SvgIcon class="profile-row-arrow" :src="icon.arrow_right" size="16" aria-hidden="true" />
          </BButton>
        </section>

        <section class="profile-section">
          <h2>{{ t('personCenter.quickAccess') }}</h2>
          <div class="profile-quick-grid">
            <BButton
              v-for="entry in mobileQuickEntries"
              :key="entry.name"
              class="profile-quick-item"
              @click="goToProfileModule(entry.mobilePath || entry.path)"
            >
              <span class="profile-entry-icon"><SvgIcon :src="entry.icon" size="20" /></span>
              <span>{{ t(entry.labelKey) }}</span>
            </BButton>
          </div>
        </section>

        <section class="profile-section">
          <h2>{{ t('personCenter.appAndAccount') }}</h2>
          <MobileListSurface>
            <!-- 主题与语言已统一收敛到设置页，移动端个人中心只保留设置入口。 -->
            <MobileListRow v-if="!isAndroidApp" interactive @click="handlePwaEntry">
              <template #leading
                ><span class="profile-entry-icon"><SvgIcon :src="icon.pwa.install" size="20" /></span
              ></template>
              <template #title>{{ t('pwa.install') }}</template>
              <template #subtitle>{{ pwaEntryDescription }}</template>
              <template #trailing><SvgIcon class="profile-row-arrow" :src="icon.arrow_right" size="17" /></template>
            </MobileListRow>
            <!--
            App 内复用「安装 App」这一格:浏览器里是装 App、App 里是更新 App,同一位置的两种形态。
            不另开入口是刻意的 —— settingsRegistry 里已经写明安装类入口只保留这一处。
          -->
            <MobileListRow v-else interactive @click="handleAppUpdateEntry">
              <template #leading
                ><span class="profile-entry-icon"><SvgIcon :src="icon.pwa.android" size="20" /></span
              ></template>
              <template #title>
                {{ t('appUpdate.entry')
                }}<span v-if="showUpdateBadge" class="profile-update-dot" aria-hidden="true"></span>
              </template>
              <template #subtitle>{{ appUpdateDescription }}</template>
              <template #trailing><SvgIcon class="profile-row-arrow" :src="icon.arrow_right" size="17" /></template>
            </MobileListRow>
            <MobileListRow interactive @click="goToProfileModule('/settings')">
              <template #leading
                ><span class="profile-entry-icon"><SvgIcon :src="icon.userCenter.settingsGear" size="20" /></span
              ></template>
              <template #title>{{ t('settings.title') }}</template>
              <template #trailing><SvgIcon class="profile-row-arrow" :src="icon.arrow_right" size="17" /></template>
            </MobileListRow>
          </MobileListSurface>
        </section>

        <section class="profile-section">
          <h2>{{ t('personCenter.communicationAndSupport') }}</h2>
          <MobileListSurface>
            <MobileListRow
              v-for="entry in mobileCommunicationEntries"
              :key="entry.name"
              interactive
              @click="goToProfileModule(entry.path)"
            >
              <template #leading
                ><span class="profile-entry-icon"><SvgIcon :src="entry.icon" size="20" /></span
              ></template>
              <template #title>{{ t(entry.labelKey) }}</template>
              <template v-if="entry.descriptionKey" #subtitle>{{ t(entry.descriptionKey) }}</template>
              <template #trailing><SvgIcon class="profile-row-arrow" :src="icon.arrow_right" size="17" /></template>
            </MobileListRow>
          </MobileListSurface>
        </section>

        <section v-if="user.role === 'root'" class="profile-section">
          <h2>{{ t('personCenter.managementTools') }}</h2>
          <MobileListSurface>
            <MobileListRow interactive @click="goToProfileModule('/admin')">
              <template #leading
                ><span class="profile-entry-icon"><SvgIcon :src="icon.user_admin" size="20" /></span
              ></template>
              <template #title>{{ t('personCenter.admin') }}</template>
              <template #subtitle>{{ t('personCenter.logs_user_mg') }}</template>
              <template #trailing><SvgIcon class="profile-row-arrow" :src="icon.arrow_right" size="17" /></template>
            </MobileListRow>
            <MobileListRow interactive @click="goToProfileModule('/serverManagement')">
              <template #leading
                ><span class="profile-entry-icon"><SvgIcon :src="icon.infrastructure.server" size="20" /></span
              ></template>
              <template #title>{{ t('personCenter.serverManagement') }}</template>
              <template #subtitle>{{ t('personCenter.serverManagementDescription') }}</template>
              <template #trailing><SvgIcon class="profile-row-arrow" :src="icon.arrow_right" size="17" /></template>
            </MobileListRow>
          </MobileListSurface>
        </section>

        <BButton
          class="profile-session-action"
          :class="{ 'profile-session-action--login': user.role === 'visitor' }"
          @click="handleExitLogin"
        >
          <SvgIcon :src="user.role === 'visitor' ? icon.navigation.user : icon.navigation.exit" size="19" />
          {{ user.role === 'visitor' ? t('personCenter.loginRegister') : t('personCenter.logout') }}
        </BButton>
      </div>
    </div>
    <my-info v-if="userVisible" v-model:visible="userVisible" />
    <ActionCardModal
      v-if="updateModalVisible"
      v-model:visible="updateModalVisible"
      :title="$t('appUpdate.modalTitle')"
      :sections="updateSections"
      :note="$t('appUpdate.modalNote')"
    />
  </CommonContainer>
</template>

<script setup lang="ts">
  import router from '@/router';
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import AvatarFramePreview from '@/components/growth/AvatarFramePreview.vue';
  import PointsBalanceSummary from '@/components/growth/PointsBalanceSummary.vue';
  import AiQuotaSummary from '@/components/aiSkills/AiQuotaSummary.vue';
  import BProgress from '@/components/base/BasicComponents/BProgress.vue';
  import MobileListSurface from '@/components/mobile/MobileListSurface.vue';
  import MobileListRow from '@/components/mobile/MobileListRow.vue';
  import { bookmarkStore, useUserStore } from '@/store';
  import { formatStorageSize } from '@/utils/common';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import { computed, defineAsyncComponent, onMounted, ref } from 'vue';
  import userApi from '@/api/userApi.ts';
  import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
  import { useI18n } from 'vue-i18n';
  import { recordOperation } from '@/api/commonApi';
  import { useGrowth } from '@/composables/useGrowth.ts';
  import { useMobileTopBar } from '@/composables/useMobileTopBar';
  import { frameVariant } from '@/config/growthFrames';
  import { usePwaInstall } from '@/composables/usePwaInstall';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import { isLightNoteAndroidApp } from '@/utils/androidBridge';
  import { useAndroidAppUpdate } from '@/composables/useAndroidAppUpdate';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import {
    MOBILE_PERSON_CENTER_COMMUNICATION_ENTRIES,
    MOBILE_PERSON_CENTER_QUICK_ENTRIES,
  } from '@/config/personCenterEntries';

  const MyInfo = defineAsyncComponent(() => import('@/components/personCenter/myInfo/MyInfo.vue'));
  const ActionCardModal = defineAsyncComponent(() => import('@/components/base/ActionCardModal.vue'));

  const { t } = useI18n();
  const bookmark = bookmarkStore();
  const menuVisible = ref(false);
  const userVisible = ref(false);

  const user = useUserStore();
  const mobileQuickEntries = MOBILE_PERSON_CENTER_QUICK_ENTRIES;
  const mobileCommunicationEntries = MOBILE_PERSON_CENTER_COMMUNICATION_ENTRIES;
  const { growth: growthInfo, loading: growthLoading, load: loadGrowth } = useGrowth();
  const equippedFrameId = computed(() => {
    const id = growthInfo.value?.equippedFrame;
    return frameVariant(id) ? id : null;
  });
  const isAndroidApp = isLightNoteAndroidApp();
  const appUpdate = useAndroidAppUpdate();
  const updateModalVisible = ref(false);
  const showUpdateBadge = computed(() => appUpdate.showBadge.value);
  /** 摘要直接把版本号说清楚，省得用户点进去才知道是不是白跑一趟 */
  const appUpdateDescription = computed(() =>
    appUpdate.updateAvailable.value
      ? t('appUpdate.newVersionShort', { version: appUpdate.latestVersion.value })
      : t('appUpdate.currentVersionShort', { version: appUpdate.installedVersion.value }),
  );
  const { canPrompt, isStandalone, openGuide } = usePwaInstall();
  const pwaEntryDescription = computed(() =>
    isStandalone.value
      ? t('pwa.installed')
      : canPrompt.value
        ? t('pwa.directAvailableShort')
        : t('pwa.addToHomeScreen'),
  );
  useMobileTopBar(['personCenter'], {
    searchMode: 'icon',
  });
  onMounted(() => {
    loadGrowth();
  });

  function goToProfileModule(path: string) {
    router.push(path);
  }

  function goGrowth() {
    goToProfileModule('/growth');
  }

  function goAiQuotaDetails() {
    router.push('/ai-usage');
  }

  function goPointsDetails() {
    router.push('/points-usage');
  }

  function formatCompactNumber(value: number | string | null | undefined) {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount)) return '0';
    if (amount >= 1000)
      return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(amount);
    return amount.toLocaleString();
  }

  function handlePwaEntry() {
    openGuide('person-center');
  }

  /**
   * 更新入口。无新版时只回一句「已是最新」，不弹面板 —— 用户点它多半是想确认一下。
   * 有新版才展开三层安装路径：下载(通知栏/文件管理器) → 复制地址去浏览器。
   */
  function handleAppUpdateEntry() {
    if (!appUpdate.updateAvailable.value) {
      message.success(t('appUpdate.upToDate', { version: appUpdate.installedVersion.value }));
      return;
    }
    updateModalVisible.value = true;
    recordOperation({ module: '个人中心', operation: `打开更新面板【${appUpdate.latestVersion.value}】` });
  }

  const updateSections = computed(() => [
    {
      key: 'update',
      title: '',
      actions: [
        {
          key: 'download',
          label: t('appUpdate.actionDownload'),
          description: t('appUpdate.actionDownloadDesc'),
          onClick: () => {
            updateModalVisible.value = false;
            if (appUpdate.startUpdate()) {
              recordOperation({ module: '个人中心', operation: `下载新版 APK【${appUpdate.latestVersion.value}】` });
            }
          },
        },
        {
          key: 'browser',
          label: t('appUpdate.actionBrowser'),
          description: t('appUpdate.actionBrowserDesc'),
          onClick: async () => {
            updateModalVisible.value = false;
            await appUpdate.copyDownloadPageUrl();
          },
        },
      ],
    },
  ]);

  function handleExitLogin() {
    menuVisible.value = false;
    if (user.role === 'visitor') {
      bookmark.isShowLogin = true;
    } else {
      Alert.alert({
        title: '提示',
        content: '此操作将退出登录, 是否继续?',
        async onOk() {
          sessionStorage.setItem('manualLogout', '1');
          await userApi.logout();
          window.dispatchEvent(new CustomEvent('light-note:auth-expired'));
        },
      });
    }
  }

  ref<Viewer>();
  function zoomImage() {
    bookmark.refreshViewer(user.headPicture || icon.navigation.user);
    menuVisible.value = false;
  }
</script>

<style lang="less" scoped>
  .person-center-layout {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .person-menu-scroll {
    min-height: 0;
    padding: 2px 0 calc(24px + env(safe-area-inset-bottom));
    overflow-y: auto;
    overscroll-behavior-y: contain;
    flex: 1 1 auto;
  }

  .profile-card {
    padding: 20px 16px 16px;
    box-sizing: border-box;
    border: 1px solid var(--surface-border-color);
    border-radius: 18px;
    background: var(--card-background);
  }

  .profile-card__identity {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .profile-card__avatar {
    width: 72px;
    min-width: 72px;
    height: 72px;
    flex: 0 0 72px;
    padding: 0;
    overflow: visible;
    border: 0;
    border-radius: 50%;
    color: var(--primary-color);
    background: transparent;
  }

  // 头像框组件会按 outerSize 输出真实外径；佩戴态必须让按钮按子元素自然占位，
  // 不能继续用头像直径 72px 裁布局，否则传说框会侵入昵称并被滚动容器削掉外饰。
  .profile-card__avatar.profile-card__avatar--framed {
    width: auto;
    min-width: 0;
    height: auto;
    flex: 0 0 auto;
  }

  .profile-card__avatar :deep(img),
  .profile-card__avatar :deep(.icon-base64),
  .profile-card__avatar :deep(.icon-fixed-base64) {
    border-radius: 50%;
    object-fit: cover;
  }

  .profile-card__copy {
    min-width: 0;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 4px;
  }

  .profile-card__copy strong,
  .profile-card__copy span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .profile-card__copy strong {
    color: var(--text-color);
    font-size: 20px;
    line-height: 1.25;
  }

  .profile-card__copy span {
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.4;
  }

  .profile-card__edit {
    min-height: 32px;
    flex: 0 0 auto;
    gap: 5px;
    padding: 0 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    color: var(--primary-color);
    background: var(--card-background);
    font-size: 12px;
  }

  .profile-card__stats {
    margin-top: 14px;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    border-top: 1px solid var(--surface-divider-color);
    border-bottom: 1px solid var(--surface-divider-color);
  }

  .profile-card__assets {
    margin-top: 12px;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .profile-card__stat {
    min-width: 0;
    min-height: 58px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    padding: 7px 4px;
    box-sizing: border-box;
  }

  .profile-card__stat + .profile-card__stat {
    border-left: 1px solid var(--surface-divider-color);
  }

  .profile-card__stat strong,
  .profile-card__stat span {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .profile-card__stat strong {
    color: var(--text-color);
    font-size: 15px;
    line-height: 1.25;
  }

  .profile-card__stat span {
    color: var(--desc-color);
    font-size: 10px;
    line-height: 1.25;
  }

  .profile-card__growth {
    width: 100%;
    height: auto;
    min-height: 54px;
    margin-top: 0;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 10px;
    padding: 11px 2px 0;
    border: 0;
    border-radius: 0;
    color: var(--text-color);
    background: transparent;
    line-height: normal;
    text-align: left;
    white-space: normal;
  }

  .profile-card__growth-icon {
    width: 34px;
    height: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 34px;
    border: 1px solid var(--surface-border-color);
    border-radius: 11px;
    color: var(--primary-color);
    background: var(--surface-panel-bg);
  }

  .profile-card__growth-body {
    min-width: 0;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 7px;
  }

  .profile-card__growth-main {
    display: flex;
    align-items: center;
  }

  .profile-card__growth-main {
    min-width: 0;
    justify-content: space-between;
    gap: 10px;
  }

  .profile-card__growth-main strong {
    min-width: 0;
    overflow: hidden;
    color: var(--text-color);
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .profile-card__growth-main > span {
    color: var(--desc-color);
    font-size: 11px;
    white-space: nowrap;
  }

  .profile-section {
    --mobile-row-min-height: 60px;
    --mobile-row-padding-y: 9px;
    --mobile-row-padding-x: 12px;

    margin-top: 18px;
  }

  .profile-section h2 {
    margin: 0 0 8px 4px;
    color: var(--desc-color);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .profile-quick-grid {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }

  .profile-quick-item {
    width: 100%;
    min-width: 0;
    height: 76px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 7px;
    padding: 8px 3px;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    color: var(--text-color);
    background: var(--card-background);
    font-size: 11px;
    font-weight: 600;
    line-height: 1.25;
    text-align: center;
    white-space: normal;
  }

  .profile-quick-item > span:last-child {
    width: 100%;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .profile-entry-icon {
    width: 32px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 32px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    color: var(--primary-color);
    background: var(--surface-panel-bg);
  }

  .profile-row-arrow {
    color: var(--desc-color);
  }

  .profile-update-dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    margin-left: 6px;
    border-radius: 50%;
    background: #dc2626;
    vertical-align: middle;
  }

  .profile-session-action {
    width: 100%;
    min-height: 46px;
    margin-top: 18px;
    gap: 8px;
    border: 1px solid #fecaca;
    border-radius: 14px;
    color: #b91c1c;
    background: var(--card-background);
  }

  .profile-session-action--login {
    border-color: var(--primary-color);
    color: var(--primary-color);
  }

  :deep(.phone-container--embedded .phone-body) {
    padding-top: 10px;
    overflow: hidden;
  }

  html.light-note-mobile-rendering .profile-card,
  html.light-note-mobile-rendering .profile-quick-item {
    box-shadow: none;
  }

  html.light-note-mobile-rendering .profile-card__growth-icon,
  html.light-note-mobile-rendering .profile-entry-icon {
    border-color: var(--surface-border-color);
    background: var(--surface-panel-bg);
  }

  @media (max-width: 360px) {
    .profile-card {
      padding: 18px 14px 14px;
    }

    .profile-card__avatar {
      width: 66px;
      min-width: 66px;
      height: 66px;
    }

    .profile-card__edit {
      width: 32px;
      padding: 0;
      font-size: 0;
    }

    .profile-quick-grid {
      gap: 6px;
    }

    .profile-quick-item {
      height: 72px;
      font-size: 10px;
    }
  }
</style>
