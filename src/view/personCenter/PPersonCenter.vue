<template>
  <CommonContainer
    :title="$t('personCenter.title')"
    :style="{ backgroundColor: user.currentTheme === 'day' ? '#f6f7f9' : '#222222' }"
    @backClick="router.push('/home')"
  >
    <div class="person-title-card" :style="{ backgroundColor: user.currentTheme === 'day' ? '#97a1c6' : '#4d5264' }">
      <div style="display: flex; gap: 20px; align-items: center">
        <div class="navigation-icon" :style="{ color: bookmark.iconColor }">
          <svg-icon
            img-id="viewUserImg"
            @click="zoomImage"
            size="50"
            :src="user.headPicture || icon.navigation.user"
            class="dom-hover"
          />
        </div>
        <div style="display: flex; flex-direction: column">
          <b style="font-size: 20px">{{ user.alias ? user.alias : $t('personCenter.defaultNickname') }}</b>
        </div>
      </div>
      <div class="user-icon-text" :style="{ color: bookmark.iconColor }">
        <div style="display: flex; gap: 20px; font-size: 14px">
          <span
            >{{ $t('navigation.tag') }}<span style="margin-left: 10px">{{ user.tagTotal }}</span></span
          >
          <span
            >{{ $t('navigation.bookmark') }}<span style="margin-left: 10px">{{ user.bookmarkTotal }}</span></span
          >
        </div>
      </div>
    </div>
    <div class="person-menu">
      <div class="person-menu-item" @click="$router.push('/myInfo')">
        <span class="person-menu-item-title">{{ $t('personCenter.personalProfile') }}</span>
        <span class="person-menu-item-des"
          >{{ $t('personCenter.email_nickname') }}
          <svg-icon color="#999fa8" style="rotate: 180deg" :src="icon.arrow_left" size="14" />
        </span>
      </div>
    </div>
    <div class="person-menu">
      <div class="person-menu-item">
        <span class="person-menu-item-title">{{ $t('personCenter.themeMode') }}</span>
        <span class="person-menu-item-des">{{ ThemeName }}</span></div
      >
      <div
        v-if="user.role === 'root'"
        class="person-menu-item"
        @click="router.push('/admin')"
        v-click-log="{ module: '个人中心', operation: `后台管理` }"
      >
        <span class="person-menu-item-title">{{ $t('personCenter.admin') }}</span>
        <span class="person-menu-item-des"
          >{{ $t('personCenter.logs_user_mg')
          }}<svg-icon color="#999fa8" style="rotate: 180deg" :src="icon.arrow_left" size="14" /></span
      ></div>
      <div
        class="person-menu-item"
        @click="router.push('/noteLibrary')"
        v-click-log="{ module: '个人中心', operation: `笔记库` }"
      >
        <span class="person-menu-item-title">{{ $t('note.title') }}</span>
        <span class="person-menu-item-des"
          ><svg-icon color="#999fa8" style="rotate: 180deg" :src="icon.arrow_left" size="14"
        /></span>
      </div>
      <div
        class="person-menu-item"
        @click="$router.push('/cloudSpace')"
        v-click-log="{ module: '个人中心', operation: `云空间` }"
      >
        <span class="person-menu-item-title">{{ $t('cloudSpace.title') }}</span>
        <span class="person-menu-item-des"
          ><svg-icon color="#999fa8" style="rotate: 180deg" :src="icon.arrow_left" size="14" /></span
      ></div>
      <div
        class="person-menu-item"
        @click="$router.push('/manage/tagMg')"
        v-click-log="{ module: '个人中心', operation: `标签管理` }"
      >
        <span class="person-menu-item-title">{{ $t('tagManage.title') }}</span>
        <span class="person-menu-item-des"
          ><svg-icon color="#999fa8" style="rotate: 180deg" :src="icon.arrow_left" size="14" /></span
      ></div>
      <div
        class="person-menu-item"
        @click="$router.push('/manage/bookmarkMg')"
        v-click-log="{ module: '个人中心', operation: `书签管理` }"
      >
        <span class="person-menu-item-title">{{ $t('bookmarkMg.title') }}</span>
        <span class="person-menu-item-des"
          ><svg-icon color="#999fa8" style="rotate: 180deg" :src="icon.arrow_left" size="14" /></span
      ></div>
    </div>
    <div class="person-menu">
      <div
        class="person-menu-item"
        @click="$router.push('/opinions')"
        v-click-log="{ module: '个人中心', operation: `意见反馈` }"
      >
        <span class="person-menu-item-title">{{ $t('personCenter.feedback') }}</span>
        <span class="person-menu-item-des"
          ><svg-icon color="#999fa8" style="rotate: 180deg" :src="icon.arrow_left" size="14" /></span
      ></div>
      <div
        class="person-menu-item"
        @click="$router.push('/help')"
        v-click-log="{ module: '轻笺助手', operation: `轻笺助手` }"
      >
        <span class="person-menu-item-title">{{ $t('ai.title') }}</span>
        <span class="person-menu-item-des"
          ><svg-icon color="#999fa8" style="rotate: 180deg" :src="icon.arrow_left" size="14" /></span
      ></div>
      <div
        class="person-menu-item"
        @click="$router.push('/updateLogs')"
        v-click-log="{ module: '更新日志', operation: `更新日志` }"
      >
        <span class="person-menu-item-title">{{ $t('personCenter.changelog') }}</span>
        <span class="person-menu-item-des"
          ><svg-icon color="#999fa8" style="rotate: 180deg" :src="icon.arrow_left" size="14" /></span
      ></div>
    </div>
    <div
      class="person-menu"
      @click="handleExitLogin"
      v-click-log="{
        module: '个人中心',
        operation: user.role === 'visitor' ? $t('personCenter.loginRegister') : $t('personCenter.logout'),
      }"
    >
      <div class="person-menu-item" style="justify-content: center">
        <span class="person-menu-item-title">{{
          user.role === 'visitor' ? $t('personCenter.loginRegister') : $t('personCenter.logout')
        }}</span></div
      >
    </div>
    <my-info v-if="userVisible" v-model:visible="userVisible" />
  </CommonContainer>
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
  import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
  import { useI18n } from 'vue-i18n';

  const { t } = useI18n();
  const bookmark = bookmarkStore();
  const menuVisible = ref(false);
  const userVisible = ref(false);

  const user = useUserStore();

  function getThemeStyle(theme) {
    document.documentElement.setAttribute('data-theme', theme);
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
          router.push('/home');
          // 获取游客信息
          userApi.getUserInfoById({ id: localStorage.getItem('userId') }).then((res) => {
            if (res.status === 200) {
              user.setUserInfo(res.data);
              user.preferences.theme = res.data.theme;
              getThemeStyle(res.data.theme);
              localStorage.setItem('theme', res.data.theme);
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
      return t('navigation.light');
    }
    return t('navigation.followSystem');
  });
  ref<Viewer>();
  function zoomImage() {
    bookmark.refreshViewer(user.headPicture || icon.navigation.user);
    menuVisible.value = false;
  }
</script>

<style lang="less">
  .person-title-card {
    gap: 40px;
    padding: 15px;
    height: 160px;
    box-sizing: border-box;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    color: white;
  }

  .person-menu {
    border-radius: 12px;
    overflow: hidden;
    margin-top: 20px;
  }

  .person-menu-item {
    background-color: var(--phone-menu-item-bg-color);
    height: 50px;
    display: flex;
    align-items: center;
    padding: 0 20px;
    justify-content: space-between;
    cursor: pointer;
    &:not(:last-child) {
      border-bottom: 1px solid var(--phone-menu-item-border-color);
    }

    .person-menu-item-des {
      color: #999fa8;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 5px;
      line-height: 100%;
    }
  }

  .navigation-icon {
    display: flex;
    align-items: center;
    clip-path: circle(50% at 50% 50%);
    cursor: pointer;
  }

  .handle-body {
    border-radius: 8px;
    background-color: var(--user-body-bg-color);
    margin-top: 15px;
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

  @media (max-width: 1000px) {
    .modal-content {
      height: 60%;
      width: 80%;
      max-width: 700px;
    }
  }
</style>
