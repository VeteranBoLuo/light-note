<template>
  <a-popover
    placement="bottomRight"
    :overlay-style="{ maxWidth: 'calc(100vw - 24px)' }"
    overlay-class-name="user-center-popover"
    :get-popup-container="getPopupContainer"
    :open="menuVisible"
    trigger="hover"
    :arrow="false"
    @openChange="handlePopoverOpenChange"
  >
    <template #content>
      <div
        :key="popoverKey"
        class="user-card"
        :style="{ color: user.iconColor }"
        @mouseenter="handleCardMouseEnter"
        @mouseleave="handleCardMouseLeave"
      >
        <div class="user-top">
          <div class="avatar-ring" :class="user.currentTheme === 'day' ? 'ring-day' : 'ring-night'">
            <svg-icon
              img-id="viewUserImg"
              @click="zoomImage"
              size="40"
              :src="user.headPicture || icon.navigation.user"
              class="dom-hover"
            />
          </div>
          <div class="user-meta">
            <div class="user-name-row">
              <span class="user-name">{{
                user.userName ? user.alias || t('personCenter.defaultNickname') : t('personCenter.pleaseLogin')
              }}</span>
              <span
                v-if="growthInfo"
                class="lv-badge"
                :class="[`tier-${badgeTier}`, { 'has-unread': growthInfo.hasUnreadLevelUp }]"
                :title="growthInfo.name"
                role="button"
                @click="goGrowth"
                >Lv.{{ growthInfo.level }}</span
              >
              <svg-icon class="dom-hover" :src="icon.card_edit" size="16" @click="editUser" />
            </div>
            <div class="user-sub">
              {{ user.role === 'visitor' ? t('personCenter.loginRegister') : t('personCenter.personalProfile') }}
            </div>
          </div>
        </div>

        <div class="stat-grid">
          <div v-for="stat in userStats" :key="stat.label" class="stat-card">
            <div class="stat-icon">
              <svg-icon :src="stat.icon" size="14" />
            </div>
            <div class="stat-text">
              <div class="stat-label">{{ stat.label }}</div>
              <div class="stat-value" :title="String(stat.value)">{{ stat.value }}</div>
            </div>
          </div>
        </div>

        <div class="settings-grid">
          <b-dropdown
            :trigger="['click']"
            placement="bottom"
            overlay-class-name="user-setting-dropdown"
            :menu-options="themeMenuOptions"
            :get-popup-container="getSettingPopupContainer"
            @open-change="handleSettingMenuChange"
          >
            <button class="setting-card">
              <span class="setting-left">
                <svg-icon size="14" :src="icon.theme" />
                {{ $t('personCenter.themeMode') }}
              </span>
              <span class="setting-right">{{ ThemeName }}</span>
            </button>
          </b-dropdown>
          <b-dropdown
            :trigger="['click']"
            placement="bottom"
            overlay-class-name="user-setting-dropdown"
            :menu-options="langMenuOptions"
            :get-popup-container="getSettingPopupContainer"
            @open-change="handleSettingMenuChange"
          >
            <button class="setting-card">
              <span class="setting-left">
                <svg-icon size="14" :src="icon.language" />
                {{ $t('personCenter.language') }}
              </span>
              <span class="setting-right">{{ LanguageName }}</span>
            </button>
          </b-dropdown>
        </div>

        <div class="menu-divider" />

        <div class="header_menu_ul">
          <div
            v-for="menuItem in menuOptions"
            class="flex-center li"
            style="position: relative"
            v-click-log="{ module: '个人中心', operation: menuItem.label }"
            @click="menuItemClick(menuItem)"
          >
            <svg-icon size="14" :src="menuItem.icon" />
            {{ menuItem.label }}
            <div v-if="getVersionIsNew(menuItem)" class="update-point" />
          </div>
          <div
            class="flex-center li logout"
            v-click-log="{
              module: '个人中心',
              operation: user.role === 'visitor' ? '登录/注册' : t('personCenter.logout'),
            }"
            @click="handleExitLogin"
          >
            <svg-icon size="14" :src="icon.user_exit" />
            {{ user.role === 'visitor' ? t('personCenter.loginRegister') : t('personCenter.logout') }}
          </div>
        </div>
      </div>
    </template>
    <div
      class="navigation-icon"
      style="margin-left: 5px"
      @mouseenter="handleTriggerMouseEnter"
      @mouseleave="handleTriggerMouseLeave"
    >
      <svg-icon size="32" :src="user.headPicture || icon.navigation.user" class="dom-hover" />
    </div>
    <my-info v-if="userVisible" v-model:visible="userVisible" />
  </a-popover>
</template>

<script setup lang="ts">
  import router from '@/router';
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { bookmarkStore, useUserStore } from '@/store';
  import { useGrowth } from '@/composables/useGrowth.ts';
  import { formatStorageSize } from '@/utils/common';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import userApi from '@/api/userApi.ts';
  import { updatePreference } from '@/utils/savePreference';
  import BDropdown from '@/components/base/BasicComponents/BDropdown.vue';
  import { useI18n } from 'vue-i18n';
  import { updateNotice } from '@/config/updateNotice';

  const MyInfo = defineAsyncComponent(() => import('@/components/personCenter/myInfo/MyInfo.vue'));

  const { t } = useI18n();
  const bookmark = bookmarkStore();
  const getPopupContainer = (trigger: HTMLElement) => {
    return document.getElementById('tag-container');
  };
  const menuVisible = ref(false);
  const isSettingMenuOpen = ref(false);
  const popoverKey = ref(0);
  const isHoveringTrigger = ref(false);
  const isHoveringCard = ref(false);
  let closeTimer: ReturnType<typeof setTimeout> | null = null;
  const userVisible = ref(false);

  const user = useUserStore();

  // 成长徽章:登录用户在头像旁展示当前等级(纯展示,管理成长走「设置」菜单入口)
  const { growth: growthInfo, load: loadGrowth } = useGrowth();
  const badgeTier = computed(() => {
    const l = growthInfo.value?.level || 1;
    return l >= 13 ? 5 : l >= 10 ? 4 : l >= 7 ? 3 : l >= 4 ? 2 : 1;
  });
  onMounted(() => {
    loadGrowth(); // 游客也拉取(后端返回 Lv.1),让游客也看到等级 → 点击去成长页是转化钩子
  });
  // 每次展开个人中心面板都强制拉最新成长:升级是后端异步发生的,确保徽章等级/红点及时刷新
  watch(
    () => menuVisible.value,
    (open) => {
      if (open) loadGrowth(true);
    },
  );
  function goGrowth() {
    closeSettingMenuAndSyncPopover();
    menuVisible.value = false;
    router.push('/growth');
  }

  function clearCloseTimer() {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
  }

  function hasActivePopoverSource() {
    return isHoveringTrigger.value || isHoveringCard.value;
  }

  function syncPopoverVisible() {
    menuVisible.value = hasActivePopoverSource();
  }

  function delayClosePopover() {
    clearCloseTimer();
    closeTimer = setTimeout(() => {
      syncPopoverVisible();
    }, 120);
  }

  function handleTriggerMouseEnter() {
    clearCloseTimer();
    isHoveringTrigger.value = true;
    menuVisible.value = true;
  }

  function handleTriggerMouseLeave() {
    isHoveringTrigger.value = false;
    delayClosePopover();
  }

  function handleCardMouseEnter() {
    clearCloseTimer();
    isHoveringCard.value = true;
    menuVisible.value = true;
  }

  function handleCardMouseLeave() {
    isHoveringCard.value = false;
    delayClosePopover();
  }

  function handleSettingMenuChange(open: boolean) {
    clearCloseTimer();
    isSettingMenuOpen.value = open;
    syncPopoverVisible();
  }

  function closeSettingMenuAndSyncPopover() {
    isSettingMenuOpen.value = false;
    delayClosePopover();
  }

  function handlePopoverOpenChange(open: boolean) {
    if (open) {
      clearCloseTimer();
      menuVisible.value = true;
      return;
    }
    delayClosePopover();
  }

  function getSettingPopupContainer(trigger: HTMLElement) {
    return (trigger.closest('.user-card') as HTMLElement) || getPopupContainer(trigger);
  }

  watch(menuVisible, (val) => {
    if (val) {
      popoverKey.value++;
    } else {
      isSettingMenuOpen.value = false;
    }
  });

  const themeMenuOptions = computed(() => [
    { label: t('navigation.followSystem'), icon: icon.navigation.system, function: () => changeTheme('system') },
    { label: t('navigation.light'), icon: icon.navigation.sun, function: () => changeTheme('day') },
    { label: t('navigation.dark'), icon: icon.navigation.moon, function: () => changeTheme('night') },
  ]);
  const langMenuOptions = computed(() => [
    { label: '中文', function: () => changeLanguage('zh-CN') },
    { label: 'English', function: () => changeLanguage('en-US') },
  ]);

  interface menuItemInterface {
    label: string;
    path?: string;
    role?: string;
    icon: string;
    [key: string]: any;
  }

  const options = ref<menuItemInterface[]>([
    {
      name: 'growth',
      label: t('growth.entry'),
      path: '/growth',
      icon: icon.userCenter.growth,
    },
    {
      name: 'settings',
      label: t('settings.title'),
      path: '/settings',
      icon: icon.userCenter.settingsGear,
    },
    {
      name: 'help',
      label: t('personCenter.help'),
      path: '/help',
      icon: icon.help_document,
    },
    {
      name: 'trash',
      label: t('trash.title'),
      path: '/trash',
      icon: icon.table_delete,
    },
    {
      name: 'operationLog',
      label: t('personCenter.feedback'),
      icon: icon.userCenter.operationLog,
    },
    {
      name: 'updateLogs',
      label: t('personCenter.changelog'),
      path: '/updateLogs',
      icon: icon.userCenter.log,
      version: updateNotice.version,
      versionKey: updateNotice.storageKey,
    },
  ]);
  function getVersionIsNew(menu: any) {
    if (menu.version) {
      const versionKey = menu.versionKey || `${menu.name}Version`;
      const version = localStorage.getItem(versionKey);
      return version !== menu.version;
    }
    return false;
  }

  const menuOptions = computed(() => {
    if (user.role === 'root') {
      return options.value;
    }
    return options.value.filter((item) => item.role !== 'root');
  });

  const userStats = computed(() => [
    {
      label: t('navigation.bookmark'),
      value: user.bookmarkTotal,
      icon: icon.workbenches.bookmark,
    },
    {
      label: t('navigation.note'),
      value: user.noteTotal,
      icon: icon.workbenches.note,
    },
    {
      label: t('personCenter.storageUsed'),
      value: formatStorageSize(user.storageUsed),
      icon: icon.storage,
    },
  ]);

  function menuItemClick(menuItem: menuItemInterface) {
    menuVisible.value = false;
    if (menuItem.version) {
      const versionKey = menuItem.versionKey || `${menuItem.name}Version`;
      localStorage.setItem(versionKey, menuItem.version);
    }
    if (menuItem.path) {
      router.push(menuItem.path);
    } else {
      switch (menuItem.label) {
        case t('personCenter.feedback'):
          router.push('/opinions');
          break;
        default:
          break;
      }
    }
  }

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

  const ThemeName = computed(() => {
    if (user.preferences.theme === 'night') {
      return t('navigation.dark');
    }
    if (user.preferences.theme === 'day') {
      return t('navigation.light');
    }
    return t('navigation.followSystem');
  });
  const LanguageName = computed(() => (user.preferences.lang === 'en-US' ? 'English' : '中文'));

  function changeTheme(theme: string) {
    closeSettingMenuAndSyncPopover();
    // 统一走 updatePreference(本地生效 + 游客只本地 + 登录同步后端并失败回滚)
    updatePreference({ theme }).catch((err) => {
      console.error('后台错误：' + err);
    });
  }

  function changeLanguage(lang: 'zh-CN' | 'en-US') {
    closeSettingMenuAndSyncPopover();
    // 统一走 updatePreference:语言即时切换(不刷新页面),与设置中心行为一致
    updatePreference({ lang }).catch((err) => {
      console.error('后台错误：' + err);
    });
  }

  function zoomImage() {
    bookmark.refreshViewer(user.headPicture || icon.navigation.user);
    menuVisible.value = false;
  }

  function editUser() {
    userVisible.value = true;
    menuVisible.value = false;
  }

  onBeforeUnmount(() => {
    clearCloseTimer();
  });
</script>

<style lang="less" scoped>
  .navigation-icon {
    display: flex;
    align-items: center;
    clip-path: circle(50% at 50% 50%);
    cursor: pointer;
  }

  .handle-body {
    display: none;
  }

  .header_menu_ul {
    list-style-type: none;
    margin-top: 8px;
    margin-bottom: 2px;
    box-sizing: border-box;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;

    .li {
      height: 32px;
      cursor: pointer;
      font-size: 12px;
      border-radius: 10px;
      color: var(--text-color);
      gap: 8px;
      background: var(--menu-item-h-bg-color);
      transition: all 0.2s ease;

      &:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
      }

      &.logout {
        background: linear-gradient(120deg, rgba(249, 112, 102, 0.18), rgba(255, 158, 130, 0.12));
      }
    }
  }

  .modal-content {
    margin: auto;
    display: block;
    height: 90%;
    width: 80%;
    max-width: 700px;
  }

  .modal-content {
    -webkit-animation-name: zoom;
    -webkit-animation-duration: 0.6s;
    animation-name: zoom;
    animation-duration: 0.6s;
    cursor: pointer;
  }
  .update-point {
    height: 5px;
    width: 5px;
    background-color: #ff4d4f;
    border-radius: 50%;
    position: absolute;
    right: 5px;
  }

  .user-card {
    width: 320px;
    max-width: calc(100vw - 28px);
    background: var(--user-body-bg-color);
    border-radius: 14px;
    padding: 14px;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.12);
    position: relative;
  }

  .user-top {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-bottom: 10px;
    border-bottom: 1px dashed var(--menu-item-h-bg-color);
  }

  .avatar-ring {
    display: grid;
    place-items: center;
    width: 52px;
    height: 52px;
    border-radius: 14px;
    background: linear-gradient(135deg, rgba(79, 134, 255, 0.25), rgba(82, 196, 186, 0.18));
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .ring-day {
    box-shadow: 0 6px 18px rgba(46, 117, 255, 0.18);
  }

  .ring-night {
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
  }

  .user-meta {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .user-name-row {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--text-color);
  }

  .user-name {
    font-weight: 700;
    font-size: 14px;
  }

  .lv-badge {
    position: relative;
    flex: 0 0 auto;
    padding: 1px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    color: #fff;
    letter-spacing: -0.01em;
    cursor: pointer;
    transition: transform 0.15s ease;

    &:hover {
      transform: translateY(-1px);
    }

    &.has-unread::after {
      content: '';
      position: absolute;
      top: -2px;
      right: -2px;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #ff4d4f;
      border: 1.5px solid var(--menu-body-bg-color, #fff);
    }

    &.tier-1 {
      background: linear-gradient(135deg, #6b7280, #9ca3af);
    }
    &.tier-2 {
      background: linear-gradient(135deg, #2563eb, #38bdf8);
    }
    &.tier-3 {
      background: linear-gradient(135deg, #7c3aed, #a855f7);
    }
    &.tier-4 {
      background: linear-gradient(135deg, #d97706, #fbbf24);
    }
    &.tier-5 {
      background: linear-gradient(135deg, #db2777, #f43f5e, #fb923c);
    }
  }

  .user-sub {
    font-size: 12px;
    color: var(--text-secondary-color, #9aa0ad);
  }

  .stat-grid {
    margin-top: 10px;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .stat-card {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    border-radius: 10px;
    background: linear-gradient(135deg, rgba(79, 134, 255, 0.12), rgba(82, 196, 186, 0.08));
    border: 1px solid rgba(255, 255, 255, 0.06);
  }

  [data-theme='night'] {
    .stat-card {
      background: rgba(255, 255, 255, 0.04);
    }
    .stat-icon {
      background: gray;
    }
  }

  .stat-icon {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    display: grid;
    place-items: center;
    background: rgba(255, 255, 255, 0.12);
  }

  .stat-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .stat-label {
    font-size: 11px;
    color: var(--text-secondary-color, #8a8f99);
  }

  .stat-value {
    font-size: 13px;
    font-weight: 700;
    color: var(--text-color);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .settings-grid {
    margin-top: 10px;
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .setting-card {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px dashed var(--menu-item-h-bg-color);
    background: rgba(255, 255, 255, 0.04);
    color: inherit;
    cursor: pointer;
    font-size: 12px;
  }

  .setting-card:hover {
    background: var(--menu-item-h-bg-color);
  }

  .setting-left {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--text-color);
  }

  .setting-right {
    color: var(--text-secondary-color, #9aa0ad);
  }

  :global(.user-setting-dropdown) {
    z-index: 100001;
  }

  :global(.user-center-popover) {
    z-index: 100001;
  }

  :global(.user-center-popover .ant-popover-inner) {
    padding: 0;
    background: transparent;
    box-shadow: none;
  }

  :global(.user-center-popover .ant-popover-inner-content) {
    padding: 0;
  }

  :global(.user-center-popover .ant-popover-arrow) {
    display: none;
  }

  .menu-divider {
    margin: 12px 0 6px;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--menu-item-h-bg-color), transparent);
    border: none;
  }

  @media (max-width: 1000px) {
    .modal-content {
      height: 60%;
      width: 80%;
      max-width: 700px;
    }
  }
</style>
