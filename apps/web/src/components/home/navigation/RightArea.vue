<template>
  <div
    class="navigation-right-area"
    :class="{ 'phone-top-menu': bookmark.isMobile }"
    :style="{ marginLeft: 'auto', gap: bookmark.isMobile ? '15px' : '5px' }"
  >
    <CampaignEntry v-if="!bookmark.isMobile" />
    <GlobalSearch />
    <BTooltip v-if="showQuickCapture" :title="$t('inbox.quickCapture')">
      <BButton
        class="quick-capture-btn"
        :class="{ 'is-open': inbox.quickCaptureVisible }"
        :aria-label="$t('inbox.quickCapture')"
        :aria-expanded="inbox.quickCaptureVisible"
        aria-haspopup="dialog"
        @click="openQuickCapture"
      >
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
        <BButton class="more-menu-trigger" :aria-label="t('navigation.moreEntries')">
          <svg-icon size="26" hover :src="icon.navigation.portal" />
        </BButton>
      </b-dropdown>
    </BTooltip>
    <BButton v-if="showGuestRegister" type="primary" class="guest-register-link" @click="registerClick">
      {{ $t('home.registerAccount') }}
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
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';
  import CampaignEntry from '@/components/support/CampaignEntry.vue';
  import GlobalSearch from '@/components/search/GlobalSearch.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import { inboxStore } from '@/store';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import { useI18n } from 'vue-i18n';
  import { computed, onMounted } from 'vue';
  import { useGrowth } from '@/composables/useGrowth.ts';
  import { frameVariant } from '@/config/growthFrames';
  import { isMobileHomeRoute } from '@/utils/preferences.ts';
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
  const moreMenuOptions = computed(() => [
    ...(user.role === 'visitor'
      ? [{ label: t('navigation.coBuild'), icon: icon.support.heart, function: coBuildClick }]
      : []),
    {
      label: t('navigation.toolbox'),
      icon: icon.toolbox.home,
      function: knowledgeWorkshopClick,
    },
    { label: t('home.officialSite'), icon: icon.userCenter.home, function: officialSiteClick },
    { label: t('navigation.projectAddress'), icon: icon.github, function: githubClick },
  ]);

  onMounted(() => {
    loadGrowth();
  });

  function githubClick() {
    window.open('https://github.com/VeteranBoLuo/light-note', '_blank', 'noopener,noreferrer');
    recordOperation({ module: '导航栏', operation: '访问项目 GitHub' });
  }

  function knowledgeWorkshopClick() {
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

  // 游客点导航栏「注册账号」:打开注册弹窗(openAuthModal 内部记 signup_open,source=nav)
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
  .quick-capture-btn {
    position: relative;
    flex: 0 0 auto;
    width: 36px;
    height: 36px;
    padding: 0;
    border-radius: 9px;
    line-height: 1;
    color: var(--primary-color, #615ced);
    background: transparent;
    transition:
      color 0.2s ease,
      background-color 0.2s ease;

    &.is-open {
      background: color-mix(in srgb, var(--primary-color, #615ced) 10%, var(--background-color));
    }

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background: color-mix(in srgb, var(--primary-color, #615ced) 10%, var(--background-color));
      }
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
