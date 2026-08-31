<template>
  <div
    class="navigation-right-area"
    :class="{ 'phone-top-menu': bookmark.isMobile }"
    :style="{ marginLeft: 'auto', gap: bookmark.isMobile ? '15px' : '5px' }"
  >
    <GlobalSearch />
    <BTooltip v-if="showQuickCapture" :title="$t('inbox.quickCapture')">
      <BButton class="quick-capture-btn" :aria-label="$t('inbox.quickCapture')" @click="openQuickCapture">
        <!--
          快速添加只负责创建，不承担待处理催办：它的角标曾用 actionTotal（全部未完成待办 +
          全部待整理），点开却只有创建表单，数字无从解释。待处理提醒改由「待办」导航角标
          （逾期 + 今天）和弹框内的上下文入口承担。
        -->
        <svg-icon size="21" :src="icon.common.add" />
      </BButton>
    </BTooltip>
    <BTooltip v-if="!bookmark.isMobile" :title="$t('navigation.moreEntries')">
      <b-dropdown align="center" trigger="click" :menu-options="moreMenuOptions">
        <BButton
          class="more-menu-trigger"
          :aria-label="t(knowledgeWorkshopUnread ? 'navigation.moreEntriesWithNew' : 'navigation.moreEntries')"
        >
          <svg-icon size="26" hover :src="icon.navigation.portal" />
          <span v-if="knowledgeWorkshopUnread" class="more-menu-trigger__unread-dot" aria-hidden="true" />
        </BButton>
      </b-dropdown>
    </BTooltip>
    <BButton v-if="showGuestRegister" type="primary" class="guest-register-link" @click="registerClick">
      {{ $t('home.freeRegister') }}
    </BButton>
    <BButton v-if="showMobileHomeExtra" class="mobile-github-btn" @click="githubClick">
      <svg-icon size="24" hover :src="icon.github" />
    </BButton>
    <NotificationBell v-if="!bookmark.isMobile && user.role !== 'visitor'" />
    <!--移动端个人中心       -->
    <div
      :class="['navigation-icon', { 'has-frame': equippedFrameId }]"
      v-if="bookmark.isMobile"
      @click="handleToPhoneUserCenter"
    >
      <AvatarFramePreview
        v-if="equippedFrameId"
        :frame-id="equippedFrameId"
        :src="user.headPicture || icon.navigation.user"
        :size="30"
        layout-mode="slot"
      />
      <svg-icon v-else size="32" :src="user.headPicture || icon.navigation.user" class="dom-hover" />
    </div>
    <!--pc端个人中心       -->
    <PersonCenter v-else />
  </div>
</template>

<script lang="ts" setup>
  import icon from '@/config/icon.ts';
  import BDropdown from '@/components/base/BasicComponents/BDropdown.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import PersonCenter from '@/view/personCenter/PersonCenter.vue';
  import NotificationBell from '@/components/notification/NotificationBell.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import AvatarFramePreview from '@/components/growth/AvatarFramePreview.vue';
  import { bookmarkStore, useUserStore } from '@/store';
  import router from '@/router';
  import { useRoute } from 'vue-router';
  import { recordOperation } from '@/api/commonApi.ts';
  import userApi from '@/api/userApi.ts';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';
  import GlobalSearch from '@/components/search/GlobalSearch.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import { inboxStore } from '@/store';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import { useI18n } from 'vue-i18n';
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useGrowth } from '@/composables/useGrowth.ts';
  import { frameVariant } from '@/config/growthFrames';
  import { isMobileHomeRoute } from '@/utils/preferences.ts';
  import { getLogDeviceId } from '@/utils/common.ts';
  import {
    featureAnnouncementSeenVersion,
    KNOWLEDGE_WORKSHOP_ANNOUNCEMENT_ID,
    KNOWLEDGE_WORKSHOP_ANNOUNCEMENT,
    markLocalFeatureAnnouncementSeen,
    millisecondsUntilFeatureAnnouncementBoundary,
    shouldShowFeatureAnnouncement,
    withFeatureAnnouncementSeen,
  } from '@/utils/featureAnnouncements';
  const bookmark = bookmarkStore();
  const inbox = inboxStore();
  const { t } = useI18n();

  const user = useUserStore();
  const route = useRoute();
  const { growth, load: loadGrowth } = useGrowth();
  const equippedFrameId = computed(() => {
    const id = growth.value?.equippedFrame;
    return frameVariant(id) ? id : null;
  });
  const showQuickCapture = computed(() => !bookmark.isMobile && Boolean(user.id) && user.role !== 'visitor');
  const showMobileHomeExtra = computed(() => bookmark.isMobile && isMobileHomeRoute(route.name, user.preferences));
  const showGuestRegister = computed(() => !user.adminContext && !user.visitorWorkspace && user.role === 'visitor');
  const isGuestAnnouncementOwner = computed(() => !user.id || user.role === 'visitor');
  const announcementDeviceKey = computed(() => getLogDeviceId() || 'visitor');
  const knowledgeWorkshopSeenVersion = computed(() =>
    featureAnnouncementSeenVersion(user.preferences, KNOWLEDGE_WORKSHOP_ANNOUNCEMENT_ID),
  );
  const knowledgeWorkshopUnread = ref(false);
  let announcementBoundaryTimer: number | null = null;
  const moreMenuOptions = computed(() => [
    ...(user.role === 'visitor'
      ? [{ label: t('navigation.coBuild'), icon: icon.support.heart, function: coBuildClick }]
      : []),
    {
      label: t('navigation.toolbox'),
      icon: icon.toolbox.home,
      unread: knowledgeWorkshopUnread.value,
      unreadLabel: t('navigation.newFeature'),
      function: knowledgeWorkshopClick,
    },
    { label: t('home.officialSite'), icon: icon.userCenter.home, function: officialSiteClick },
    { label: t('navigation.projectAddress'), icon: icon.github, function: githubClick },
  ]);

  function syncKnowledgeWorkshopAnnouncement() {
    knowledgeWorkshopUnread.value = shouldShowFeatureAnnouncement({
      announcementId: KNOWLEDGE_WORKSHOP_ANNOUNCEMENT_ID,
      guest: isGuestAnnouncementOwner.value,
      preferences: user.preferences,
      localOwnerKey: announcementDeviceKey.value,
    });
  }

  function scheduleAnnouncementBoundary() {
    if (announcementBoundaryTimer !== null) window.clearTimeout(announcementBoundaryTimer);
    announcementBoundaryTimer = null;
    const remaining = millisecondsUntilFeatureAnnouncementBoundary(KNOWLEDGE_WORKSHOP_ANNOUNCEMENT_ID);
    if (remaining <= 0) return;
    announcementBoundaryTimer = window.setTimeout(
      () => {
        syncKnowledgeWorkshopAnnouncement();
        scheduleAnnouncementBoundary();
      },
      Math.min(remaining + 25, 2_147_000_000),
    );
  }

  onMounted(() => {
    loadGrowth();
    syncKnowledgeWorkshopAnnouncement();
    scheduleAnnouncementBoundary();
  });
  onBeforeUnmount(() => {
    if (announcementBoundaryTimer !== null) window.clearTimeout(announcementBoundaryTimer);
  });
  watch([isGuestAnnouncementOwner, knowledgeWorkshopSeenVersion], () => {
    syncKnowledgeWorkshopAnnouncement();
    scheduleAnnouncementBoundary();
  });

  function githubClick() {
    window.open('https://github.com/VeteranBoLuo/light-note', '_blank', 'noopener,noreferrer');
    recordOperation({ module: '导航栏', operation: '访问项目 GitHub' });
  }

  function knowledgeWorkshopClick() {
    knowledgeWorkshopUnread.value = false;
    // 工坊上新提示的产品语义是“同一台设备只提醒一次”。本地标记必须覆盖登录与游客，
    // 避免刷新时等待用户信息或服务端已读回写而短暂/持续恢复红点；登录用户仍同步服务端以支持跨设备已读。
    markLocalFeatureAnnouncementSeen(KNOWLEDGE_WORKSHOP_ANNOUNCEMENT_ID, announcementDeviceKey.value);
    if (!isGuestAnnouncementOwner.value) {
      user.preferences = withFeatureAnnouncementSeen(
        user.preferences,
        KNOWLEDGE_WORKSHOP_ANNOUNCEMENT_ID,
      ) as typeof user.preferences;
      void userApi
        .markFeatureAnnouncementSeen({
          announcementId: KNOWLEDGE_WORKSHOP_ANNOUNCEMENT.id,
          version: KNOWLEDGE_WORKSHOP_ANNOUNCEMENT.version,
        })
        .catch(() => {
          // 上新提示是非关键旁路；本机已读已经落盘，服务端失败只影响跨设备同步，不应阻断导航。
          console.warn('[feature-announcement] persist failed');
        });
    }
    void router.push('/toolbox');
    recordOperation({ module: '导航栏', operation: '从更多入口打开知识工坊' });
  }

  function officialSiteClick() {
    router.push('/');
    recordOperation({ module: '导航栏', operation: '访问官方首页' });
  }

  function coBuildClick() {
    router.push('/co-build');
    recordOperation({ module: '导航栏', operation: '打开共建轻笺' });
  }

  // 游客点导航栏「免费注册」:打开注册弹窗(openAuthModal 内部记 signup_open,source=nav)
  function registerClick() {
    bookmark.openAuthModal('注册', 'nav');
  }

  function openQuickCapture() {
    if (blockGuestWrite('inbox-capture', t('inbox.guestPrompt'))) return;
    recordOperation(OPERATION_LOG_MAP.inbox.openCapture);
    inbox.openQuickCapture();
  }

  function handleToPhoneUserCenter() {
    bookmark.isFold = true;
    router.push('/personCenter');
  }
</script>

<style lang="less" scoped>
  .navigation-right-area {
    display: flex;
    align-items: center;
    min-width: 220px;
    justify-content: flex-end;
    position: absolute;
    right: 40px;
  }
  .navigation-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    min-width: 0;
    height: 40px;
    min-height: 0;
    flex: 0 0 40px;
    clip-path: circle(50% at 50% 50%);
    cursor: pointer;
  }
  .navigation-icon.has-frame {
    clip-path: none;
    overflow: visible;
  }
  .navigation-action-btn {
    border: 0;
    padding: 0;
    background: transparent;
    color: var(--text-color);
    display: flex;
    align-items: center;
    cursor: pointer;
  }
  .phone-top-menu {
    position: absolute;
    left: 64px;
    right: 14px;
    width: unset !important;
    min-width: 0;
    gap: 8px !important;
  }
  .phone-top-menu :deep(.global-search) {
    flex: 1;
    min-width: 0;
  }
  .phone-top-menu .guest-register-link,
  .phone-top-menu .mobile-github-btn,
  .phone-top-menu .navigation-icon {
    flex: 0 0 auto;
  }
  .phone-top-menu .guest-register-link {
    padding-right: 12px;
    padding-left: 12px;
  }
  .mobile-github-btn {
    border: 0;
    padding: 0;
    background: transparent;
    color: var(--text-color);
    display: flex;
    align-items: center;
    cursor: pointer;
    flex: 0 0 auto;
  }
  .more-menu-trigger {
    position: relative;
    width: 36px;
    height: 36px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 0;
    color: var(--text-color);
    background: transparent;
    cursor: pointer;
  }
  .more-menu-trigger__unread-dot {
    position: absolute;
    top: 3px;
    right: 2px;
    width: 8px;
    height: 8px;
    border: 2px solid var(--background-color);
    border-radius: 50%;
    background: var(--danger-color, #f04455);
    pointer-events: none;
  }
  .quick-capture-btn {
    position: relative;
    flex: 0 0 auto;
    width: 36px;
    height: 36px;
    padding: 0;
    border-radius: 9px;
    line-height: 1;
    color: var(--primary-color, #615ced);
    background: color-mix(in srgb, var(--primary-color, #615ced) 10%, var(--background-color));
    transition:
      color 0.2s ease,
      background-color 0.2s ease,
      transform 0.2s ease;

    &:hover {
      color: var(--primary-color, #615ced);
      background: color-mix(in srgb, var(--primary-color, #615ced) 18%, var(--background-color));
      transform: translateY(-1px);
    }
  }
  .guest-register-link {
    font-size: 13px;
    font-weight: 500;
    color: #fff;
    background: #615ced;
    cursor: pointer;
    white-space: nowrap;
    padding: 5px 14px;
    border-radius: 999px;
    transition:
      opacity 0.2s,
      box-shadow 0.2s;
    box-shadow: 0 2px 8px rgba(97, 92, 237, 0.28);
  }
  .guest-register-link:hover {
    opacity: 0.9;
    box-shadow: 0 3px 12px rgba(97, 92, 237, 0.4);
  }

  @media (min-width: 768px) and (max-width: 1199px) {
    .navigation-right-area {
      right: 16px;
    }
  }
</style>
