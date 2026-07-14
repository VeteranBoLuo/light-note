<template>
  <div
    class="navigation-right-area"
    :class="{ 'phone-top-menu': bookmark.isMobile }"
    :style="{ marginLeft: 'auto', gap: bookmark.isMobile ? '15px' : '5px' }"
  >
    <GlobalSearch />
    <BButton v-if="!bookmark.isMobile" size="small" type="primary" class="quick-capture-btn" @click="openQuickCapture">
      {{ $t('inbox.quickCapture') }}
    </BButton>
    <BTooltip :title="$t('home.toolbox')" always>
      <div v-if="!bookmark.isMobile" @click="toolkitClick" v-click-log="OPERATION_LOG_MAP.navigation.toolkit" class="toolkit-link">
        <svg-icon size="26" hover :src="icon.toolkit" />
      </div>
    </BTooltip>
    <b-dropdown
      v-if="!bookmark.isMobile"
      align="center"
      :menu-options="[
        { label: $t('navigation.projectAddress'), function: () => githubClick() },
        { label: $t('home.officialSite'), function: () => router.push('/landing') },
      ]"
    >
      <svg-icon size="26" hover :src="icon.github" @click="githubClick" />
    </b-dropdown>
    <button v-if="bookmark.isMobile && route.path.includes('/home')" class="mobile-github-btn" @click="githubClick">
      <svg-icon size="24" hover :src="icon.github" />
    </button>
    <span v-if="user.role === 'visitor' && !user.visitorWorkspace" class="guest-register-link" @click="registerClick">{{ $t('home.freeRegister') }}</span>
    <NotificationBell v-if="!bookmark.isMobile && user.role !== 'visitor'" />
    <!--移动端个人中心       -->
    <div :class="['navigation-icon']" v-if="bookmark.isMobile" @click="handleToPhoneUserCenter">
      <svg-icon size="32" :src="user.headPicture || icon.navigation.user" class="dom-hover" />
    </div>
    <!--pc端个人中心       -->
    <PersonCenter v-else />
    <QuickCaptureModal v-model:visible="inbox.quickCaptureVisible" />
  </div>
</template>

<script lang="ts" setup>
  import icon from '@/config/icon.ts';
  import BDropdown from '@/components/base/BasicComponents/BDropdown.vue';
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
  import QuickCaptureModal from '@/components/inbox/QuickCaptureModal.vue';
  import { inboxStore } from '@/store';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import { useI18n } from 'vue-i18n';
  const bookmark = bookmarkStore();
  const inbox = inboxStore();
  const { t } = useI18n();

  const user = useUserStore();
  const route = useRoute();

  function githubClick() {
    window.open('https://github.com/VeteranBoLuo/light-note');
    recordOperation({ module: '导航栏', operation: `点击书签卡片Github` });
  }

  function toolkitClick() {
    window.open('https://boluo66.top/toolkit/');
  }

  // 游客点导航栏「免费注册」:打开注册弹窗(openAuthModal 内部记 signup_open,source=nav)
  function registerClick() {
    bookmark.openAuthModal('注册', 'nav');
  }

  function openQuickCapture() {
    if (blockGuestWrite('inbox-capture', t('inbox.guestPrompt'))) return;
    recordOperation(OPERATION_LOG_MAP.inbox.openCapture);
    inbox.quickCaptureVisible = true;
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
    left: 128px;
    right: 14px;
    width: unset !important;
    min-width: 0;
    gap: 10px !important;
  }
  .phone-top-menu :deep(.global-search) {
    flex: 1;
    min-width: 0;
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
  .toolkit-link {
    text-decoration: none;
  }
  .quick-capture-btn {
    flex: 0 0 auto;
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
</style>
