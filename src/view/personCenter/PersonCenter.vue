<template>
  <a-tooltip
    :color="bookmark.currentTheme === 'day' ? '#97a1c6' : '#4d5264'"
    placement="bottomLeft"
    :get-popup-container="getPopupContainer"
    v-model:open="menuVisible"
  >
    <template #title>
      <div class="flex-align-center" style="gap: 15px; padding: 5px">
        <div :class="['navigation-icon']" :style="{ color: bookmark.iconColor }">
          <svg-icon
            img-id="viewUserImg"
            @click="zoomImage"
            size="40"
            :src="user.headPicture || icon.navigation.user"
            class="dom-hover"
          />
        </div>
        <div class="user-icon-text" :style="{ color: bookmark.iconColor }">
          <div class="flex-align-center" style="gap: 10px"
            ><b>{{ user.userName ? user.alias || gt('personCenter.defaultNickname') : gt('personCenter.pleaseLogin') }}</b>
            <svg-icon class="dom-hover" :src="icon.card_edit" size="16" @click="editUser" />
          </div>
          <div style="display: flex; gap: 20px; font-size: 12px">
            <span
              >{{ gt('navigation.bookmark') }}<span style="margin-left: 10px">{{ user.bookmarkTotal }}</span></span
            >
            <span
              >{{ gt('navigation.note') }}<span style="margin-left: 10px">{{ user.noteTotal }}</span></span
            >
          </div>
        </div>
      </div>
      <div class="handle-body">
        <div class="handle-body-title-body">
          <div class="flex-center" style="height: 40px; color: var(--text-color); gap: 10px; font-size: 12px">
            <svg-icon size="14" :src="icon.theme" />
            {{ $t('personCenter.themeMode') }}
          </div>
          <div style="text-align: right; padding-right: 20px; color: #969ba2; font-size: 12px">
            {{ ThemeName }}
          </div>
        </div>
        <hr
          style="width: calc(100% - 20px); border: unset; height: 1px"
          :color="bookmark.currentTheme === 'day' ? '#f6f7f9' : '#4e5262'"
        />
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
            class="flex-center li"
            v-click-log="{
              module: '个人中心',
              operation: user.role === 'visitor' ? '登录/注册' : gt('personCenter.logout'),
            }"
            @click="handleExitLogin"
          >
            <svg-icon size="14" :src="icon.user_exit" />
            {{ user.role === 'visitor' ? gt('personCenter.loginRegister') : gt('personCenter.logout') }}
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
  import { gt } from '@/utils/global.ts';

  const bookmark = bookmarkStore();
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
      label: gt('personCenter.admin'),
      path: '/admin',
      role: 'root',
      icon: icon.user_admin,
    },
    {
      name: 'help',
      label: gt('personCenter.help'),
      path: '/help',
      icon: icon.help_document,
    },
    {
      name: 'operationLog',
      label: gt('personCenter.feedback'),
      icon: icon.userCenter.operationLog,
    },
    {
      name: 'updateLogs',
      label: gt('personCenter.changelog'),
      path: '/updateLogs',
      icon: icon.userCenter.log,
      version: '4.0',
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

  function menuItemClick(menuItem: menuItemInterface) {
    menuVisible.value = false;
    if (menuItem.version) {
      localStorage.setItem(`${menuItem.name}Version`, menuItem.version);
    }
    if (menuItem.path) {
      router.push(menuItem.path);
    } else {
      switch (menuItem.label) {
        case '意见反馈':
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
              bookmark.theme = res.data.theme;
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
    if (bookmark.theme === 'night') {
      return gt('navigation.dark');
    }
    if (bookmark.theme === 'day') {
      return gt('navigation.day');
    }
    return gt('navigation.followSystem');
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
    border-radius: 8px;
    background-color: var(--user-body-bg-color);
    margin-top: 10px;
    padding: 5px;
    width: 220px;

    .handle-body-title-body {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
      align-items: center;
    }
  }

  .header_menu_ul {
    list-style-type: none;
    text-align: center;
    margin-top: 5px;
    margin-bottom: 5px;
    box-sizing: border-box;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;

    .li {
      height: 30px;
      cursor: pointer;
      font-size: 12px;
      border-radius: 4px;
      color: var(--text-color);
      gap: 10px;

      &:hover {
        background-color: var(--menu-item-h-bg-color);
        border-radius: 8px;
      }
    }
  }

  .user-icon-text {
    text-align: left;
    color: white !important;
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

  @media (max-width: 1000px) {
    .modal-content {
      height: 60%;
      width: 80%;
      max-width: 700px;
    }
  }
</style>
