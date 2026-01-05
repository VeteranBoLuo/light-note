<template>
  <a-tooltip
    :color="tooltipColor"
    placement="bottomRight"
    :overlay-style="{ maxWidth: 'calc(100vw - 24px)' }"
    :get-popup-container="getPopupContainer"
    v-model:open="menuVisible"
  >
    <template #title>
      <div class="user-card" :style="{ color: bookmark.iconColor }">
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
              <div class="stat-value">{{ stat.value }}</div>
            </div>
          </div>
        </div>

        <div class="theme-row">
          <div class="theme-left">
            <svg-icon size="14" :src="icon.theme" />
            {{ $t('personCenter.themeMode') }}
          </div>
          <div class="theme-right">{{ ThemeName }}</div>
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
    <div class="navigation-icon" style="margin-left: 5px">
      <svg-icon size="32" :src="user.headPicture || icon.navigation.user" class="dom-hover" />
    </div>
    <my-info v-if="userVisible" v-model:visible="userVisible" />
    <Opinions v-if="opinionsVisible" v-model:visible="opinionsVisible" />
  </a-tooltip>
</template>

<script setup lang="ts">
  import router from '@/router';
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { bookmarkStore, useUserStore } from '@/store';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import { computed, ref } from 'vue';
  import userApi from '@/api/userApi.ts';
  import MyInfo from '@/components/personCenter/myInfo/MyInfo.vue';
  import Opinions from '@/components/personCenter/opinions/Opinions.vue';
  import { useI18n } from 'vue-i18n';

  const { t } = useI18n();
  const bookmark = bookmarkStore();
  const tooltipColor = computed(() => (user.currentTheme === 'day' ? '#ffffff' : '#33343f'));
  const getPopupContainer = (trigger: HTMLElement) => {
    return document.getElementById('tag-container');
  };
  const menuVisible = ref(false);
  const userVisible = ref(false);

  const opinionsVisible = ref(false);

  const user = useUserStore();

  interface menuItemInterface {
    label: string;
    path?: string;
    role?: string;
    icon: string;
    [key: string]: any;
  }

  const options = ref<menuItemInterface[]>([
    {
      name: 'admin',
      label: t('personCenter.admin'),
      path: '/admin',
      role: 'root',
      icon: icon.user_admin,
    },
    {
      name: 'help',
      label: t('personCenter.help'),
      path: '/help',
      icon: icon.help_document,
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
      version: '4.1',
    },
  ]);
  function getVersionIsNew(menu: any) {
    if (menu.version) {
      const version = localStorage.getItem(`${menu.name}Version`);
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
      icon: icon.manage_categoryBtn_bookmark,
    },
    {
      label: t('navigation.note'),
      value: user.noteTotal,
      icon: icon.noteDetail.save,
    },
    {
      label: t('personCenter.storageUsed'),
      value: user.storageUsed,
      icon: icon.file_upload,
    },
  ]);

  function menuItemClick(menuItem: menuItemInterface) {
    menuVisible.value = false;
    if (menuItem.version) {
      localStorage.setItem(`${menuItem.name}Version`, menuItem.version);
    }
    if (menuItem.path) {
      router.push(menuItem.path);
    } else {
      switch (menuItem.label) {
        case t('personCenter.feedback'):
          opinionsVisible.value = true;
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
        onOk() {
          // 清空当前用户信息
          user.resetUserInfo();
          // 打开登录页面
          bookmark.isShowLogin = true;
          // 刷新游客书签和标签
          bookmark.type = 'all';
          bookmark.refreshTag();
          // 获取游客信息
          userApi.getUserInfoById({ id: '' }).then((res: any) => {
            if (res.status === 'visitor') {
              user.setUserInfo(res.data);
              user.preferences.theme = res.data.theme;
              localStorage.setItem('theme', res.data.theme);
              if (bookmark.isMobileDevice) {
                router.push('/home');
              } else {
                router.push('/');
              }
            }
          });
        },
      });
    }
  }

  const ThemeName = computed(() => {
    if (user.preferences.theme === 'night') {
      return t('navigation.dark');
    }
    if (user.currentTheme === 'day') {
      return t('navigation.day');
    }
    return t('navigation.followSystem');
  });

  function zoomImage() {
    bookmark.refreshViewer(user.headPicture || icon.navigation.user);
    menuVisible.value = false;
  }

  function editUser() {
    userVisible.value = true;
    menuVisible.value = false;
  }
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
  }

  .theme-row {
    margin-top: 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px dashed var(--menu-item-h-bg-color);
    background: rgba(255, 255, 255, 0.04);
    font-size: 12px;
  }

  .theme-left {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--text-color);
  }

  .theme-right {
    color: var(--text-secondary-color, #9aa0ad);
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
