<template>
  <div
    class="navigation-right-area"
    :class="{ 'phone-top-menu': bookmark.isMobile }"
    :style="{ marginLeft: 'auto', gap: bookmark.isMobile ? '15px' : '5px' }"
  >
    <GlobalSearch />
    <BButton v-if="showQuickCapture" size="small" type="primary" class="quick-capture-btn" @click="openQuickCapture">
      {{ $t('inbox.quickCapture') }}
      <span v-if="inbox.actionTotal" class="quick-capture-count">{{ displayInboxCount }}</span>
    </BButton>
    <BTooltip v-if="!bookmark.isMobile" :title="$t('navigation.moreEntries')">
      <b-dropdown align="center" trigger="click" :menu-options="moreMenuOptions">
        <div class="more-menu-trigger">
          <svg-icon size="26" hover :src="icon.navigation.portal" />
        </div>
      </b-dropdown>
    </BTooltip>
    <BButton v-if="bookmark.isMobile && route.path.includes('/home')" class="mobile-github-btn" @click="githubClick">
      <svg-icon size="24" hover :src="icon.github" />
    </BButton>
    <BButton v-if="showGuestRegister" type="primary" class="guest-register-link" @click="registerClick">
      {{ $t('home.freeRegister') }}
    </BButton>
    <NotificationBell v-if="!bookmark.isMobile && user.role !== 'visitor'" />
    <!--移动端个人中心       -->
    <div :class="['navigation-icon']" v-if="bookmark.isMobile" @click="handleToPhoneUserCenter">
      <svg-icon size="32" :src="user.headPicture || icon.navigation.user" class="dom-hover" />
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
  import { bookmarkStore, useUserStore } from '@/store';
  import router from '@/router';
  import { useRoute } from 'vue-router';
  import { recordOperation } from '@/api/commonApi.ts';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';
  import GlobalSearch from '@/components/search/GlobalSearch.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import { inboxStore } from '@/store';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import { useI18n } from 'vue-i18n';
  import { computed } from 'vue';
  const bookmark = bookmarkStore();
  const inbox = inboxStore();
  const { t } = useI18n();

  const user = useUserStore();
  const route = useRoute();
  const showQuickCapture = computed(() => !bookmark.isMobile && Boolean(user.id) && user.role !== 'visitor');
  const showGuestRegister = computed(() => !user.adminContext && !user.visitorWorkspace && user.role === 'visitor');
  const displayInboxCount = computed(() => (inbox.actionTotal > 99 ? '99+' : String(inbox.actionTotal)));
  const moreMenuOptions = computed(() => [
    { label: t('home.officialSite'), icon: icon.userCenter.home, function: officialSiteClick },
    { label: t('home.toolbox'), icon: icon.toolkit, function: toolkitClick },
    { label: t('navigation.projectAddress'), icon: icon.github, function: githubClick },
  ]);

  function githubClick() {
    window.open('https://github.com/VeteranBoLuo/light-note', '_blank', 'noopener,noreferrer');
    recordOperation({ module: '导航栏', operation: '访问项目 GitHub' });
  }

  function toolkitClick() {
    window.open('https://boluo66.top/toolkit/', '_blank', 'noopener,noreferrer');
    recordOperation(OPERATION_LOG_MAP.navigation.toolkit);
  }

  function officialSiteClick() {
    router.push('/landing');
    recordOperation({ module: '导航栏', operation: '访问官方首页' });
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
    min-width: 140px;
    justify-content: flex-end;
    position: absolute;
    right: 40px;
  }
  .navigation-icon {
    display: flex;
    align-items: center;
    clip-path: circle(50% at 50% 50%);
    cursor: pointer;
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
    left: 104px;
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
    display: flex;
    align-items: center;
    cursor: pointer;
  }
  .quick-capture-btn {
    flex: 0 0 auto;
    gap: 6px;
  }
  .quick-capture-count {
    min-width: 17px;
    height: 17px;
    padding: 0 4px;
    border-radius: 9px;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.22);
    color: #fff;
    font-size: 10px;
    line-height: 1;
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

  @media (max-width: 360px) {
    .phone-top-menu .mobile-github-btn {
      display: none;
    }
  }
</style>
