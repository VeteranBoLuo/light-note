<template>
  <CommonContainer
    :title="$t('personCenter.title')"
    :style="{ backgroundColor: user.currentTheme === 'day' ? '#f6f7f9' : '#222222' }"
    @backClick="router.push('/home')"
  >
    <div class="person-title-card" :style="{ backgroundColor: user.currentTheme === 'day' ? '#97a1c6' : '#4d5264' }">
      <div style="display: flex; gap: 20px; align-items: center">
        <div class="navigation-icon" :class="{ 'has-frame': equippedFrameId }" :style="{ color: user.iconColor }">
          <AvatarFramePreview
            v-if="equippedFrameId"
            :frame-id="equippedFrameId"
            :src="user.headPicture || icon.navigation.user"
            :size="44"
            :decorative="false"
            class="dom-hover"
            @click="zoomImage"
          />
          <svg-icon
            v-else
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
      <div class="user-icon-text" :style="{ color: user.iconColor }">
        <div style="display: flex; gap: 20px; font-size: 14px">
          <span
            >{{ $t('navigation.bookmark') }}<span style="margin-left: 10px">{{ user.bookmarkTotal }}</span></span
          >
          <span
            >{{ $t('navigation.note') }}<span style="margin-left: 10px">{{ user.noteTotal }}</span></span
          >
          <span
            >{{ $t('personCenter.storageUsed')
            }}<span style="margin-left: 10px">{{ formatStorageSize(user.storageUsed) }}</span></span
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
      <div class="person-menu-item" @click="goGrowth" v-click-log="{ module: '个人中心', operation: '打开我的成长' }">
        <span class="person-menu-item-title">{{ $t('growth.entry') }}</span>
        <span class="person-menu-item-des"
          >Lv.{{ growthInfo?.level || 1 }} · 🪙 {{ (growthInfo?.points || 0).toLocaleString('en-US') }}
          <svg-icon color="#999fa8" style="rotate: 180deg" :src="icon.arrow_left" size="14" />
        </span>
      </div>
    </div>
    <div class="person-menu">
      <!-- 主题与语言已统一收敛到设置页，移动端个人中心只保留设置入口。 -->
      <div
        class="person-menu-item"
        @click="$router.push('/settings')"
        v-click-log="{ module: '个人中心', operation: '打开设置' }"
      >
        <span class="person-menu-item-title">{{ $t('settings.title') }}</span>
        <span class="person-menu-item-des">
          <svg-icon color="#999fa8" style="rotate: 180deg" :src="icon.arrow_left" size="14" />
        </span>
      </div>
      <div
        class="person-menu-item"
        @click="$router.push('/help')"
        v-click-log="{ module: '个人中心', operation: '打开帮助' }"
      >
        <span class="person-menu-item-title">{{ $t('personCenter.help') }}</span>
        <span class="person-menu-item-des">
          <svg-icon color="#999fa8" style="rotate: 180deg" :src="icon.arrow_left" size="14" />
        </span>
      </div>
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
    </div>
    <div class="person-menu">
      <div v-if="canUseQuickCapture" class="person-menu-item" @click="openQuickCapture">
        <span class="person-menu-item-title">{{ $t('inbox.quickCapture') }}</span>
        <span class="person-menu-item-des">
          {{ inbox.actionTotal || '' }}
          <svg-icon color="#999fa8" style="rotate: 180deg" :src="icon.arrow_left" size="14" />
        </span>
      </div>
      <div
        class="person-menu-item"
        @click="$router.push('/search')"
        v-click-log="{ module: '个人中心', operation: `资源中心` }"
      >
        <span class="person-menu-item-title">{{ $t('personCenter.resourceCenter') }}</span>
        <span class="person-menu-item-des"
          >{{ $t('personCenter.resourceCenterDesc')
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
      <div
        class="person-menu-item"
        @click="$router.push('/ptrash')"
        v-click-log="{ module: '个人中心', operation: '回收站' }"
      >
        <span class="person-menu-item-title">{{ $t('trash.title') }}</span>
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
  import AvatarFramePreview from '@/components/growth/AvatarFramePreview.vue';
  import { bookmarkStore, inboxStore, useUserStore } from '@/store';
  import { formatStorageSize } from '@/utils/common';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import { computed, defineAsyncComponent, onMounted, ref } from 'vue';
  import userApi from '@/api/userApi.ts';
  import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
  import { useI18n } from 'vue-i18n';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import { recordOperation } from '@/api/commonApi';
  import { OPERATION_LOG_MAP } from '@/config/logMap';
  import { useGrowth } from '@/composables/useGrowth.ts';
  import { frameVariant } from '@/config/growthFrames';

  const MyInfo = defineAsyncComponent(() => import('@/components/personCenter/myInfo/MyInfo.vue'));

  const { t } = useI18n();
  const bookmark = bookmarkStore();
  const inbox = inboxStore();
  const menuVisible = ref(false);
  const userVisible = ref(false);

  const user = useUserStore();
  const { growth: growthInfo, load: loadGrowth } = useGrowth();
  const equippedFrameId = computed(() => {
    const id = growthInfo.value?.equippedFrame;
    return frameVariant(id) ? id : null;
  });
  const canUseQuickCapture = computed(() => Boolean(user.id) && user.role !== 'visitor');

  onMounted(() => {
    loadGrowth();
  });

  function goGrowth() {
    router.push('/growth');
  }

  function openQuickCapture() {
    if (blockGuestWrite('inbox-capture', t('inbox.guestPrompt'))) return;
    recordOperation(OPERATION_LOG_MAP.inbox.openCapture);
    inbox.openQuickCapture();
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

  ref<Viewer>();
  function zoomImage() {
    bookmark.refreshViewer(user.headPicture || icon.navigation.user);
    menuVisible.value = false;
  }
</script>

<style lang="less" scoped>
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
  .navigation-icon.has-frame {
    clip-path: none;
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
